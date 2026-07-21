import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyCoreMigrations,
  buildJourneyVersion,
  InMemoryJourneyAuthoringRepository,
  JourneyAuthoringService,
  JourneyPrerequisiteError,
  JourneyVersionConflictError,
  PostgresJourneyAuthoringRepository,
  type JourneyAuthoringDependencies,
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
  makeJourneyDraft,
  makeProposedRequirement,
  makeStudentPersona,
} from "../helpers/journey-authoring-fixtures";

const databases: DatabaseTestService[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

function idFactory(): () => string {
  const ids = [
    journeyFixtureIds.journey,
    journeyFixtureIds.versionOne,
    "18181818-1818-4818-8818-181818181818",
    journeyFixtureIds.versionTwo,
    "19191919-1919-4919-8919-191919191919",
    "20202020-2020-4020-8020-202020202020",
  ];
  return () => ids.shift() ?? crypto.randomUUID();
}

function harness() {
  const confirmed = makeConfirmedRequirement();
  let requirementVersions: readonly unknown[] = [confirmed];
  let authorization = makeActiveAuthorization();
  let persona = makeStudentPersona();
  const auditEvents: unknown[] = [];
  const permissions = {
    checkPermission: vi.fn(() => Promise.resolve([])),
  };
  const dependencies: JourneyAuthoringDependencies = {
    requirements: {
      getVersion: (_workspaceId, _agreementVersionId, requirementVersionId) =>
        Promise.resolve(
          requirementVersions.find(
            (version) =>
              typeof version === "object" &&
              version !== null &&
              "id" in version &&
              version.id === requirementVersionId,
          ) as never,
        ),
      listVersions: () => Promise.resolve(requirementVersions as never),
    },
    authorizations: {
      readAuthorization: () => Promise.resolve(authorization),
      listAuthorizations: () => Promise.resolve([authorization]),
    },
    personas: {
      readPersona: () => Promise.resolve(persona),
    },
  };
  const repository = new InMemoryJourneyAuthoringRepository({
    appendAuditEvent: (event: unknown) => {
      auditEvents.push(event);
      return Promise.resolve();
    },
  });
  const service = new JourneyAuthoringService(
    repository,
    dependencies,
    permissions,
    {
      idFactory: idFactory(),
      now: () => "2026-07-21T10:05:00.000Z",
    },
  );
  return {
    auditEvents,
    confirmed,
    dependencies,
    permissions,
    repository,
    service,
    setAuthorization: (next: typeof authorization) => {
      authorization = next;
    },
    setPersona: (next: typeof persona) => {
      persona = next;
    },
    setRequirementVersions: (next: readonly unknown[]) => {
      requirementVersions = next;
    },
  };
}

const scope = {
  principal: journeyPrincipal,
  workspaceId: journeyFixtureIds.workspace,
  softwareId: journeyFixtureIds.software,
  agreementVersionId: journeyFixtureIds.agreement,
};

describe("named journey service", () => {
  it("authorizes and appends a runnable journey with an inspectable causal view", async () => {
    const context = harness();
    const result = await context.service.saveJourney({
      ...scope,
      draft: makeJourneyDraft(),
    });

    expect(context.permissions.checkPermission).toHaveBeenCalledWith({
      principal: journeyPrincipal,
      workspaceId: journeyFixtureIds.workspace,
      permission: "JOURNEY_MANAGE",
    });
    expect(result.readiness).toEqual({ status: "RUNNABLE", blockers: [] });
    expect(result.version).toMatchObject({
      version: 1,
      sourceVersionId: null,
      createdBy: { kind: "HUMAN", actorId: journeyPrincipal.userId },
    });
    expect(result.causalLinks).toEqual([
      expect.objectContaining({
        requirementVersionId: journeyFixtureIds.confirmedRequirement,
        requirementText:
          "Do not send the synthetic student email to fixture analytics.",
        personaId: journeyFixtureIds.persona,
        personaDisplayName: "Nova Reed (Fictional)",
        sourceField: "email",
        checkpointIds: ["submission-request"],
      }),
      expect.objectContaining({
        sourceField: "submissionPhrase",
        checkpointIds: ["submission-request"],
      }),
    ]);
    expect(result.lastSuccessfulVersion).toBeNull();
    expect(result.repairHistory).toEqual([]);
    expect(context.auditEvents).toEqual([
      expect.objectContaining({
        action: "journey.created",
        subjectId: result.version.id,
        actor: { kind: "HUMAN", actorId: journeyPrincipal.userId },
      }),
    ]);
  });

  it.each([
    {
      label: "an unconfirmed rule",
      arrange: (context: ReturnType<typeof harness>) => {
        context.setRequirementVersions([
          {
            ...context.confirmed,
            status: "AMBIGUOUS",
            executable: false,
          },
        ]);
      },
      code: "REQUIREMENT_NOT_EXECUTABLE",
    },
    {
      label: "an expired authorization",
      arrange: (context: ReturnType<typeof harness>) => {
        context.setAuthorization(
          makeActiveAuthorization({ status: "EXPIRED" }),
        );
      },
      code: "AUTHORIZATION_INACTIVE",
    },
    {
      label: "an authorization whose human review is due",
      arrange: (context: ReturnType<typeof harness>) => {
        context.setAuthorization(
          makeActiveAuthorization({ reviewAt: "2026-07-21T10:04:00.000Z" }),
        );
      },
      code: "AUTHORIZATION_INACTIVE",
    },
    {
      label: "a persona with the wrong role",
      arrange: (context: ReturnType<typeof harness>) => {
        context.setPersona(makeStudentPersona({ role: "TEACHER" }));
      },
      code: "PERSONA_ROLE_MISMATCH",
    },
    {
      label: "a missing fictional source field",
      arrange: (context: ReturnType<typeof harness>) => {
        context.setPersona(makeStudentPersona({ fields: {} }));
      },
      code: "TEST_FIELD_UNAVAILABLE",
    },
  ])("does not save a journey with $label", async ({ arrange, code }) => {
    const context = harness();
    arrange(context);

    const rejection = context.service.saveJourney({
      ...scope,
      draft: makeJourneyDraft(),
    });
    await expect(rejection).rejects.toBeInstanceOf(JourneyPrerequisiteError);
    await expect(rejection).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code })],
    });
    await expect(
      context.repository.listVersions(
        journeyFixtureIds.workspace,
        journeyFixtureIds.software,
      ),
    ).resolves.toEqual([]);
  });

  it("appends a new immutable version and refuses a stale fork", async () => {
    const context = harness();
    const first = await context.service.saveJourney({
      ...scope,
      draft: makeJourneyDraft(),
    });
    const before = JSON.stringify(first.version);
    const secondInput = {
      ...scope,
      sourceVersionId: first.version.id,
      draft: makeJourneyDraft({
        goal: "Submit the fictional response and preserve the required request capture.",
      }),
    };
    const second = await context.service.saveJourney(secondInput);

    expect(JSON.stringify(first.version)).toBe(before);
    expect(second.version).toMatchObject({
      journeyId: first.version.journeyId,
      sourceVersionId: first.version.id,
      version: 2,
    });
    const history = await context.service.listJourneys(scope);
    expect(history.versions.map((view) => view.version.version)).toEqual([2, 1]);
    expect(history.current.map((view) => view.version.id)).toEqual([
      second.version.id,
    ]);
    await expect(context.service.saveJourney(secondInput)).rejects.toBeInstanceOf(
      JourneyVersionConflictError,
    );
  });

  it("reassesses current prerequisites without mutating a stored version", async () => {
    const context = harness();
    const created = await context.service.saveJourney({
      ...scope,
      draft: makeJourneyDraft(),
    });
    const before = JSON.stringify(created.version);
    context.setAuthorization(
      makeActiveAuthorization({ status: "REVOKED" }),
    );

    const history = await context.service.listJourneys(scope);

    expect(history.current[0]?.readiness).toEqual({
      status: "BLOCKED",
      blockers: [
        expect.objectContaining({ code: "AUTHORIZATION_INACTIVE" }),
      ],
    });
    expect(JSON.stringify(history.current[0]?.version)).toBe(before);
  });

  it("returns only journeys from the requested agreement version", async () => {
    const context = harness();
    const first = await context.service.saveJourney({
      ...scope,
      draft: makeJourneyDraft(),
    });
    await context.service.saveJourney({
      ...scope,
      agreementVersionId: "30303030-3030-4030-8030-303030303030",
      draft: makeJourneyDraft({
        name: "Journey for another immutable agreement",
      }),
    });

    const history = await context.service.listJourneys(scope);

    expect(history.versions.map((view) => view.version.id)).toEqual([
      first.version.id,
    ]);
    expect(history.current.map((view) => view.version.id)).toEqual([
      first.version.id,
    ]);
  });

  it("serializes competing appends so only one new version can win", async () => {
    const context = harness();
    const first = await context.service.saveJourney({
      ...scope,
      draft: makeJourneyDraft(),
    });
    const results = await Promise.allSettled([
      context.service.saveJourney({
        ...scope,
        sourceVersionId: first.version.id,
        draft: makeJourneyDraft({ goal: "First bounded edit." }),
      }),
      context.service.saveJourney({
        ...scope,
        sourceVersionId: first.version.id,
        draft: makeJourneyDraft({ goal: "Second bounded edit." }),
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status !== "rejected") throw new Error("One append must fail");
    expect(rejected.reason).toBeInstanceOf(JourneyVersionConflictError);
  });

  it("atomically persists immutable PostgreSQL journey versions and source lineage", async () => {
    const databaseService = await createDatabaseTestService();
    databases.push(databaseService);
    const database = databaseService.database;
    await applyCoreMigrations(database);
    const proposed = makeProposedRequirement();
    const confirmed = makeConfirmedRequirement();
    const databaseNow = Date.now();
    const authorization = makeActiveAuthorization({
      validFrom: new Date(databaseNow - 86_400_000).toISOString(),
      reviewAt: new Date(databaseNow + 4 * 86_400_000).toISOString(),
      expiresAt: new Date(databaseNow + 10 * 86_400_000).toISOString(),
      attestedAt: new Date(databaseNow - 86_400_000).toISOString(),
    });
    const persona = makeStudentPersona();
    await database.query(
      "INSERT INTO workspaces (id, name, created_at, created_by) VALUES ($1, 'Fictional District', now(), '{}')",
      [journeyFixtureIds.workspace],
    );
    await database.query(
      "INSERT INTO software_records (workspace_id, id, name, vendor_name, approval_state, approval_owner, created_at) VALUES ($1, $2, 'Fixture LMS', 'Fictional Vendor', 'UNKNOWN', 'NONE', now())",
      [journeyFixtureIds.workspace, journeyFixtureIds.software],
    );
    await database.query(
      "INSERT INTO agreement_versions (workspace_id, id, software_id, version, source_object_key, source_sha256, source_mime_type, source_file_name, source_byte_length, normalized_text, page_map, created_at, created_by) VALUES ($1, $2, $3, 1, ('agreements/sha256/' || $4 || '.txt'), $4, 'text/plain', 'Fictional Agreement.txt', 7, 'Fixture', jsonb_build_array(jsonb_build_object('pageNumber', 1, 'startOffset', 0, 'endOffset', 7, 'text', 'Fixture', 'textSha256', repeat('b', 64))), now(), jsonb_build_object('kind', 'HUMAN', 'actorId', 'fixture-officer'))",
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
        journeyFixtureIds.workspace,
        proposed.id,
        journeyFixtureIds.agreement,
        proposed.requirementKey,
        proposed.modelRunId,
        proposed,
        proposed.createdAt,
      ],
    );
    await database.query(
      "INSERT INTO requirement_versions (workspace_id, id, agreement_version_id, requirement_key, version, source_requirement_version_id, status, executable, payload, created_at) VALUES ($1, $2, $3, $4, 2, $5, 'CONFIRMED', true, $6, $7)",
      [
        journeyFixtureIds.workspace,
        confirmed.id,
        journeyFixtureIds.agreement,
        confirmed.requirementKey,
        proposed.id,
        confirmed,
        confirmed.createdAt,
      ],
    );
    await database.query(
      "INSERT INTO authorizations (workspace_id, id, software_id, version, status, valid_from, expires_at, scope, attested_by, attested_at) VALUES ($1, $2, $3, 1, 'ACTIVE', $4, $5, $6, $7, $8)",
      [
        journeyFixtureIds.workspace,
        authorization.id,
        journeyFixtureIds.software,
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

    const repository = new PostgresJourneyAuthoringRepository(database);
    const first = buildJourneyVersion({
      id: journeyFixtureIds.versionOne,
      workspaceId: journeyFixtureIds.workspace,
      softwareId: journeyFixtureIds.software,
      agreementVersionId: journeyFixtureIds.agreement,
      journeyId: journeyFixtureIds.journey,
      version: 1,
      sourceVersionId: null,
      draft: makeJourneyDraft(),
      createdAt: "2026-07-21T10:05:00.000Z",
      createdBy: { kind: "HUMAN", actorId: journeyPrincipal.userId },
    });
    const second = buildJourneyVersion({
      id: journeyFixtureIds.versionTwo,
      workspaceId: journeyFixtureIds.workspace,
      softwareId: journeyFixtureIds.software,
      agreementVersionId: journeyFixtureIds.agreement,
      journeyId: journeyFixtureIds.journey,
      version: 2,
      sourceVersionId: first.id,
      draft: makeJourneyDraft({ goal: "A source-bound second version." }),
      createdAt: "2026-07-21T10:06:00.000Z",
      createdBy: { kind: "HUMAN", actorId: journeyPrincipal.userId },
    });
    const audit = (version: JourneyVersion, eventId: string) => ({
      eventId,
      eventType: "AUDIT_RECORDED" as const,
      workspaceId: version.workspaceId,
      subjectType: "journey_version",
      subjectId: version.id,
      action: version.version === 1 ? "journey.created" : "journey.versioned",
      actor: { kind: "HUMAN" as const, actorId: journeyPrincipal.userId },
      occurredAt: version.createdAt,
      details: { sourceVersionId: version.sourceVersionId },
    });

    await expect(
      repository.appendVersion(
        first,
        audit(first, "21212121-2121-4121-8121-212121212121"),
      ),
    ).resolves.toEqual(first);
    await expect(
      repository.appendVersion(
        second,
        audit(second, "22222222-2222-4222-8222-222222222223"),
      ),
    ).resolves.toEqual(second);
    const outsideAuthorization = buildJourneyVersion({
      id: "23232323-2323-4323-8323-232323232323",
      workspaceId: journeyFixtureIds.workspace,
      softwareId: journeyFixtureIds.software,
      agreementVersionId: journeyFixtureIds.agreement,
      journeyId: journeyFixtureIds.journey,
      version: 3,
      sourceVersionId: second.id,
      draft: makeJourneyDraft({
        allowedActions: ["NAVIGATE", "SUBMIT", "UPLOAD"],
      }),
      createdAt: "2026-07-21T10:07:00.000Z",
      createdBy: { kind: "HUMAN", actorId: journeyPrincipal.userId },
    });
    await expect(
      repository.appendVersion(
        outsideAuthorization,
        audit(outsideAuthorization, "24242424-2424-4424-8424-242424242424"),
      ),
    ).rejects.toThrow("Journey actions exceed the active authorization scope");
    const missingProhibition = buildJourneyVersion({
      id: "25252525-2525-4525-8525-252525252525",
      workspaceId: journeyFixtureIds.workspace,
      softwareId: journeyFixtureIds.software,
      agreementVersionId: journeyFixtureIds.agreement,
      journeyId: journeyFixtureIds.journey,
      version: 3,
      sourceVersionId: second.id,
      draft: makeJourneyDraft({
        prohibitedActions: ["PURCHASE", "DELETE", "ADMINISTER"],
      }),
      createdAt: "2026-07-21T10:08:00.000Z",
      createdBy: { kind: "HUMAN", actorId: journeyPrincipal.userId },
    });
    await expect(
      repository.appendVersion(
        missingProhibition,
        audit(missingProhibition, "26262626-2626-4626-8626-262626262626"),
      ),
    ).rejects.toThrow(
      "Journey must retain every action prohibited by its authorization",
    );
    await expect(
      repository.listVersions(
        journeyFixtureIds.workspace,
        journeyFixtureIds.software,
      ),
    ).resolves.toEqual([second, first]);
    await expect(
      database.query(
        "UPDATE journey_versions SET payload = jsonb_set(payload, '{goal}', '\"changed\"') WHERE workspace_id = $1 AND id = $2",
        [journeyFixtureIds.workspace, first.id],
      ),
    ).rejects.toThrow();
  });
});
