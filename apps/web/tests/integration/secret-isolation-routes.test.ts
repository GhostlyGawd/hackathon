import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as resetFixture } from "../../app/api/demo/reset/route";
import { POST as createSession } from "../../app/api/demo/session/route";
import { GET as exportWorkspace } from "../../app/api/workspaces/[workspaceId]/export/route";
import {
  GET as listSecrets,
  POST as createSecret,
} from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/secrets/route";
import { POST as previewRedaction } from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/secrets/[secretId]/preview/route";
import { POST as attemptRawAccess } from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/secrets/[secretId]/raw-access/route";
import { POST as revokeSecret } from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/secrets/[secretId]/revoke/route";
import {
  configuredSecretRepresentations,
  containsSecretRepresentation,
} from "../../../../packages/core/src/secret-isolation";
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

function softwareContext(workspaceId: string, softwareId: string) {
  return { params: Promise.resolve({ workspaceId, softwareId }) };
}

function secretContext(
  workspaceId: string,
  softwareId: string,
  secretId: string,
) {
  return { params: Promise.resolve({ workspaceId, softwareId, secretId }) };
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
    authorizedTenantUrl: "https://cedar.northstar.invalid",
    districtOwner: "Curriculum and Instruction",
    approval: {
      state: "APPROVED",
      setBy: {
        kind: "IMPORTED_SYSTEM",
        actorId: "fictional-registry",
        displayName: "Fictional district registry",
        source: "district fixture",
      },
      reason: "Fictional fixture approval.",
    },
  });
  return item.software.id;
}

function generatedSecret(): string {
  return `runtime/${randomUUID()}?credential=${randomUUID()}`;
}

beforeEach(() => {
  expect(resetFixture().status).toBe(200);
});

