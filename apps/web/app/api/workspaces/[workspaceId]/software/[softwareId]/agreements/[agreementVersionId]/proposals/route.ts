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
