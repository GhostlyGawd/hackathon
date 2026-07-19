import { AuthenticationRequiredError } from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import {
  fixtureUserByKey,
  isFixtureMode,
  principalForFixtureUser,
} from "../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../lib/route-response";
import {
  clearFixtureSession,
  principalFromRequest,
  setFixtureSession,
} from "../../../../lib/session";

export function GET(request: NextRequest): NextResponse {
  const principal = principalFromRequest(request);
  if (!principal) {
    return authorizationErrorResponse(new AuthenticationRequiredError());
  }
  return NextResponse.json({ principal });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!isFixtureMode()) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Not found." } },
        { status: 404 },
      );
    }
    const body = (await request.json()) as { userKey?: unknown };
    const user =
      typeof body.userKey === "string"
        ? fixtureUserByKey(body.userKey)
        : undefined;
    if (!user) {
      throw new AuthenticationRequiredError();
    }
    const response = NextResponse.json({
      principal: principalForFixtureUser(user),
    });
    setFixtureSession(response, user);
    return response;
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}

export function DELETE(): NextResponse {
  const response = NextResponse.json({ signedOut: true });
  clearFixtureSession(response);
  return response;
}
