import {
  AuthenticationRequiredError,
  SetupSoftwareUnavailableError,
} from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../../../lib/session";
import { deriveRuntimeSetupWorkflow } from "../../../../../../../lib/setup-workflow-runtime";

interface RouteContext {
  readonly params: Promise<{ workspaceId: string; softwareId: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const principal = principalFromRequest(request);
    if (!principal) throw new AuthenticationRequiredError();
    const { workspaceId, softwareId } = await context.params;
    const runtime = await getAccessRuntime();
    const inventory = await runtime.inventoryService.listSoftware({
      principal,
      workspaceId,
    });
    const item = inventory.find(
      (candidate) => candidate.software.id === softwareId,
    );
    if (!item) throw new SetupSoftwareUnavailableError();

    const workflow = await deriveRuntimeSetupWorkflow({
      runtime,
      principal,
      workspaceId,
      item,
    });
    return NextResponse.json(
      { workflow },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
