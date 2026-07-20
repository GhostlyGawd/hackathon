import { AuthenticationRequiredError } from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../../lib/access-fixture";
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
    const personas = await (await getAccessRuntime()).syntheticDataService.listPersonas({
      principal,
      workspaceId,
    });
    return NextResponse.json({ personas });
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
    const body: unknown = await request.json();
    const persona = await (await getAccessRuntime()).syntheticDataService.createPersona({
      ...(typeof body === "object" && body !== null ? body : {}),
      principal,
      workspaceId,
    });
    return NextResponse.json({ persona }, { status: 201 });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
