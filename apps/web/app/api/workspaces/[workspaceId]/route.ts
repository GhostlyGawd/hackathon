import { AuthenticationRequiredError } from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../lib/route-response";
import { principalFromRequest } from "../../../../lib/session";

interface RouteContext {
  readonly params: Promise<{ workspaceId: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const principal = principalFromRequest(request);
    if (!principal) {
      throw new AuthenticationRequiredError();
    }
    const { workspaceId } = await context.params;
    const runtime = await getAccessRuntime();
    const workspace = await runtime.service.getWorkspace({
      principal,
      workspaceId,
    });
    const roleAssignments = await runtime.repository.listRoleAssignments(
      workspaceId,
      principal.userId,
    );
    return NextResponse.json({ workspace, roleAssignments });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
