import {
  PostgresWorkspaceAuthorizationRepository,
  WorkspaceAuthorizationService,
} from "../../packages/core/src/authorization";
import {
  EvidenceReceiptService,
  InMemoryEvidenceObjectStore,
  PostgresEvidenceReceiptRepository,
} from "../../packages/core/src/evidence-receipt";
import {
  PostgresFindingEvaluationRepository,
  evaluateBoundedFinding,
} from "../../packages/core/src/finding-evaluation";
import { applyCoreMigrations } from "../../packages/core/src/migrations";
import {
  createDatabaseTestService,
  type DatabaseTestService,
} from "../../packages/testkit/src/index";
import { automationActor, domainIds, humanActor } from "./domain-fixtures";
import { makeEvidenceReceiptBundle } from "./evidence-receipt-fixtures";
import { makeFindingEvaluationInput } from "./finding-evaluation-fixtures";
import { insertPostgresJourneyFixture } from "./postgres-journey-fixture";

function idFactory(): () => string {
  let value = 700;
  return () =>
    `00000000-0000-4000-8000-${String(++value).padStart(12, "0")}`;
}

export async function seedPostgresApprovalFixture(): Promise<{
  readonly databaseService: DatabaseTestService;
  readonly authorization: WorkspaceAuthorizationService;
}> {
  const databaseService = await createDatabaseTestService();
  const database = databaseService.database;
  await applyCoreMigrations(database);
  const now = Date.now();
  await database.query(
    "INSERT INTO workspaces (id, name, created_at, created_by) VALUES ($1, 'Approval Authority District (Fictional)', now(), $2)",
    [domainIds.workspace, humanActor],
  );
  await database.query(
    "INSERT INTO user_roles (workspace_id, id, user_id, role, assigned_at, assigned_by) VALUES ($1, $2, $3, 'PRIVACY_OFFICER', now(), $4)",
    [
      domainIds.workspace,
      "40404040-4040-4040-8040-404040404040",
      "fictional-officer-a",
      humanActor,
    ],
  );
  await database.query(
    "INSERT INTO software_records (workspace_id, id, name, vendor_name, approval_state, approval_owner, created_at) VALUES ($1, $2, 'Northstar Classroom (Fictional)', 'Northstar Learning Labs (Fictional)', 'APPROVED', 'IMPORTED_SYSTEM', now())",
    [domainIds.workspace, domainIds.software],
  );
  await database.query(
    "INSERT INTO software_inventory_details (workspace_id, software_id, authorized_tenant_url, district_owner, known_version, created_by, created_at) VALUES ($1, $2, 'https://cedar.northstar.invalid', 'Curriculum and Instruction', '2026.7-fixture', $3, now())",
    [domainIds.workspace, domainIds.software, humanActor],
  );
  await database.query(
    "INSERT INTO software_approval_origins (workspace_id, id, software_id, state, actor_kind, set_by, reason, source_reference, recorded_by, recorded_at) VALUES ($1, $2, $3, 'APPROVED', 'IMPORTED_SYSTEM', $4, 'Imported existing district approval record.', 'AP-2042', $5, now())",
    [
      domainIds.workspace,
      "41414141-4141-4141-8141-414141414141",
      domainIds.software,
      {
        kind: "IMPORTED_SYSTEM",
        actorId: "fictional-district-registry",
        displayName: "Fictional Cedar Ridge App Registry",
        source: "district inventory export",
      },
      humanActor,
    ],
  );
  await database.query(
    "INSERT INTO agreement_versions (workspace_id, id, software_id, version, source_object_key, source_sha256, source_mime_type, source_file_name, source_byte_length, normalized_text, page_map, created_at, created_by) VALUES ($1, $2, $3, 1, ('agreements/sha256/' || $4 || '.txt'), $4, 'text/plain', 'Approval Authority Agreement.txt', 7, 'Fixture', jsonb_build_array(jsonb_build_object('pageNumber', 1, 'startOffset', 0, 'endOffset', 7, 'text', 'Fixture', 'textSha256', repeat('b', 64))), now(), $5)",
    [
      domainIds.workspace,
      domainIds.agreement,
      domainIds.software,
      "a".repeat(64),
      humanActor,
    ],
  );
  await database.query(
    "INSERT INTO authorizations (workspace_id, id, software_id, version, status, valid_from, expires_at, scope, attested_by, attested_at) VALUES ($1, $2, $3, 1, 'ACTIVE', $4, $5, $6, $7, $8)",
    [
      domainIds.workspace,
      domainIds.authorization,
      domainIds.software,
      new Date(now - 86_400_000).toISOString(),
      new Date(now + 10 * 86_400_000).toISOString(),
      {
        authorityBasis: "Controlled fictional test authority.",
        reviewAt: new Date(now + 4 * 86_400_000).toISOString(),
        allowedBaseUrl: "https://classroom.pactwire.test",
        allowedDomains: ["classroom.pactwire.test"],
        allowedActions: ["NAVIGATE"],
        prohibitedActions: ["MESSAGE"],
        redirectPolicy: "ALLOW_LISTED_ONLY",
        popupPolicy: "BLOCK_ALL",
        attestation: {
          authorityConfirmed: true,
          syntheticAccountsOnlyConfirmed: true,
        },
      },
      humanActor,
      new Date(now - 86_400_000).toISOString(),
    ],
  );
  const evaluationInput = makeFindingEvaluationInput({
    destinationStatus: "PROHIBITED",
  });
  const manifest = evaluationInput.runManifest;
  await insertPostgresJourneyFixture(database, {
    workspaceId: domainIds.workspace,
    softwareId: domainIds.software,
    agreementVersionId: domainIds.agreement,
    authorizationId: domainIds.authorization,
    journeyVersionId: domainIds.journeyVersion,
    journeyId: domainIds.journey,
    personaId: "42424242-4242-4242-8242-424242424242",
    proposalRunId: "43434343-4343-4343-8343-434343434343",
    proposedRequirementId: "44444444-4444-4444-8444-444444444445",
    confirmedRequirementId: domainIds.requirement,
    actorId: humanActor.actorId,
    allowedActions: ["NAVIGATE"],
    prohibitedActions: ["MESSAGE"],
    checkpointIds: manifest.requiredCheckpointIds,
  });
  await database.query(
    "INSERT INTO runs (workspace_id, id, software_id, state, agreement_version_id, journey_version_id, authorization_id, runner_config_version, snapshot_hash, queued_at) VALUES ($1, $2, $3, 'QUEUED', $4, $5, $6, $7, $8, $9)",
    [
      domainIds.workspace,
      domainIds.run,
      domainIds.software,
      domainIds.agreement,
      domainIds.journeyVersion,
      domainIds.authorization,
      manifest.runnerConfigVersion,
      manifest.snapshot.snapshotHash,
      manifest.queuedAt,
    ],
  );
  await database.query(
    "INSERT INTO run_execution_scopes (workspace_id, run_id, software_id, scope_hash, model_identifier, required_checkpoint_ids, payload, created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [
      manifest.workspaceId,
      manifest.runId,
      manifest.softwareId,
      manifest.executionScopeHash,
      manifest.modelIdentifier,
      manifest.requiredCheckpointIds,
      {
        schemaVersion: "1.0.0",
        runId: manifest.runId,
        workspaceId: manifest.workspaceId,
        softwareId: manifest.softwareId,
        requiredCheckpointIds: manifest.requiredCheckpointIds,
        modelIdentifier: manifest.modelIdentifier,
        createdAt: manifest.queuedAt,
        createdBy: automationActor,
        scopeHash: manifest.executionScopeHash,
      },
      manifest.queuedAt,
      automationActor,
    ],
  );
  await database.query(
    "UPDATE runs SET state = 'RUNNING' WHERE workspace_id = $1 AND id = $2",
    [manifest.workspaceId, manifest.runId],
  );
  await database.query(
    "INSERT INTO run_manifests (workspace_id, id, run_id, software_id, terminal_status, manifest_hash, payload, finalized_at, finalized_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [
      manifest.workspaceId,
      manifest.id,
      manifest.runId,
      manifest.softwareId,
      manifest.terminalStatus,
      manifest.manifestHash,
      manifest,
      manifest.terminalAt,
      manifest.finalizedBy,
    ],
  );
  await database.query(
    "UPDATE runs SET state = 'COMPLETED', terminal_at = $3, manifest_hash = $4 WHERE workspace_id = $1 AND id = $2",
    [
      manifest.workspaceId,
      manifest.runId,
      manifest.terminalAt,
      manifest.manifestHash,
    ],
  );
  const evaluation = evaluateBoundedFinding(evaluationInput);
  await new PostgresFindingEvaluationRepository(database).append(evaluation);
  const receiptService = new EvidenceReceiptService(
    new PostgresEvidenceReceiptRepository(database),
    new InMemoryEvidenceObjectStore(),
  );
  await receiptService.append(makeEvidenceReceiptBundle());
  const authorization = new WorkspaceAuthorizationService(
    new PostgresWorkspaceAuthorizationRepository(database),
    {
      idFactory: idFactory(),
      now: () => "2026-07-22T15:00:00.000Z",
    },
  );
  return { databaseService, authorization };
}
