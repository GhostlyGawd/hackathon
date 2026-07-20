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
  PostgresTestAuthorizationRepository,
  TestAuthorizationService,
} from "../../packages/core/src/test-authorization";
import {
  LikelyRealDataError,
  PostgresSyntheticDataRepository,
  SyntheticDataService,
} from "../../packages/core/src/synthetic-data";
import {
  createDatabaseTestService,
  type DatabaseTestService,
} from "../../packages/testkit/src/index";

const databases: DatabaseTestService[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

function ids(): () => string {
  let value = 30_000;
  return () => {
    value += 1;
    return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
  };
}

function activeAuthorizationInput(context: {
  readonly principal: Record<string, string>;
  readonly workspaceId: string;
  readonly softwareId: string;
}) {
  return {
    principal: context.principal,
    workspaceId: context.workspaceId,
    softwareId: context.softwareId,
    authorityBasis: "District-owned fictional training tenant.",
    validFrom: "2026-07-20T00:00:00.000Z",
    reviewAt: "2026-07-21T00:00:00.000Z",
    expiresAt: "2026-07-22T00:00:00.000Z",
    allowedBaseUrl: "https://cedar.northstar.invalid/classroom",
    allowedSupportingDomains: ["assets.northstar.invalid"],
    allowedActions: ["NAVIGATE", "SUBMIT"],
    prohibitedActions: ["DELETE", "PURCHASE", "MESSAGE"],
    redirectPolicy: "ALLOW_LISTED_ONLY",
    popupPolicy: "BLOCK_ALL",
    attestation: {
      authorityConfirmed: true,
      syntheticAccountsOnlyConfirmed: true,
      statement: "I confirm this fictional district controls the test tenant.",
    },
  };
}

async function fixture() {
  const database = await createDatabaseTestService();
  databases.push(database);
  await applyCoreMigrations(database.database);
  const idFactory = ids();
  const workspaceRepository = new PostgresWorkspaceAuthorizationRepository(
    database.database,
  );
  const authorization = new WorkspaceAuthorizationService(workspaceRepository, {
    idFactory,
    now: () => "2026-07-20T00:30:00.000Z",
  });
  const created = await authorization.createWorkspace({
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
  const inventory = new SoftwareInventoryService(
    inventoryRepository,
    authorization,
    { idFactory, now: () => "2026-07-20T00:30:00.000Z" },
  );
  const software = await inventory.createSoftware({
    principal,
    workspaceId: created.workspace.id,
    name: "Northstar Classroom (Fictional)",
    vendorName: "Northstar Learning Labs (Fictional)",
    authorizedTenantUrl: "https://cedar.northstar.invalid/classroom",
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
  const testAuthorizationRepository = new PostgresTestAuthorizationRepository(
    database.database,
  );
  const testAuthorization = new TestAuthorizationService(
    testAuthorizationRepository,
    authorization,
    inventoryRepository,
    { idFactory, now: () => "2026-07-20T00:30:00.000Z" },
  );
  const policy = await testAuthorization.createAuthorization(
    activeAuthorizationInput({
      principal,
      workspaceId: created.workspace.id,
      softwareId: software.software.id,
    }),
  );
  const agreementId = "71717171-7171-4171-8171-717171717171";
  const journeyVersionId = "72727272-7272-4272-8272-727272727272";
  await database.database.query(
    "INSERT INTO agreement_versions (workspace_id, id, software_id, version, source_object_key, source_sha256, source_mime_type, source_file_name, source_byte_length, normalized_text, page_map, created_at, created_by) VALUES ($1, $2, $3, 1, ('agreements/sha256/' || $4 || '.pdf'), $4, 'application/pdf', 'Persona Fixture.pdf', 1, 'Fixture', jsonb_build_array(jsonb_build_object('pageNumber', 1, 'startOffset', 0, 'endOffset', 7, 'text', 'Fixture', 'textSha256', repeat('b', 64))), now(), $5)",
    [
      created.workspace.id,
      agreementId,
      software.software.id,
      "a".repeat(64),
      { kind: "HUMAN", actorId: principal.userId },
    ],
  );
  await database.database.query(
    "INSERT INTO journey_versions (workspace_id, id, journey_id, version, authorization_id, payload, created_at, created_by) VALUES ($1, $2, $3, 1, $4, '{}', now(), $5)",
    [
      created.workspace.id,
      journeyVersionId,
      "73737373-7373-4373-8373-737373737373",
      policy.id,
      { kind: "HUMAN", actorId: principal.userId },
    ],
  );
  const runIds = [
    "74747474-7474-4474-8474-747474747474",
    "75757575-7575-4575-8575-757575757575",
    "76767676-7676-4676-8676-767676767676",
  ] as const;
  for (const runId of runIds) {
    await database.database.query(
      "INSERT INTO runs (workspace_id, id, software_id, state, agreement_version_id, journey_version_id, authorization_id, runner_config_version, snapshot_hash, queued_at) VALUES ($1, $2, $3, 'QUEUED', $4, $5, $6, 'runner-v1', $7, now())",
      [
        created.workspace.id,
        runId,
        software.software.id,
        agreementId,
        journeyVersionId,
        policy.id,
        "b".repeat(64),
      ],
    );
  }
  let token = 0n;
  const repository = new PostgresSyntheticDataRepository(database.database);
  const service = new SyntheticDataService(repository, authorization, {
    idFactory,
    now: () => "2026-07-20T00:30:00.000Z",
    tokenFactory: () => (++token).toString(16).padStart(32, "0"),
  });
  return {
    database,
    principal,
    repository,
    runIds,
    service,
    workspaceId: created.workspace.id,
    workspaceRepository,
  };
}

const safeDraft = {
  role: "STUDENT" as const,
  displayName: "Nova Reed (Fictional)",
  email: "nova.reed@student.pactwire.invalid",
  fields: { submissionPhrase: "Fictional response about Saturn" },
  confirmedFictional: true as const,
};

describe("PostgreSQL synthetic data", () => {
  it("persists only confirmed, scanner-clear personas and audits without raw rejected values", async () => {
    const context = await fixture();
    const rejectedEmail = "student@real-school.edu";
    await expect(
      context.service.createPersona({
        principal: context.principal,
        workspaceId: context.workspaceId,
        role: "STUDENT",
        displayName: "Taylor Morgan",
        email: rejectedEmail,
        fields: { studentId: "123456789" },
        confirmedFictional: true,
      }),
    ).rejects.toBeInstanceOf(LikelyRealDataError);

    const persona = await context.service.createPersona({
      principal: context.principal,
      workspaceId: context.workspaceId,
      ...safeDraft,
    });
    const stored = await context.database.database.query<{
      readonly fictional_confirmation: unknown;
      readonly scan_result: unknown;
    }>(
      "SELECT fictional_confirmation, scan_result FROM personas WHERE workspace_id = $1 AND id = $2",
      [context.workspaceId, persona.id],
    );
    expect(stored.rows[0]).toMatchObject({
      fictional_confirmation: {
        statementVersion: "fictional-only-v1",
        confirmedBy: { actorId: context.principal.userId },
      },
      scan_result: { scannerVersion: "likely-real-v1", outcome: "CLEAR" },
    });
    const audits = await context.workspaceRepository.listAuditEvents(
      context.workspaceId,
    );
    expect(audits.map((event) => event.action)).toContain("persona.created");
    expect(JSON.stringify(audits)).not.toContain(rejectedEmail);
  });

  it("enforces immutable, globally unique, source-complete canaries across runs", async () => {
    const context = await fixture();
    const persona = await context.service.createPersona({
      principal: context.principal,
      workspaceId: context.workspaceId,
      ...safeDraft,
    });
    const selection = [
      { personaId: persona.id, sourceFields: ["email", "submissionPhrase"] },
    ];
    const runA = await context.service.generateRunCanaries({
      principal: context.principal,
      workspaceId: context.workspaceId,
      runId: context.runIds[0],
      selections: selection,
    });
    const replay = await context.service.generateRunCanaries({
      principal: context.principal,
      workspaceId: context.workspaceId,
      runId: context.runIds[0],
      selections: selection,
    });
    const runB = await context.service.generateRunCanaries({
      principal: context.principal,
      workspaceId: context.workspaceId,
      runId: context.runIds[1],
      selections: selection,
    });

    expect(replay).toEqual(runA);
    expect(new Set([...runA, ...runB].map((item) => item.value)).size).toBe(4);
    expect(
      runA.every(
        (item) => item.personaId === persona.id && item.workspaceId === context.workspaceId,
      ),
    ).toBe(true);
    await expect(
      context.service.listRunCanaries({
        principal: context.principal,
        workspaceId: context.workspaceId,
        runId: context.runIds[2],
      }),
    ).resolves.toEqual([]);
    await expect(
      context.database.database.query(
        "UPDATE canaries SET value = 'PACTWIRE-FICTIONAL-CHANGED' WHERE workspace_id = $1 AND id = $2",
        [context.workspaceId, runA[0]?.id],
      ),
    ).rejects.toThrow("immutable");
    await expect(
      context.database.database.query(
        "INSERT INTO canaries (workspace_id, id, run_id, persona_id, source_field, value, generated_at) VALUES ($1, $2, $3, $4, 'displayName', $5, now())",
        [
          context.workspaceId,
          "77777777-7777-4777-8777-777777777778",
          context.runIds[2],
          persona.id,
          runA[0]?.value,
        ],
      ),
    ).rejects.toThrow();
  });
});
