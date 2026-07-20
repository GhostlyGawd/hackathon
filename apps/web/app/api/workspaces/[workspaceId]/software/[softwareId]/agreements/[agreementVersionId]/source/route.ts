import { AuthenticationRequiredError } from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../../../../../lib/session";

interface RouteContext {
  readonly params: Promise<{
    workspaceId: string;
    softwareId: string;
    agreementVersionId: string;
  }>;
}

function quotedFileName(fileName: string): string {
  return fileName.replaceAll(/["\\\r\n]/gu, "_");
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const principal = principalFromRequest(request);
    if (!principal) throw new AuthenticationRequiredError();
    const { workspaceId, softwareId, agreementVersionId } = await context.params;
    const runtime = await getAccessRuntime();
    const source = await runtime.agreementService.readOriginal({
      principal,
      workspaceId,
      softwareId,
      agreementVersionId,
    });
    return new NextResponse(Buffer.from(source.bytes), {
      status: 200,
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="${quotedFileName(source.agreement.sourceFileName)}"`,
        "content-length": String(source.agreement.sourceByteLength),
        "content-type": source.agreement.sourceMimeType,
        "x-content-type-options": "nosniff",
        "x-pactwire-source-sha256": source.agreement.sourceSha256,
      },
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
