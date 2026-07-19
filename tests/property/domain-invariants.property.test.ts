import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  appendAuditEvent,
  applyApprovalEvent,
  approvalEventSchema,
  assertRetrySnapshot,
  createRetryRun,
  deserializeDomainEvent,
  findingSchema,
  runSchema,
  serializeDomainEvent,
  WorkspaceBoundaryStore,
  type ApprovalAggregate,
  type ApprovalState,
} from "../../packages/core/src/domain";
import {
  automationActor,
  domainIds,
  humanActor,
  makeTerminalRun,
} from "../helpers/domain-fixtures";

const propertyOptions = { seed: 20_260_719, numRuns: 250 } as const;
const approvalStates = [
  "UNKNOWN",
  "APPROVED",
  "HOLD",
  "REJECTED",
  "RETIRED",
] as const;
const approvalReasons = [
  "WITNESSED_CONFLICT",
  "REQUIRED_VISIBILITY_LOSS",
  "HUMAN_DECISION",
  "IMPORTED_DECISION",
  "HUMAN_HOLD",
  "HUMAN_REJECTION",
  "HUMAN_RETIREMENT",
] as const;

function uuidFor(index: number): string {
  const tail = (index + 1).toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${tail}`;
}

function humanReason(target: ApprovalState): (typeof approvalReasons)[number] {
  switch (target) {
    case "HOLD":
      return "HUMAN_HOLD";
    case "REJECTED":
      return "HUMAN_REJECTION";
    case "RETIRED":
      return "HUMAN_RETIREMENT";
    case "UNKNOWN":
    case "APPROVED":
      return "HUMAN_DECISION";
  }
}

describe("core domain properties", () => {
  it("PROP-01: no automated event sequence can enter or restore APPROVED", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...approvalStates),
        fc.array(
          fc.record({
            to: fc.constantFrom(...approvalStates),
            reason: fc.constantFrom(...approvalReasons),
          }),
          { maxLength: 50 },
        ),
        (initialState, attempts) => {
          let aggregate: ApprovalAggregate = {
            workspaceId: domainIds.workspace,
            softwareId: domainIds.software,
            state: initialState,
            events: [],
          };
          for (const [index, attempt] of attempts.entries()) {
            try {
              aggregate = applyApprovalEvent(aggregate, {
                eventId: uuidFor(index),
                workspaceId: domainIds.workspace,
                softwareId: domainIds.software,
                from: aggregate.state,
                to: attempt.to,
                reason: attempt.reason,
                actor: automationActor,
                occurredAt: "2026-07-19T18:30:00.000Z",
              });
              expect(aggregate.state).not.toBe("APPROVED");
            } catch {
              expect(aggregate.state).toBeDefined();
            }
          }
        },
      ),
      propertyOptions,
    );
  });

  it("PROP-02: the only accepted automated transition is APPROVED to HOLD", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...approvalStates),
        fc.constantFrom(...approvalStates),
        fc.constantFrom(...approvalReasons),
        (from, to, reason) => {
          const accepted = approvalEventSchema.safeParse({
            eventId: uuidFor(0),
            workspaceId: domainIds.workspace,
            softwareId: domainIds.software,
            from,
            to,
            reason,
            actor: automationActor,
            occurredAt: "2026-07-19T18:30:00.000Z",
          }).success;
          const expected =
            from === "APPROVED" &&
            to === "HOLD" &&
            ["WITNESSED_CONFLICT", "REQUIRED_VISIBILITY_LOSS"].includes(reason);

          expect(accepted).toBe(expected);
        },
      ),
      propertyOptions,
    );
  });

  it("PROP-05: clean and not-reobserved findings require all required checkpoints", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS" as const,
          "NOT_REOBSERVED_IN_NAMED_TESTS" as const,
        ),
        fc
          .array(
            fc.record({
              required: fc.boolean(),
              exercised: fc.boolean(),
              visible: fc.boolean(),
            }),
            { minLength: 1, maxLength: 30 },
          )
          .filter((checkpoints) => checkpoints.some((checkpoint) => checkpoint.required)),
        (state, checkpoints) => {
          const complete = checkpoints
            .filter((checkpoint) => checkpoint.required)
            .every((checkpoint) => checkpoint.exercised && checkpoint.visible);
          const result = findingSchema.safeParse({
            id: domainIds.finding,
            workspaceId: domainIds.workspace,
            runId: domainIds.run,
            requirementVersionId: domainIds.requirement,
            state,
            checkpoints: checkpoints.map((checkpoint, index) => ({
              checkpointId: `checkpoint-${index}`,
              ...checkpoint,
            })),
            observationIds: [],
            ...(state === "NOT_REOBSERVED_IN_NAMED_TESTS"
              ? { priorFindingId: "30303030-3030-4030-8030-303030303030" }
              : {}),
            limitations: ["Only generated fictional checkpoints were evaluated."],
            createdAt: "2026-07-19T18:30:00.000Z",
          });

          expect(result.success).toBe(complete);
        },
      ),
      propertyOptions,
    );
  });

  it("PROP-11: audit and approval histories append without mutation and preserve actors", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("created", "reviewed", "held"), {
          minLength: 1,
          maxLength: 30,
        }),
        fc.array(fc.constantFrom(...approvalStates), { maxLength: 30 }),
        (actions, targets) => {
          let auditHistory: ReturnType<typeof appendAuditEvent> = [];
          for (const [index, action] of actions.entries()) {
            const before = structuredClone(auditHistory);
            auditHistory = appendAuditEvent(auditHistory, {
              eventId: uuidFor(index),
              eventType: "AUDIT_RECORDED",
              workspaceId: domainIds.workspace,
              subjectType: "software",
              subjectId: domainIds.software,
              action,
              actor: humanActor,
              occurredAt: "2026-07-19T18:30:00.000Z",
              details: { synthetic: true },
            });
            expect(auditHistory.slice(0, -1)).toEqual(before);
            expect(auditHistory.at(-1)?.actor).toEqual(humanActor);
          }

          let approval: ApprovalAggregate = {
            workspaceId: domainIds.workspace,
            softwareId: domainIds.software,
            state: "UNKNOWN",
            events: [],
          };
          for (const [index, target] of targets.entries()) {
            if (approval.state === "RETIRED" || approval.state === target) {
              continue;
            }
            const before = structuredClone(approval);
            approval = applyApprovalEvent(approval, {
              eventId: uuidFor(100 + index),
              workspaceId: domainIds.workspace,
              softwareId: domainIds.software,
              from: approval.state,
              to: target,
              reason: humanReason(target),
              ...(target === "APPROVED"
                ? { humanDecisionId: uuidFor(200 + index) }
                : {}),
              actor: humanActor,
              occurredAt: "2026-07-19T18:30:00.000Z",
            });
            expect(approval.events.slice(0, -1)).toEqual(before.events);
            expect(approval.events.at(-1)?.actor).toEqual(humanActor);
          }
        },
      ),
      propertyOptions,
    );
  });

  it("PROP-12: one workspace cannot read, mutate, reference, or export another", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (payload) => {
        const store = new WorkspaceBoundaryStore<{
          readonly id: string;
          readonly workspaceId: string;
          readonly payload: string;
        }>();
        const workspaceA = domainIds.workspace;
        const workspaceB = "31313131-3131-4131-8131-313131313131";
        const sharedId = "32323232-3232-4232-8232-323232323232";
        const recordA = {
          id: sharedId,
          workspaceId: workspaceA,
          payload,
        };
        store.insert(workspaceA, recordA);

        expect(store.read(workspaceB, recordA.id)).toBeUndefined();
        expect(() =>
          store.mutate(workspaceB, recordA.id, (record) => record),
        ).toThrow();
        expect(() =>
          store.insert(
            workspaceB,
            {
              id: "33333333-3333-4333-8333-333333333334",
              workspaceId: workspaceB,
              payload,
            },
            [recordA.id],
          ),
        ).toThrow();
        expect(store.exportWorkspace(workspaceB)).toEqual([]);
        expect(store.exportWorkspace(workspaceA)).toEqual([recordA]);

        const recordB = {
          id: sharedId,
          workspaceId: workspaceB,
          payload: `workspace-b:${payload}`,
        };
        store.insert(workspaceB, recordB);
        expect(store.read(workspaceA, sharedId)).toEqual(recordA);
        expect(store.read(workspaceB, sharedId)).toEqual(recordB);
      }),
      propertyOptions,
    );
  });

  it("PROP-18: retries preserve the exact frozen configuration", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.constantFrom(
          "agreementVersionId",
          "journeyVersionId",
          "authorizationId",
          "runnerConfigVersion",
          "snapshotHash",
        ),
        (runnerConfigVersion, changedField) => {
          const source = runSchema.parse(
            makeTerminalRun({
              snapshot: {
                agreementVersionId: domainIds.agreement,
                journeyVersionId: domainIds.journeyVersion,
                authorizationId: domainIds.authorization,
                runnerConfigVersion,
                snapshotHash: "a".repeat(64),
              },
            }),
          );
          const retry = createRetryRun(source, {
            id: "34343434-3434-4434-8434-343434343434",
            eventId: "35353535-3535-4535-8535-353535353535",
            queuedAt: "2026-07-19T18:40:00.000Z",
            actor: humanActor,
          });
          expect(retry.snapshot).toEqual(source.snapshot);

          const changed = {
            ...retry.snapshot,
            [changedField]:
              changedField === "snapshotHash"
                ? "b".repeat(64)
                : changedField === "runnerConfigVersion"
                  ? `${runnerConfigVersion}-changed`
                  : "36363636-3636-4636-8636-363636363636",
          };
          expect(() => assertRetrySnapshot(source.snapshot, changed)).toThrow();
        },
      ),
      propertyOptions,
    );
  });

  it("PROP-19: every terminal run has a manifest or an explicit integrity failure", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("COMPLETED", "PARTIAL", "FAILED", "CANCELED"),
        fc.boolean(),
        fc.boolean(),
        (state, hasManifest, hasIntegrityFailure) => {
          const result = runSchema.safeParse(
            makeTerminalRun({
              state,
              terminalAt: "2026-07-19T18:40:00.000Z",
              ...(hasManifest ? { manifestHash: "b".repeat(64) } : {}),
              ...(hasIntegrityFailure
                ? {
                    integrityFailure: {
                      code: "GENERATED_FAILURE",
                      message: "Generated explicit integrity failure.",
                    },
                  }
                : { integrityFailure: undefined }),
            }),
          );
          const expected =
            state === "COMPLETED"
              ? hasManifest && !hasIntegrityFailure
              : hasManifest !== hasIntegrityFailure;

          expect(result.success).toBe(expected);
        },
      ),
      propertyOptions,
    );
  });

  it("domain events round-trip without semantic loss", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (value) => {
        const event = {
          eventId: uuidFor(0),
          eventType: "AUDIT_RECORDED",
          workspaceId: domainIds.workspace,
          subjectType: "software",
          subjectId: domainIds.software,
          action: "generated",
          actor: humanActor,
          occurredAt: "2026-07-19T18:30:00.000Z",
          details: { value },
        };

        expect(deserializeDomainEvent(serializeDomainEvent(event))).toEqual(event);
      }),
      propertyOptions,
    );
  });
});
