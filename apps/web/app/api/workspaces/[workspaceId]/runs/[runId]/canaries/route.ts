import { AuthenticationRequiredError } from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../../../lib/session";

interface RouteContext {
  readonly params: Promise<{ workspaceId: string; runId: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const principal = principalFromRequest(request);
    if (!principal) throw new AuthenticationRequiredError();
    const { workspaceId, runId } = await context.params;
    const canaries = await (
      await getAccessRuntime()
    ).syntheticDataService.listRunCanaries({ principal, workspaceId, runId });
    return NextResponse.json({ canaries });
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
    const { workspaceId, runId } = await context.params;
    const body: unknown = await request.json();
    const canaries = await (
      await getAccessRuntime()
    ).syntheticDataService.generateRunCanaries({
      ...(typeof body === "object" && body !== null ? body : {}),
      principal,
      workspaceId,
      runId,
    });
    return NextResponse.json({ canaries }, { status: 201 });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
