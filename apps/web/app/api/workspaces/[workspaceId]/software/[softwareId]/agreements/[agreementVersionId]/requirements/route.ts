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

function requestRecord(candidate: unknown): Readonly<Record<string, unknown>> {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new TypeError("Requirement review request must be an object");
  }
  return candidate as Readonly<Record<string, unknown>>;
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
    const history = await runtime.requirementReviewService.listRequirementHistory({
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
    const body = requestRecord(await request.json());
    const runtime = await getAccessRuntime();
    const version = await runtime.requirementReviewService.reviewRequirement({
      ...body,
      principal,
      workspaceId,
      softwareId,
      agreementVersionId,
    });
    return NextResponse.json(version, {
      status: 201,
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
