import { AuthenticationRequiredError } from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../../../../../lib/session";

interface RouteContext {
  readonly params: Promise<{
    workspaceId: string;
    softwareId: string;
    secretId: string;
  }>;
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const principal = principalFromRequest(request);
    if (!principal) throw new AuthenticationRequiredError();
    const { workspaceId, softwareId, secretId } = await context.params;
    await (await getAccessRuntime()).secretIsolationService.attemptRawAccess({
      principal,
      workspaceId,
      softwareId,
      secretId,
    });
    return NextResponse.json({ ok: false }, { status: 403 });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
