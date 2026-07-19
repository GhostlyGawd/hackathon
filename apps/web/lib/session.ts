import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import {
  fixtureUserById,
  isFixtureMode,
  principalForFixtureUser,
  type FixtureUser,
} from "./access-fixture";

export const sessionCookieName = "pactwire_access_session";

interface SessionPayload {
  readonly version: 1;
  readonly userId: string;
  readonly activeWorkspaceId: string;
  readonly expiresAt: number;
}

function sessionSecret(): string {
  const configured = process.env.PACTWIRE_SESSION_SECRET;
  if (configured && configured.length >= 32) {
    return configured;
  }
  if (process.env.NODE_ENV !== "production" && isFixtureMode()) {
    return "pactwire-fictional-fixture-session-secret-v1";
  }
  throw new Error("PACTWIRE_SESSION_SECRET must contain at least 32 characters");
}

function signature(encodedPayload: string): string {
  return createHmac("sha256", sessionSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function issueToken(user: FixtureUser): string {
  const payload: SessionPayload = {
    version: 1,
    userId: user.userId,
    activeWorkspaceId: user.activeWorkspaceId,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${encoded}.${signature(encoded)}`;
}

function parsePayload(token: string): SessionPayload | undefined {
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) {
    return undefined;
  }
  const expected = Buffer.from(signature(encoded), "base64url");
  const supplied = Buffer.from(suppliedSignature, "base64url");
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    if (
      parsed.version !== 1 ||
      typeof parsed.userId !== "string" ||
      typeof parsed.activeWorkspaceId !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      return undefined;
    }
    return parsed as SessionPayload;
  } catch {
    return undefined;
  }
}

export function setFixtureSession(
  response: NextResponse,
  user: FixtureUser,
): void {
  response.cookies.set(sessionCookieName, issueToken(user), {
    httpOnly: true,
    maxAge: 8 * 60 * 60,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearFixtureSession(response: NextResponse): void {
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
}

export function principalFromRequest(request: NextRequest) {
  const token = request.cookies.get(sessionCookieName)?.value;
  if (!token) {
    return undefined;
  }
  const payload = parsePayload(token);
  if (!payload) {
    return undefined;
  }
  const user = fixtureUserById(payload.userId);
  if (!user || user.activeWorkspaceId !== payload.activeWorkspaceId) {
    return undefined;
  }
  return principalForFixtureUser(user);
}
