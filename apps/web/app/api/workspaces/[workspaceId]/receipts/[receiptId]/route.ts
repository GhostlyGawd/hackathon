import {
  AuthenticationRequiredError,
  verifyEvidenceReceiptBundle,
} from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../../lib/session";

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
      permission: "EVIDENCE_REVIEW",
    });
    const bundle = await runtime.evidenceReceiptService.get(
      workspaceId,
      receiptId,
    );
    const verification = verifyEvidenceReceiptBundle(bundle);
    const correlationId = runtime.qualityTelemetry.newCorrelationId();
    runtime.qualityTelemetry.recordEvent({
      workspaceId,
      correlationId,
      name: "RECEIPT_VIEWED",
      artifact: { kind: "RECEIPT", id: receiptId },
      actor: { kind: "HUMAN", id: principal.userId },
    });
    if (verification.status === "VALID") {
      runtime.qualityTelemetry.recordEvent({
        workspaceId,
        correlationId,
        name: "RECEIPT_VERIFIED",
        artifact: { kind: "RECEIPT", id: receiptId },
        actor: { kind: "AUTOMATION", id: "pactwire-receipt-verifier" },
      });
    }
    return NextResponse.json(
      {
        receipt: bundle.receipt,
        content: bundle.content,
        artifacts: bundle.artifacts.map(({ contentBase64: _content, ...artifact }) => artifact),
        verification,
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
