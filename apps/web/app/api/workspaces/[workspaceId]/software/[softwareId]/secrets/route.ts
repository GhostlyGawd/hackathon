import { AuthenticationRequiredError } from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../../../lib/session";

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
    const secrets = await (
      await getAccessRuntime()
    ).secretIsolationService.listSecrets({ principal, workspaceId, softwareId });
    return NextResponse.json({ secrets });
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
    const { workspaceId, softwareId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const secret = await (
      await getAccessRuntime()
    ).secretIsolationService.createSecret({
      principal,
      workspaceId,
      softwareId,
      label: body["label"],
      kind: body["kind"],
      value: body["value"],
      expiresAt: body["expiresAt"],
    });
    return NextResponse.json({ secret }, { status: 201 });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
