import { afterEach, describe, expect, it } from "vitest";
import {
  AgreementIntakeService,
  InMemoryAgreementIntakeRepository,
  InMemoryAgreementObjectStore,
  InMemoryRequirementProposalRepository,
  PostgresAgreementIntakeRepository,
  PostgresRequirementProposalRepository,
  RequirementProposalService,
  type RequirementProposalModelAdapter,
  type RequirementProposalModelAttempt,
} from "../../packages/core/src/index";
import {
  InMemoryWorkspaceAuthorizationRepository,
  PermissionDeniedError,
  PostgresWorkspaceAuthorizationRepository,
  WorkspaceAuthorizationService,
} from "../../packages/core/src/authorization";
import {
  InMemorySoftwareInventoryRepository,
  PostgresSoftwareInventoryRepository,
  SoftwareInventoryService,
} from "../../packages/core/src/inventory";
import { applyCoreMigrations } from "../../packages/core/src/migrations";
import {
  createDatabaseTestService,
  type DatabaseTestService,
} from "../../packages/testkit/src/index";
import {
  makeCompletedAttempt,
  makeProposalCandidate,
} from "../helpers/requirement-proposal-fixtures";

const databases: DatabaseTestService[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

function idFactory(): () => string {
  let value = 2_000;
  return () => {
    value += 1;
    return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
  };
}

class SequenceAdapter implements RequirementProposalModelAdapter {
  readonly provider = "DETERMINISTIC_FIXTURE" as const;
  readonly requestedModel = "fixture-requirement-proposer-v1";
  readonly #attempts: RequirementProposalModelAttempt[];
  calls = 0;

  constructor(attempts: readonly RequirementProposalModelAttempt[]) {
    this.#attempts = [...attempts];
  }

  propose(): Promise<RequirementProposalModelAttempt> {
    const attempt = this.#attempts[Math.min(this.calls, this.#attempts.length - 1)];
    this.calls += 1;
    if (!attempt) throw new Error("A sequence attempt is required");
    return Promise.resolve(attempt);
  }
}

async function seed(
  persistence: "memory" | "postgres",
  adapter: RequirementProposalModelAdapter,
) {
  const nextId = idFactory();
  const now = () => "2026-07-19T21:00:00.000Z";
  const database =
    persistence === "postgres" ? await createDatabaseTestService() : undefined;
  if (database) {
    databases.push(database);
    await applyCoreMigrations(database.database);
  }
  const authorizationRepository = database
    ? new PostgresWorkspaceAuthorizationRepository(database.database)
    : new InMemoryWorkspaceAuthorizationRepository();
  const authorization = new WorkspaceAuthorizationService(
    authorizationRepository,
    { idFactory: nextId, now },
  );
  const creator = {
    userId: "fictional-privacy-officer",
    displayName: "Morgan Vale (Fictional)",
  };
  const workspace = await authorization.createWorkspace({
    principal: creator,
    name: "Fictional Cedar Ridge School District",
  });
  const principal = {
    ...creator,
    activeWorkspaceId: workspace.workspace.id,
  };
  const inventoryRepository = database
    ? new PostgresSoftwareInventoryRepository(database.database)
    : new InMemorySoftwareInventoryRepository(authorizationRepository);
  const inventory = new SoftwareInventoryService(
    inventoryRepository,
    authorization,
    { idFactory: nextId, now },
  );
  const software = await inventory.createSoftware({
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
    },
  });
  const agreementRepository = database
    ? new PostgresAgreementIntakeRepository(database.database)
    : new InMemoryAgreementIntakeRepository(authorizationRepository);
  const objectStore = new InMemoryAgreementObjectStore();
  const agreementService = new AgreementIntakeService(
    agreementRepository,
    objectStore,
    authorization,
    inventoryRepository,
    { idFactory: nextId, now },
  );
  const bytes = new TextEncoder().encode(
    "Fictional Cedar Ridge DPA\nPurpose: classroom instruction only.\fFictional Cedar Ridge DPA\nRecipients: district-authorized subprocessors only.",
  );
  const agreement = await agreementService.uploadAgreement({
    principal,
    workspaceId: workspace.workspace.id,
    softwareId: software.software.id,
    fileName: "Northstar-DPA-fictional.txt",
    mimeType: "text/plain",
    bytes,
  });
  const proposalRepository = database
    ? new PostgresRequirementProposalRepository(database.database)
    : new InMemoryRequirementProposalRepository(authorizationRepository);
  const proposalService = new RequirementProposalService(
    proposalRepository,
    agreementService,
    authorization,
    adapter,
    { idFactory: nextId, now, maxAttempts: 2 },
  );
  return {
    adapter,
    agreement: agreement.agreement,
    authorization,
    database,
    principal,
    proposalRepository,
    proposalService,
    softwareId: software.software.id,
    workspaceId: workspace.workspace.id,
  };
}

