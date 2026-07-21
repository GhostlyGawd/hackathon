import { describe, expect, it } from "vitest";
import { applyRunEvent, runSchema } from "../../packages/core/src/domain";
import {
  buildRunExecutionScope,
  buildRunManifest,
} from "../../packages/core/src/run-orchestration";
import {
  automationActor,
  domainIds,
  makeQueuedRun,
} from "../helpers/domain-fixtures";

const running = runSchema.parse(
  applyRunEvent(makeQueuedRun(), {
    eventId: "41414141-4141-4141-8141-414141414141",
    eventType: "RUN_STARTED",
    workspaceId: domainIds.workspace,
    runId: domainIds.run,
    from: "QUEUED",
    to: "RUNNING",
    actor: automationActor,
    occurredAt: "2026-07-22T10:01:00.000Z",
  }),
);

const scope = buildRunExecutionScope({
  runId: running.id,
  workspaceId: running.workspaceId,
  softwareId: running.softwareId,
  requiredCheckpointIds: ["submission-request", "completion-visible"],
  modelIdentifier: "gpt-5.6-sol",
  createdAt: running.queuedAt,
  createdBy: automationActor,
});

const observations = [
  {
    observationId: "43434343-4343-4343-8343-434343434343",
    sequence: 2,
    source: "RECORDER" as const,
    payloadHash: "c".repeat(64),
  },
  {
    observationId: "42424242-4242-4242-8242-424242424242",
    sequence: 1,
    source: "NETWORK" as const,
    payloadHash: "b".repeat(64),
  },
];

function manifestInput(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    run: running,
    scope,
    terminalStatus: "COMPLETED" as const,
    runnerVersion: "pactwire-runner-v1",
    terminalAt: "2026-07-22T10:02:00.000Z",
    observations,
    coverage: [
      { checkpointId: "submission-request", status: "VERIFIED" as const },
      { checkpointId: "completion-visible", status: "VERIFIED" as const },
    ],
    limitations: [
      "This manifest describes only the named controlled journey.",
    ],
    finalizedBy: automationActor,
    ...overrides,
  };
}

describe("run orchestration manifest", () => {
  it("canonicalizes observation order into a stable immutable manifest hash", () => {
    const forward = buildRunManifest(manifestInput());
    const reversed = buildRunManifest(
      manifestInput({ observations: [...observations].reverse() }),
    );

    expect(forward.manifestHash).toBe(reversed.manifestHash);
    expect(forward.observationHashes.map(({ sequence }) => sequence)).toEqual([
      1, 2,
    ]);
    expect(forward).toMatchObject({
      terminalStatus: "COMPLETED",
      modelIdentifier: "gpt-5.6-sol",
      runnerConfigVersion: "runner-v1",
      runnerVersion: "pactwire-runner-v1",
      missingCoverage: [],
    });
    expect(Object.isFrozen(forward)).toBe(true);
  });

  it("rejects completion when any frozen checkpoint is untested or invisible", () => {
    expect(() =>
      buildRunManifest(
        manifestInput({
          coverage: [
            {
              checkpointId: "submission-request",
              status: "VERIFIED",
            },
            {
              checkpointId: "completion-visible",
              status: "NOT_VISIBLE",
              reason: "The recorder lost the required capture point.",
            },
          ],
        }),
      ),
    ).toThrow(/completed|coverage/i);
  });

  it("preserves captured evidence and names missing coverage for a partial run", () => {
    const manifest = buildRunManifest(
      manifestInput({
        terminalStatus: "PARTIAL",
        coverage: [
          { checkpointId: "submission-request", status: "VERIFIED" },
          {
            checkpointId: "completion-visible",
            status: "NOT_TESTED",
            reason: "The worker stopped before this checkpoint.",
          },
        ],
      }),
    );

    expect(manifest.missingCoverage).toEqual([
      {
        checkpointId: "completion-visible",
        status: "NOT_TESTED",
        reason: "The worker stopped before this checkpoint.",
      },
    ]);
    expect(manifest.observationHashes).toHaveLength(2);
  });
});
