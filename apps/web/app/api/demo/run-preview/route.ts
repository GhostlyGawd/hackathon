import { AuthenticationRequiredError } from "@pactwire/core";
import { readFile } from "node:fs/promises";
import { type NextRequest, NextResponse } from "next/server";
import { authorizationErrorResponse } from "../../../../lib/route-response";
import { principalFromRequest } from "../../../../lib/session";

const previewPath = new URL(
  "../../../../../../docs/evidence/FIX-01/fixture-baseline-desktop.png",
  import.meta.url,
);

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (!principalFromRequest(request)) throw new AuthenticationRequiredError();
    const image = await readFile(previewPath);
    return new NextResponse(new Uint8Array(image), {
      headers: {
        "cache-control": "private, no-store",
        "content-type": "image/png",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
