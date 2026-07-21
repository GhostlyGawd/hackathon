import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  FrozenReplayScopeError,
  executeDeterministicReplay,
  type MaterializedReplayOperation,
} from "../../apps/runner/src/deterministic-replay";
import { makeReplayVersion } from "../helpers/deterministic-replay-fixtures";

const propertySeed = 20260721;
const propertyRuns = 250;

describe("deterministic replay properties", () => {
  it("PROP-18: retries preserve frozen scope while run-specific values change only materialized inputs", async () => {
    const replay = makeReplayVersion();
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z0-9]{8,24}$/u),
        fc.stringMatching(/^[A-Z0-9]{12,32}$/u),
        async (emailToken, responseToken) => {
          const values = {
            "student-email-value": `${emailToken}@canary.pactwire.invalid`,
            "student-response-value": `PACTWIRE-FICTIONAL-${responseToken}`,
          };
          const calls: MaterializedReplayOperation[] = [];
          const outcome = await executeDeterministicReplay({
            replay,
            snapshot: structuredClone(replay.snapshot),
            baseUrl: "http://classroom.pactwire.test",
            bindingValues: values,
            adapter: {
              execute(operation) {
                calls.push(operation);
                return Promise.resolve({ status: "COMPLETED" as const });
              },
            },
            now: () => "2026-07-21T10:15:00.000Z",
          });

          expect(outcome.state).toBe("COMPLETED");
          expect(outcome.snapshot).toEqual(replay.snapshot);
          expect(calls.map((operation) => operation.operationId)).toEqual(
            replay.operations.map((operation) => operation.operationId),
          );
          expect(JSON.stringify(outcome)).not.toContain(values["student-email-value"]);
          expect(JSON.stringify(outcome)).not.toContain(values["student-response-value"]);
        },
      ),
      { seed: propertySeed, numRuns: propertyRuns },
    );
  });

  it("PROP-18: every changed frozen field is rejected before execution", async () => {
    const replay = makeReplayVersion();
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "agreementVersionId",
          "journeyVersionId",
          "authorizationId",
          "runnerConfigVersion",
          "snapshotHash",
        ),
        async (field) => {
          const calls: MaterializedReplayOperation[] = [];
          const snapshot = {
            ...replay.snapshot,
            [field]:
              field === "runnerConfigVersion"
                ? "different-runner"
                : field === "snapshotHash"
                  ? "f".repeat(64)
                  : "15151515-1515-4515-8515-151515151515",
          };
          await expect(
            executeDeterministicReplay({
              replay,
              snapshot,
              baseUrl: "http://classroom.pactwire.test",
              bindingValues: {
                "student-email-value": "student@canary.pactwire.invalid",
                "student-response-value": "PACTWIRE-FICTIONAL-AAAAAAAAAAAA",
              },
              adapter: {
                execute(operation) {
                  calls.push(operation);
                  return Promise.resolve({ status: "COMPLETED" as const });
                },
              },
              now: () => "2026-07-21T10:15:00.000Z",
            }),
          ).rejects.toBeInstanceOf(FrozenReplayScopeError);
          expect(calls).toEqual([]);
        },
      ),
      { seed: propertySeed, numRuns: propertyRuns },
    );
  });

  it("PROP-05: a missing required checkpoint cannot become a successful replay", async () => {
    const replay = makeReplayVersion();
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (checkpointVisible) => {
        const outcome = await executeDeterministicReplay({
          replay,
          snapshot: replay.snapshot,
          baseUrl: "http://classroom.pactwire.test",
          bindingValues: {
            "student-email-value": "student@canary.pactwire.invalid",
            "student-response-value": "PACTWIRE-FICTIONAL-AAAAAAAAAAAA",
          },
          adapter: {
            execute(operation) {
              if (operation.kind === "CHECKPOINT" && !checkpointVisible) {
                return Promise.resolve({
                  status: "DRIFTED" as const,
                  reasonCode: "CHECKPOINT_MISSING",
                });
              }
              return Promise.resolve({ status: "COMPLETED" as const });
            },
          },
          now: () => "2026-07-21T10:15:00.000Z",
        });

        if (checkpointVisible) {
          expect(outcome.state).toBe("COMPLETED");
        } else {
          expect(outcome.state).toBe("DRIFTED");
          expect(outcome.checkpoints.some((checkpoint) => checkpoint.status === "VERIFIED")).toBe(false);
        }
      }),
      { seed: propertySeed, numRuns: propertyRuns },
    );
  });
});
