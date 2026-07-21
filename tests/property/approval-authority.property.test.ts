import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ApprovalAuthorityService,
  InMemoryApprovalAuthorityRepository,
} from "../../packages/core/src/approval-authority";
import { domainIds } from "../helpers/domain-fixtures";
import {
  approvalSoftwareFixture,
  conflictSignal,
  idFactory,
  repairedSignal,
} from "../helpers/approval-authority-fixtures";

const seed = 20260721;

async function fixture() {
  const repository = new InMemoryApprovalAuthorityRepository();
  await repository.initialize(approvalSoftwareFixture);
  const service = new ApprovalAuthorityService(
    repository,
    { checkPermission: () => Promise.resolve([]) },
    {
      idFactory: idFactory(),
      now: () => "2026-07-22T15:00:00.000Z",
    },
  );
  return { repository, service };
}

describe("DET-05 approval authority properties", () => {
  it("PROP-03 applies any concurrent duplicate witnessed-conflict receipt exactly once", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 25 }), async (count) => {
        const { repository, service } = await fixture();
        const signal = conflictSignal();
        await Promise.all(
          Array.from({ length: count }, () => service.considerFinding(signal)),
        );
        const snapshot = await repository.getSnapshot(
          domainIds.workspace,
          domainIds.software,
        );
        expect(snapshot?.state).toBe("HOLD");
        expect(snapshot?.events).toHaveLength(1);
        expect(snapshot?.holdReceipts).toHaveLength(1);
      }),
      { seed, numRuns: 200 },
    );
  }, 20_000);

  it("PROP-02 automation never enters APPROVED under generated finding sequences", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom("CONFLICT", "CLEAN"), {
          minLength: 1,
          maxLength: 40,
        }),
        async (sequence) => {
          const { repository, service } = await fixture();
          for (const [index, step] of sequence.entries()) {
            const signal = step === "CONFLICT" ? conflictSignal() : repairedSignal();
            await service.considerFinding({
              ...signal,
              idempotencyKey: `${signal.idempotencyKey}:${index}`,
            });
          }
          const snapshot = await repository.getSnapshot(
            domainIds.workspace,
            domainIds.software,
          );
          for (const event of snapshot?.events ?? []) {
            if (event.actor.kind === "AUTOMATION") {
              expect(event.to).toBe("HOLD");
              expect(event.from).toBe("APPROVED");
            }
          }
        },
      ),
      { seed, numRuns: 500 },
    );
  }, 20_000);

  it("PROP-11 preserves every prior event and actor under generated duplicate sequences", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 30 }),
        async (duplicates) => {
          const { repository, service } = await fixture();
          const signal = conflictSignal();
          let priorEvents: readonly unknown[] = [];
          for (const [index, duplicate] of duplicates.entries()) {
            await service.considerFinding({
              ...signal,
              idempotencyKey: duplicate
                ? signal.idempotencyKey
                : `${signal.idempotencyKey}:${index}`,
            });
            const snapshot = await repository.getSnapshot(
              domainIds.workspace,
              domainIds.software,
            );
            expect(snapshot?.events.slice(0, priorEvents.length)).toEqual(
              priorEvents,
            );
            priorEvents = structuredClone(snapshot?.events ?? []);
            expect(snapshot?.events.every(({ actor }) => actor.actorId.length > 0)).toBe(
              true,
            );
          }
        },
      ),
      { seed, numRuns: 300 },
    );
  }, 20_000);
});
