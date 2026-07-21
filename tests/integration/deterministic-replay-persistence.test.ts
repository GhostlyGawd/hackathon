import { afterEach, describe, expect, it } from "vitest";
import {
  applyCoreMigrations,
  InMemoryDeterministicReplayRepository,
  InMemoryJourneyRepairRepository,
  PostgresJourneyRepairRepository,
  PostgresDeterministicReplayRepository,
  PostgresJourneyAuthoringRepository,
  ReplayVersionConflictError,
  type AuditEvent,
  type DeterministicReplayVersion,
  type JourneyVersion,
  buildJourneyRepairPromotion,
  buildPromotedRepairReplayVersion,
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
import {
  makePromotedRepairInput,
  makeRepairDraft,
  makeVerifiedRepair,
  repairFixtureIds,
} from "../helpers/journey-repair-fixtures";

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

  it("stores append-only model draft, deterministic verification, and human promotion history", async () => {
    const databaseService = await createDatabaseTestService();
    databases.push(databaseService);
    const database = databaseService.database;
    await applyCoreMigrations(database);
    await seedExactJourney(database);
    const replayRepository = new PostgresDeterministicReplayRepository(database);
    const repairRepository = new PostgresJourneyRepairRepository(database);
    const sourceReplay = makeReplayVersion();
    const repair = makeRepairDraft();
    const verification = makeVerifiedRepair(repair);
    const promotedReplay = buildPromotedRepairReplayVersion(
      makePromotedRepairInput(repair, verification),
    );
    const promotion = buildJourneyRepairPromotion({
      id: repairFixtureIds.promotion,
      repair,
      verification,
      sourceReplay,
      promotedReplay,
      rationale:
        "I reviewed the same authorized actions and exact frozen checkpoint.",
      reviewedAt: promotedReplay.createdAt,
      reviewedBy: promotedReplay.createdBy,
    });

    await replayRepository.appendVersion(sourceReplay, replayAudit(sourceReplay));
    await repairRepository.appendDraft(repair);
    const fabricatedVerificationId =
      "31313131-3131-4131-8131-313131313131";
    const fabricatedVerification = {
      ...structuredClone(verification),
      id: fabricatedVerificationId,
      checkpoints: [],
    };
    await expect(
      database.query(
        "INSERT INTO journey_repair_verifications (workspace_id, id, repair_id, source_replay_version_id, status, repair_hash, payload, verified_at, verified_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [
          fabricatedVerification.workspaceId,
          fabricatedVerification.id,
          fabricatedVerification.repairId,
          fabricatedVerification.sourceReplayVersionId,
          fabricatedVerification.status,
          fabricatedVerification.repairHash,
          fabricatedVerification,
          fabricatedVerification.verifiedAt,
          fabricatedVerification.verifiedBy,
        ],
      ),
    ).rejects.toThrow(/every frozen checkpoint/i);
    await repairRepository.appendVerification(verification);
    await replayRepository.appendVersion(
      promotedReplay,
      replayAudit(
        promotedReplay,
        "30303030-3030-4030-8030-303030303030",
      ),
    );
    const fabricatedPromotionId = "32323232-3232-4232-8232-323232323232";
    const fabricatedPromotion = {
      ...structuredClone(promotion),
      id: fabricatedPromotionId,
      repairHash: "a".repeat(64),
    };
    await expect(
      database.query(
        "INSERT INTO journey_repair_promotions (workspace_id, id, repair_id, verification_id, promoted_replay_version_id, repair_hash, rationale, payload, reviewed_at, reviewed_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        [
          fabricatedPromotion.workspaceId,
          fabricatedPromotion.id,
          fabricatedPromotion.repairId,
          fabricatedPromotion.verificationId,
          fabricatedPromotion.promotedReplayVersionId,
          fabricatedPromotion.repairHash,
          fabricatedPromotion.rationale,
          fabricatedPromotion,
          fabricatedPromotion.reviewedAt,
          fabricatedPromotion.reviewedBy,
        ],
      ),
    ).rejects.toThrow(/exact verified draft/i);
    await repairRepository.appendPromotion(promotion, promotedReplay);

    await expect(
      repairRepository.listHistory(
        repair.workspaceId,
        repair.softwareId,
        repair.journeyVersionId,
      ),
    ).resolves.toEqual([
      { draft: repair, verification, promotion },
    ]);
    await expect(
      database.query(
        "UPDATE journey_repair_drafts SET status = 'UNRESOLVED' WHERE workspace_id = $1 AND id = $2",
        [repair.workspaceId, repair.id],
      ),
    ).rejects.toThrow(/immutable/i);
    await expect(
      database.query(
        "UPDATE journey_repair_promotions SET rationale = 'Changed' WHERE workspace_id = $1 AND id = $2",
        [promotion.workspaceId, promotion.id],
      ),
    ).rejects.toThrow(/immutable/i);
  });

  it("enforces repair history links in memory before any record can be presented as promoted", async () => {
    const repository = new InMemoryJourneyRepairRepository();
    const repair = makeRepairDraft();
    const sourceReplay = makeReplayVersion();
    const verification = makeVerifiedRepair(repair);
    const promotedReplay = buildPromotedRepairReplayVersion(
      makePromotedRepairInput(repair, verification),
    );
    const promotion = buildJourneyRepairPromotion({
      id: repairFixtureIds.promotion,
      repair,
      verification,
      sourceReplay,
      promotedReplay,
      rationale: "I reviewed the frozen checkpoint and bounded selector diff.",
      reviewedAt: promotedReplay.createdAt,
      reviewedBy: promotedReplay.createdBy,
    });

    await expect(
      repository.appendPromotion(promotion, promotedReplay),
    ).rejects.toThrow(/draft/i);
    await repository.appendDraft(repair);
    await expect(repository.appendVerification(verification)).resolves.toEqual(
      verification,
    );
    await expect(
      repository.appendPromotion(promotion, promotedReplay),
    ).resolves.toEqual(promotion);
    await expect(repository.appendDraft(repair)).rejects.toThrow(/conflict/i);
  });
});