function scope(context: Awaited<ReturnType<typeof seed>>) {
  return {
    principal: context.principal,
    workspaceId: context.workspaceId,
    softwareId: context.softwareId,
    agreementVersionId: context.agreement.id,
  };
}

describe("requirement proposal service", () => {
  it("persists only exact cited proposals as non-executable model drafts", async () => {
    const context = await seed(
      "memory",
      new SequenceAdapter([makeCompletedAttempt()]),
    );
    const result = await context.proposalService.proposeRequirements(scope(context));

    expect(result.run).toMatchObject({
      status: "SUCCEEDED",
      provider: "DETERMINISTIC_FIXTURE",
      requestedModel: "fixture-requirement-proposer-v1",
      attempts: [{ outcome: "COMPLETED" }],
      totalEstimatedCostMicroUsd: 0,
      requestedBy: { kind: "HUMAN", actorId: context.principal.userId },
    });
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({
      agreementVersionId: context.agreement.id,
      modelRunId: result.run.id,
      version: 1,
      status: "PROPOSED",
      executable: false,
      details: makeProposalCandidate(),
      citation: { page: 1 },
      proposedBy: {
        kind: "AUTOMATION",
        component: "deterministic-requirement-fixture",
      },
    });
    const proposal = result.proposals[0]!;
    expect(
      context.agreement.normalizedText.slice(
        proposal.citation.startOffset,
        proposal.citation.endOffset,
      ),
    ).toBe(proposal.details.sourceText);
    await expect(
      context.proposalService.listProposalHistory(scope(context)),
    ).resolves.toMatchObject({
      runs: [{ id: result.run.id, status: "SUCCEEDED" }],
      proposals: [{ id: proposal.id, executable: false }],
    });
  });

  it("retries a retryable failure once and logs every attempt and aggregate cost", async () => {
    const first = {
      ...makeCompletedAttempt(),
      outcome: "PROVIDER_ERROR" as const,
      candidates: [],
      retryable: true,
      failureCode: "PROVIDER_ERROR",
      safeMessage:
        "The model request failed before a usable response was returned.",
      usage: {
        ...makeCompletedAttempt().usage,
        inputTokens: 10,
        totalTokens: 10,
        estimatedCostMicroUsd: 50,
      },
    };
    const second = {
      ...makeCompletedAttempt(),
      responseId: "fixture-response-2",
      usage: {
        ...makeCompletedAttempt().usage,
        outputTokens: 2,
        totalTokens: 2,
        estimatedCostMicroUsd: 60,
      },
    };
    const adapter = new SequenceAdapter([first, second]);
    const context = await seed("memory", adapter);

    const result = await context.proposalService.proposeRequirements(scope(context));

    expect(adapter.calls).toBe(2);
    expect(result.run).toMatchObject({
      status: "SUCCEEDED",
      attempts: [
        {
          outcome: "PROVIDER_ERROR",
          usage: { estimatedCostMicroUsd: 50 },
        },
        { outcome: "COMPLETED", usage: { estimatedCostMicroUsd: 60 } },
      ],
      totalEstimatedCostMicroUsd: 110,
      totalInputTokens: 10,
      totalOutputTokens: 2,
    });
  });

  it("records a refusal with zero proposals and does not retry it", async () => {
    const refusal: RequirementProposalModelAttempt = {
      ...makeCompletedAttempt(),
      outcome: "REFUSED",
      candidates: [],
      retryable: false,
      failureCode: "REFUSED",
      safeMessage:
        "The model declined to propose requirements. No proposal was created.",
    };
    const adapter = new SequenceAdapter([refusal]);
    const context = await seed("memory", adapter);
    const result = await context.proposalService.proposeRequirements(scope(context));

    expect(adapter.calls).toBe(1);
    expect(result).toMatchObject({
      run: {
        status: "REFUSED",
        safeMessage:
          "The model declined to propose requirements. No proposal was created.",
      },
      proposals: [],
    });
    expect(
      (await context.proposalService.listProposalHistory(scope(context))).proposals,
    ).toEqual([]);
  });

  it("denies a reviewer before invoking the adapter but allows proposal reads", async () => {
    const adapter = new SequenceAdapter([makeCompletedAttempt()]);
    const context = await seed("memory", adapter);
    await context.proposalService.proposeRequirements(scope(context));
    const reviewer = {
      userId: "fictional-reviewer",
      displayName: "Jordan Brooks (Fictional)",
      activeWorkspaceId: context.workspaceId,
    };
    await context.authorization.assignRole({
      principal: context.principal,
      workspaceId: context.workspaceId,
      targetUserId: reviewer.userId,
      role: "REVIEWER",
    });

    await expect(
      context.proposalService.proposeRequirements({
        ...scope(context),
        principal: reviewer,
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(adapter.calls).toBe(1);
    await expect(
      context.proposalService.listProposalHistory({
        ...scope(context),
        principal: reviewer,
      }),
    ).resolves.toMatchObject({ proposals: [{}] });
  });

  it("atomically stores PostgreSQL model runs and immutable proposal versions", async () => {
    const context = await seed(
      "postgres",
      new SequenceAdapter([makeCompletedAttempt()]),
    );
    const result = await context.proposalService.proposeRequirements(scope(context));
    const database = context.database!.database;
    const runs = await database.query<{ readonly status: string }>(
      "SELECT status FROM requirement_proposal_runs WHERE workspace_id = $1",
      [context.workspaceId],
    );
    const requirements = await database.query<{
      readonly status: string;
      readonly executable: boolean;
      readonly model_run_id: string;
    }>(
      "SELECT status, executable, model_run_id FROM requirement_versions WHERE workspace_id = $1",
      [context.workspaceId],
    );
    expect(runs.rows).toEqual([{ status: "SUCCEEDED" }]);
    expect(requirements.rows).toEqual([
      {
        status: "PROPOSED",
        executable: false,
        model_run_id: result.run.id,
      },
    ]);
    await expect(
      database.query(
        "UPDATE requirement_proposal_runs SET safe_message = 'changed' WHERE workspace_id = $1 AND id = $2",
        [context.workspaceId, result.run.id],
      ),
    ).rejects.toThrow("immutable");
  });

  it("rejects a PostgreSQL proposal linked to a failed model run", async () => {
    const refusal: RequirementProposalModelAttempt = {
      ...makeCompletedAttempt(),
      outcome: "REFUSED",
      candidates: [],
      retryable: false,
      failureCode: "REFUSED",
      safeMessage:
        "The model declined to propose requirements. No proposal was created.",
    };
    const context = await seed("postgres", new SequenceAdapter([refusal]));
    const result = await context.proposalService.proposeRequirements(scope(context));
    const database = context.database!.database;

    expect(result).toMatchObject({
      run: { status: "REFUSED" },
      proposals: [],
    });
    await expect(
      database.query(
        "INSERT INTO requirement_versions (workspace_id, id, agreement_version_id, requirement_key, version, model_run_id, status, executable, payload, created_at) VALUES ($1, $2, $3, $4, 1, $5, 'PROPOSED', false, $6, $7)",
        [
          context.workspaceId,
          "00000000-0000-4000-8000-000000009999",
          context.agreement.id,
          "must-not-materialize",
          result.run.id,
          {},
          "2026-07-19T21:00:00.000Z",
        ],
      ),
    ).rejects.toThrow("successful model proposal run");
    await expect(
      database.query<{ readonly count: number | string }>(
        "SELECT COUNT(*) AS count FROM requirement_versions WHERE workspace_id = $1",
        [context.workspaceId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });
});
