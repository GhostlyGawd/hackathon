import { AuthenticationRequiredError } from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../../../lib/session";

interface RouteContext {
  readonly params: Promise<{ workspaceId: string; softwareId: string }>;
}

function optionalText(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
    const agreements = await runtime.agreementService.listAgreements({
      principal,
      workspaceId,
      softwareId,
    });
    return NextResponse.json({ agreements });
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
    const runtime = await getAccessRuntime();
    await runtime.service.checkPermission({
      principal,
      workspaceId,
      permission: "AGREEMENT_UPLOAD",
    });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new TypeError("Agreement file is required");
    const result = await runtime.agreementService.uploadAgreement({
      principal,
      workspaceId,
      softwareId,
      fileName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      ...(optionalText(form, "expectedSha256")
        ? { expectedSha256: optionalText(form, "expectedSha256") }
        : {}),
      ...(optionalText(form, "effectiveFrom")
        ? { effectiveFrom: optionalText(form, "effectiveFrom") }
        : {}),
      ...(optionalText(form, "effectiveUntil")
        ? { effectiveUntil: optionalText(form, "effectiveUntil") }
        : {}),
    });
    if (!result.duplicate) {
      runtime.qualityTelemetry.recordEvent({
        workspaceId,
        name: "AGREEMENT_UPLOADED",
        artifact: { kind: "AGREEMENT", id: result.agreement.id },
        actor: { kind: "HUMAN", id: principal.userId },
      });
    }
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
