import { randomBytes } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  Aes256GcmSecretCipher,
  InMemorySecretIsolationRepository,
  SecretIsolationService,
  SecretLeaseUnavailableError,
  configuredSecretRepresentations,
  containsSecretRepresentation,
  redactSecretText,
} from "../../packages/core/src/secret-isolation";
import {
  InMemoryWorkspaceAuthorizationRepository,
  WorkspaceAuthorizationService,
} from "../../packages/core/src/authorization";
import {
  InMemorySoftwareInventoryRepository,
  SoftwareInventoryService,
} from "../../packages/core/src/inventory";

const propertyOptions = { seed: 20_260_719, numRuns: 250 } as const;
const asyncPropertyTimeoutMs = 15_000;

function idFactory(): () => string {
  let value = 5_000;
  return () => {
    value += 1;
    return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
  };
}

async function fixture(secretValue: string) {
  const ids = idFactory();
  const workspaceRepository = new InMemoryWorkspaceAuthorizationRepository();
  const workspaceService = new WorkspaceAuthorizationService(workspaceRepository, {
    idFactory: ids,
    now: () => "2026-07-19T20:30:00.000Z",
  });
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
  const inventoryRepository = new InMemorySoftwareInventoryRepository(
    workspaceRepository,
  );
  const inventoryService = new SoftwareInventoryService(
    inventoryRepository,
    workspaceService,
    { idFactory: ids, now: () => "2026-07-19T20:30:00.000Z" },
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
  const repository = new InMemorySecretIsolationRepository(workspaceRepository);
  const service = new SecretIsolationService(
    repository,
    workspaceService,
    inventoryRepository,
    new Aes256GcmSecretCipher(randomBytes(32), "fixture-key-v1"),
    {
      idFactory: ids,
      tokenFactory: () => `lease-${ids()}-${ids()}`,
      now: () => "2026-07-19T20:30:00.000Z",
    },
  );
  const secret = await service.createSecret({
    principal,
    workspaceId: created.workspace.id,
    softwareId: software.software.id,
    label: "Generated fictional browser credential",
    kind: "PASSWORD",
    value: secretValue,
    expiresAt: "2026-07-20T20:30:00.000Z",
  });
  return {
    principal,
    workspaceId: created.workspace.id,
    softwareId: software.software.id,
    secret,
    service,
  };
}

describe("secret isolation properties", () => {
  it("PROP-15: redaction removes every configured representation and is idempotent", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Za-z0-9!@#$%^&*()_+/?=-]{12,64}$/),
        (secret) => {
          const input = configuredSecretRepresentations(secret).join(" | ");
          const once = redactSecretText(input, [secret]);
          const twice = redactSecretText(once, [secret]);
          expect(twice).toBe(once);
          expect(containsSecretRepresentation(twice, [secret])).toBe(false);
        },
      ),
      propertyOptions,
    );
  });

  it("PROP-20: a harness lease cannot cross browser contexts or be consumed twice", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid().filter((candidate) => candidate !== "00000000-0000-0000-0000-000000000000"),
        async (contextA, contextB) => {
          fc.pre(contextA !== contextB);
          const secretValue = `runtime-${contextA}-${contextB}`;
          const context = await fixture(secretValue);
          const grant = await context.service.issueHarnessLease({
            principal: context.principal,
            workspaceId: context.workspaceId,
            softwareId: context.softwareId,
            secretId: context.secret.id,
            browserContextId: contextA,
            purpose: "Fictional tenant sign-in",
            ttlSeconds: 60,
          });

          await expect(
            context.service.consumeHarnessLease({
              leaseId: grant.lease.id,
              token: grant.token,
              browserContextId: contextB,
            }),
          ).rejects.toBeInstanceOf(SecretLeaseUnavailableError);
          await expect(
            context.service.consumeHarnessLease({
              leaseId: grant.lease.id,
              token: grant.token,
              browserContextId: contextA,
            }),
          ).resolves.toMatchObject({ value: secretValue });
          await expect(
            context.service.consumeHarnessLease({
              leaseId: grant.lease.id,
              token: grant.token,
              browserContextId: contextA,
            }),
          ).rejects.toBeInstanceOf(SecretLeaseUnavailableError);
        },
      ),
      propertyOptions,
    );
  }, asyncPropertyTimeoutMs);
});
