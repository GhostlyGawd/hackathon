import { afterEach, describe, expect, it } from "vitest";
import {
  applyCoreMigrations,
  InMemoryDeterministicReplayRepository,
  PostgresDeterministicReplayRepository,
  PostgresJourneyAuthoringRepository,
  ReplayVersionConflictError,
  type AuditEvent,
  type DeterministicReplayVersion,
  type JourneyVersion,
} from "../../packages/core/src/index";
import {
  createDatabaseTestService,
  type DatabaseTestService,
} from "../../packages/testkit/src/index";
import {
  journeyFixtureIds,
  journeyPrincipal,
  makeActiveAuthorization,
  makeConfirmedRequirement,
  makeProposedRequirement,
  makeStudentPersona,
} from "../helpers/journey-authoring-fixtures";
import {
  makeReplayJourney,
  makeReplayVersion,
} from "../helpers/deterministic-replay-fixtures";

const databases: DatabaseTestService[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

function replayAudit(
  replay: DeterministicReplayVersion,
  eventId = "16161616-1616-4616-8616-161616161616",
): AuditEvent {
  return {
    eventId,
    eventType: "AUDIT_RECORDED",
    workspaceId: replay.workspaceId,
    subjectType: "deterministic_replay_version",
    subjectId: replay.id,
    action: replay.version === 1 ? "replay.created" : "replay.versioned",
    actor: replay.createdBy,
    occurredAt: replay.createdAt,
    details: {
      replayId: replay.replayId,
      sourceVersionId: replay.sourceVersionId,
      arm: replay.arm,
    },
  };
}

function journeyAudit(journey: JourneyVersion): AuditEvent {
  return {
    eventId: "17171717-1717-4717-8717-171717171717",
    eventType: "AUDIT_RECORDED",
    workspaceId: journey.workspaceId,
    subjectType: "journey_version",
    subjectId: journey.id,
    action: "journey.created",
    actor: journey.createdBy,
    occurredAt: journey.createdAt,
    details: { sourceVersionId: null },
  };
}

async function seedExactJourney(database: DatabaseTestService["database"]) {
  const proposed = makeProposedRequirement();
  const confirmed = makeConfirmedRequirement();
  const persona = makeStudentPersona();
  const databaseNow = Date.now();
  const authorization = makeActiveAuthorization({
    validFrom: new Date(databaseNow - 86_400_000).toISOString(),
    reviewAt: new Date(databaseNow + 4 * 86_400_000).toISOString(),
    expiresAt: new Date(databaseNow + 10 * 86_400_000).toISOString(),
    attestedAt: new Date(databaseNow - 86_400_000).toISOString(),
  });
  await database.query(
    "INSERT INTO workspaces (id, name, created_at, created_by) VALUES ($1, 'Replay District (Fictional)', now(), '{}')",
    [journeyFixtureIds.workspace],
  );
  await database.query(
    "INSERT INTO software_records (workspace_id, id, name, vendor_name, approval_state, approval_owner, created_at) VALUES ($1, $2, 'Replay Fixture', 'Fictional Vendor', 'UNKNOWN', 'NONE', now())",
    [journeyFixtureIds.workspace, journeyFixtureIds.software],
  );
  await database.query(
    "INSERT INTO agreement_versions (workspace_id, id, software_id, version, source_object_key, source_sha256, source_mime_type, source_file_name, source_byte_length, normalized_text, page_map, created_at, created_by) VALUES ($1, $2, $3, 1, ('agreements/sha256/' || $4 || '.txt'), $4, 'text/plain', 'Replay Agreement.txt', 7, 'Fixture', jsonb_build_array(jsonb_build_object('pageNumber', 1, 'startOffset', 0, 'endOffset', 7, 'text', 'Fixture', 'textSha256', repeat('b', 64))), now(), jsonb_build_object('kind', 'HUMAN', 'actorId', 'fixture-officer'))",
    [
      journeyFixtureIds.workspace,
      journeyFixtureIds.agreement,
      journeyFixtureIds.software,
      "a".repeat(64),
    ],
  );
  await database.query(
    "INSERT INTO requirement_proposal_runs (workspace_id, id, software_id, agreement_version_id, status, provider, requested_model, returned_model, attempts, total_input_tokens, total_cached_input_tokens, total_output_tokens, total_reasoning_tokens, total_tokens, total_estimated_cost_micro_usd, requested_by, created_at) VALUES ($1, $2, $3, $4, 'SUCCEEDED', 'DETERMINISTIC_FIXTURE', 'fixture-v1', 'fixture-v1', '[{}]', 0, 0, 0, 0, 0, 0, jsonb_build_object('kind', 'HUMAN', 'actorId', 'fixture-officer'), now())",
    [
      journeyFixtureIds.workspace,
      proposed.modelRunId,
      journeyFixtureIds.software,
      journeyFixtureIds.agreement,
    ],
  );
  await database.query(
    "INSERT INTO requirement_versions (workspace_id, id, agreement_version_id, requirement_key, version, model_run_id, status, executable, payload, created_at) VALUES ($1, $2, $3, $4, 1, $5, 'PROPOSED', false, $6, $7)",
    [
      proposed.workspaceId,
      proposed.id,
      proposed.agreementVersionId,
      proposed.requirementKey,
      proposed.modelRunId,
      proposed,
      proposed.createdAt,
    ],
  );
  await database.query(
    "INSERT INTO requirement_versions (workspace_id, id, agreement_version_id, requirement_key, version, source_requirement_version_id, status, executable, payload, created_at) VALUES ($1, $2, $3, $4, 2, $5, 'CONFIRMED', true, $6, $7)",
    [
      confirmed.workspaceId,
      confirmed.id,
      confirmed.agreementVersionId,
      confirmed.requirementKey,
      proposed.id,
      confirmed,
      confirmed.createdAt,
    ],
  );
  await database.query(
    "INSERT INTO authorizations (workspace_id, id, software_id, version, status, valid_from, expires_at, scope, attested_by, attested_at) VALUES ($1, $2, $3, 1, 'ACTIVE', $4, $5, $6, $7, $8)",
    [
      authorization.workspaceId,
      authorization.id,
      authorization.softwareId,
      authorization.validFrom,
      authorization.expiresAt,
      {
        authorityBasis: authorization.authorityBasis,
        reviewAt: authorization.reviewAt,
        allowedBaseUrl: authorization.allowedBaseUrl,
        allowedDomains: authorization.allowedDomains,
        allowedActions: authorization.allowedActions,
        prohibitedActions: authorization.prohibitedActions,
        redirectPolicy: authorization.redirectPolicy,
        popupPolicy: authorization.popupPolicy,
        attestation: authorization.attestation,
      },
      authorization.attestedBy,
      authorization.attestedAt,
    ],
  );
  await database.query(
    "INSERT INTO personas (workspace_id, id, role, fictional, display_name, email, fields, fictional_confirmation, scan_result, created_at, created_by) VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, $9, $10)",
    [
      persona.workspaceId,
      persona.id,
      persona.role,
      persona.displayName,
      persona.email,
      persona.fields,
      persona.fictionalConfirmation,
      persona.scanResult,
      persona.createdAt,
      persona.createdBy,
    ],
  );
  const journey = makeReplayJourney();
  await new PostgresJourneyAuthoringRepository(database).appendVersion(
    journey,
    journeyAudit(journey),
  );
}

describe("deterministic replay persistence", () => {
  it("appends immutable in-memory versions with audit provenance and rejects a competing version", async () => {
    const auditEvents: AuditEvent[] = [];
    const repository = new InMemoryDeterministicReplayRepository({
      appendAuditEvent(event) {
        auditEvents.push(event);
        return Promise.resolve();
      },
    });
    const replay = makeReplayVersion();

    await expect(repository.appendVersion(replay, replayAudit(replay))).resolves.toEqual(
      replay,
    );
    await expect(
      repository.appendVersion(
        replay,
        replayAudit(replay, "18181818-1818-4818-8818-181818181818"),
      ),
    ).rejects.toBeInstanceOf(ReplayVersionConflictError);
    await expect(
      repository.listVersions(replay.workspaceId, replay.softwareId, replay.journeyVersionId),
    ).resolves.toEqual([replay]);
    expect(auditEvents).toEqual([replayAudit(replay)]);
  });

  it("atomically persists a human baseline and rejects update or automated authorship in PostgreSQL", async () => {
    const databaseService = await createDatabaseTestService();
    databases.push(databaseService);
    const database = databaseService.database;
    await applyCoreMigrations(database);
    await seedExactJourney(database);
    const repository = new PostgresDeterministicReplayRepository(database);
    const replay = makeReplayVersion();

    await expect(repository.appendVersion(replay, replayAudit(replay))).resolves.toEqual(
      replay,
    );
    await expect(
      repository.getVersion(replay.workspaceId, replay.softwareId, replay.id),
    ).resolves.toEqual(replay);
    await expect(
      database.query(
        "UPDATE deterministic_replay_versions SET replay_hash = $1 WHERE workspace_id = $2 AND id = $3",
        ["f".repeat(64), replay.workspaceId, replay.id],
      ),
    ).rejects.toThrow();

    const forgedId = "19191919-1919-4919-8919-191919191919";
    const forgedReplayId = "20202020-2020-4020-8020-202020202020";
    const forgedPayload = {
      ...structuredClone(replay),
      id: forgedId,
      replayId: forgedReplayId,
      replayHash: "e".repeat(64),
    };
    await expect(
      database.query(
        "INSERT INTO deterministic_replay_versions (workspace_id, id, software_id, agreement_version_id, journey_version_id, authorization_id, replay_id, version, source_replay_version_id, replay_hash, snapshot_hash, payload, created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, NULL, $8, $9, $10, now(), jsonb_build_object('kind', 'AUTOMATION', 'actorId', 'forged-replay', 'component', 'forged-replay'))",
        [
          replay.workspaceId,
          forgedId,
          replay.softwareId,
          replay.agreementVersionId,
          replay.journeyVersionId,
          replay.authorizationId,
          forgedReplayId,
          forgedPayload.replayHash,
          replay.snapshot.snapshotHash,
          forgedPayload,
        ],
      ),
    ).rejects.toThrow();

    const mismatchedAuthorId = "21212121-2121-4121-8121-212121212121";
    const mismatchedAuthorReplayId = "22222222-2222-4222-8222-222222222222";
    const mismatchedAuthorPayload = {
      ...structuredClone(replay),
      id: mismatchedAuthorId,
      replayId: mismatchedAuthorReplayId,
      replayHash: "d".repeat(64),
      createdBy: {
        kind: "AUTOMATION",
        actorId: "forged-replay",
        component: "forged-replay",
      },
    };
    await expect(
      database.query(
        "INSERT INTO deterministic_replay_versions (workspace_id, id, software_id, agreement_version_id, journey_version_id, authorization_id, replay_id, version, source_replay_version_id, replay_hash, snapshot_hash, payload, created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, NULL, $8, $9, $10, $11, $12)",
        [
          replay.workspaceId,
          mismatchedAuthorId,
          replay.softwareId,
          replay.agreementVersionId,
          replay.journeyVersionId,
          replay.authorizationId,
          mismatchedAuthorReplayId,
          mismatchedAuthorPayload.replayHash,
          replay.snapshot.snapshotHash,
          mismatchedAuthorPayload,
          replay.createdAt,
          replay.createdBy,
        ],
      ),
    ).rejects.toThrow(/columns must match the immutable payload/i);

    const auditRows = await database.query<{ action: string; actor: unknown }>(
      "SELECT action, actor FROM audit_events WHERE workspace_id = $1 AND subject_id = $2",
      [replay.workspaceId, replay.id],
    );
    expect(auditRows.rows).toEqual([
      {
        action: "replay.created",
        actor: { kind: "HUMAN", actorId: journeyPrincipal.userId },
      },
    ]);
  });
});
