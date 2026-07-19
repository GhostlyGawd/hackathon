import { AuthenticationRequiredError } from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../../../../../lib/session";

interface RouteContext {
  readonly params: Promise<{
    workspaceId: string;
    softwareId: string;
    authorizationId: string;
  }>;
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const principal = principalFromRequest(request);
    if (!principal) throw new AuthenticationRequiredError();
    const { workspaceId, softwareId, authorizationId } = await context.params;
    const body = (await request.json()) as { readonly reason?: unknown };
    const runtime = await getAccessRuntime();
    const authorization = await runtime.testAuthorizationService.revokeAuthorization({
      principal,
      workspaceId,
      softwareId,
      authorizationId,
      reason: body.reason,
    });
    return NextResponse.json({ authorization });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
