import { AuthenticationRequiredError } from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../../../lib/session";

interface RouteContext {
  readonly params: Promise<{ workspaceId: string; receiptId: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const principal = principalFromRequest(request);
    if (!principal) throw new AuthenticationRequiredError();
    const { workspaceId, receiptId } = await context.params;
    const runtime = await getAccessRuntime();
    await runtime.service.checkPermission({
      principal,
      workspaceId,
      permission: "WORKSPACE_EXPORT",
    });
    await runtime.service.checkPermission({
      principal,
      workspaceId,
      permission: "EVIDENCE_REVIEW",
    });
    const serialized = await runtime.evidenceReceiptService.exportSanitizedBundle(
      workspaceId,
      receiptId,
    );
    runtime.qualityTelemetry.recordEvent({
      workspaceId,
      name: "RECEIPT_EXPORTED",
      artifact: { kind: "RECEIPT", id: receiptId },
      actor: { kind: "HUMAN", id: principal.userId },
    });
    return new NextResponse(serialized, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="pactwire-receipt-${receiptId}.json"`,
        "content-type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
