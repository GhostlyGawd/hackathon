import { afterEach, describe, expect, it } from "vitest";
import {
  applyCoreMigrations,
  loadCoreMigrations,
} from "../../packages/core/src/migrations";
import {
  createDatabaseTestService,
  type DatabaseTestService,
} from "../../packages/testkit/src/index";

const databases: DatabaseTestService[] = [];

async function migratedDatabase(): Promise<DatabaseTestService> {
  const service = await createDatabaseTestService();
  databases.push(service);
  await applyCoreMigrations(service.database);
  return service;
}

async function insertRunnableJourneyFixture(
  database: DatabaseTestService["database"],
  input: {
    readonly workspaceId: string;
    readonly softwareId: string;
    readonly agreementVersionId: string;
    readonly authorizationId: string;
    readonly journeyVersionId: string;
    readonly journeyId: string;
    readonly personaId: string;
    readonly proposalRunId: string;
    readonly proposedRequirementId: string;
    readonly confirmedRequirementId: string;
  },
): Promise<void> {
  await database.query(
    "INSERT INTO personas (workspace_id, id, role, fictional, display_name, email, fields, fictional_confirmation, scan_result, created_at, created_by) VALUES ($1, $2, 'STUDENT', true, 'Journey Student (Fictional)', $3, jsonb_build_object('submissionPhrase', 'Fictional response'), jsonb_build_object('statementVersion', 'fictional-only-v1', 'confirmedAt', now(), 'confirmedBy', jsonb_build_object('kind', 'HUMAN', 'actorId', 'migration-fixture')), jsonb_build_object('scannerVersion', 'likely-real-v1', 'outcome', 'CLEAR', 'findings', jsonb_build_array()), now(), jsonb_build_object('kind', 'HUMAN', 'actorId', 'migration-fixture'))",
    [
      input.workspaceId,
      input.personaId,
      `journey-${input.personaId.slice(0, 8)}@pactwire.invalid`,
    ],
  );
  await database.query(
    "INSERT INTO requirement_proposal_runs (workspace_id, id, software_id, agreement_version_id, status, provider, requested_model, returned_model, attempts, total_input_tokens, total_cached_input_tokens, total_output_tokens, total_reasoning_tokens, total_tokens, total_estimated_cost_micro_usd, requested_by, created_at) VALUES ($1, $2, $3, $4, 'SUCCEEDED', 'DETERMINISTIC_FIXTURE', 'fixture-v1', 'fixture-v1', '[{}]', 0, 0, 0, 0, 0, 0, jsonb_build_object('kind', 'HUMAN', 'actorId', 'migration-fixture'), now())",
    [
      input.workspaceId,
      input.proposalRunId,
      input.softwareId,
      input.agreementVersionId,
    ],
  );
  await database.query(
    "INSERT INTO requirement_versions (workspace_id, id, agreement_version_id, requirement_key, version, model_run_id, status, executable, payload, created_at) VALUES ($1, $2, $3, 'migration-rule', 1, $4, 'PROPOSED', false, '{}', now())",
    [
      input.workspaceId,
      input.proposedRequirementId,
      input.agreementVersionId,
      input.proposalRunId,
    ],
  );
  const confirmedPayload = {
    id: input.confirmedRequirementId,
    workspaceId: input.workspaceId,
    agreementVersionId: input.agreementVersionId,
    requirementKey: "migration-rule",
    version: 2,
    sourceVersionId: input.proposedRequirementId,
    status: "CONFIRMED",
    executable: true,
    plainLanguage: "Observe the fictional migration request.",
    predicate: { kind: "OBSERVABLE_DATA_FLOW" },
    confirmedBy: { kind: "HUMAN", actorId: "migration-fixture" },
    confirmedAt: "2026-07-21T00:00:00.000Z",
  };
  await database.query(
    "INSERT INTO requirement_versions (workspace_id, id, agreement_version_id, requirement_key, version, source_requirement_version_id, status, executable, payload, created_at) VALUES ($1, $2, $3, 'migration-rule', 2, $4, 'CONFIRMED', true, $5, now())",
    [
      input.workspaceId,
      input.confirmedRequirementId,
      input.agreementVersionId,
      input.proposedRequirementId,
      confirmedPayload,
    ],
  );
  const createdAt = new Date().toISOString();
  const journeyPayload = {
    id: input.journeyVersionId,
    workspaceId: input.workspaceId,
    softwareId: input.softwareId,
    agreementVersionId: input.agreementVersionId,
    journeyId: input.journeyId,
    version: 1,
    sourceVersionId: null,
    name: "Migration journey",
    role: "STUDENT",
    goal: "Submit the fictional migration response.",
    startState: "Signed in to the fictional migration workspace.",
    requirementVersionIds: [input.confirmedRequirementId],
    authorizationId: input.authorizationId,
    personaId: input.personaId,
    testFields: [
      {
        fieldId: "student-email",
        sourceField: "email",
        requirementVersionId: input.confirmedRequirementId,
      },
    ],
    allowedActions: ["NAVIGATE"],
    prohibitedActions: ["MESSAGE"],
    checkpoints: [
      {
        checkpointId: "migration-request",
        required: true,
        description: "Observe the fictional migration request.",
        observationSource: "NETWORK",
        requiredVisibility: true,
        requirementVersionIds: [input.confirmedRequirementId],
        testFieldIds: ["student-email"],
      },
    ],
    steps: [
      {
        stepId: "open-fixture",
        instruction: "Open the fictional fixture.",
        action: "NAVIGATE",
      },
    ],
    createdAt,
    createdBy: { kind: "HUMAN", actorId: "migration-fixture" },
  };
  await database.query(
    "INSERT INTO journey_versions (workspace_id, id, software_id, agreement_version_id, journey_id, version, source_journey_version_id, authorization_id, persona_id, payload, created_at, created_by) VALUES ($1, $2, $3, $4, $5, 1, NULL, $6, $7, $8, $9, jsonb_build_object('kind', 'HUMAN', 'actorId', 'migration-fixture'))",
    [
      input.workspaceId,
      input.journeyVersionId,
      input.softwareId,
      input.agreementVersionId,
      input.journeyId,
      input.authorizationId,
      input.personaId,
      journeyPayload,
      createdAt,
    ],
  );
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((service) => service.close()));
});

