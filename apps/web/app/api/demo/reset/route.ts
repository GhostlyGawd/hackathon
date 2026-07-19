import { NextResponse } from "next/server";
import {
  isFixtureMode,
  resetAccessRuntime,
} from "../../../../lib/access-fixture";
import { clearFixtureSession } from "../../../../lib/session";

export function POST(): NextResponse {
  if (!isFixtureMode()) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found." } },
      { status: 404 },
    );
  }
  resetAccessRuntime();
  const response = NextResponse.json({ reset: true });
  clearFixtureSession(response);
  return response;
}
