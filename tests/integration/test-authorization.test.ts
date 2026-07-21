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
  PolicyDeniedError,
  PostgresTestAuthorizationRepository,
  TestAuthorizationService,
} from "../../packages/core/src/test-authorization";
import {
  createDatabaseTestService,
  type DatabaseTestService,
} from "../../packages/testkit/src/index";
import { insertPostgresJourneyFixture } from "../helpers/postgres-journey-fixture";

const databases: DatabaseTestService[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

function ids(): () => string {
  let value = 800;
  return () => {
    value += 1;
    return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
  };
}

async function fixture(now = "2026-07-19T20:30:00.000Z") {
  const database = await createDatabaseTestService();
  databases.push(database);
  await applyCoreMigrations(database.database);
  const idFactory = ids();
  const workspaceRepository = new PostgresWorkspaceAuthorizationRepository(
    database.database,
  );
  const workspaceService = new WorkspaceAuthorizationService(
    workspaceRepository,
    { idFactory, now: () => now },
  );
  const inventoryRepository = new PostgresSoftwareInventoryRepository(
    database.database,
  );
  const inventoryService = new SoftwareInventoryService(
    inventoryRepository,
    workspaceService,
    { idFactory, now: () => now },
  );
  const authorizationRepository = new PostgresTestAuthorizationRepository(
    database.database,
  );
  const authorizationService = new TestAuthorizationService(
    authorizationRepository,
    workspaceService,
    inventoryRepository,
    { idFactory, now: () => now },
  );
  const creator = {
    userId: "fictional-officer-a",
    displayName: "Morgan Vale (Fictional)",
  };
  const workspace = await workspaceService.createWorkspace({
    principal: creator,
    name: "Fictional Cedar Ridge School District",
  });
  const principal = { ...creator, activeWorkspaceId: workspace.workspace.id };
  const item = await inventoryService.createSoftware({
    principal,
    workspaceId: workspace.workspace.id,
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
      sourceReference: "AP-2042",
    },
  });
  return {
    database,
    principal,
    workspaceId: workspace.workspace.id,
    softwareId: item.software.id,
    authorizationRepository,
    authorizationService,
  };
}

function activeInput(context: {
  readonly principal: Record<string, string>;
  readonly workspaceId: string;
  readonly softwareId: string;
}) {
  return {
    principal: context.principal,
    workspaceId: context.workspaceId,
    softwareId: context.softwareId,
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
  };
}

