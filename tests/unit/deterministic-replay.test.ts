import { describe, expect, it } from "vitest";
import {
  buildDeterministicReplayVersion,
  computeDeterministicReplayHash,
  deterministicReplayVersionSchema,
} from "../../packages/core/src/deterministic-replay";
import {
  FrozenReplayScopeError,
  executeDeterministicReplay,
  type DeterministicReplayAdapter,
  type MaterializedReplayOperation,
} from "../../apps/runner/src/deterministic-replay";
import {
  makeReplayDraft,
  makeReplayJourney,
  makeReplayVersion,
  replayFixtureIds,
} from "../helpers/deterministic-replay-fixtures";
import { journeyPrincipal } from "../helpers/journey-authoring-fixtures";

const injectedValues = Object.freeze({
  "student-email-value": "student-a@canary.pactwire.invalid",
  "student-response-value": "PACTWIRE-FICTIONAL-AAAAAAAAAAAAAAAAAAAA",
});

function successfulAdapter(calls: MaterializedReplayOperation[]): DeterministicReplayAdapter {
  return {
    execute(operation) {
      calls.push(operation);
      return Promise.resolve({ status: "COMPLETED" });
    },
  };
}

describe("deterministic replay domain", () => {
  it("builds a stable immutable human-authored baseline without captured canary values", () => {
    const replay = makeReplayVersion();

    expect(deterministicReplayVersionSchema.parse(replay)).toEqual(replay);
    expect(replay).toMatchObject({
      arm: "HUMAN_AUTHORED_DETERMINISTIC",
      modelInvocationCount: 0,
      replayId: replayFixtureIds.replay,
      journeyVersionId: makeReplayJourney().id,
      version: 1,
      sourceVersionId: null,
    });
    expect(replay.replayHash).toBe(computeDeterministicReplayHash(replay));
    expect(replay.snapshot.snapshotHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(replay)).not.toContain(injectedValues["student-email-value"]);
    expect(JSON.stringify(replay)).not.toContain(injectedValues["student-response-value"]);
    expect(Object.isFrozen(replay)).toBe(true);
    expect(Object.isFrozen(replay.operations)).toBe(true);
  });

  it.each([
    [
      "a required checkpoint is omitted",
      makeReplayDraft({
        operations: makeReplayDraft().operations.filter(
          (operation) => operation.kind !== "CHECKPOINT",
        ),
      }),
    ],
    [
      "a fictional field has no runtime binding",
      makeReplayDraft({ bindings: [makeReplayDraft().bindings[0]!] }),
    ],
    [
      "navigation contains an absolute destination",
      makeReplayDraft({
        operations: makeReplayDraft().operations.map((operation) =>
          operation.kind === "NAVIGATE"
            ? { ...operation, path: "https://outside.example/student" }
            : operation,
        ),
      }),
    ],
    [
      "navigation uses a backslash origin escape",
      makeReplayDraft({
        operations: makeReplayDraft().operations.map((operation) =>
          operation.kind === "NAVIGATE"
            ? { ...operation, path: "/\\outside.example" }
            : operation,
        ),
      }),
    ],
    [
      "an operation exceeds the journey action scope",
      makeReplayDraft({
        operations: makeReplayDraft().operations.map((operation) =>
          operation.kind === "CLICK"
            ? { ...operation, authorizedAction: "MESSAGE" as const }
            : operation,
        ),
      }),
    ],
  ])("rejects %s", (_caseName, draft) => {
    expect(() =>
      buildDeterministicReplayVersion({
        id: replayFixtureIds.versionOne,
        replayId: replayFixtureIds.replay,
        version: 1,
        sourceVersionId: null,
        journey: makeReplayJourney(),
        runnerConfigVersion: "deterministic-replay-v1",
        draft,
        createdAt: "2026-07-21T10:10:00.000Z",
        createdBy: { kind: "HUMAN", actorId: journeyPrincipal.userId },
      }),
    ).toThrow();
  });

  it("rejects automation as the author of the non-model baseline", () => {
    expect(() =>
      makeReplayVersion({
        createdBy: {
          kind: "AUTOMATION",
          actorId: "replay-generator",
          component: "replay-generator",
        },
      }),
    ).toThrow();
  });
});

describe("deterministic replay execution", () => {
  it("injects current run values, completes every checkpoint, and persists only value hashes", async () => {
    const replay = makeReplayVersion();
    const calls: MaterializedReplayOperation[] = [];
    const outcome = await executeDeterministicReplay({
      replay,
      snapshot: replay.snapshot,
      baseUrl: "http://classroom.pactwire.test",
      bindingValues: injectedValues,
      adapter: successfulAdapter(calls),
      now: () => "2026-07-21T10:15:00.000Z",
    });

    expect(outcome.state).toBe("COMPLETED");
    expect(outcome.arm).toBe("HUMAN_AUTHORED_DETERMINISTIC");
    expect(outcome.modelInvocationCount).toBe(0);
    expect(outcome.checkpoints).toEqual([
      expect.objectContaining({
        checkpointId: "submission-request",
        status: "VERIFIED",
      }),
    ]);
    expect(calls.find((call) => call.kind === "FILL")).toMatchObject({
      value: injectedValues["student-response-value"],
    });
    expect(calls.find((call) => call.kind === "ASSERT_VALUE")).toMatchObject({
      value: injectedValues["student-email-value"],
    });
    expect(JSON.stringify(outcome)).not.toContain(injectedValues["student-email-value"]);
    expect(JSON.stringify(outcome)).not.toContain(injectedValues["student-response-value"]);
    expect(outcome.trace.filter((event) => event.valueHash)).toHaveLength(2);
  });

  it("reports drift and never success when a required checkpoint moves or disappears", async () => {
    const replay = makeReplayVersion();
    const outcome = await executeDeterministicReplay({
      replay,
      snapshot: replay.snapshot,
      baseUrl: "http://classroom.pactwire.test",
      bindingValues: injectedValues,
      adapter: {
        execute(operation) {
          return Promise.resolve(operation.kind === "NAVIGATE"
            ? {
                status: "DRIFTED" as const,
                reasonCode: "NAVIGATION_STATUS_MISMATCH",
              }
            : { status: "COMPLETED" as const });
        },
      },
      now: () => "2026-07-21T10:15:00.000Z",
    });

    expect(outcome.state).toBe("DRIFTED");
    expect(outcome.checkpoints).toEqual([
      expect.objectContaining({
        checkpointId: "submission-request",
        status: "NOT_REACHED",
      }),
    ]);
    expect(outcome.trace).toEqual([
      expect.objectContaining({
        operationId: "open-student-workspace",
        status: "DRIFTED",
        reasonCode: "NAVIGATION_STATUS_MISMATCH",
      }),
    ]);
  });

  it("rejects changed frozen scope before the adapter can act", async () => {
    const replay = makeReplayVersion();
    const calls: MaterializedReplayOperation[] = [];
    await expect(
      executeDeterministicReplay({
        replay,
        snapshot: {
          ...replay.snapshot,
          runnerConfigVersion: "changed-runner",
          snapshotHash: "b".repeat(64),
        },
        baseUrl: "http://classroom.pactwire.test",
        bindingValues: injectedValues,
        adapter: successfulAdapter(calls),
        now: () => "2026-07-21T10:15:00.000Z",
      }),
    ).rejects.toBeInstanceOf(FrozenReplayScopeError);
    expect(calls).toEqual([]);
  });
});
