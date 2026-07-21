import { createHash } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyRunEvent, runSchema } from "../../packages/core/src/domain";
import {
  buildRunExecutionScope,
  buildRunManifest,
  InMemoryRunOrchestrationRepository,
  RunOrchestrationService,
} from "../../packages/core/src/run-orchestration";
import {
  automationActor,
  domainIds,
  humanActor,
  makeQueuedRun,
} from "../helpers/domain-fixtures";

const propertyOptions = Object.freeze({ seed: 20_260_722, numRuns: 250 });
const checkpointArbitrary = fc.uniqueArray(
  fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/u),
  { minLength: 2, maxLength: 10 },
);
const observationArbitrary = fc.uniqueArray(
  fc.record({
    sequence: fc.integer({ min: 0, max: 1_000_000 }),
    source: fc.constantFrom("BROWSER", "NETWORK", "STORAGE", "RECORDER"),
    payload: fc.string({ maxLength: 80 }),
  }),
  { maxLength: 20, selector: ({ sequence }) => sequence },
);

function uuidFor(value: number, prefix = "dddddddd-dddd-4ddd-8ddd"): string {
  return `${prefix}-${value.toString(16).padStart(12, "0")}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function shuffled<T>(values: readonly T[], seed: number): readonly T[] {
  return fc.sample(
    fc.shuffledSubarray([...values], {
      minLength: values.length,
      maxLength: values.length,
    }),
    { seed, numRuns: 1 },
  )[0]!;
}

function orchestrationFixture() {
  let current = Date.parse("2026-07-22T10:00:00.000Z");
  let identifier = 1;
  const repository = new InMemoryRunOrchestrationRepository();
  const service = new RunOrchestrationService(repository, {
    idFactory: () => uuidFor(identifier++),
    now: () => new Date(current).toISOString(),
    leaseDurationMs: 1_000,
  });
  return {
    repository,
    service,
    advance: (milliseconds: number) => {
      current += milliseconds;
    },
  };
}

function queueInput(
  idempotencyKey: string,
  requiredCheckpointIds: readonly string[],
  runnerConfigVersion = "runner-v1",
) {
  return {
    workspaceId: domainIds.workspace,
    softwareId: domainIds.software,
    snapshot: {
      agreementVersionId: domainIds.agreement,
      journeyVersionId: domainIds.journeyVersion,
      authorizationId: domainIds.authorization,
      runnerConfigVersion,
      snapshotHash: sha256(`snapshot:${runnerConfigVersion}`),
    },
    requiredCheckpointIds,
    modelIdentifier: "gpt-5.6-sol",
    queuedBy: humanActor,
    idempotencyKey,
  };
}

describe("run orchestration properties", () => {
  it("PROP-22: canonical observation and coverage ordering produces one manifest hash", () => {
    fc.assert(
      fc.property(
        checkpointArbitrary,
        observationArbitrary,
        fc.integer(),
        fc.integer(),
        fc.nat(),
        (checkpointIds, observations, observationSeed, coverageSeed, mask) => {
          const running = runSchema.parse(
            applyRunEvent(makeQueuedRun(), {
              eventId: uuidFor(1, "eeeeeeee-eeee-4eee-8eee"),
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
            requiredCheckpointIds: checkpointIds,
            modelIdentifier: "gpt-5.6-sol",
            createdAt: running.queuedAt,
            createdBy: humanActor,
          });
          const normalizedObservations = observations.map((observation) => ({
            observationId: uuidFor(
              observation.sequence,
              "ffffffff-ffff-4fff-8fff",
            ),
            sequence: observation.sequence,
            source: observation.source,
            payloadHash: sha256(observation.payload),
          }));
          const coverage = checkpointIds.map((checkpointId, index) =>
            (mask & (1 << index)) !== 0
              ? { checkpointId, status: "VERIFIED" as const }
              : {
                  checkpointId,
                  status: "NOT_VISIBLE" as const,
                  reason: "Generated capture gap.",
                },
          );
          const verified = coverage.filter(
            (checkpoint) => checkpoint.status === "VERIFIED",
          ).length;
          const terminalStatus =
            verified === coverage.length
              ? ("COMPLETED" as const)
              : verified === 0
                ? ("FAILED" as const)
                : ("PARTIAL" as const);
          const base = {
            id: uuidFor(2, "eeeeeeee-eeee-4eee-8eee"),
            run: running,
            scope,
            terminalStatus,
            runnerVersion: "pactwire-runner-v1",
            terminalAt: "2026-07-22T10:02:00.000Z",
            observations: normalizedObservations,
            coverage,
            limitations: ["Generated controlled run only."],
            finalizedBy: automationActor,
          };

          const canonical = buildRunManifest(base);
          const permuted = buildRunManifest({
            ...base,
            observations: shuffled(normalizedObservations, observationSeed),
            coverage: shuffled(coverage, coverageSeed),
          });

          expect(permuted).toEqual(canonical);
          expect(permuted.manifestHash).toBe(canonical.manifestHash);
        },
      ),
      propertyOptions,
    );
  });

  it("PROP-18: arbitrary safe retry chains preserve the exact frozen snapshot and scope", async () => {
    await fc.assert(
      fc.asyncProperty(
        checkpointArbitrary,
        fc.stringMatching(/^[A-Za-z0-9._-]{1,40}$/u),
        fc.integer({ min: 1, max: 5 }),
        async (checkpointIds, runnerConfigVersion, retryCount) => {
          const { service, advance } = orchestrationFixture();
          let run = await service.queueRun(
            queueInput("property-queue", checkpointIds, runnerConfigVersion),
          );
          const frozenSnapshot = structuredClone(run.snapshot);
          let frozenScope: readonly string[] | undefined;

          for (let index = 0; index < retryCount; index += 1) {
            const claimed = await service.claimNext({
              workspaceId: domainIds.workspace,
              workerId: `property-worker-${index}`,
              leaseToken: `${String(index).padStart(2, "0")}${"l".repeat(40)}`,
              actor: automationActor,
              idempotencyKey: `property-claim-${index}`,
            });
            expect(claimed).toBeDefined();
            frozenScope ??= [...claimed!.scope.requiredCheckpointIds];
            advance(1_001);
            const failed = await service.failExpiredLease({
              workspaceId: domainIds.workspace,
              runId: run.id,
              actor: automationActor,
              idempotencyKey: `property-expire-${index}`,
            });
            const retry = await service.retryRun({
              workspaceId: domainIds.workspace,
              sourceRunId: failed.id,
              requestedBy: humanActor,
              idempotencyKey: `property-retry-${index}`,
            });

            expect(retry.run.snapshot).toEqual(frozenSnapshot);
            expect(retry.scope.requiredCheckpointIds).toEqual(frozenScope);
            expect(retry.scope.modelIdentifier).toBe("gpt-5.6-sol");
            expect(retry.run.retryOfRunId).toBe(failed.id);
            run = retry.run;
          }
        },
      ),
      propertyOptions,
    );
  });

  it("PROP-19: every terminal orchestration result has a manifest or explicit integrity failure", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("COMPLETED", "PARTIAL", "FAILED", "CANCELED", "INTEGRITY"),
        fc.boolean(),
        async (outcome, invisible) => {
          const { repository, service } = orchestrationFixture();
          const checkpoints = ["request-captured", "completion-visible"];
          const queued = await service.queueRun(
            queueInput("terminal-queue", checkpoints),
          );
          let terminalRunId = queued.id;

          if (outcome === "CANCELED") {
            await service.cancelRun({
              workspaceId: domainIds.workspace,
              runId: queued.id,
              runnerVersion: "pactwire-runner-v1",
              observations: [],
              coverage: checkpoints.map((checkpointId) => ({
                checkpointId,
                status: "NOT_TESTED" as const,
                reason: "Generated cancellation before execution.",
              })),
              limitations: ["Generated controlled cancellation."],
              requestedBy: humanActor,
              finalizedBy: automationActor,
              idempotencyKey: "terminal-cancel",
            });
          } else {
            const claimed = await service.claimNext({
              workspaceId: domainIds.workspace,
              workerId: "terminal-worker",
              leaseToken: "t".repeat(40),
              actor: automationActor,
              idempotencyKey: "terminal-claim",
            });
            expect(claimed).toBeDefined();
            if (outcome === "INTEGRITY") {
              const failed = await service.failRunIntegrity({
                workspaceId: domainIds.workspace,
                runId: queued.id,
                leaseToken: claimed!.leaseToken,
                terminalStatus: invisible ? "PARTIAL" : "FAILED",
                code: "GENERATED_CAPTURE_FAILURE",
                message: "Generated recorder integrity failure.",
                actor: automationActor,
                idempotencyKey: "terminal-integrity",
              });
              terminalRunId = failed.id;
            } else {
              const missing = {
                status: invisible ? ("NOT_VISIBLE" as const) : ("NOT_TESTED" as const),
                reason: "Generated missing checkpoint coverage.",
              };
              const coverage =
                outcome === "COMPLETED"
                  ? checkpoints.map((checkpointId) => ({
                      checkpointId,
                      status: "VERIFIED" as const,
                    }))
                  : outcome === "PARTIAL"
                    ? [
                        {
                          checkpointId: checkpoints[0]!,
                          status: "VERIFIED" as const,
                        },
                        { checkpointId: checkpoints[1]!, ...missing },
                      ]
                    : checkpoints.map((checkpointId) => ({
                        checkpointId,
                        ...missing,
                      }));
              await service.finalizeRun({
                workspaceId: domainIds.workspace,
                runId: queued.id,
                leaseToken: claimed!.leaseToken,
                terminalStatus: outcome,
                runnerVersion: "pactwire-runner-v1",
                observations: [],
                coverage,
                limitations: ["Generated controlled terminal outcome."],
                actor: automationActor,
                idempotencyKey: "terminal-finalize",
              });
            }
          }

          const history = await repository.getHistoryEntry(
            domainIds.workspace,
            terminalRunId,
          );
          expect(history?.run.state).toMatch(
            /^(COMPLETED|PARTIAL|FAILED|CANCELED)$/u,
          );
          if (outcome === "INTEGRITY") {
            expect(history?.manifest).toBeUndefined();
            expect(history?.run.integrityFailure).toBeDefined();
          } else {
            expect(history?.manifest).toBeDefined();
            expect(history?.run.integrityFailure).toBeUndefined();
          }
        },
      ),
      propertyOptions,
    );
  });
});
