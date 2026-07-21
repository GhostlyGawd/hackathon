import { AuthenticationRequiredError } from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import {
  fixtureRunHistorySoftwareId,
  getAccessRuntime,
} from "../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../lib/session";

interface RouteContext {
  readonly params: Promise<{ workspaceId: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const principal = principalFromRequest(request);
    if (!principal) throw new AuthenticationRequiredError();
    const { workspaceId } = await context.params;
    const runtime = await getAccessRuntime();
    await runtime.service.checkPermission({
      principal,
      workspaceId,
      permission: "WORKSPACE_READ",
    });
    const softwareId =
      request.nextUrl.searchParams.get("softwareId") ??
      fixtureRunHistorySoftwareId;
    const history = await runtime.runOrchestrationRepository.listHistory(
      workspaceId,
      softwareId,
    );
    const runs = history.map(({ run, scope, lease, manifest }) => ({
      run,
      scope,
      ...(lease
        ? {
            lease: {
              id: lease.id,
              workerId: lease.workerId,
              acquiredAt: lease.acquiredAt,
              expiresAt: lease.expiresAt,
              leaseHash: lease.leaseHash,
            },
          }
        : {}),
      ...(manifest ? { manifest } : {}),
    }));
    return NextResponse.json({ softwareId, runs });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
