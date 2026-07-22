import { AuthenticationRequiredError } from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../../../lib/session";

interface RouteContext {
  readonly params: Promise<{ workspaceId: string; receiptId: string }>;
}

export async function DELETE(
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
      permission: "EVIDENCE_RETENTION_MANAGE",
    });
    const body = (await request.json()) as {
      readonly confirmation?: unknown;
      readonly reason?: unknown;
    };
    const deletion = await runtime.evidenceReceiptService.deleteRetainedContent({
      workspaceId,
      receiptId,
      confirmation: body.confirmation as string,
      reason: body.reason as string,
      requestedAt: new Date().toISOString(),
      requestedBy: { kind: "HUMAN", actorId: principal.userId },
    });
    runtime.qualityTelemetry.recordEvent({
      workspaceId,
      name: "RECEIPT_ARTIFACT_CONTENT_DELETED",
      artifact: { kind: "RECEIPT", id: receiptId },
      actor: { kind: "HUMAN", id: principal.userId },
    });
    return NextResponse.json(
      { deletion },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
