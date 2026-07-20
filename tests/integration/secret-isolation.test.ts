import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  PostgresWorkspaceAuthorizationRepository,
  WorkspaceAuthorizationService,
} from "../../packages/core/src/authorization";
import {
  PostgresSoftwareInventoryRepository,
  SoftwareInventoryService,
} from "../../packages/core/src/inventory";
import { applyCoreMigrations } from "../../packages/core/src/migrations";
import {
  Aes256GcmSecretCipher,
  PostgresSecretIsolationRepository,
  RawSecretAccessDeniedError,
  SecretIsolationService,
  SecretLeaseUnavailableError,
  configuredSecretRepresentations,
  containsSecretRepresentation,
} from "../../packages/core/src/secret-isolation";
import {
  createDatabaseTestService,
  type DatabaseTestService,
} from "../../packages/testkit/src/index";

const databases: DatabaseTestService[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

function ids(): () => string {
  let value = 7_000;
  return () => {
    value += 1;
    return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
  };
}

async function fixture() {
  const database = await createDatabaseTestService();
  databases.push(database);
  await applyCoreMigrations(database.database);
  const idFactory = ids();
  let currentTime = "2026-07-19T20:30:00.000Z";
  const now = () => currentTime;
  const workspaceRepository = new PostgresWorkspaceAuthorizationRepository(
    database.database,
  );
  const workspaceService = new WorkspaceAuthorizationService(
    workspaceRepository,
    { idFactory, now },
  );
  const created = await workspaceService.createWorkspace({
    principal: {
      userId: "fictional-officer-a",
      displayName: "Morgan Vale (Fictional)",
    },
    name: "Fictional Cedar Ridge School District",
  });
  const principal = {
    userId: "fictional-officer-a",
    displayName: "Morgan Vale (Fictional)",
    activeWorkspaceId: created.workspace.id,
  };
  const inventoryRepository = new PostgresSoftwareInventoryRepository(
    database.database,
  );
  const inventoryService = new SoftwareInventoryService(
    inventoryRepository,
    workspaceService,
    { idFactory, now },
  );
  const software = await inventoryService.createSoftware({
    principal,
    workspaceId: created.workspace.id,
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
  const secretRepository = new PostgresSecretIsolationRepository(
    database.database,
  );
  const secretService = new SecretIsolationService(
    secretRepository,
    workspaceService,
    inventoryRepository,
    new Aes256GcmSecretCipher(randomBytes(32), "integration-key-v1"),
    {
      idFactory,
      tokenFactory: () => `lease-${randomUUID()}-${randomUUID()}`,
      now,
    },
  );
  return {
    database,
    workspaceRepository,
    workspaceService,
    principal,
    workspaceId: created.workspace.id,
    softwareId: software.software.id,
    secretRepository,
    secretService,
    setTime(value: string) {
      currentTime = value;
    },
  };
}

function generatedSecret(): string {
  return `runtime/${randomUUID()}?token=${randomUUID()}`;
}

describe("PostgreSQL secret isolation", () => {
  it("stores only authenticated ciphertext and redacts every normal output channel", async () => {
    const context = await fixture();
    const secretValue = generatedSecret();
    const secret = await context.secretService.createSecret({
      principal: context.principal,
      workspaceId: context.workspaceId,
      softwareId: context.softwareId,
      label: "Generated fictional browser credential",
      kind: "PASSWORD",
      value: secretValue,
      expiresAt: "2026-07-20T20:30:00.000Z",
    });
    const stored = await context.database.database.query<{
      readonly encrypted_value: unknown;
    }>(
      "SELECT encrypted_value FROM secret_records WHERE workspace_id = $1 AND id = $2",
      [context.workspaceId, secret.id],
    );
    const storedText = JSON.stringify(stored.rows);
    for (const representation of configuredSecretRepresentations(secretValue)) {
      expect(storedText).not.toContain(representation);
    }

    for (const channel of ["PROMPT", "LOG", "EVIDENCE", "EXPORT"] as const) {
      const result = await context.secretService.redactNormalOutput({
        principal: context.principal,
        workspaceId: context.workspaceId,
        softwareId: context.softwareId,
        channel,
        content: {
          authorization: `Bearer ${secretValue}`,
          body: configuredSecretRepresentations(secretValue).join(" | "),
        },
      });
      const output = JSON.stringify(result);
      expect(result.redactionCount).toBeGreaterThan(0);
      expect(containsSecretRepresentation(output, [secretValue])).toBe(false);
    }

    const audits = await context.workspaceRepository.listAuditEvents(
      context.workspaceId,
    );
    expect(JSON.stringify(audits)).not.toContain(secretValue);
    expect(audits.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "secret.created",
        "secret.normal_output_redacted",
      ]),
    );
  });

  it("binds short-lived harness injection to one context and one consumption", async () => {
    const context = await fixture();
    const secretValue = generatedSecret();
    const secret = await context.secretService.createSecret({
      principal: context.principal,
      workspaceId: context.workspaceId,
      softwareId: context.softwareId,
      label: "Generated fictional browser credential",
      kind: "SESSION_COOKIE",
      value: secretValue,
    });
    const grant = await context.secretService.issueHarnessLease({
      principal: context.principal,
      workspaceId: context.workspaceId,
      softwareId: context.softwareId,
      secretId: secret.id,
      browserContextId: "fictional-context-a",
      purpose: "Fictional tenant sign-in",
      ttlSeconds: 60,
    });

    await expect(
      context.secretService.consumeHarnessLease({
        leaseId: grant.lease.id,
        token: grant.token,
        browserContextId: "fictional-context-b",
      }),
    ).rejects.toBeInstanceOf(SecretLeaseUnavailableError);
    await expect(
      context.secretService.consumeHarnessLease({
        leaseId: grant.lease.id,
        token: grant.token,
        browserContextId: "fictional-context-a",
      }),
    ).resolves.toEqual({
      value: secretValue,
      kind: "SESSION_COOKIE",
      secretId: secret.id,
    });
    await expect(
      context.secretService.consumeHarnessLease({
        leaseId: grant.lease.id,
        token: grant.token,
        browserContextId: "fictional-context-a",
      }),
    ).rejects.toBeInstanceOf(SecretLeaseUnavailableError);

    const expiringGrant = await context.secretService.issueHarnessLease({
      principal: context.principal,
      workspaceId: context.workspaceId,
      softwareId: context.softwareId,
      secretId: secret.id,
      browserContextId: "fictional-context-expiring",
      purpose: "Fictional expiry check",
      ttlSeconds: 15,
    });
    context.setTime("2026-07-19T20:30:16.000Z");
    await expect(
      context.secretService.consumeHarnessLease({
        leaseId: expiringGrant.lease.id,
        token: expiringGrant.token,
        browserContextId: "fictional-context-expiring",
      }),
    ).rejects.toBeInstanceOf(SecretLeaseUnavailableError);

    const audits = await context.workspaceRepository.listAuditEvents(
      context.workspaceId,
    );
    expect(audits.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "secret.harness_lease_issued",
        "secret.harness_injection_denied",
        "secret.harness_injected",
      ]),
    );
    expect(JSON.stringify(audits)).not.toContain(secretValue);
  });

  it("denies and audits raw access while defensively redacting exports", async () => {
    const context = await fixture();
    const secretValue = generatedSecret();
    const secret = await context.secretService.createSecret({
      principal: context.principal,
      workspaceId: context.workspaceId,
      softwareId: context.softwareId,
      label: "Generated fictional browser credential",
      kind: "API_TOKEN",
      value: secretValue,
    });
    await context.workspaceRepository.appendAuditEvent({
      eventId: randomUUID(),
      eventType: "AUDIT_RECORDED",
      workspaceId: context.workspaceId,
      subjectType: "synthetic_regression",
      subjectId: secret.id,
      action: "synthetic.unsafe_log",
      actor: { kind: "HUMAN", actorId: context.principal.userId },
      occurredAt: "2026-07-19T20:30:00.000Z",
      details: { accidentalValue: secretValue },
    });
    const unsafeExport = await context.workspaceService.exportWorkspace({
      principal: context.principal,
      workspaceId: context.workspaceId,
    });
    const safeExport = await context.secretService.redactWorkspaceExport({
      principal: context.principal,
      workspaceId: context.workspaceId,
      content: unsafeExport,
    });

    expect(containsSecretRepresentation(JSON.stringify(safeExport), [secretValue])).toBe(
      false,
    );
    expect(safeExport["secretMetadata"]).toEqual([
      expect.objectContaining({ id: secret.id, status: "ACTIVE" }),
    ]);
    await expect(
      context.secretService.attemptRawAccess({
        principal: context.principal,
        workspaceId: context.workspaceId,
        softwareId: context.softwareId,
        secretId: secret.id,
      }),
    ).rejects.toBeInstanceOf(RawSecretAccessDeniedError);
    const audits = await context.workspaceRepository.listAuditEvents(
      context.workspaceId,
    );
    const denial = audits.find(
      (event) => event.action === "secret.raw_access_denied",
    );
    expect(denial).toBeDefined();
    expect(JSON.stringify(denial)).not.toContain(secretValue);
  });

  it("enforces immutable encrypted bytes and context-bound lease identity in SQL", async () => {
    const context = await fixture();
    const secret = await context.secretService.createSecret({
      principal: context.principal,
      workspaceId: context.workspaceId,
      softwareId: context.softwareId,
      label: "Generated fictional browser credential",
      kind: "PASSWORD",
      value: generatedSecret(),
    });
    const grant = await context.secretService.issueHarnessLease({
      principal: context.principal,
      workspaceId: context.workspaceId,
      softwareId: context.softwareId,
      secretId: secret.id,
      browserContextId: "fictional-context-a",
      purpose: "Fictional tenant sign-in",
      ttlSeconds: 60,
    });

    await expect(
      context.database.database.query(
        "UPDATE secret_records SET encrypted_value = jsonb_set(encrypted_value, '{ciphertext}', to_jsonb('tampered'::text)) WHERE workspace_id = $1 AND id = $2",
        [context.workspaceId, secret.id],
      ),
    ).rejects.toThrow("immutable");
    await expect(
      context.database.database.query(
        "UPDATE secret_access_leases SET browser_context_hash = $3 WHERE workspace_id = $1 AND id = $2",
        [context.workspaceId, grant.lease.id, "a".repeat(64)],
      ),
    ).rejects.toThrow("immutable");
    await expect(
      context.database.database.query(
        "DELETE FROM secret_access_leases WHERE workspace_id = $1 AND id = $2",
        [context.workspaceId, grant.lease.id],
      ),
    ).rejects.toThrow("cannot be deleted");
  });
});
