import { AuthenticationRequiredError } from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../lib/session";
import { deriveRuntimeSetupWorkflow } from "../../../../../lib/setup-workflow-runtime";

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
    const approvalState = request.nextUrl.searchParams.get("approvalState");
    const query = request.nextUrl.searchParams.get("query");
    const runtime = await getAccessRuntime();
    const baseItems = await runtime.inventoryService.listSoftware({
      principal,
      workspaceId,
      ...(approvalState ? { approvalState } : {}),
      ...(query ? { query } : {}),
    });
    const items = await Promise.all(
      baseItems.map(async (item) => {
        const workflow = await deriveRuntimeSetupWorkflow({
          runtime,
          principal,
          workspaceId,
          item,
        });
        return {
          ...item,
          agreementVersion: workflow.configuration.agreementVersion,
          authorizationReviewAt:
            workflow.configuration.authorizationReviewAt,
          nextSafeAction: workflow.nextAction,
        };
      }),
    );
    return NextResponse.json({ items });
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
    const { workspaceId } = await context.params;
    const body = (await request.json()) as {
      readonly name?: unknown;
      readonly vendorName?: unknown;
      readonly authorizedTenantUrl?: unknown;
      readonly districtOwner?: unknown;
      readonly knownVersion?: unknown;
      readonly approval?: unknown;
    };
    const runtime = await getAccessRuntime();
    const item = await runtime.inventoryService.createSoftware({
      principal,
      workspaceId,
      name: body.name,
      vendorName: body.vendorName,
      authorizedTenantUrl: body.authorizedTenantUrl,
      districtOwner: body.districtOwner,
      ...(body.knownVersion ? { knownVersion: body.knownVersion } : {}),
      approval: body.approval,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