describe("PostgreSQL test authorization", () => {
  it("stores the human attestation and policy, then audits every blocked attempt", async () => {
    const context = await fixture();
    const authorization = await context.authorizationService.createAuthorization(
      activeInput(context),
    );

    expect(authorization).toMatchObject({
      version: 1,
      status: "ACTIVE",
      allowedDomains: [
        "cedar.northstar.invalid",
        "assets.northstar.invalid",
      ],
      attestedBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
    });
    const decision = await context.authorizationService.evaluateAttempt({
      principal: context.principal,
      workspaceId: context.workspaceId,
      softwareId: context.softwareId,
      authorizationId: authorization.id,
      attempt: {
        kind: "REDIRECT",
        targetUrl: "https://tracker.outside.invalid/collect",
      },
    });
    expect(decision).toMatchObject({
      allowed: false,
      reason: "DOMAIN_NOT_ALLOWED",
      targetDomain: "tracker.outside.invalid",
    });
    await expect(
      context.authorizationRepository.listDecisions(
        context.workspaceId,
        authorization.id,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        outcome: "DENY",
        reason: "DOMAIN_NOT_ALLOWED",
      }),
    ]);
    const audit = await context.database.database.query<{
      readonly action: string;
      readonly details: { readonly outcome: string; readonly reason: string };
    }>(
      "SELECT action, details FROM audit_events WHERE workspace_id = $1 AND subject_id = $2 ORDER BY occurred_at, id",
      [context.workspaceId, authorization.id],
    );
    expect(audit.rows.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "test_authorization.created",
        "test_authorization.policy_denied",
      ]),
    );
    const deniedAudit = audit.rows.find(
      (event) => event.action === "test_authorization.policy_denied",
    );
    expect(deniedAudit?.details.outcome).toBe("DENY");
    expect(deniedAudit?.details.reason).toBe("DOMAIN_NOT_ALLOWED");
  });

  it("prevents expired and revoked authorization from passing the run queue gate", async () => {
    const context = await fixture();
    const authorization = await context.authorizationService.createAuthorization(
      activeInput(context),
    );
    const expiredService = new TestAuthorizationService(
      context.authorizationRepository,
      { checkPermission: () => Promise.resolve([]) },
      { readSoftware: () => Promise.resolve({} as never) },
      { now: () => "2026-07-22T20:00:00.000Z" },
    );

    await expect(
      expiredService.assertRunMayQueue({
        principal: context.principal,
        workspaceId: context.workspaceId,
        softwareId: context.softwareId,
        authorizationId: authorization.id,
      }),
    ).rejects.toMatchObject({
      reason: "AUTHORIZATION_EXPIRED",
    });
    await context.authorizationService.revokeAuthorization({
      principal: context.principal,
      workspaceId: context.workspaceId,
      softwareId: context.softwareId,
      authorizationId: authorization.id,
      reason: "Fictional district access was withdrawn.",
    });
    await expect(
      context.authorizationService.assertRunMayQueue({
        principal: context.principal,
        workspaceId: context.workspaceId,
        softwareId: context.softwareId,
        authorizationId: authorization.id,
      }),
    ).rejects.toBeInstanceOf(PolicyDeniedError);
    const decisions = await context.authorizationRepository.listDecisions(
      context.workspaceId,
      authorization.id,
    );
    expect(decisions.map((decision) => decision.reason)).toEqual(
      expect.arrayContaining([
        "AUTHORIZATION_EXPIRED",
        "AUTHORIZATION_REVOKED",
      ]),
    );
    expect(decisions).toHaveLength(2);
  });

  it("rejects direct queued-run inserts that bypass the service gate", async () => {
    const context = await fixture();
    const authorization = await context.authorizationService.createAuthorization(
      {
        ...activeInput(context),
        reviewAt: "2099-07-21T00:00:00.000Z",
        expiresAt: "2099-07-22T00:00:00.000Z",
      },
    );
    const agreementId = "91919191-9191-4191-8191-919191919191";
    const journeyVersionId = "92929292-9292-4292-8292-929292929292";
    await context.database.database.query(
      "INSERT INTO agreement_versions (workspace_id, id, software_id, version, source_object_key, source_sha256, source_mime_type, source_file_name, source_byte_length, normalized_text, page_map, created_at, created_by) VALUES ($1, $2, $3, 1, ('agreements/sha256/' || $4 || '.pdf'), $4, 'application/pdf', 'Authorization Gate Fixture.pdf', 1, 'Fixture', jsonb_build_array(jsonb_build_object('pageNumber', 1, 'startOffset', 0, 'endOffset', 7, 'text', 'Fixture', 'textSha256', repeat('b', 64))), now(), $5)",
      [
        context.workspaceId,
        agreementId,
        context.softwareId,
        "a".repeat(64),
        { kind: "HUMAN", actorId: context.principal.userId },
      ],
    );
    await insertPostgresJourneyFixture(context.database.database, {
      workspaceId: context.workspaceId,
      softwareId: context.softwareId,
      agreementVersionId: agreementId,
      authorizationId: authorization.id,
      journeyVersionId,
      journeyId: "93939393-9393-4393-8393-939393939393",
      personaId: "95959595-9595-4595-8595-959595959595",
      proposalRunId: "96969696-9696-4696-8696-969696969696",
      proposedRequirementId: "97979797-9797-4797-8797-979797979797",
      confirmedRequirementId: "98989898-9898-4898-8898-989898989898",
      actorId: context.principal.userId,
      allowedActions: ["NAVIGATE"],
      prohibitedActions: authorization.prohibitedActions,
    });
    const queueSql =
      "INSERT INTO runs (workspace_id, id, software_id, state, agreement_version_id, journey_version_id, authorization_id, runner_config_version, snapshot_hash, queued_at) VALUES ($1, $2, $3, 'QUEUED', $4, $5, $6, 'runner-v1', $7, now())";
    const queueParams = [
      context.workspaceId,
      "94949494-9494-4494-8494-949494949494",
      context.softwareId,
      agreementId,
      journeyVersionId,
      authorization.id,
      "b".repeat(64),
    ];

    await context.database.database.query(
      "UPDATE authorizations SET status = 'EXPIRED' WHERE workspace_id = $1 AND id = $2",
      [context.workspaceId, authorization.id],
    );
    await expect(
      context.database.database.query(queueSql, queueParams),
    ).rejects.toThrow("not active");

    await context.database.database.query(
      "UPDATE authorizations SET status = 'ACTIVE', scope = jsonb_set(scope, '{attestation,authorityConfirmed}', 'false'::jsonb) WHERE workspace_id = $1 AND id = $2",
      [context.workspaceId, authorization.id],
    );
    await expect(
      context.database.database.query(queueSql, queueParams),
    ).rejects.toThrow("attestation is incomplete");

    await context.database.database.query(
      "UPDATE authorizations SET status = 'REVOKED' WHERE workspace_id = $1 AND id = $2",
      [context.workspaceId, authorization.id],
    );
    await expect(
      context.database.database.query(queueSql, queueParams),
    ).rejects.toThrow("not active");
  });
});
