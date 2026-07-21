import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyCoreMigrations,
  buildRequirementReviewVersion,
  InMemoryRequirementReviewRepository,
  PostgresRequirementReviewRepository,
  RequirementReviewConflictError,
  RequirementReviewService,
  type ProposedRequirementVersion,
} from "../../packages/core/src/index";
import {
  createDatabaseTestService,
  type DatabaseTestService,
} from "../../packages/testkit/src/index";
import { makeProposalAgreement, makeProposalCandidate } from "../helpers/requirement-proposal-fixtures";

const proposal: ProposedRequirementVersion = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "11111111-1111-4111-8111-111111111111",
  agreementVersionId: "33333333-3333-4333-8333-333333333333",
  requirementKey: "recipient-rule",
  version: 1,
  modelRunId: "44444444-4444-4444-8444-444444444444",
  status: "PROPOSED",
  executable: false,
  plainLanguage: makeProposalCandidate().plainLanguage,
  details: makeProposalCandidate(),
  citation: {
    page: 1,
    startOffset: 31,
    endOffset: 66,
    quotedTextSha256:
      "bafd7017bdc7c5f679e224d65db753879ba4c92f400e71c1bbe77ba416f45926",
  },
  proposedBy: {
    kind: "AUTOMATION",
    actorId: "fixture-requirement-proposer",
    component: "deterministic-requirement-fixture",
  },
  createdAt: "2026-07-20T20:00:00.000Z",
};