describe("core domain migrations", () => {
  it("loads the ordered PostgreSQL schema migrations", async () => {
    const migrations = await loadCoreMigrations();

    expect(migrations.map((migration) => migration.version)).toEqual([
      "0001",
      "0002",
      "0003",
      "0004",
      "0005",
      "0006",
      "0007",
      "0008",
      "0009",
      "0010",
      "0011",
    ]);
  });

  it("applies all domain tables exactly once with a stable checksum", async () => {
    const service = await createDatabaseTestService();
    databases.push(service);

    await expect(applyCoreMigrations(service.database)).resolves.toEqual([
      "0001",
      "0002",
      "0003",
      "0004",
      "0005",
      "0006",
      "0007",
      "0008",
      "0009",
      "0010",
      "0011",
    ]);
    await expect(applyCoreMigrations(service.database)).resolves.toEqual([]);
    const tables = await service.database.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );

    expect(tables.rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "workspaces",
        "software_records",
        "software_inventory_details",
        "software_approval_origins",
        "authorization_policy_decisions",
        "secret_records",
        "secret_access_leases",
        "agreement_versions",
        "requirement_proposal_runs",
        "requirement_versions",
        "deterministic_replay_versions",
        "journey_repair_drafts",
        "journey_repair_verifications",
        "journey_repair_promotions",
        "runs",
        "run_events",
        "observations",
        "findings",
        "evidence_receipts",
        "approval_events",
        "audit_events",
      ]),
    );
    expect(tables.rows).toHaveLength(31);
  });

  it("requires immutable, latest-source lineage for human requirement reviews", async () => {
    const { database } = await migratedDatabase();
    const workspace = "11111111-1111-4111-8111-111111111111";
    const software = "22222222-2222-4222-8222-222222222222";
    const agreement = "33333333-3333-4333-8333-333333333333";
    const run = "44444444-4444-4444-8444-444444444444";
    const proposal = "55555555-5555-4555-8555-555555555555";
    const confirmed = "66666666-6666-4666-8666-666666666666";
    await database.query(
      "INSERT INTO workspaces (id, name, created_at, created_by) VALUES ($1, 'Fictional District', now(), '{}')",
      [workspace],
    );
    await database.query(
      "INSERT INTO software_records (workspace_id, id, name, vendor_name, approval_state, approval_owner, created_at) VALUES ($1, $2, 'Fixture LMS', 'Fictional Vendor', 'UNKNOWN', 'NONE', now())",
      [workspace, software],
    );
    await database.query(
      "INSERT INTO agreement_versions (workspace_id, id, software_id, version, source_object_key, source_sha256, source_mime_type, source_file_name, source_byte_length, normalized_text, page_map, created_at, created_by) VALUES ($1, $2, $3, 1, ('agreements/sha256/' || $4 || '.txt'), $4, 'text/plain', 'Fictional Agreement.txt', 7, 'Fixture', jsonb_build_array(jsonb_build_object('pageNumber', 1, 'startOffset', 0, 'endOffset', 7, 'text', 'Fixture', 'textSha256', repeat('b', 64))), now(), jsonb_build_object('kind', 'HUMAN', 'actorId', 'fixture-officer'))",
      [workspace, agreement, software, "a".repeat(64)],
    );
    await database.query(
      "INSERT INTO requirement_proposal_runs (workspace_id, id, software_id, agreement_version_id, status, provider, requested_model, returned_model, attempts, total_input_tokens, total_cached_input_tokens, total_output_tokens, total_reasoning_tokens, total_tokens, total_estimated_cost_micro_usd, requested_by, created_at) VALUES ($1, $2, $3, $4, 'SUCCEEDED', 'DETERMINISTIC_FIXTURE', 'fixture-v1', 'fixture-v1', '[{}]', 0, 0, 0, 0, 0, 0, jsonb_build_object('kind', 'HUMAN', 'actorId', 'fixture-officer'), now())",
      [workspace, run, software, agreement],
    );
    await database.query(
      "INSERT INTO requirement_versions (workspace_id, id, agreement_version_id, requirement_key, version, model_run_id, status, executable, payload, created_at) VALUES ($1, $2::uuid, $3, 'recipient-rule', 1, $4, 'PROPOSED', false, jsonb_build_object('id', to_jsonb($2::uuid), 'status', 'PROPOSED'), now())",
      [workspace, proposal, agreement, run],
    );

    await expect(
      database.query(
        "INSERT INTO requirement_versions (workspace_id, id, agreement_version_id, requirement_key, version, source_requirement_version_id, status, executable, payload, created_at) VALUES ($1, $2::uuid, $3, 'recipient-rule', 2, $4::uuid, 'CONFIRMED', true, jsonb_build_object('id', to_jsonb($2::uuid), 'sourceVersionId', to_jsonb($4::uuid), 'status', 'CONFIRMED', 'executable', true, 'confirmedBy', jsonb_build_object('kind', 'HUMAN', 'actorId', 'fixture-officer'), 'predicate', jsonb_build_object('kind', 'OBSERVABLE_DATA_FLOW')), now())",
        [workspace, confirmed, agreement, proposal],
      ),
    ).resolves.toBeDefined();
    await expect(
      database.query(
        "INSERT INTO requirement_versions (workspace_id, id, agreement_version_id, requirement_key, version, source_requirement_version_id, status, executable, payload, created_at) VALUES ($1, $2::uuid, $3, 'recipient-rule', 3, $4::uuid, 'AMBIGUOUS', false, jsonb_build_object('id', to_jsonb($2::uuid), 'sourceVersionId', to_jsonb($4::uuid), 'status', 'AMBIGUOUS', 'executable', false, 'reviewedBy', jsonb_build_object('kind', 'HUMAN', 'actorId', 'fixture-officer')), now())",
        [
          workspace,
          "77777777-7777-4777-8777-777777777777",
          agreement,
          proposal,
        ],
      ),
    ).rejects.toThrow("latest requirement version");
    await expect(
      database.query(
        "INSERT INTO requirement_versions (workspace_id, id, agreement_version_id, requirement_key, version, status, executable, payload, created_at) VALUES ($1, $2, $3, 'other-rule', 1, 'REJECTED', false, jsonb_build_object('status', 'REJECTED', 'reviewedBy', jsonb_build_object('kind', 'HUMAN', 'actorId', 'fixture-officer')), now())",
        [
          workspace,
          "88888888-8888-4888-8888-888888888888",
          agreement,
        ],
      ),
    ).rejects.toThrow("source requirement version");
    await expect(
      database.query(
        "UPDATE requirement_versions SET executable = false WHERE workspace_id = $1 AND id = $2",
        [workspace, confirmed],
      ),
    ).rejects.toThrow("immutable");
  });

  it("rejects a cross-workspace foreign-key reference", async () => {
    const { database } = await migratedDatabase();
    const workspaceA = "11111111-1111-4111-8111-111111111111";
    const workspaceB = "22222222-2222-4222-8222-222222222222";
    const softwareA = "33333333-3333-4333-8333-333333333333";
    const agreementA = "44444444-4444-4444-8444-444444444444";
    await database.query(
      "INSERT INTO workspaces (id, name, created_at, created_by) VALUES ($1, 'Fictional District A', now(), '{}'), ($2, 'Fictional District B', now(), '{}')",
      [workspaceA, workspaceB],
    );
    await database.query(
      "INSERT INTO software_records (workspace_id, id, name, vendor_name, approval_state, approval_owner, created_at) VALUES ($1, $2, 'Fixture LMS', 'Fictional Vendor', 'UNKNOWN', 'NONE', now())",
      [workspaceA, softwareA],
    );
    await database.query(
      "INSERT INTO agreement_versions (workspace_id, id, software_id, version, source_object_key, source_sha256, source_mime_type, source_file_name, source_byte_length, normalized_text, page_map, created_at, created_by) VALUES ($1, $2, $3, 1, ('agreements/sha256/' || $4 || '.pdf'), $4, 'application/pdf', 'Fictional Agreement.pdf', 1, 'Fixture', jsonb_build_array(jsonb_build_object('pageNumber', 1, 'startOffset', 0, 'endOffset', 7, 'text', 'Fixture', 'textSha256', repeat('b', 64))), now(), jsonb_build_object('kind', 'HUMAN', 'actorId', 'fixture-officer'))",
      [workspaceA, agreementA, softwareA, "a".repeat(64)],
    );

    await expect(
      database.query(
        "INSERT INTO requirement_versions (workspace_id, id, agreement_version_id, requirement_key, version, status, executable, payload, created_at) VALUES ($1, $2, $3, 'recipient-rule', 1, 'PROPOSED', false, '{}', now())",
        [
          workspaceB,
          "55555555-5555-4555-8555-555555555555",
          agreementA,
        ],
      ),
    ).rejects.toThrow();
  });

  it("enforces the automated hold rule and append-only approval history in SQL", async () => {
    const { database } = await migratedDatabase();
    const workspace = "11111111-1111-4111-8111-111111111111";
    const software = "33333333-3333-4333-8333-333333333333";
    const event = "66666666-6666-4666-8666-666666666666";
    await database.query(
      "INSERT INTO workspaces (id, name, created_at, created_by) VALUES ($1, 'Fictional District', now(), '{}')",
      [workspace],
    );
    await database.query(
      "INSERT INTO software_records (workspace_id, id, name, vendor_name, approval_state, approval_owner, created_at) VALUES ($1, $2, 'Fixture LMS', 'Fictional Vendor', 'APPROVED', 'HUMAN', now())",
      [workspace, software],
    );
    await database.query(
      "INSERT INTO approval_events (workspace_id, id, software_id, previous_state, next_state, reason, actor_kind, actor, occurred_at) VALUES ($1, $2, $3, 'APPROVED', 'HOLD', 'WITNESSED_CONFLICT', 'AUTOMATION', '{}', now())",
      [workspace, event, software],
    );

    await expect(
      database.query(
        "INSERT INTO approval_events (workspace_id, id, software_id, previous_state, next_state, reason, actor_kind, actor, occurred_at) VALUES ($1, $2, $3, 'HOLD', 'APPROVED', 'HUMAN_DECISION', 'AUTOMATION', '{}', now())",
        [
          workspace,
          "77777777-7777-4777-8777-777777777777",
          software,
        ],
      ),
    ).rejects.toThrow();
    await expect(
      database.query(
        "INSERT INTO approval_events (workspace_id, id, software_id, previous_state, next_state, reason, actor_kind, actor, occurred_at) VALUES ($1, $2, $3, 'HOLD', 'APPROVED', 'HUMAN_DECISION', 'HUMAN', '{}', now())",
        [
          workspace,
          "78787878-7878-4878-8878-787878787878",
          software,
        ],
      ),
    ).rejects.toThrow();
    const decision = "79797979-7979-4979-8979-797979797979";
    await database.query(
      "INSERT INTO human_decisions (workspace_id, id, software_id, outcome, rationale, named_scope_acknowledged, actor, signed_at) VALUES ($1, $2, $3, 'RESTORE_APPROVED', 'Fictional signed restoration.', true, '{}', now())",
      [workspace, decision, software],
    );
    await expect(
      database.query(
        "INSERT INTO approval_events (workspace_id, id, software_id, previous_state, next_state, reason, human_decision_id, actor_kind, actor, occurred_at) VALUES ($1, $2, $3, 'HOLD', 'APPROVED', 'HUMAN_HOLD', $4, 'HUMAN', '{}', now())",
        [
          workspace,
          "81818181-8181-4181-8181-818181818181",
          software,
          decision,
        ],
      ),
    ).rejects.toThrow();
    const keepHoldDecision = "82828282-8282-4282-8282-828282828282";
    await database.query(
      "INSERT INTO human_decisions (workspace_id, id, software_id, outcome, rationale, named_scope_acknowledged, actor, signed_at) VALUES ($1, $2, $3, 'KEEP_HOLD', 'Fictional signed hold decision.', true, '{}', now())",
      [workspace, keepHoldDecision, software],
    );
    await expect(
      database.query(
        "INSERT INTO approval_events (workspace_id, id, software_id, previous_state, next_state, reason, human_decision_id, actor_kind, actor, occurred_at) VALUES ($1, $2, $3, 'HOLD', 'APPROVED', 'HUMAN_DECISION', $4, 'HUMAN', '{}', now())",
        [
          workspace,
          "83838383-8383-4383-8383-838383838383",
          software,
          keepHoldDecision,
        ],
      ),
    ).rejects.toThrow();
    await expect(
      database.query(
        "INSERT INTO approval_events (workspace_id, id, software_id, previous_state, next_state, reason, human_decision_id, actor_kind, actor, occurred_at) VALUES ($1, $2, $3, 'HOLD', 'APPROVED', 'HUMAN_DECISION', $4, 'HUMAN', '{}', now())",
        [
          workspace,
          "80808080-8080-4080-8080-808080808080",
          software,
          decision,
        ],
      ),
    ).resolves.toBeDefined();
    await expect(
      database.query(
        "UPDATE approval_events SET reason = 'REQUIRED_VISIBILITY_LOSS' WHERE workspace_id = $1 AND id = $2",
        [workspace, event],
      ),
    ).rejects.toThrow("immutable");
  });

  it("requires terminal run evidence and immutable actor-provenance events", async () => {
    const { database } = await migratedDatabase();
    const workspace = "11111111-1111-4111-8111-111111111111";
    const software = "33333333-3333-4333-8333-333333333333";
    const authorization = "41414141-4141-4141-8141-414141414141";
    const agreement = "42424242-4242-4242-8242-424242424242";
    const journey = "43434343-4343-4343-8343-434343434343";
    const run = "44444444-4444-4444-8444-444444444445";
    await database.query(
      "INSERT INTO workspaces (id, name, created_at, created_by) VALUES ($1, 'Fictional District', now(), '{}')",
      [workspace],
    );
    await database.query(
      "INSERT INTO software_records (workspace_id, id, name, vendor_name, approval_state, approval_owner, created_at) VALUES ($1, $2, 'Fixture LMS', 'Fictional Vendor', 'UNKNOWN', 'NONE', now())",
      [workspace, software],
    );
    await database.query(
      "INSERT INTO authorizations (workspace_id, id, software_id, version, status, valid_from, expires_at, scope, attested_by, attested_at) VALUES ($1, $2, $3, 1, 'ACTIVE', now(), now() + interval '1 day', '{\"reviewAt\":\"2099-01-01T00:00:00.000Z\",\"allowedActions\":[\"NAVIGATE\"],\"prohibitedActions\":[\"MESSAGE\"],\"attestation\":{\"authorityConfirmed\":true,\"syntheticAccountsOnlyConfirmed\":true}}', '{\"kind\":\"HUMAN\",\"actorId\":\"fictional-officer\"}', now())",
      [workspace, authorization, software],
    );
    await database.query(
      "INSERT INTO agreement_versions (workspace_id, id, software_id, version, source_object_key, source_sha256, source_mime_type, source_file_name, source_byte_length, normalized_text, page_map, created_at, created_by) VALUES ($1, $2, $3, 1, ('agreements/sha256/' || $4 || '.pdf'), $4, 'application/pdf', 'Fictional Agreement.pdf', 1, 'Fixture', jsonb_build_array(jsonb_build_object('pageNumber', 1, 'startOffset', 0, 'endOffset', 7, 'text', 'Fixture', 'textSha256', repeat('b', 64))), now(), jsonb_build_object('kind', 'HUMAN', 'actorId', 'fixture-officer'))",
      [workspace, agreement, software, "a".repeat(64)],
    );
    await insertRunnableJourneyFixture(database, {
      workspaceId: workspace,
      softwareId: software,
      agreementVersionId: agreement,
      authorizationId: authorization,
      journeyVersionId: journey,
      journeyId: "45454545-4545-4545-8545-454545454545",
      personaId: "46464646-4646-4646-8646-464646464646",
      proposalRunId: "47474747-4747-4747-8747-474747474747",
      proposedRequirementId: "48484848-4848-4848-8848-484848484848",
      confirmedRequirementId: "49494949-4949-4949-8949-494949494949",
    });

    await expect(
      database.query(
        "INSERT INTO runs (workspace_id, id, software_id, state, agreement_version_id, journey_version_id, authorization_id, runner_config_version, snapshot_hash, queued_at, terminal_at) VALUES ($1, $2, $3, 'FAILED', $4, $5, $6, 'runner-v1', $7, now(), now())",
        [
          workspace,
          run,
          software,
          agreement,
          journey,
          authorization,
          "b".repeat(64),
        ],
      ),
    ).rejects.toThrow();
    await database.query(
      "INSERT INTO runs (workspace_id, id, software_id, state, agreement_version_id, journey_version_id, authorization_id, runner_config_version, snapshot_hash, queued_at) VALUES ($1, $2, $3, 'QUEUED', $4, $5, $6, 'runner-v1', $7, now())",
      [
        workspace,
        run,
        software,
        agreement,
        journey,
        authorization,
        "b".repeat(64),
      ],
    );
    await database.query(
      "UPDATE runs SET state = 'RUNNING' WHERE workspace_id = $1 AND id = $2",
      [workspace, run],
    );
    await database.query(
      "UPDATE runs SET state = 'FAILED', terminal_at = now(), integrity_failure = $3 WHERE workspace_id = $1 AND id = $2",
      [
        workspace,
        run,
        { code: "RECORDER_CRASH", message: "Fictional failure" },
      ],
    );
    await expect(
      database.query(
        "UPDATE runs SET runner_config_version = 'runner-v2' WHERE workspace_id = $1 AND id = $2",
        [workspace, run],
      ),
    ).rejects.toThrow();
    await expect(
      database.query(
        "INSERT INTO runs (workspace_id, id, software_id, state, agreement_version_id, journey_version_id, authorization_id, runner_config_version, snapshot_hash, retry_of_run_id, queued_at) VALUES ($1, $2, $3, 'QUEUED', $4, $5, $6, 'runner-v2', $7, $8, now())",
        [
          workspace,
          "48484848-4848-4848-8848-484848484848",
          software,
          agreement,
          journey,
          authorization,
          "b".repeat(64),
          run,
        ],
      ),
    ).rejects.toThrow();
    await expect(
      database.query(
        "INSERT INTO runs (workspace_id, id, software_id, state, agreement_version_id, journey_version_id, authorization_id, runner_config_version, snapshot_hash, retry_of_run_id, queued_at) VALUES ($1, $2, $3, 'QUEUED', $4, $5, $6, 'runner-v1', $7, $8, now())",
        [
          workspace,
          "49494949-4949-4949-8949-494949494949",
          software,
          agreement,
          journey,
          authorization,
          "b".repeat(64),
          run,
        ],
      ),
    ).resolves.toBeDefined();
    await expect(
      database.query(
        "INSERT INTO run_events (workspace_id, id, run_id, event_type, previous_state, next_state, actor_kind, actor, occurred_at) VALUES ($1, $2, $3, 'RUN_STARTED', 'RUNNING', 'FAILED', 'AUTOMATION', '{}', now())",
        [
          workspace,
          "45454545-4545-4545-8545-454545454546",
          run,
        ],
      ),
    ).rejects.toThrow();
    await expect(
      database.query(
        "INSERT INTO run_events (workspace_id, id, run_id, event_type, previous_state, next_state, actor_kind, actor, occurred_at, integrity_failure) VALUES ($1, $2, $3, 'RUN_FAILED', 'RUNNING', 'FAILED', 'MODEL', '{}', now(), $4)",
        [
          workspace,
          "46464646-4646-4646-8646-464646464646",
          run,
          { code: "RECORDER_CRASH", message: "Fictional failure" },
        ],
      ),
    ).rejects.toThrow();
    const event = "47474747-4747-4747-8747-474747474747";
    await database.query(
      "INSERT INTO run_events (workspace_id, id, run_id, event_type, previous_state, next_state, actor_kind, actor, occurred_at, integrity_failure) VALUES ($1, $2, $3, 'RUN_FAILED', 'RUNNING', 'FAILED', 'AUTOMATION', '{}', now(), $4)",
      [
        workspace,
        event,
        run,
        { code: "RECORDER_CRASH", message: "Fictional failure" },
      ],
    );
    await expect(
      database.query(
        "DELETE FROM run_events WHERE workspace_id = $1 AND id = $2",
        [workspace, event],
      ),
    ).rejects.toThrow("immutable");
  });

  it("rejects same-workspace references across software and run boundaries", async () => {
    const { database } = await migratedDatabase();
    const workspace = "51515151-5151-4151-8151-515151515151";
    const softwareA = "52525252-5252-4252-8252-525252525252";
    const softwareB = "53535353-5353-4353-8353-535353535353";
    const authorizationA = "54545454-5454-4454-8454-545454545454";
    const agreementA = "55555555-5555-4555-8555-555555555556";
    const agreementB = "56565656-5656-4656-8656-565656565656";
    const journeyA = "57575757-5757-4757-8757-575757575757";
    const runA = "58585858-5858-4858-8858-585858585858";
    const runB = "59595959-5959-4959-8959-595959595959";
    await database.query(
      "INSERT INTO workspaces (id, name, created_at, created_by) VALUES ($1, 'Fictional District', now(), '{}')",
      [workspace],
    );
    await database.query(
      "INSERT INTO software_records (workspace_id, id, name, vendor_name, approval_state, approval_owner, created_at) VALUES ($1, $2, 'Fixture A', 'Fictional Vendor', 'UNKNOWN', 'NONE', now()), ($1, $3, 'Fixture B', 'Fictional Vendor', 'UNKNOWN', 'NONE', now())",
      [workspace, softwareA, softwareB],
    );
    await database.query(
      "INSERT INTO authorizations (workspace_id, id, software_id, version, status, valid_from, expires_at, scope, attested_by, attested_at) VALUES ($1, $2, $3, 1, 'ACTIVE', now(), now() + interval '1 day', '{\"reviewAt\":\"2099-01-01T00:00:00.000Z\",\"allowedActions\":[\"NAVIGATE\"],\"prohibitedActions\":[\"MESSAGE\"],\"attestation\":{\"authorityConfirmed\":true,\"syntheticAccountsOnlyConfirmed\":true}}', '{\"kind\":\"HUMAN\",\"actorId\":\"fictional-officer\"}', now())",
      [workspace, authorizationA, softwareA],
    );
    await database.query(
      "INSERT INTO agreement_versions (workspace_id, id, software_id, version, source_object_key, source_sha256, source_mime_type, source_file_name, source_byte_length, normalized_text, page_map, created_at, created_by) VALUES ($1, $2, $3, 1, ('agreements/sha256/' || $5 || '.pdf'), $5, 'application/pdf', 'Fictional A.pdf', 1, 'Fixture', jsonb_build_array(jsonb_build_object('pageNumber', 1, 'startOffset', 0, 'endOffset', 7, 'text', 'Fixture', 'textSha256', repeat('b', 64))), now(), jsonb_build_object('kind', 'HUMAN', 'actorId', 'fixture-officer')), ($1, $4, $6, 1, ('agreements/sha256/' || $5 || '.pdf'), $5, 'application/pdf', 'Fictional B.pdf', 1, 'Fixture', jsonb_build_array(jsonb_build_object('pageNumber', 1, 'startOffset', 0, 'endOffset', 7, 'text', 'Fixture', 'textSha256', repeat('b', 64))), now(), jsonb_build_object('kind', 'HUMAN', 'actorId', 'fixture-officer'))",
      [
        workspace,
        agreementA,
        softwareA,
        agreementB,
        "c".repeat(64),
        softwareB,
      ],
    );
    await insertRunnableJourneyFixture(database, {
      workspaceId: workspace,
      softwareId: softwareA,
      agreementVersionId: agreementA,
      authorizationId: authorizationA,
      journeyVersionId: journeyA,
      journeyId: "60606060-6060-4060-8060-606060606060",
      personaId: "67676767-6767-4767-8767-676767676767",
      proposalRunId: "68686868-6868-4868-8868-686868686868",
      proposedRequirementId: "69696969-6969-4969-8969-696969696969",
      confirmedRequirementId: "70707070-7070-4070-8070-707070707070",
    });
    await expect(
      database.query(
        "INSERT INTO runs (workspace_id, id, software_id, state, agreement_version_id, journey_version_id, authorization_id, runner_config_version, snapshot_hash, queued_at) VALUES ($1, $2, $3, 'QUEUED', $4, $5, $6, 'runner-v1', $7, now())",
        [
          workspace,
          "61616161-6161-4161-8161-616161616161",
          softwareA,
          agreementB,
          journeyA,
          authorizationA,
          "d".repeat(64),
        ],
      ),
    ).rejects.toThrow();
    for (const runId of [runA, runB]) {
      await database.query(
        "INSERT INTO runs (workspace_id, id, software_id, state, agreement_version_id, journey_version_id, authorization_id, runner_config_version, snapshot_hash, queued_at) VALUES ($1, $2, $3, 'QUEUED', $4, $5, $6, 'runner-v1', $7, now())",
        [
          workspace,
          runId,
          softwareA,
          agreementA,
          journeyA,
          authorizationA,
          "d".repeat(64),
        ],
      );
    }
    const persona = "61616161-6161-4161-8161-616161616161";
    const canary = "62626262-6262-4262-8262-626262626262";
    const observation = "63636363-6363-4363-8363-636363636363";
    await database.query(
      "INSERT INTO personas (workspace_id, id, role, fictional, display_name, email, fields, fictional_confirmation, scan_result, created_at, created_by) VALUES ($1, $2, 'STUDENT', true, 'Migration Student (Fictional)', 'migration@student.pactwire.invalid', '{}', $3, $4, now(), $5)",
      [
        workspace,
        persona,
        {
          statementVersion: "fictional-only-v1",
          confirmedAt: "2026-07-20T00:30:00.000Z",
          confirmedBy: { kind: "HUMAN", actorId: "migration-fixture" },
        },
        { scannerVersion: "likely-real-v1", outcome: "CLEAR", findings: [] },
        { kind: "HUMAN", actorId: "migration-fixture" },
      ],
    );
    await database.query(
      "INSERT INTO canaries (workspace_id, id, run_id, persona_id, source_field, value, generated_at) VALUES ($1, $2, $3, $4, 'email', $5, now())",
      [
        workspace,
        canary,
        runA,
        persona,
        `pw-${"c".repeat(32)}@canary.pactwire.invalid`,
      ],
    );
    await expect(
      database.query(
        "UPDATE journey_versions SET payload = '{\"changed\":true}' WHERE workspace_id = $1 AND id = $2",
        [workspace, journeyA],
      ),
    ).rejects.toThrow("immutable");
    await expect(
      database.query(
        "UPDATE canaries SET value = 'changed@pactwire.invalid' WHERE workspace_id = $1 AND id = $2",
        [workspace, canary],
      ),
    ).rejects.toThrow("immutable");
    await database.query(
      "INSERT INTO observations (workspace_id, id, run_id, source, recorder_version, sequence, observed_at, payload_hash, facts) VALUES ($1, $2, $3, 'NETWORK', 'recorder-v1', 1, now(), $4, '{}')",
      [workspace, observation, runB, "e".repeat(64)],
    );
    await expect(
      database.query(
        "INSERT INTO canary_matches (workspace_id, id, run_id, canary_id, observation_id, transform, matched_value_hash, created_at) VALUES ($1, $2, $3, $4, $5, 'EXACT', $6, now())",
        [
          workspace,
          "64646464-6464-4464-8464-646464646464",
          runA,
          canary,
          observation,
          "f".repeat(64),
        ],
      ),
    ).rejects.toThrow();
  });
});
