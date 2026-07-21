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
    return NextResponse.json(
      {
        receipt: bundle.receipt,
        content: bundle.content,
        artifacts: bundle.artifacts.map(({ contentBase64: _content, ...artifact }) => artifact),
        verification: verifyEvidenceReceiptBundle(bundle),
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
