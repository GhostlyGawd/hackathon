import { afterEach, describe, expect, it } from "vitest";
import {
  ApprovalAuthorityService,
  PostgresApprovalAuthorityRepository,
} from "../../packages/core/src/approval-authority";
import type { DatabaseTestService } from "../../packages/testkit/src/index";
import { domainIds } from "../helpers/domain-fixtures";
import {
  conflictSignal,
  idFactory,
} from "../helpers/approval-authority-fixtures";
import { seedPostgresApprovalFixture } from "../helpers/postgres-approval-fixture";

const databases: DatabaseTestService[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

async function fixture() {
  const seeded = await seedPostgresApprovalFixture();
  databases.push(seeded.databaseService);
  const repository = new PostgresApprovalAuthorityRepository(
    seeded.databaseService.database,
  );
  const service = new ApprovalAuthorityService(
    repository,
    seeded.authorization,
    {
      idFactory: idFactory(),
      now: () => "2026-07-22T15:00:00.000Z",
    },
  );
  return { ...seeded, repository, service };
}

describe("DET-05 PostgreSQL approval authority", () => {
  it("commits one receipt contribution, one hold event, and one current-state update", async () => {
    const { databaseService, repository, service } = await fixture();
    const signal = conflictSignal();

    await expect(service.considerFinding(signal)).resolves.toMatchObject({
      outcome: "HOLD_APPLIED",
    });
    await expect(service.considerFinding(signal)).resolves.toMatchObject({
      outcome: "ALREADY_RECORDED",
    });

    const snapshot = await repository.getSnapshot(
      domainIds.workspace,
      domainIds.software,
    );
    expect(snapshot).toMatchObject({
      state: "HOLD",
      approvalOrigin: {
        state: "HOLD",
        setBy: { kind: "AUTOMATION" },
      },
    });
    expect(snapshot?.events).toHaveLength(1);
    expect(snapshot?.holdReceipts).toHaveLength(1);
    const stored = await databaseService.database.query<{
      approval_state: string;
      approval_owner: string;
    }>(
      "SELECT approval_state, approval_owner FROM software_records WHERE workspace_id = $1 AND id = $2",
      [domainIds.workspace, domainIds.software],
    );
    expect(stored.rows).toEqual([
      { approval_state: "HOLD", approval_owner: "AUTOMATION" },
    ]);
  });

  it("restores only through an authorized signed decision and keeps every prior byte append-only", async () => {
    const { databaseService, repository, service } = await fixture();
    const signal = conflictSignal();
    await service.considerFinding(signal);
    const before = await repository.getSnapshot(
      domainIds.workspace,
      domainIds.software,
    );

    const result = await service.recordHumanDecision({
      principal: {
        userId: "fictional-officer-a",
        displayName: "Morgan Vale (Fictional)",
        activeWorkspaceId: domainIds.workspace,
      },
      workspaceId: domainIds.workspace,
      softwareId: domainIds.software,
      outcome: "RESTORE_APPROVED",
      rationale: "Reviewed the bounded fictional rerun evidence.",
      namedScopeAcknowledged: true,
      receiptId: signal.receiptBundle.receipt.id,
      reviewedRun: {
        runId: domainIds.run,
        findingState: "NOT_REOBSERVED_IN_NAMED_TESTS",
      },
    });

    expect(result.snapshot.state).toBe("APPROVED");
    expect(result.snapshot.events.slice(0, before?.events.length)).toEqual(
      before?.events,
    );
    expect(result.snapshot.decisions).toHaveLength(1);
    await expect(
      databaseService.database.query(
        "UPDATE approval_events SET reason = 'REQUIRED_VISIBILITY_LOSS' WHERE workspace_id = $1 AND software_id = $2",
        [domainIds.workspace, domainIds.software],
      ),
    ).rejects.toThrow(/immutable/iu);
    await expect(
      databaseService.database.query(
        "DELETE FROM human_decisions WHERE workspace_id = $1 AND software_id = $2",
        [domainIds.workspace, domainIds.software],
      ),
    ).rejects.toThrow(/immutable/iu);
  });
});
