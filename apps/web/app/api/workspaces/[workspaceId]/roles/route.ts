import { AuthenticationRequiredError } from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../lib/session";

interface RouteContext {
  readonly params: Promise<{ workspaceId: string }>;
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const principal = principalFromRequest(request);
    if (!principal) {
      throw new AuthenticationRequiredError();
    }
    const { workspaceId } = await context.params;
    const body = (await request.json()) as {
      targetUserId?: unknown;
      role?: unknown;
    };
    const runtime = await getAccessRuntime();
    const assignment = await runtime.service.assignRole({
      principal,
      workspaceId,
      targetUserId: body.targetUserId,
      role: body.role,
    });
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