describe("secret isolation HTTP boundary", () => {
  it("creates and lists metadata without returning plaintext or ciphertext", async () => {
    const cookie = await signIn("officer");
    const softwareId = await seededSoftwareId();
    const secretValue = generatedSecret();
    const pathname = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software/${softwareId}/secrets`;
    const created = await createSecret(
      request(pathname, {
        method: "POST",
        cookie,
        body: {
          label: "Generated fictional browser credential",
          kind: "PASSWORD",
          value: secretValue,
          expiresAt: "2026-07-20T20:30:00.000Z",
        },
      }),
      softwareContext(fixtureWorkspaceIds.cedarRidge, softwareId),
    );
    const createdText = await created.text();
    expect(created.status).toBe(201);
    expect(createdText).not.toContain(secretValue);
    expect(createdText).not.toContain("ciphertext");
    expect(createdText).not.toContain("authTag");

    const listed = await listSecrets(
      request(pathname, { cookie }),
      softwareContext(fixtureWorkspaceIds.cedarRidge, softwareId),
    );
    const listedText = await listed.text();
    expect(listed.status).toBe(200);
    expect(listedText).toContain("Generated fictional browser credential");
    expect(listedText).not.toContain(secretValue);
    expect(listedText).not.toContain("encrypted");
  });

  it("denies operator creation despite a forged client role", async () => {
    const cookie = await signIn("operator");
    const softwareId = await seededSoftwareId();
    const pathname = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software/${softwareId}/secrets`;
    const response = await createSecret(
      request(pathname, {
        method: "POST",
        cookie,
        body: {
          label: "Forged browser credential",
          kind: "PASSWORD",
          value: generatedSecret(),
          clientClaimedRole: "PRIVACY_OFFICER",
        },
      }),
      softwareContext(fixtureWorkspaceIds.cedarRidge, softwareId),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PERMISSION_DENIED", auditRecorded: true },
    });
  });

  it("rejects an expired value as an invalid request without echoing it", async () => {
    const cookie = await signIn("officer");
    const softwareId = await seededSoftwareId();
    const secretValue = generatedSecret();
    const pathname = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software/${softwareId}/secrets`;
    const response = await createSecret(
      request(pathname, {
        method: "POST",
        cookie,
        body: {
          label: "Expired fictional browser credential",
          kind: "PASSWORD",
          value: secretValue,
          expiresAt: "2026-07-19T20:00:00.000Z",
        },
      }),
      softwareContext(fixtureWorkspaceIds.cedarRidge, softwareId),
    );
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).toContain("INVALID_REQUEST");
    expect(containsSecretRepresentation(body, [secretValue])).toBe(false);
  });

  it("blocks human, page, and model raw access and records the denial", async () => {
    const cookie = await signIn("officer");
    const softwareId = await seededSoftwareId();
    const secretValue = generatedSecret();
    const root = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software/${softwareId}/secrets`;
    const created = await createSecret(
      request(root, {
        method: "POST",
        cookie,
        body: {
          label: "Generated fictional browser credential",
          kind: "PASSWORD",
          value: secretValue,
        },
      }),
      softwareContext(fixtureWorkspaceIds.cedarRidge, softwareId),
    );
    const createdBody = (await created.json()) as {
      readonly secret: { readonly id: string };
    };
    const response = await attemptRawAccess(
      request(`${root}/${createdBody.secret.id}/raw-access`, {
        method: "POST",
        cookie,
        body: { requestedBy: "UNTRUSTED_PAGE", clientClaimedRole: "MODEL" },
      }),
      secretContext(
        fixtureWorkspaceIds.cedarRidge,
        softwareId,
        createdBody.secret.id,
      ),
    );
    const text = await response.text();

    expect(response.status).toBe(403);
    expect(text).toContain("SECRET_RAW_ACCESS_DENIED");
    expect(text).toContain("Browser harness injection only");
    expect(containsSecretRepresentation(text, [secretValue])).toBe(false);
    const audits = await (await getAccessRuntime()).repository.listAuditEvents(
      fixtureWorkspaceIds.cedarRidge,
    );
    expect(audits.at(-1)?.action).toBe("secret.raw_access_denied");
  });

  it("returns a fully redacted preview and defensively redacted workspace export", async () => {
    const cookie = await signIn("officer");
    const softwareId = await seededSoftwareId();
    const secretValue = generatedSecret();
    const root = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software/${softwareId}/secrets`;
    const created = await createSecret(
      request(root, {
        method: "POST",
        cookie,
        body: {
          label: "Generated fictional browser credential",
          kind: "API_TOKEN",
          value: secretValue,
        },
      }),
      softwareContext(fixtureWorkspaceIds.cedarRidge, softwareId),
    );
    const createdBody = (await created.json()) as {
      readonly secret: { readonly id: string };
    };
    const preview = await previewRedaction(
      request(`${root}/${createdBody.secret.id}/preview`, {
        method: "POST",
        cookie,
      }),
      secretContext(
        fixtureWorkspaceIds.cedarRidge,
        softwareId,
        createdBody.secret.id,
      ),
    );
    const previewText = await preview.text();
    expect(preview.status).toBe(200);
    expect(previewText).toContain("[REDACTED_SECRET]");
    expect(containsSecretRepresentation(previewText, [secretValue])).toBe(false);

    const runtime = await getAccessRuntime();
    await runtime.repository.appendAuditEvent({
      eventId: randomUUID(),
      eventType: "AUDIT_RECORDED",
      workspaceId: fixtureWorkspaceIds.cedarRidge,
      subjectType: "synthetic_regression",
      subjectId: createdBody.secret.id,
      action: "synthetic.unsafe_log",
      actor: { kind: "HUMAN", actorId: "fictional-officer-a" },
      occurredAt: "2026-07-19T20:30:00.000Z",
      details: { accidentalValue: secretValue },
    });
    const exported = await exportWorkspace(
      request(`/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/export`, {
        cookie,
      }),
      { params: Promise.resolve({ workspaceId: fixtureWorkspaceIds.cedarRidge }) },
    );
    const exportText = await exported.text();
    expect(exported.status).toBe(200);
    expect(exportText).toContain("secretMetadata");
    expect(exportText).toContain("rawValuesIncluded");
    for (const representation of configuredSecretRepresentations(secretValue)) {
      expect(exportText).not.toContain(representation);
    }
  });

  it("revokes without exposing bytes and keeps another workspace target-neutral", async () => {
    const cookie = await signIn("officer");
    const softwareId = await seededSoftwareId();
    const secretValue = generatedSecret();
    const root = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software/${softwareId}/secrets`;
    const created = await createSecret(
      request(root, {
        method: "POST",
        cookie,
        body: {
          label: "Generated fictional browser credential",
          kind: "SESSION_COOKIE",
          value: secretValue,
        },
      }),
      softwareContext(fixtureWorkspaceIds.cedarRidge, softwareId),
    );
    const createdBody = (await created.json()) as {
      readonly secret: { readonly id: string };
    };
    const revoked = await revokeSecret(
      request(`${root}/${createdBody.secret.id}/revoke`, {
        method: "POST",
        cookie,
        body: { reason: "Fictional credential rotated." },
      }),
      secretContext(
        fixtureWorkspaceIds.cedarRidge,
        softwareId,
        createdBody.secret.id,
      ),
    );
    const revokedText = await revoked.text();
    expect(revoked.status).toBe(200);
    expect(revokedText).toContain('"status":"REVOKED"');
    expect(revokedText).not.toContain(secretValue);

    const crossWorkspace = await listSecrets(
      request(
        `/api/workspaces/${fixtureWorkspaceIds.harbor}/software/${softwareId}/secrets`,
        { cookie },
      ),
      softwareContext(fixtureWorkspaceIds.harbor, softwareId),
    );
    const crossText = await crossWorkspace.text();
    expect(crossWorkspace.status).toBe(404);
    expect(crossText).not.toContain("Fictional Harbor School District");
    expect(crossText).not.toContain(secretValue);
  });
});
