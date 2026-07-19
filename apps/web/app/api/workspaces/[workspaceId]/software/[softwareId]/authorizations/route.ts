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
    const runtime = await getAccessRuntime();
    const authorizations = await runtime.testAuthorizationService.listAuthorizations({
      principal,
      workspaceId,
      softwareId,
    });
    return NextResponse.json({ authorizations });
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
    const runtime = await getAccessRuntime();
    const authorization =
      await runtime.testAuthorizationService.createAuthorization({
        principal,
        workspaceId,
        softwareId,
        authorityBasis: body["authorityBasis"],
        validFrom: body["validFrom"],
        reviewAt: body["reviewAt"],
        expiresAt: body["expiresAt"],
        allowedBaseUrl: body["allowedBaseUrl"],
        allowedSupportingDomains: body["allowedSupportingDomains"],
        allowedActions: body["allowedActions"],
        prohibitedActions: body["prohibitedActions"],
        redirectPolicy: body["redirectPolicy"],
        popupPolicy: body["popupPolicy"],
        attestation: body["attestation"],
      });
    return NextResponse.json({ authorization }, { status: 201 });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
