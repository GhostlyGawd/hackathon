import { AuthenticationRequiredError } from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../../../lib/session";

interface RouteContext {
  readonly params: Promise<{ workspaceId: string; recordId: string }>;
}

function requestRecord(candidate: unknown): Readonly<Record<string, unknown>> {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new TypeError("Destination review request must be an object");
  }
  return candidate as Readonly<Record<string, unknown>>;
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const principal = principalFromRequest(request);
    if (!principal) throw new AuthenticationRequiredError();
    const { workspaceId, recordId } = await context.params;
    const body = requestRecord(await request.json());
    const runtime = await getAccessRuntime();
    const version = await runtime.destinationRegistryService.reviewDestination({
      ...body,
      principal,
      workspaceId,
      recordId,
    });
    return NextResponse.json(version, {
      status: 201,
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
