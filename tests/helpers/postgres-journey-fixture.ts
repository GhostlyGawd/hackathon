import type { MigrationDatabase } from "../../packages/core/src/migrations";

interface PostgresJourneyFixtureInput {
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
  readonly actorId: string;
  readonly allowedActions: readonly string[];
  readonly prohibitedActions: readonly string[];
}

export async function insertPostgresJourneyFixture(
  database: MigrationDatabase,
  input: PostgresJourneyFixtureInput,
): Promise<void> {
  const actor = { kind: "HUMAN", actorId: input.actorId } as const;
  await database.query(
    "INSERT INTO personas (workspace_id, id, role, fictional, display_name, email, fields, fictional_confirmation, scan_result, created_at, created_by) VALUES ($1, $2, 'STUDENT', true, 'Run Seed Student (Fictional)', $3, jsonb_build_object('submissionPhrase', 'Fictional seeded response'), $4, jsonb_build_object('scannerVersion', 'likely-real-v1', 'outcome', 'CLEAR', 'findings', jsonb_build_array()), now(), $5)",
    [
      input.workspaceId,
      input.personaId,
      `run-seed-${input.personaId.slice(0, 8)}@pactwire.invalid`,
      {
        statementVersion: "fictional-only-v1",
        confirmedAt: new Date().toISOString(),
        confirmedBy: actor,
      },
      actor,
    ],
  );
  await database.query(
    "INSERT INTO requirement_proposal_runs (workspace_id, id, software_id, agreement_version_id, status, provider, requested_model, returned_model, attempts, total_input_tokens, total_cached_input_tokens, total_output_tokens, total_reasoning_tokens, total_tokens, total_estimated_cost_micro_usd, requested_by, created_at) VALUES ($1, $2, $3, $4, 'SUCCEEDED', 'DETERMINISTIC_FIXTURE', 'fixture-v1', 'fixture-v1', '[{}]', 0, 0, 0, 0, 0, 0, $5, now())",
    [
      input.workspaceId,
      input.proposalRunId,
      input.softwareId,
      input.agreementVersionId,
      actor,
    ],
  );
  await database.query(
    "INSERT INTO requirement_versions (workspace_id, id, agreement_version_id, requirement_key, version, model_run_id, status, executable, payload, created_at) VALUES ($1, $2, $3, 'run-seed-rule', 1, $4, 'PROPOSED', false, '{}', now())",
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
    requirementKey: "run-seed-rule",
    version: 2,
    sourceVersionId: input.proposedRequirementId,
    status: "CONFIRMED",
    executable: true,
    plainLanguage: "Use fictional data only in the controlled test tenant.",
    predicate: { kind: "OBSERVABLE_DATA_FLOW" },
    confirmedBy: actor,
    confirmedAt: new Date().toISOString(),
  };
  await database.query(
    "INSERT INTO requirement_versions (workspace_id, id, agreement_version_id, requirement_key, version, source_requirement_version_id, status, executable, payload, created_at) VALUES ($1, $2, $3, 'run-seed-rule', 2, $4, 'CONFIRMED', true, $5, now())",
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
    name: "Controlled run seed",
    role: "STUDENT",
    goal: "Open the fictional controlled test tenant.",
    startState: "Signed in as the fictional run seed student.",
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
    allowedActions: input.allowedActions,
    prohibitedActions: input.prohibitedActions,
    checkpoints: [
      {
        checkpointId: "controlled-page",
        required: true,
        description: "Observe the fictional controlled page.",
        observationSource: "SCREENSHOT",
        requiredVisibility: true,
        requirementVersionIds: [input.confirmedRequirementId],
        testFieldIds: ["student-email"],
      },
    ],
    steps: [
      {
        stepId: "open-controlled-page",
        instruction: "Open the fictional controlled page.",
        action: input.allowedActions[0],
      },
    ],
    createdAt,
    createdBy: actor,
  };
  await database.query(
    "INSERT INTO journey_versions (workspace_id, id, software_id, agreement_version_id, journey_id, version, source_journey_version_id, authorization_id, persona_id, payload, created_at, created_by) VALUES ($1, $2, $3, $4, $5, 1, NULL, $6, $7, $8, $9, $10)",
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
      actor,
    ],
  );
}
