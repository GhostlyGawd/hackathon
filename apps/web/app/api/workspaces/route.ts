import { AuthenticationRequiredError } from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../lib/route-response";
import { principalFromRequest } from "../../../lib/session";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = principalFromRequest(request);
    if (!principal) {
      throw new AuthenticationRequiredError();
    }
    const body = (await request.json()) as { name?: unknown };
    const runtime = await getAccessRuntime();
    const created = await runtime.service.createWorkspace({
      principal,
      name: body.name,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
