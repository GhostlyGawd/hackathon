import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  InMemoryRunOrchestrationRepository,
  PostgresRunOrchestrationRepository,
  RunOrchestrationConflictError,
  RunOrchestrationService,
} from "../../packages/core/src/run-orchestration";
import {
  applyCoreMigrations,
  runSnapshotSchema,
} from "../../packages/core/src/index";
import {
  createDatabaseTestService,
  type DatabaseTestService,
} from "../../packages/testkit/src/index";
import {
  automationActor,
  domainIds,
  humanActor,
  makeQueuedRun,
} from "../helpers/domain-fixtures";
import { insertPostgresJourneyFixture } from "../helpers/postgres-journey-fixture";

const databases: DatabaseTestService[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

function serviceFixture() {
  let current = Date.parse("2026-07-22T10:00:00.000Z");
  const repository = new InMemoryRunOrchestrationRepository();
  const service = new RunOrchestrationService(repository, {
    idFactory: randomUUID,
    now: () => new Date(current).toISOString(),
    leaseDurationMs: 60_000,
  });
  return {
    repository,
    service,
    advance: (milliseconds: number) => {
      current += milliseconds;
    },
  };
}

function queueInput(idempotencyKey: string) {
  const snapshot = runSnapshotSchema.parse(makeQueuedRun()["snapshot"]);
  return {
    workspaceId: domainIds.workspace,
    softwareId: domainIds.software,
    snapshot,
    requiredCheckpointIds: ["submission-request", "completion-visible"],
    modelIdentifier: "gpt-5.6-sol",
    queuedBy: humanActor,
    idempotencyKey,
  };
}

const completedCoverage = [
  { checkpointId: "submission-request", status: "VERIFIED" as const },
  { checkpointId: "completion-visible", status: "VERIFIED" as const },
];

const observations = [
  {
    observationId: "45454545-4545-4545-8545-454545454545",
    sequence: 0,
    source: "NETWORK" as const,
    payloadHash: "d".repeat(64),
  },
];

async function postgresServiceFixture() {
  const databaseService = await createDatabaseTestService();
  databases.push(databaseService);
  const database = databaseService.database;
  await applyCoreMigrations(database);
  const databaseNow = Date.now();
  await database.query(
    "INSERT INTO workspaces (id, name, created_at, created_by) VALUES ($1, 'Run Orchestration District (Fictional)', now(), '{}')",
    [domainIds.workspace],
  );
  await database.query(
    "INSERT INTO software_records (workspace_id, id, name, vendor_name, approval_state, approval_owner, created_at) VALUES ($1, $2, 'Run Orchestration Fixture', 'Fictional Vendor', 'UNKNOWN', 'NONE', now())",
    [domainIds.workspace, domainIds.software],
  );
  await database.query(
    "INSERT INTO agreement_versions (workspace_id, id, software_id, version, source_object_key, source_sha256, source_mime_type, source_file_name, source_byte_length, normalized_text, page_map, created_at, created_by) VALUES ($1, $2, $3, 1, ('agreements/sha256/' || $4 || '.txt'), $4, 'text/plain', 'Run Orchestration Agreement.txt', 7, 'Fixture', jsonb_build_array(jsonb_build_object('pageNumber', 1, 'startOffset', 0, 'endOffset', 7, 'text', 'Fixture', 'textSha256', repeat('b', 64))), now(), jsonb_build_object('kind', 'HUMAN', 'actorId', 'fictional-officer'))",
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
      new Date(databaseNow - 86_400_000).toISOString(),
      new Date(databaseNow + 10 * 86_400_000).toISOString(),
      {
        authorityBasis: "Controlled fictional test authority.",
        reviewAt: new Date(databaseNow + 4 * 86_400_000).toISOString(),
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
      new Date(databaseNow - 86_400_000).toISOString(),
    ],
  );
  await insertPostgresJourneyFixture(database, {
    workspaceId: domainIds.workspace,
    softwareId: domainIds.software,
    agreementVersionId: domainIds.agreement,
    authorizationId: domainIds.authorization,
    journeyVersionId: domainIds.journeyVersion,
    journeyId: domainIds.journey,
    personaId: "46464646-4646-4646-8646-464646464646",
    proposalRunId: "47474747-4747-4747-8747-474747474747",
    proposedRequirementId: "48484848-4848-4848-8848-484848484848",
    confirmedRequirementId: domainIds.requirement,
    actorId: humanActor.actorId,
    allowedActions: ["NAVIGATE"],
    prohibitedActions: ["MESSAGE"],
  });
  let current = Date.parse("2026-07-22T10:00:00.000Z");
  const repository = new PostgresRunOrchestrationRepository(database);
  const service = new RunOrchestrationService(repository, {
    idFactory: randomUUID,
    now: () => new Date(current).toISOString(),
    leaseDurationMs: 60_000,
  });
  return {
    database,
    repository,
    service,
    advance: (milliseconds: number) => {
      current += milliseconds;
    },
  };
}

describe("run orchestration integration", () => {
  it("claims a queued run once and finalizes it idempotently with an immutable manifest", async () => {
    const { repository, service, advance } = serviceFixture();
    const queued = await service.queueRun(queueInput("queue-complete"));
    await expect(service.queueRun(queueInput("queue-complete"))).resolves.toEqual(
      queued,
    );

    const [first, competing] = await Promise.all([
      service.claimNext({
        workspaceId: domainIds.workspace,
        workerId: "worker-a",
        leaseToken: "a".repeat(48),
        actor: automationActor,
        idempotencyKey: "claim-complete-a",
      }),
      service.claimNext({
        workspaceId: domainIds.workspace,
        workerId: "worker-b",
        leaseToken: "b".repeat(48),
        actor: automationActor,
        idempotencyKey: "claim-complete-b",
      }),
    ]);
    const claimed = first ?? competing;
    expect(claimed).toBeDefined();
    expect([first, competing].filter(Boolean)).toHaveLength(1);
    expect(claimed?.run.state).toBe("RUNNING");

    advance(10_000);
    const finalized = await service.finalizeRun({
      workspaceId: domainIds.workspace,
      runId: queued.id,
      leaseToken: claimed!.leaseToken,
      terminalStatus: "COMPLETED",
      runnerVersion: "pactwire-runner-v1",
      observations,
      coverage: completedCoverage,
      limitations: ["Only the named controlled journey was exercised."],
      actor: automationActor,
      idempotencyKey: "finalize-complete",
    });
    await expect(
      service.finalizeRun({
        workspaceId: domainIds.workspace,
        runId: queued.id,
        leaseToken: claimed!.leaseToken,
        terminalStatus: "COMPLETED",
        runnerVersion: "pactwire-runner-v1",
        observations,
        coverage: completedCoverage,
        limitations: ["Only the named controlled journey was exercised."],
        actor: automationActor,
        idempotencyKey: "finalize-complete",
      }),
    ).resolves.toEqual(finalized);

    expect(finalized.run).toMatchObject({
      state: "COMPLETED",
      manifestHash: finalized.manifest.manifestHash,
    });
    await expect(
      repository.listHistory(domainIds.workspace, domainIds.software),
    ).resolves.toEqual([
      expect.objectContaining({
        run: finalized.run,
        manifest: finalized.manifest,
        scope: claimed!.scope,
      }),
    ]);
    await expect(
      service.finalizeRun({
        workspaceId: domainIds.workspace,
        runId: queued.id,
        leaseToken: claimed!.leaseToken,
        terminalStatus: "FAILED",
        runnerVersion: "changed",
        observations: [],
        coverage: completedCoverage,
        limitations: ["Conflicting retry."],
        actor: automationActor,
        idempotencyKey: "finalize-complete",
      }),
    ).rejects.toBeInstanceOf(RunOrchestrationConflictError);
  });

  it("records an expired worker lease as an explicit integrity failure and retries with frozen scope", async () => {
    const { repository, service, advance } = serviceFixture();
    const queued = await service.queueRun(queueInput("queue-crash"));
    const claimed = await service.claimNext({
      workspaceId: domainIds.workspace,
      workerId: "worker-crash",
      leaseToken: "c".repeat(48),
      actor: automationActor,
      idempotencyKey: "claim-crash",
    });
    expect(claimed).toBeDefined();
    advance(60_001);

    const failed = await service.failExpiredLease({
      workspaceId: domainIds.workspace,
      runId: queued.id,
      actor: automationActor,
      idempotencyKey: "expire-crash",
    });
    expect(failed).toMatchObject({
      state: "FAILED",
      integrityFailure: { code: "WORKER_LEASE_EXPIRED" },
    });
    await expect(
      repository.getManifest(domainIds.workspace, queued.id),
    ).resolves.toBeUndefined();

    const retry = await service.retryRun({
      workspaceId: domainIds.workspace,
      sourceRunId: queued.id,
      requestedBy: humanActor,
      idempotencyKey: "retry-crash",
    });
    expect(retry.run).toMatchObject({
      state: "QUEUED",
      retryOfRunId: queued.id,
      snapshot: queued.snapshot,
    });
    expect(retry.scope).toMatchObject({
      requiredCheckpointIds: claimed!.scope.requiredCheckpointIds,
      modelIdentifier: claimed!.scope.modelIdentifier,
    });
  });

  it("cancels an unclaimed run with a manifest that names every untested checkpoint", async () => {
    const { service } = serviceFixture();
    const queued = await service.queueRun(queueInput("queue-cancel"));
    const canceled = await service.cancelRun({
      workspaceId: domainIds.workspace,
      runId: queued.id,
      runnerVersion: "pactwire-runner-v1",
      observations: [],
      coverage: [
        {
          checkpointId: "submission-request",
          status: "NOT_TESTED",
          reason: "The authorized operator canceled before execution.",
        },
        {
          checkpointId: "completion-visible",
          status: "NOT_TESTED",
          reason: "The authorized operator canceled before execution.",
        },
      ],
      limitations: ["No browser session started."],
      requestedBy: humanActor,
      finalizedBy: automationActor,
      idempotencyKey: "cancel-queued",
    });

    expect(canceled.run.state).toBe("CANCELED");
    expect(canceled.manifest.missingCoverage).toHaveLength(2);
    expect(canceled.manifest.startedAt).toBeNull();
  });

  it("atomically persists queue, lease, terminal manifest, and idempotency receipts in PostgreSQL", async () => {
    const { database, repository, service, advance } =
      await postgresServiceFixture();
    const queued = await service.queueRun({
      ...queueInput("postgres-queue"),
      requiredCheckpointIds: ["controlled-page"],
    });
    const claimed = await service.claimNext({
      workspaceId: domainIds.workspace,
      workerId: "postgres-worker",
      leaseToken: "p".repeat(48),
      actor: automationActor,
      idempotencyKey: "postgres-claim",
    });
    expect(claimed?.run.state).toBe("RUNNING");
    await expect(
      service.claimNext({
        workspaceId: domainIds.workspace,
        workerId: "competing-worker",
        leaseToken: "q".repeat(48),
        actor: automationActor,
        idempotencyKey: "postgres-competing-claim",
      }),
    ).resolves.toBeUndefined();
    advance(5_000);
    const finalized = await service.finalizeRun({
      workspaceId: domainIds.workspace,
      runId: queued.id,
      leaseToken: claimed!.leaseToken,
      terminalStatus: "COMPLETED",
      runnerVersion: "pactwire-runner-v1",
      observations,
      coverage: [{ checkpointId: "controlled-page", status: "VERIFIED" }],
      limitations: ["Only the controlled page checkpoint was exercised."],
      actor: automationActor,
      idempotencyKey: "postgres-finalize",
    });

    await expect(
      repository.getManifest(domainIds.workspace, queued.id),
    ).resolves.toEqual(finalized.manifest);
    await expect(
      database.query(
        "UPDATE run_manifests SET manifest_hash = $3 WHERE workspace_id = $1 AND run_id = $2",
        [domainIds.workspace, queued.id, "f".repeat(64)],
      ),
    ).rejects.toThrow(/immutable/i);
    await expect(
      database.query(
        "UPDATE run_execution_scopes SET model_identifier = 'changed-model' WHERE workspace_id = $1 AND run_id = $2",
        [domainIds.workspace, queued.id],
      ),
    ).rejects.toThrow(/immutable/i);
    const rows = await database.query<{ event_type: string }>(
      "SELECT event_type FROM run_events WHERE workspace_id = $1 AND run_id = $2 ORDER BY occurred_at, id",
      [domainIds.workspace, queued.id],
    );
    expect(rows.rows.map(({ event_type }) => event_type)).toEqual([
      "RUN_STARTED",
      "RUN_COMPLETED",
    ]);
  }, 60_000);
});
