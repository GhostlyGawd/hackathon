import { AuthenticationRequiredError } from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../../../../../lib/session";

interface RouteContext {
  readonly params: Promise<{
    workspaceId: string;
    softwareId: string;
    agreementVersionId: string;
  }>;
}

function failureStatus(status: string): number {
  return status === "PROVIDER_ERROR" || status === "INCOMPLETE" ? 502 : 422;
}

function modelOutcome(
  status: string,
): "SUCCEEDED" | "REFUSED" | "INCOMPLETE" | "FAILED" {
  if (status === "SUCCEEDED" || status === "REFUSED" || status === "INCOMPLETE") {
    return status;
  }
  return "FAILED";
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const principal = principalFromRequest(request);
    if (!principal) throw new AuthenticationRequiredError();
    const { workspaceId, softwareId, agreementVersionId } =
      await context.params;
    const runtime = await getAccessRuntime();
    const history = await runtime.requirementProposalService.listProposalHistory({
      principal,
      workspaceId,
      softwareId,
      agreementVersionId,
    });
    return NextResponse.json(history, {
      headers: { "cache-control": "private, no-store" },
    });
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
    const { workspaceId, softwareId, agreementVersionId } =
      await context.params;
    const runtime = await getAccessRuntime();
    const result = await runtime.requirementProposalService.proposeRequirements({
      principal,
      workspaceId,
      softwareId,
      agreementVersionId,
    });
    const correlationId = runtime.qualityTelemetry.newCorrelationId();
    const outcome = modelOutcome(result.run.status);
    const modelFailure = outcome === "FAILED" || outcome === "INCOMPLETE";
    runtime.qualityTelemetry.recordLog({
      workspaceId,
      correlationId,
      lane: "MODEL",
      code: modelFailure ? "MODEL_FAILURE" : "MODEL_ACTION",
      artifact: { kind: "REQUIREMENT", id: result.run.id },
      actor: { kind: "AUTOMATION", id: result.run.requestedModel },
      dimensions: {
        modelOutcome: outcome,
        ...(result.run.failureCode
          ? { failureCode: result.run.failureCode }
          : {}),
      },
      measures: {
        estimatedCostMicroUsd: result.run.totalEstimatedCostMicroUsd,
        latencyMs: result.run.attempts.reduce(
          (total, attempt) => total + attempt.latencyMs,
          0,
        ),
        retryCount: Math.max(0, result.run.attempts.length - 1),
        modelFailureCount: modelFailure ? 1 : 0,
      },
    });
    if (result.run.status === "SUCCEEDED" && result.proposals.length > 0) {
      runtime.qualityTelemetry.recordEvent({
        workspaceId,
        correlationId,
        name: "REQUIREMENT_PROPOSED",
        artifact: { kind: "REQUIREMENT", id: result.proposals[0]!.id },
        actor: { kind: "AUTOMATION", id: result.run.requestedModel },
        dimensions: { modelOutcome: "SUCCEEDED" },
      });
    }
    if (result.run.status === "SUCCEEDED") {
      return NextResponse.json(result, {
        status: 201,
        headers: { "cache-control": "private, no-store" },
      });
    }
    return NextResponse.json(
      {
        error: {
          code: `REQUIREMENT_PROPOSAL_${result.run.status}`,
          message: result.run.safeMessage,
          auditRecorded: true,
        },
        ...result,
      },
      {
        status: failureStatus(result.run.status),
        headers: { "cache-control": "private, no-store" },
      },
    );
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
