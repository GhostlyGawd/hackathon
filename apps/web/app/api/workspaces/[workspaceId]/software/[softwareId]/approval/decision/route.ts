import {
  ApprovalAuthorityIntegrityError,
  AuthenticationRequiredError,
} from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../../../../lib/session";

interface RouteContext {
  readonly params: Promise<{ workspaceId: string; softwareId: string }>;
}

function telemetryDecisionKind(
  outcome: unknown,
): "KEEP_HOLD" | "RESTORE_APPROVAL" | "REJECT" | "RETIRE" {
  if (outcome === "RESTORE_APPROVED") return "RESTORE_APPROVAL";
  if (outcome === "KEEP_HOLD" || outcome === "REJECT" || outcome === "RETIRE") {
    return outcome;
  }
  throw new TypeError("A recorded human decision needs a known outcome");
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const principal = principalFromRequest(request);
    if (!principal) throw new AuthenticationRequiredError();
    const { workspaceId, softwareId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const runtime = await getAccessRuntime();
    const reviewedFinding =
      typeof body["reviewedFindingId"] === "string"
        ? await runtime.findingEvaluationRepository.get(
            workspaceId,
            body["reviewedFindingId"],
          )
        : undefined;
    if (body["reviewedFindingId"] && !reviewedFinding) {
      throw new ApprovalAuthorityIntegrityError(
        "The reviewed finding was not available in this workspace",
      );
    }
    const result = await runtime.approvalAuthorityService.recordHumanDecision({
      principal,
      workspaceId,
      softwareId,
      outcome: body["outcome"],
      rationale: body["rationale"],
      namedScopeAcknowledged: body["namedScopeAcknowledged"],
      receiptId: body["receiptId"],
      ...(reviewedFinding
        ? {
            reviewedRun: {
              runId: reviewedFinding.finding.runId,
              findingState: reviewedFinding.finding.state,
            },
          }
        : {}),
    });
    const correlationId = runtime.qualityTelemetry.newCorrelationId();
    const decisionKind = telemetryDecisionKind(body["outcome"]);
    runtime.qualityTelemetry.recordEvent({
      workspaceId,
      correlationId,
      name: "HUMAN_DECISION_RECORDED",
      artifact: { kind: "APPROVAL", id: softwareId },
      actor: { kind: "HUMAN", id: principal.userId },
      dimensions: {
        decisionKind,
        approvalState: result.snapshot.state,
      },
    });
    runtime.qualityTelemetry.recordLog({
      workspaceId,
      correlationId,
      lane: "HUMAN_DECISION",
      code: "HUMAN_DECISION",
      artifact: { kind: "APPROVAL", id: softwareId },
      actor: { kind: "HUMAN", id: principal.userId },
      dimensions: {
        decisionKind,
        approvalState: result.snapshot.state,
      },
    });
    return NextResponse.json(
      { outcome: result.outcome, approval: result.snapshot },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
