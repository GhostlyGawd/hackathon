import { describe, expect, it, vi } from "vitest";
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
  visibilitySignal,
} from "../helpers/approval-authority-fixtures";

function fixture(options: { readonly authorized?: boolean } = {}) {
  const repository = new InMemoryApprovalAuthorityRepository();
  const checkPermission = vi.fn(() => {
    if (options.authorized === false) {
      return Promise.reject(new Error("permission denied"));
    }
    return Promise.resolve([]);
  });
  const service = new ApprovalAuthorityService(
    repository,
    { checkPermission },
    {
      idFactory: idFactory(),
      now: () => "2026-07-22T15:00:00.000Z",
    },
  );
  return { checkPermission, repository, service };
}

describe("DET-05 approval hold authority", () => {
  it("applies one receipt-linked APPROVED to HOLD transition for an exact witnessed conflict", async () => {
    const { repository, service } = fixture();
    await repository.initialize(approvalSoftwareFixture);
    const signal = conflictSignal();

    const first = await service.considerFinding(signal);
    const duplicate = await service.considerFinding(signal);
    const snapshot = await repository.getSnapshot(
      domainIds.workspace,
      domainIds.software,
    );

    expect(first.outcome).toBe("HOLD_APPLIED");
    expect(duplicate.outcome).toBe("ALREADY_RECORDED");
    expect(snapshot).toMatchObject({
      state: "HOLD",
      events: [
        {
          from: "APPROVED",
          to: "HOLD",
          reason: "WITNESSED_CONFLICT",
          receiptId: signal.receiptBundle.receipt.id,
          actor: { kind: "AUTOMATION" },
        },
      ],
    });
    expect(snapshot?.holdReceipts).toHaveLength(1);
  });

  it("keeps HOLD after a clean named rerun and never lets automation enter APPROVED", async () => {
    const { repository, service } = fixture();
    await repository.initialize(approvalSoftwareFixture);
    await service.considerFinding(conflictSignal());

    const result = await service.considerFinding(repairedSignal());
    const snapshot = await repository.getSnapshot(
      domainIds.workspace,
      domainIds.software,
    );

    expect(result).toMatchObject({
      outcome: "NO_CHANGE",
      reason: "FINDING_DOES_NOT_AUTHORIZE_A_STATE_CHANGE",
    });
    expect(snapshot?.state).toBe("HOLD");
    expect(snapshot?.events).toHaveLength(1);
  });

  it("requires previous visibility and a frozen retry before visibility loss can hold approval", async () => {
    const neverVisible = fixture();
    await neverVisible.repository.initialize(approvalSoftwareFixture);
    await expect(
      neverVisible.service.considerFinding(
        visibilitySignal({ previouslyVisible: false }),
      ),
    ).resolves.toMatchObject({
      outcome: "NO_CHANGE",
      reason: "FROZEN_RETRY_REQUIRED",
    });

    const unfrozen = fixture();
    await unfrozen.repository.initialize(approvalSoftwareFixture);
    await expect(
      unfrozen.service.considerFinding(visibilitySignal({ frozenRetry: false })),
    ).resolves.toMatchObject({
      outcome: "NO_CHANGE",
      reason: "FROZEN_RETRY_REQUIRED",
    });
    expect(
      (
        await unfrozen.repository.getSnapshot(
          domainIds.workspace,
          domainIds.software,
        )
      )?.state,
    ).toBe("APPROVED");

    const frozen = fixture();
    await frozen.repository.initialize(approvalSoftwareFixture);
    await expect(
      frozen.service.considerFinding(visibilitySignal()),
    ).resolves.toMatchObject({ outcome: "HOLD_APPLIED" });
    expect(
      (
        await frozen.repository.getSnapshot(
          domainIds.workspace,
          domainIds.software,
        )
      )?.events[0],
    ).toMatchObject({ reason: "REQUIRED_VISIBILITY_LOSS" });
  });

  it("requires a signed authorized human decision and named-scope acknowledgement to restore approval", async () => {
    const denied = fixture({ authorized: false });
    await denied.repository.initialize(approvalSoftwareFixture);
    await denied.service.considerFinding(conflictSignal());
    await expect(
      denied.service.recordHumanDecision({
        principal: {
          userId: "fictional-reviewer-a",
          displayName: "Jordan Brooks (Fictional)",
          activeWorkspaceId: domainIds.workspace,
        },
        workspaceId: domainIds.workspace,
        softwareId: domainIds.software,
        outcome: "RESTORE_APPROVED",
        rationale: "Reviewed the bounded fictional rerun evidence.",
        namedScopeAcknowledged: true,
        receiptId: conflictSignal().receiptBundle.receipt.id,
        reviewedRun: {
          runId: domainIds.run,
          findingState: "NOT_REOBSERVED_IN_NAMED_TESTS",
        },
      }),
    ).rejects.toThrow("permission denied");

    const allowed = fixture();
    await allowed.repository.initialize(approvalSoftwareFixture);
    const signal = conflictSignal();
    await allowed.service.considerFinding(signal);
    const result = await allowed.service.recordHumanDecision({
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
    expect(result.snapshot.decisions[0]).toMatchObject({
      outcome: "RESTORE_APPROVED",
      actor: { kind: "HUMAN", actorId: "fictional-officer-a" },
      namedScopeAcknowledged: true,
    });
    expect(result.snapshot.events.at(-1)).toMatchObject({
      from: "HOLD",
      to: "APPROVED",
      actor: { kind: "HUMAN" },
    });
    expect(allowed.checkPermission).toHaveBeenCalledWith(
      expect.objectContaining({ permission: "APPROVAL_RESTORE" }),
    );
  });

  it("rejects restoration without a clean reviewed run or explicit named-scope acknowledgement", async () => {
    const { repository, service } = fixture();
    await repository.initialize(approvalSoftwareFixture);
    const signal = conflictSignal();
    await service.considerFinding(signal);
    const base = {
      principal: {
        userId: "fictional-officer-a",
        displayName: "Morgan Vale (Fictional)",
        activeWorkspaceId: domainIds.workspace,
      },
      workspaceId: domainIds.workspace,
      softwareId: domainIds.software,
      outcome: "RESTORE_APPROVED" as const,
      rationale: "Reviewed the bounded fictional rerun evidence.",
      receiptId: signal.receiptBundle.receipt.id,
    };

    await expect(
      service.recordHumanDecision({
        ...base,
        namedScopeAcknowledged: false,
        reviewedRun: {
          runId: domainIds.run,
          findingState: "NOT_REOBSERVED_IN_NAMED_TESTS",
        },
      }),
    ).rejects.toThrow();
    await expect(
      service.recordHumanDecision({
        ...base,
        namedScopeAcknowledged: true,
        reviewedRun: {
          runId: domainIds.run,
          findingState: "NEEDS_REVIEW",
        },
      }),
    ).rejects.toThrow("named clean rerun");
  });
});