const databases: DatabaseTestService[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

function harness() {
  const auditEvents: unknown[] = [];
  const authorization = {
    checkPermission: vi.fn(() => Promise.resolve([])),
  };
  const agreements = {
    getAgreement: vi.fn(() => Promise.resolve(makeProposalAgreement())),
  };
  const repository = new InMemoryRequirementReviewRepository(
    {
      listProposals: () => Promise.resolve([proposal]),
    },
    {
      appendAuditEvent: (event: unknown) => {
        auditEvents.push(event);
        return Promise.resolve();
      },
    },
  );
  const ids = [
    "55555555-5555-4555-8555-555555555555",
    "66666666-6666-4666-8666-666666666666",
    "77777777-7777-4777-8777-777777777777",
    "88888888-8888-4888-8888-888888888888",
  ];
  const service = new RequirementReviewService(
    repository,
    agreements,
    authorization,
    {
      idFactory: () => ids.shift()!,
      now: () => "2026-07-20T20:05:00.000Z",
    },
  );
  return { auditEvents, authorization, agreements, repository, service };
}

const scope = {
  principal: {
    userId: "fictional-officer-a",
    displayName: "Morgan Vale (Fictional)",
    activeWorkspaceId: proposal.workspaceId,
  },
  workspaceId: proposal.workspaceId,
  softwareId: "22222222-2222-4222-8222-222222222222",
  agreementVersionId: proposal.agreementVersionId,
};

describe("requirement review service", () => {
  it("authorizes, appends a human-confirmed version, and preserves citation history", async () => {
    const context = harness();
    const confirmed = await context.service.reviewRequirement({
      ...scope,
      sourceVersionId: proposal.id,
      decision: "CONFIRM",
      executable: true,
      edits: { action: "Transmit" },
      rationale: "I verified this rule against the exact fictional source.",
    });

    expect(context.authorization.checkPermission).toHaveBeenCalledWith({
      principal: scope.principal,
      workspaceId: proposal.workspaceId,
      permission: "REQUIREMENT_CONFIRM",
    });
    expect(confirmed).toMatchObject({
      sourceVersionId: proposal.id,
      version: 2,
      status: "CONFIRMED",
      executable: true,
      citation: proposal.citation,
      confirmedBy: { kind: "HUMAN", actorId: scope.principal.userId },
    });
    const history = await context.service.listRequirementHistory(scope);
    expect(history.versions).toHaveLength(2);
    expect(history.current).toEqual([confirmed]);
    expect(history.versions).toContainEqual(proposal);
    expect(context.auditEvents).toEqual([
      expect.objectContaining({
        action: "requirement.confirmed",
        subjectId: confirmed.id,
        actor: { kind: "HUMAN", actorId: scope.principal.userId },
      }),
    ]);
  });

  it("refuses to fork history from a stale source version", async () => {
    const context = harness();
    const review = {
      ...scope,
      sourceVersionId: proposal.id,
      decision: "AMBIGUOUS" as const,
      rationale: "A person must clarify the recipient restriction.",
    };
    await context.service.reviewRequirement(review);

    await expect(context.service.reviewRequirement(review)).rejects.toBeInstanceOf(
      RequirementReviewConflictError,
    );
  });

  it("serializes competing in-memory decisions so only one can append", async () => {
    const context = harness();
    const decisions = await Promise.allSettled([
      context.service.reviewRequirement({
        ...scope,
        sourceVersionId: proposal.id,
        decision: "AMBIGUOUS",
        rationale: "A person must clarify the recipient restriction.",
      }),
      context.service.reviewRequirement({
        ...scope,
        sourceVersionId: proposal.id,
        decision: "REJECT",
        rationale: "The proposal does not describe the source accurately.",
      }),
    ]);

    expect(decisions.filter((decision) => decision.status === "fulfilled")).toHaveLength(1);
    const rejected = decisions.find((decision) => decision.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status !== "rejected") throw new Error("One decision must be rejected");
    expect(rejected.reason).toBeInstanceOf(RequirementReviewConflictError);
    await expect(context.service.listRequirementHistory(scope)).resolves.toMatchObject({
      versions: [{ version: 2 }, { version: 1 }],
    });
  });

  it("atomically appends and reads PostgreSQL review versions without rewriting the proposal", async () => {
    const databaseService = await createDatabaseTestService();
    databases.push(databaseService);
    const database = databaseService.database;
    await applyCoreMigrations(database);
    await database.query(
      "INSERT INTO workspaces (id, name, created_at, created_by) VALUES ($1, 'Fictional District', now(), '{}')",
      [proposal.workspaceId],
    );
    await database.query(
      "INSERT INTO software_records (workspace_id, id, name, vendor_name, approval_state, approval_owner, created_at) VALUES ($1, $2, 'Fixture LMS', 'Fictional Vendor', 'UNKNOWN', 'NONE', now())",
      [proposal.workspaceId, scope.softwareId],
    );
    await database.query(
      "INSERT INTO agreement_versions (workspace_id, id, software_id, version, source_object_key, source_sha256, source_mime_type, source_file_name, source_byte_length, normalized_text, page_map, created_at, created_by) VALUES ($1, $2, $3, 1, ('agreements/sha256/' || $4 || '.txt'), $4, 'text/plain', 'Fictional Agreement.txt', 7, 'Fixture', jsonb_build_array(jsonb_build_object('pageNumber', 1, 'startOffset', 0, 'endOffset', 7, 'text', 'Fixture', 'textSha256', repeat('b', 64))), now(), jsonb_build_object('kind', 'HUMAN', 'actorId', 'fixture-officer'))",
      [proposal.workspaceId, proposal.agreementVersionId, scope.softwareId, "a".repeat(64)],
    );
    await database.query(
      "INSERT INTO requirement_proposal_runs (workspace_id, id, software_id, agreement_version_id, status, provider, requested_model, returned_model, attempts, total_input_tokens, total_cached_input_tokens, total_output_tokens, total_reasoning_tokens, total_tokens, total_estimated_cost_micro_usd, requested_by, created_at) VALUES ($1, $2, $3, $4, 'SUCCEEDED', 'DETERMINISTIC_FIXTURE', 'fixture-v1', 'fixture-v1', '[{}]', 0, 0, 0, 0, 0, 0, jsonb_build_object('kind', 'HUMAN', 'actorId', 'fixture-officer'), now())",
      [proposal.workspaceId, proposal.modelRunId, scope.softwareId, proposal.agreementVersionId],
    );
    await database.query(
      "INSERT INTO requirement_versions (workspace_id, id, agreement_version_id, requirement_key, version, model_run_id, status, executable, payload, created_at) VALUES ($1, $2, $3, $4, 1, $5, 'PROPOSED', false, $6, $7)",
      [
        proposal.workspaceId,
        proposal.id,
        proposal.agreementVersionId,
        proposal.requirementKey,
        proposal.modelRunId,
        proposal,
        proposal.createdAt,
      ],
    );
    const repository = new PostgresRequirementReviewRepository(database);
    const confirmed = buildRequirementReviewVersion({
      id: "99999999-9999-4999-8999-999999999999",
      source: proposal,
      decision: "CONFIRM",
      executable: true,
      edits: { action: "Transmit" },
      rationale: "I verified the exact fictional source.",
      reviewedBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
      reviewedAt: "2026-07-20T20:05:00.000Z",
    });
    await expect(
      repository.appendReview(confirmed, {
        eventId: "98989898-9898-4898-8898-989898989898",
        eventType: "AUDIT_RECORDED",
        workspaceId: proposal.workspaceId,
        subjectType: "requirement_version",
        subjectId: confirmed.id,
        action: "requirement.confirmed",
        actor: { kind: "HUMAN", actorId: "fictional-officer-a" },
        occurredAt: confirmed.createdAt,
        details: { sourceVersionId: proposal.id },
      }),
    ).resolves.toEqual(confirmed);
    await expect(
      repository.listVersions(proposal.workspaceId, proposal.agreementVersionId),
    ).resolves.toEqual([confirmed, proposal]);
    await expect(
      database.query(
        "UPDATE requirement_versions SET executable = false WHERE workspace_id = $1 AND id = $2",
        [proposal.workspaceId, confirmed.id],
      ),
    ).rejects.toThrow("immutable");
    await expect(
      database.query<{ readonly count: number | string }>(
        "SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id = $1 AND subject_id = $2",
        [proposal.workspaceId, confirmed.id],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 1 }] });
  });
});
