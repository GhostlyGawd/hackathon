import { afterEach, describe, expect, it } from "vitest";
import {
  InMemoryFindingEvaluationRepository,
  PostgresFindingEvaluationRepository,
  evaluateBoundedFinding,
} from "../../packages/core/src/finding-evaluation";
import {
  EvidenceReceiptService,
  InMemoryEvidenceObjectStore,
  PostgresEvidenceReceiptRepository,
} from "../../packages/core/src/evidence-receipt";
import { applyCoreMigrations } from "../../packages/core/src/migrations";
import {
  createDatabaseTestService,
  type DatabaseTestService,
} from "../../packages/testkit/src/index";
import {
  automationActor,
  domainIds,
  humanActor,
} from "../helpers/domain-fixtures";
import { makeFindingEvaluationInput } from "../helpers/finding-evaluation-fixtures";
import { makeEvidenceReceiptBundle } from "../helpers/evidence-receipt-fixtures";
import { insertPostgresJourneyFixture } from "../helpers/postgres-journey-fixture";

const databases: DatabaseTestService[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

async function seedFindingDatabase() {
  const databaseService = await createDatabaseTestService();
  databases.push(databaseService);
  const database = databaseService.database;
  await applyCoreMigrations(database);
  const now = Date.now();
  await database.query(
    "INSERT INTO workspaces (id, name, created_at, created_by) VALUES ($1, 'Finding Evaluation District (Fictional)', now(), '{}')",
    [domainIds.workspace],
  );
  await database.query(
    "INSERT INTO software_records (workspace_id, id, name, vendor_name, approval_state, approval_owner, created_at) VALUES ($1, $2, 'Finding Evaluation Fixture', 'Fictional Vendor', 'UNKNOWN', 'NONE', now())",
    [domainIds.workspace, domainIds.software],
  );
  await database.query(
    "INSERT INTO agreement_versions (workspace_id, id, software_id, version, source_object_key, source_sha256, source_mime_type, source_file_name, source_byte_length, normalized_text, page_map, created_at, created_by) VALUES ($1, $2, $3, 1, ('agreements/sha256/' || $4 || '.txt'), $4, 'text/plain', 'Finding Evaluation Agreement.txt', 7, 'Fixture', jsonb_build_array(jsonb_build_object('pageNumber', 1, 'startOffset', 0, 'endOffset', 7, 'text', 'Fixture', 'textSha256', repeat('b', 64))), now(), jsonb_build_object('kind', 'HUMAN', 'actorId', 'fictional-officer'))",
    [
      domainIds.workspace,
      domainIds.agreement,
      domainIds.software,
      "a".repeat(64),
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
  const evaluationInput = makeFindingEvaluationInput();
  const manifest = evaluationInput.runManifest;
  await insertPostgresJourneyFixture(database, {
    workspaceId: domainIds.workspace,
    softwareId: domainIds.software,
    agreementVersionId: domainIds.agreement,
    authorizationId: domainIds.authorization,
    journeyVersionId: domainIds.journeyVersion,
    journeyId: domainIds.journey,
    personaId: "17171717-1717-4717-8717-171717171717",
    proposalRunId: "18181818-1818-4818-8818-181818181818",
    proposedRequirementId: "19191919-1919-4919-8919-191919191919",
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
      "a".repeat(64),
      manifest.queuedAt,
    ],
  );
  const executionScope = {
    schemaVersion: "1.0.0",
    runId: manifest.runId,
    workspaceId: manifest.workspaceId,
    softwareId: manifest.softwareId,
    requiredCheckpointIds: manifest.requiredCheckpointIds,
    modelIdentifier: manifest.modelIdentifier,
    createdAt: manifest.queuedAt,
    createdBy: automationActor,
    scopeHash: manifest.executionScopeHash,
  };
  await database.query(
    "INSERT INTO run_execution_scopes (workspace_id, run_id, software_id, scope_hash, model_identifier, required_checkpoint_ids, payload, created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [
      manifest.workspaceId,
      manifest.runId,
      manifest.softwareId,
      manifest.executionScopeHash,
      manifest.modelIdentifier,
      manifest.requiredCheckpointIds,
      executionScope,
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
  return database;
}

describe("DET-03 finding persistence", () => {
  it("stores immutable evaluations without changing their deterministic result", async () => {
    const repository = new InMemoryFindingEvaluationRepository();
    const evaluation = evaluateBoundedFinding(
      makeFindingEvaluationInput({ destinationStatus: "PROHIBITED" }),
    );

    await repository.append(evaluation);

    await expect(
      repository.get(evaluation.finding.workspaceId, evaluation.finding.id),
    ).resolves.toEqual(evaluation);
    await expect(
      repository.listForRun(
        evaluation.finding.workspaceId,
        evaluation.finding.runId,
      ),
    ).resolves.toEqual([evaluation]);
    await expect(repository.append(evaluation)).rejects.toThrow(/already exists/iu);
  });

  it("persists the complete bounded payload through PostgreSQL and rejects mutation", async () => {
    const database = await seedFindingDatabase();
    const repository = new PostgresFindingEvaluationRepository(database);
    const evaluation = evaluateBoundedFinding(
      makeFindingEvaluationInput({ destinationStatus: "PROHIBITED" }),
    );

    await repository.append(evaluation);

    await expect(
      repository.get(evaluation.finding.workspaceId, evaluation.finding.id),
    ).resolves.toEqual(evaluation);
    await expect(
      repository.listForRun(
        evaluation.finding.workspaceId,
        evaluation.finding.runId,
      ),
    ).resolves.toEqual([evaluation]);
    await expect(
      database.query(
        "UPDATE findings SET state = 'NEEDS_REVIEW' WHERE workspace_id = $1 AND id = $2",
        [evaluation.finding.workspaceId, evaluation.finding.id],
      ),
    ).rejects.toThrow(/immutable/iu);
    await expect(
      database.query(
        "DELETE FROM findings WHERE workspace_id = $1 AND id = $2",
        [evaluation.finding.workspaceId, evaluation.finding.id],
      ),
    ).rejects.toThrow(/immutable/iu);
  });
});

describe("DET-04 PostgreSQL evidence receipt persistence", () => {
  it("stores the exact independently verifiable bundle and rejects database mutation", async () => {
    const database = await seedFindingDatabase();
    const findingRepository = new PostgresFindingEvaluationRepository(database);
    const evaluation = evaluateBoundedFinding(
      makeFindingEvaluationInput({ destinationStatus: "PROHIBITED" }),
    );
    await findingRepository.append(evaluation);
    const repository = new PostgresEvidenceReceiptRepository(database);
    const service = new EvidenceReceiptService(
      repository,
      new InMemoryEvidenceObjectStore(),
    );
    const bundle = makeEvidenceReceiptBundle();

    await service.append(bundle);

    await expect(
      service.get(bundle.receipt.workspaceId, bundle.receipt.id),
    ).resolves.toEqual(bundle);
    await expect(
      database.query(
        "UPDATE evidence_receipts SET content_hash = $3 WHERE workspace_id = $1 AND id = $2",
        [bundle.receipt.workspaceId, bundle.receipt.id, "0".repeat(64)],
      ),
    ).rejects.toThrow(/immutable/iu);
    await expect(
      database.query(
        "DELETE FROM evidence_receipts WHERE workspace_id = $1 AND id = $2",
        [bundle.receipt.workspaceId, bundle.receipt.id],
      ),
    ).rejects.toThrow(/immutable/iu);
  });
});
