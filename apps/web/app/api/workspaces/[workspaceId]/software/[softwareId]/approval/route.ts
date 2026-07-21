import {
  ApprovalAuthorityIntegrityError,
  AuthenticationRequiredError,
  type VisibilityLossProof,
} from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import {
  fixtureFindingIds,
  getAccessRuntime,
} from "../../../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../../../lib/session";

interface RouteContext {
  readonly params: Promise<{ workspaceId: string; softwareId: string }>;
}

async function storedVisibilityProof(
  workspaceId: string,
  findingId: string,
): Promise<VisibilityLossProof | undefined> {
  const runtime = await getAccessRuntime();
  const finding = await runtime.findingEvaluationRepository.get(
    workspaceId,
    findingId,
  );
  if (!finding || finding.finding.state !== "NOT_VISIBLE") return undefined;
  const retry = await runtime.runOrchestrationRepository.getHistoryEntry(
    workspaceId,
    finding.finding.runId,
  );
  const sourceRunId = retry?.run.retryOfRunId;
  if (!retry?.manifest || !sourceRunId) return undefined;
  const source = await runtime.runOrchestrationRepository.getHistoryEntry(
    workspaceId,
    sourceRunId,
  );
  if (!source?.manifest) return undefined;
  const firstFinding = (
    await runtime.findingEvaluationRepository.listForRun(
      workspaceId,
      sourceRunId,
    )
  ).find(({ finding: candidate }) => candidate.state === "NOT_VISIBLE");
  const checkpoint = finding.finding.checkpoints.find(
    ({ required, visible }) => required && !visible,
  );
  if (!firstFinding || !checkpoint) return undefined;
  const history = await runtime.runOrchestrationRepository.listHistory(
    workspaceId,
    retry.run.softwareId,
  );
  const priorVisible = history.find(({ run, manifest }) => {
    if (!manifest) return false;
    return (
      run.id !== retry.run.id &&
      run.id !== source.run.id &&
      manifest.snapshot.snapshotHash === retry.manifest?.snapshot.snapshotHash &&
      manifest.checkpointCoverage.some(
        ({ checkpointId, status }) =>
          checkpointId === checkpoint.checkpointId && status === "VERIFIED",
      )
    );
  });
  if (!priorVisible?.manifest) return undefined;
  return {
    checkpointId: checkpoint.checkpointId,
    priorVisibleAttempt: {
      runId: priorVisible.run.id,
      state: "VERIFIED",
      snapshotHash: priorVisible.manifest.snapshot.snapshotHash,
    },
    firstAttempt: {
      findingId: firstFinding.finding.id,
      runId: source.run.id,
      state: "NOT_VISIBLE",
      snapshotHash: source.manifest.snapshot.snapshotHash,
    },
    retryAttempt: {
      findingId: finding.finding.id,
      runId: retry.run.id,
      retryOfRunId: source.run.id,
      state: "NOT_VISIBLE",
      snapshotHash: retry.manifest.snapshot.snapshotHash,
    },
  };
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const principal = principalFromRequest(request);
    if (!principal) throw new AuthenticationRequiredError();
    const { workspaceId, softwareId } = await context.params;
    const approval = await (
      await getAccessRuntime()
    ).approvalAuthorityService.getApproval({
      principal,
      workspaceId,
      softwareId,
    });
    return NextResponse.json(
      {
        approval,
        controlledFixture: {
          conflictFindingId: fixtureFindingIds.conflict,
          repairedFindingId: fixtureFindingIds.repaired,
          visibilityRetryFindingId: fixtureFindingIds.visibilityRetry,
        },
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const principal = principalFromRequest(request);
    if (!principal) throw new AuthenticationRequiredError();
    const { workspaceId, softwareId } = await context.params;
    const body = (await request.json()) as { readonly findingId?: unknown };
    if (typeof body.findingId !== "string") {
      throw new TypeError("findingId is required");
    }
    const runtime = await getAccessRuntime();
    await runtime.service.checkPermission({
      principal,
      workspaceId,
      permission: "EVIDENCE_REVIEW",
    });
    const findingEvaluation =
      await runtime.findingEvaluationRepository.get(
        workspaceId,
        body.findingId,
      );
    if (!findingEvaluation) {
      throw new ApprovalAuthorityIntegrityError(
        "The stored finding was not available in this workspace",
      );
    }
    const receipts = await runtime.evidenceReceiptService.listForFinding(
      workspaceId,
      body.findingId,
    );
    const receiptBundle = receipts.find(
      ({ receipt }) => receipt.findingId === body.findingId,
    );
    const visibilityLossProof = await storedVisibilityProof(
      workspaceId,
      body.findingId,
    );
    const result = await runtime.approvalAuthorityService.considerFinding({
      workspaceId,
      softwareId,
      findingEvaluation,
      ...(receiptBundle ? { receiptBundle } : {}),
      actor: {
        kind: "AUTOMATION",
        actorId: "pactwire-deterministic-approval-authority",
        component: "approval-authority-v1",
      },
      idempotencyKey: receiptBundle
        ? `receipt:${receiptBundle.receipt.id}`
        : `finding:${body.findingId}`,
      ...(visibilityLossProof ? { visibilityLossProof } : {}),
    });
    return NextResponse.json(
      {
        outcome: result.outcome,
        ...(result.outcome === "NO_CHANGE" ? { reason: result.reason } : {}),
        approval: result.snapshot,
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
