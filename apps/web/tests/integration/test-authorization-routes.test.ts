import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as resetFixture } from "../../app/api/demo/reset/route";
import { POST as createSession } from "../../app/api/demo/session/route";
import {
  GET as listAuthorizations,
  POST as createAuthorization,
} from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/authorizations/route";
import { POST as evaluateAttempt } from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/authorizations/[authorizationId]/decisions/route";
import { POST as checkRunQueue } from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/authorizations/[authorizationId]/queue-check/route";
import { POST as revokeAuthorization } from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/authorizations/[authorizationId]/revoke/route";
import { fixtureWorkspaceIds, getAccessRuntime } from "../../lib/access-fixture";

function request(
  pathname: string,
  options: {
    readonly method?: string;
    readonly body?: unknown;
    readonly cookie?: string;
  } = {},
): NextRequest {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.cookie) headers.set("cookie", options.cookie);
  return new NextRequest(`http://pactwire.test${pathname}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

function context(
  workspaceId: string,
  softwareId: string,
): { readonly params: Promise<{ workspaceId: string; softwareId: string }> };
function context(
  workspaceId: string,
  softwareId: string,
  authorizationId: string,
): {
  readonly params: Promise<{
    workspaceId: string;
    softwareId: string;
    authorizationId: string;
  }>;
};
function context(
  workspaceId: string,
  softwareId: string,
  authorizationId?: string,
): {
  readonly params: Promise<{
    workspaceId: string;
    softwareId: string;
    authorizationId?: string;
  }>;
} {
  return {
    params: Promise.resolve({
      workspaceId,
      softwareId,
      ...(authorizationId ? { authorizationId } : {}),
    }),
  };
}

async function signIn(userKey: "officer" | "operator"): Promise<string> {
  const response = await createSession(
    request("/api/demo/session", { method: "POST", body: { userKey } }),
  );
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function seededSoftwareId(): Promise<string> {
  const runtime = await getAccessRuntime();
  const existing = await runtime.inventoryRepository.listSoftware(
    fixtureWorkspaceIds.cedarRidge,
  );
  if (existing[0]) return existing[0].id;
  const item = await runtime.inventoryService.createSoftware({
    principal: {
      userId: "fictional-officer-a",
      displayName: "Morgan Vale (Fictional)",
      activeWorkspaceId: fixtureWorkspaceIds.cedarRidge,
    },
    workspaceId: fixtureWorkspaceIds.cedarRidge,
    name: "Northstar Classroom (Fictional)",
    vendorName: "Northstar Learning Labs (Fictional)",
    authorizedTenantUrl: "https://cedar.northstar.invalid/classroom",
    districtOwner: "Curriculum and Instruction",
    approval: {
      state: "APPROVED",
      setBy: {
        kind: "IMPORTED_SYSTEM",
        actorId: "fictional-district-registry",
        displayName: "Fictional Cedar Ridge App Registry",
        source: "district inventory export",
      },
      reason: "Imported existing district approval record.",
    },
  });
  return item.software.id;
}

function authorizationBody(overrides: Record<string, unknown> = {}) {
  return {
    authorityBasis: "District-owned fictional training tenant.",
    validFrom: "2026-07-19T20:00:00.000Z",
    reviewAt: "2026-07-20T20:00:00.000Z",
    expiresAt: "2026-07-21T20:00:00.000Z",
    allowedBaseUrl: "https://cedar.northstar.invalid/classroom",
    allowedSupportingDomains: ["assets.northstar.invalid"],
    allowedActions: ["NAVIGATE", "SUBMIT"],
    prohibitedActions: ["DELETE", "PURCHASE", "MESSAGE"],
    redirectPolicy: "ALLOW_LISTED_ONLY",
    popupPolicy: "BLOCK_ALL",
    attestation: {
      authorityConfirmed: true,
      syntheticAccountsOnlyConfirmed: true,
      statement:
        "I confirm the fictional district controls or may test this tenant.",
    },
    ...overrides,
  };
}

beforeEach(() => {
  expect(resetFixture().status).toBe(200);
});

describe("test authorization HTTP boundary", () => {
  it("creates and reads a human-attested policy without trusting a client actor", async () => {
    const cookie = await signIn("officer");
    const softwareId = await seededSoftwareId();
    const pathname = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software/${softwareId}/authorizations`;
    const created = await createAuthorization(
      request(pathname, {
        method: "POST",
        cookie,
        body: {
          ...authorizationBody(),
          attestedBy: { kind: "MODEL", actorId: "forged-model" },
        },
      }),
      context(fixtureWorkspaceIds.cedarRidge, softwareId),
    );
    const body = (await created.json()) as {
      readonly authorization: { readonly id: string; readonly attestedBy: unknown };
    };

    expect(created.status).toBe(201);
    expect(body.authorization.attestedBy).toEqual({
      kind: "HUMAN",
      actorId: "fictional-officer-a",
    });
    const listed = await listAuthorizations(
      request(pathname, { cookie }),
      context(fixtureWorkspaceIds.cedarRidge, softwareId),
    );
    await expect(listed.json()).resolves.toMatchObject({
      authorizations: [
        expect.objectContaining({
          effectiveStatus: "ACTIVE",
          authorityBasis: "District-owned fictional training tenant.",
        }),
      ],
    });
  });

  it("denies operator policy creation even when the client claims officer authority", async () => {
    const cookie = await signIn("operator");
    const softwareId = await seededSoftwareId();
    const pathname = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software/${softwareId}/authorizations`;
    const response = await createAuthorization(
      request(pathname, {
        method: "POST",
        cookie,
        body: { ...authorizationBody(), clientClaimedRole: "PRIVACY_OFFICER" },
      }),
      context(fixtureWorkspaceIds.cedarRidge, softwareId),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PERMISSION_DENIED", auditRecorded: true },
    });
  });

  it("blocks and audits an unlisted redirect with a bounded response", async () => {
    const cookie = await signIn("officer");
    const softwareId = await seededSoftwareId();
    const root = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software/${softwareId}/authorizations`;
    const created = await createAuthorization(
      request(root, { method: "POST", cookie, body: authorizationBody() }),
      context(fixtureWorkspaceIds.cedarRidge, softwareId),
    );
    const createdBody = (await created.json()) as {
      readonly authorization: { readonly id: string };
    };
    const response = await evaluateAttempt(
      request(`${root}/${createdBody.authorization.id}/decisions`, {
        method: "POST",
        cookie,
        body: {
          attempt: {
            kind: "REDIRECT",
            targetUrl: "https://tracker.outside.invalid/collect?secret=no",
          },
        },
      }),
      context(
        fixtureWorkspaceIds.cedarRidge,
        softwareId,
        createdBody.authorization.id,
      ),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("DOMAIN_NOT_ALLOWED");
    expect(body).toContain("tracker.outside.invalid");
    expect(body).not.toContain("?secret=no");
  });

  it("returns a recorded conflict when expired authorization reaches the queue gate", async () => {
    const cookie = await signIn("officer");
    const softwareId = await seededSoftwareId();
    const root = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software/${softwareId}/authorizations`;
    const created = await createAuthorization(
      request(root, {
        method: "POST",
        cookie,
        body: authorizationBody({
          validFrom: "2026-07-18T18:00:00.000Z",
          reviewAt: "2026-07-19T18:30:00.000Z",
          expiresAt: "2026-07-19T19:00:00.000Z",
        }),
      }),
      context(fixtureWorkspaceIds.cedarRidge, softwareId),
    );
    const createdBody = (await created.json()) as {
      readonly authorization: { readonly id: string };
    };
    const response = await checkRunQueue(
      request(`${root}/${createdBody.authorization.id}/queue-check`, {
        method: "POST",
        cookie,
      }),
      context(
        fixtureWorkspaceIds.cedarRidge,
        softwareId,
        createdBody.authorization.id,
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "POLICY_DENIED",
        reason: "AUTHORIZATION_EXPIRED",
        auditRecorded: true,
      },
    });
  });

  it("requires officer authority for revocation and blocks the queue after revocation", async () => {
    const officerCookie = await signIn("officer");
    const softwareId = await seededSoftwareId();
    const root = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software/${softwareId}/authorizations`;
    const created = await createAuthorization(
      request(root, {
        method: "POST",
        cookie: officerCookie,
        body: authorizationBody(),
      }),
      context(fixtureWorkspaceIds.cedarRidge, softwareId),
    );
    const createdBody = (await created.json()) as {
      readonly authorization: { readonly id: string };
    };
    const authorizationContext = context(
      fixtureWorkspaceIds.cedarRidge,
      softwareId,
      createdBody.authorization.id,
    );
    const operatorCookie = await signIn("operator");
    const denied = await revokeAuthorization(
      request(`${root}/${createdBody.authorization.id}/revoke`, {
        method: "POST",
        cookie: operatorCookie,
        body: { reason: "Forged operator revocation." },
      }),
      authorizationContext,
    );
    expect(denied.status).toBe(403);

    const revoked = await revokeAuthorization(
      request(`${root}/${createdBody.authorization.id}/revoke`, {
        method: "POST",
        cookie: officerCookie,
        body: { reason: "Fictional district test access was withdrawn." },
      }),
      authorizationContext,
    );
    await expect(revoked.json()).resolves.toMatchObject({
      authorization: { status: "REVOKED" },
    });
    const queue = await checkRunQueue(
      request(`${root}/${createdBody.authorization.id}/queue-check`, {
        method: "POST",
        cookie: officerCookie,
      }),
      authorizationContext,
    );
    expect(queue.status).toBe(409);
    await expect(queue.json()).resolves.toMatchObject({
      error: { reason: "AUTHORIZATION_REVOKED", auditRecorded: true },
    });
  });

  it("rejects incomplete attestation and keeps another workspace target-neutral", async () => {
    const cookie = await signIn("officer");
    const softwareId = await seededSoftwareId();
    const root = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software/${softwareId}/authorizations`;
    const invalid = await createAuthorization(
      request(root, {
        method: "POST",
        cookie,
        body: authorizationBody({
          attestation: {
            authorityConfirmed: false,
            syntheticAccountsOnlyConfirmed: true,
            statement: "A forged incomplete attestation.",
          },
        }),
      }),
      context(fixtureWorkspaceIds.cedarRidge, softwareId),
    );
    expect(invalid.status).toBe(400);

    const crossWorkspace = await listAuthorizations(
      request(
        `/api/workspaces/${fixtureWorkspaceIds.harbor}/software/${softwareId}/authorizations`,
        { cookie },
      ),
      context(fixtureWorkspaceIds.harbor, softwareId),
    );
    const body = await crossWorkspace.text();
    expect(crossWorkspace.status).toBe(404);
    expect(body).toContain("Workspace not found or not available.");
    expect(body).not.toContain("Fictional Harbor School District");
    expect(body).not.toContain("Avery Stone");
  });
});
