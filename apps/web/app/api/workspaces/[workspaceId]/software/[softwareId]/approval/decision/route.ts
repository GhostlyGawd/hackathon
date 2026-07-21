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
    return NextResponse.json(
      { outcome: result.outcome, approval: result.snapshot },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
