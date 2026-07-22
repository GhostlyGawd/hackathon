import {
  AuthenticationRequiredError,
  PolicyDeniedError,
} from "@pactwire/core";
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
  let principal: ReturnType<typeof principalFromRequest> = undefined;
  let routeScope:
    | { workspaceId: string; softwareId: string; authorizationId: string }
    | undefined;
  try {
    principal = principalFromRequest(request);
    if (!principal) throw new AuthenticationRequiredError();
    routeScope = await context.params;
    const { workspaceId, softwareId, authorizationId } = routeScope;
    const runtime = await getAccessRuntime();
    const decision = await runtime.testAuthorizationService.assertRunMayQueue({
      principal,
      workspaceId,
      softwareId,
      authorizationId,
    });
    return NextResponse.json({ decision });
  } catch (error) {
    if (
      error instanceof PolicyDeniedError &&
      error.reason === "AUTHORIZATION_EXPIRED" &&
      principal &&
      routeScope
    ) {
      const runtime = await getAccessRuntime();
      const correlationId = runtime.qualityTelemetry.newCorrelationId();
      runtime.qualityTelemetry.recordEventOnce(
        `AUTHORIZATION_EXPIRED:${routeScope.workspaceId}:${routeScope.authorizationId}`,
        {
          workspaceId: routeScope.workspaceId,
          correlationId,
          name: "AUTHORIZATION_EXPIRED",
          artifact: {
            kind: "AUTHORIZATION",
            id: routeScope.authorizationId,
          },
          actor: { kind: "AUTOMATION", id: "pactwire-run-queue-gate" },
        },
      );
      runtime.qualityTelemetry.recordLog({
        workspaceId: routeScope.workspaceId,
        correlationId,
        lane: "HARNESS",
        code: "BLOCKED_ACTION",
        artifact: {
          kind: "AUTHORIZATION",
          id: routeScope.authorizationId,
        },
        actor: { kind: "HUMAN", id: principal.userId },
        dimensions: { failureCode: error.reason },
        measures: { blockedActionCount: 1 },
      });
    }
    return authorizationErrorResponse(error);
  }
}
