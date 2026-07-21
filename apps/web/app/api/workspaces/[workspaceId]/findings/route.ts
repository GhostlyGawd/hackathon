import {
  AuthenticationRequiredError,
  FINDING_DECISION_TABLE,
  FINDING_EVALUATOR_VERSION,
} from "@pactwire/core";
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
    const findings = (
      await Promise.all(
        history.map(({ run }) =>
          runtime.findingEvaluationRepository.listForRun(workspaceId, run.id),
        ),
      )
    ).flat();
    return NextResponse.json(
      {
        softwareId,
        evaluatorVersion: FINDING_EVALUATOR_VERSION,
        decisionTable: FINDING_DECISION_TABLE,
        findings,
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
