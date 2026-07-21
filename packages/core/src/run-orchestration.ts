import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  applyRunEvent,
  actorSchema,
  automationActorSchema,
  createRetryRun,
  runEventSchema,
  runSchema,
  runSnapshotSchema,
  type Actor,
  type Run,
  type RunEvent,
} from "./domain.js";
import type { MigrationDatabase } from "./migrations.js";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const shortText = z.string().trim().min(1).max(500);
const boundedText = z.string().trim().min(1).max(4_000);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function hashCanonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function immutableClone<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Object.isFrozen(candidate)
    ) {
      return;
    }
    for (const nested of Object.values(candidate)) freeze(nested);
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

const nonModelActorSchema = actorSchema.refine(
  (actor) => actor.kind !== "MODEL",
  "A model cannot create a frozen run execution scope",
);

const runExecutionScopeBaseSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    runId: uuid,
    workspaceId: uuid,
    softwareId: uuid,
    requiredCheckpointIds: z.array(shortText).min(1).max(128),
    modelIdentifier: shortText,
    createdAt: timestamp,
    createdBy: nonModelActorSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (hasDuplicates(value.requiredCheckpointIds)) {
      context.addIssue({
        code: "custom",
        path: ["requiredCheckpointIds"],
        message: "Required run checkpoints must be unique",
      });
    }
  });

export function computeRunExecutionScopeHash(candidate: unknown): string {
  return hashCanonical(runExecutionScopeBaseSchema.parse(candidate));
}

export const runExecutionScopeSchema = runExecutionScopeBaseSchema
  .safeExtend({ scopeHash: sha256 })
  .superRefine((value, context) => {
    const { scopeHash: _scopeHash, ...base } = value;
    if (computeRunExecutionScopeHash(base) !== value.scopeHash) {
      context.addIssue({
        code: "custom",
        path: ["scopeHash"],
        message: "Run execution scope hash must match its canonical content",
      });
    }
  });
export type RunExecutionScope = z.infer<typeof runExecutionScopeSchema>;

export function buildRunExecutionScope(candidate: unknown): RunExecutionScope {
  const input = z
    .object({
      runId: uuid,
      workspaceId: uuid,
      softwareId: uuid,
      requiredCheckpointIds: z.array(shortText).min(1).max(128),
      modelIdentifier: shortText,
      createdAt: timestamp,
      createdBy: nonModelActorSchema,
    })
    .strict()
    .parse(candidate);
  const base = runExecutionScopeBaseSchema.parse({
    schemaVersion: "1.0.0",
    ...input,
    requiredCheckpointIds: [...input.requiredCheckpointIds],
    createdAt: new Date(input.createdAt).toISOString(),
  });
  return immutableClone(
    runExecutionScopeSchema.parse({
      ...base,
      scopeHash: computeRunExecutionScopeHash(base),
    }),
  );
}

export const runManifestObservationSchema = z
  .object({
    observationId: uuid,
    sequence: z.number().int().nonnegative(),
    source: z.enum(["BROWSER", "NETWORK", "STORAGE", "RECORDER"]),
    payloadHash: sha256,
  })
  .strict();
export type RunManifestObservation = z.infer<
  typeof runManifestObservationSchema
>;

const verifiedCoverageSchema = z
  .object({
    checkpointId: shortText,
    status: z.literal("VERIFIED"),
  })
  .strict();
const missingCoverageSchema = z
  .object({
    checkpointId: shortText,
    status: z.enum(["NOT_TESTED", "NOT_VISIBLE"]),
    reason: boundedText,
  })
  .strict();
export const runCheckpointCoverageSchema = z.discriminatedUnion("status", [
  verifiedCoverageSchema,
  missingCoverageSchema,
]);
export type RunCheckpointCoverage = z.infer<
  typeof runCheckpointCoverageSchema
>;

const terminalStatusSchema = z.enum([
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELED",
]);
export type RunTerminalStatus = z.infer<typeof terminalStatusSchema>;

const runManifestBaseSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: uuid,
    workspaceId: uuid,
    runId: uuid,
    softwareId: uuid,
    snapshot: runSnapshotSchema,
    executionScopeHash: sha256,
    modelIdentifier: shortText,
    runnerConfigVersion: shortText,
    runnerVersion: shortText,
    queuedAt: timestamp,
    startedAt: timestamp.nullable(),
    terminalAt: timestamp,
    retryOfRunId: uuid.nullable(),
    terminalStatus: terminalStatusSchema,
    requiredCheckpointIds: z.array(shortText).min(1).max(128),
    observationHashes: z.array(runManifestObservationSchema).max(10_000),
    checkpointCoverage: z.array(runCheckpointCoverageSchema).min(1).max(128),
    missingCoverage: z.array(missingCoverageSchema).max(128),
    limitations: z.array(boundedText).min(1).max(128),
    finalizedBy: automationActorSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const observationIds = value.observationHashes.map(
      (observation) => observation.observationId,
    );
    const observationSequences = value.observationHashes.map(
      (observation) => String(observation.sequence),
    );
    if (hasDuplicates(observationIds) || hasDuplicates(observationSequences)) {
      context.addIssue({
        code: "custom",
        path: ["observationHashes"],
        message: "Manifest observations must have unique IDs and sequences",
      });
    }
    if (
      value.observationHashes.some(
        (observation, index) =>
          index > 0 &&
          value.observationHashes[index - 1]!.sequence > observation.sequence,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["observationHashes"],
        message: "Manifest observations must be in canonical sequence order",
      });
    }
    const required = value.requiredCheckpointIds;
    const covered = value.checkpointCoverage.map(
      (checkpoint) => checkpoint.checkpointId,
    );
    if (
      hasDuplicates(required) ||
      hasDuplicates(covered) ||
      required.length !== covered.length ||
      required.some((checkpointId, index) => covered[index] !== checkpointId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["checkpointCoverage"],
        message: "Checkpoint coverage must exactly match frozen required coverage",
      });
    }
    const expectedMissing = value.checkpointCoverage.filter(
      (checkpoint): checkpoint is z.infer<typeof missingCoverageSchema> =>
        checkpoint.status !== "VERIFIED",
    );
    if (canonicalJson(expectedMissing) !== canonicalJson(value.missingCoverage)) {
      context.addIssue({
        code: "custom",
        path: ["missingCoverage"],
        message: "Missing coverage must be derived from checkpoint coverage",
      });
    }
    if (value.terminalStatus === "COMPLETED" && expectedMissing.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["terminalStatus"],
        message: "A completed run cannot contain missing checkpoint coverage",
      });
    }
    const verifiedCount = value.checkpointCoverage.filter(
      (checkpoint) => checkpoint.status === "VERIFIED",
    ).length;
    if (
      value.terminalStatus === "PARTIAL" &&
      (expectedMissing.length === 0 || verifiedCount === 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["terminalStatus"],
        message: "A partial run needs both captured and missing coverage",
      });
    }
    if (value.terminalStatus === "FAILED" && expectedMissing.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["terminalStatus"],
        message: "A failed run must name the coverage that did not complete",
      });
    }
    if (
      value.terminalStatus !== "CANCELED" &&
      value.startedAt === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["startedAt"],
        message: "A non-canceled terminal run must have started",
      });
    }
    const queued = Date.parse(value.queuedAt);
    const started = value.startedAt ? Date.parse(value.startedAt) : queued;
    const terminal = Date.parse(value.terminalAt);
    if (started < queued || terminal < started) {
      context.addIssue({
        code: "custom",
        path: ["terminalAt"],
        message: "Run manifest timestamps must be monotonic",
      });
    }
  });

export function computeRunManifestHash(candidate: unknown): string {
  return hashCanonical(runManifestBaseSchema.parse(candidate));
}

export const runManifestSchema = runManifestBaseSchema
  .safeExtend({ manifestHash: sha256 })
  .superRefine((value, context) => {
    const { manifestHash: _manifestHash, ...base } = value;
    if (computeRunManifestHash(base) !== value.manifestHash) {
      context.addIssue({
        code: "custom",
        path: ["manifestHash"],
        message: "Run manifest hash must match its canonical content",
      });
    }
  });
export type RunManifest = z.infer<typeof runManifestSchema>;

function startTime(run: Run): string | null {
  return (
    run.events.find((event) => event.eventType === "RUN_STARTED")?.occurredAt ??
    null
  );
}

export function buildRunManifest(candidate: unknown): RunManifest {
  const input = z
    .object({
      id: uuid,
      run: runSchema,
      scope: runExecutionScopeSchema,
      terminalStatus: terminalStatusSchema,
      runnerVersion: shortText,
      terminalAt: timestamp,
      observations: z.array(runManifestObservationSchema).max(10_000),
      coverage: z.array(runCheckpointCoverageSchema).min(1).max(128),
      limitations: z.array(boundedText).min(1).max(128),
      finalizedBy: automationActorSchema,
    })
    .strict()
    .parse(candidate);
  const validSourceState =
    input.terminalStatus === "CANCELED"
      ? input.run.state === "QUEUED" || input.run.state === "RUNNING"
      : input.run.state === "RUNNING";
  if (
    !validSourceState ||
    input.scope.runId !== input.run.id ||
    input.scope.workspaceId !== input.run.workspaceId ||
    input.scope.softwareId !== input.run.softwareId
  ) {
    throw new Error("Run manifest must match its active frozen run and scope");
  }

  const coverageByCheckpoint = new Map(
    input.coverage.map((checkpoint) => [checkpoint.checkpointId, checkpoint]),
  );
  if (
    coverageByCheckpoint.size !== input.coverage.length ||
    input.coverage.length !== input.scope.requiredCheckpointIds.length ||
    input.coverage.some(
      (checkpoint) =>
        !input.scope.requiredCheckpointIds.includes(checkpoint.checkpointId),
    )
  ) {
    throw new Error("Run manifest coverage must match the frozen checkpoint set");
  }
  const checkpointCoverage = input.scope.requiredCheckpointIds.map(
    (checkpointId) => coverageByCheckpoint.get(checkpointId)!,
  );
  const observationHashes = [...input.observations].sort(
    (left, right) =>
      left.sequence - right.sequence ||
      left.observationId.localeCompare(right.observationId),
  );
  const missingCoverage = checkpointCoverage.filter(
    (checkpoint): checkpoint is z.infer<typeof missingCoverageSchema> =>
      checkpoint.status !== "VERIFIED",
  );
  const base = runManifestBaseSchema.parse({
    schemaVersion: "1.0.0",
    id: input.id,
    workspaceId: input.run.workspaceId,
    runId: input.run.id,
    softwareId: input.run.softwareId,
    snapshot: input.run.snapshot,
    executionScopeHash: input.scope.scopeHash,
    modelIdentifier: input.scope.modelIdentifier,
    runnerConfigVersion: input.run.snapshot.runnerConfigVersion,
    runnerVersion: input.runnerVersion,
    queuedAt: input.run.queuedAt,
    startedAt: startTime(input.run),
    terminalAt: new Date(input.terminalAt).toISOString(),
    retryOfRunId: input.run.retryOfRunId ?? null,
    terminalStatus: input.terminalStatus,
    requiredCheckpointIds: input.scope.requiredCheckpointIds,
    observationHashes,
    checkpointCoverage,
    missingCoverage,
    limitations: input.limitations,
    finalizedBy: input.finalizedBy,
  });
  return immutableClone(
    runManifestSchema.parse({
      ...base,
      manifestHash: computeRunManifestHash(base),
    }),
  );
}

export interface QueueRunInput {
  readonly workspaceId: string;
  readonly softwareId: string;
  readonly snapshot: z.input<typeof runSnapshotSchema>;
  readonly requiredCheckpointIds: readonly string[];
  readonly modelIdentifier: string;
  readonly queuedBy: Actor;
  readonly idempotencyKey: string;
}

const idempotencyKeySchema = z.string().trim().min(1).max(200);
const leaseTokenSchema = z.string().min(32).max(1_000);

const runWorkerLeaseBaseSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: uuid,
    workspaceId: uuid,
    runId: uuid,
    workerId: shortText,
    tokenHash: sha256,
    acquiredAt: timestamp,
    expiresAt: timestamp,
    claimedBy: automationActorSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.expiresAt) <= Date.parse(value.acquiredAt)) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "A worker lease must expire after it is acquired",
      });
    }
  });

export function computeRunWorkerLeaseHash(candidate: unknown): string {
  return hashCanonical(runWorkerLeaseBaseSchema.parse(candidate));
}

export const runWorkerLeaseSchema = runWorkerLeaseBaseSchema
  .safeExtend({ leaseHash: sha256 })
  .superRefine((value, context) => {
    const { leaseHash: _leaseHash, ...base } = value;
    if (computeRunWorkerLeaseHash(base) !== value.leaseHash) {
      context.addIssue({
        code: "custom",
        path: ["leaseHash"],
        message: "Worker lease hash must match its canonical content",
      });
    }
  });
export type RunWorkerLease = z.infer<typeof runWorkerLeaseSchema>;

export function buildRunWorkerLease(candidate: unknown): RunWorkerLease {
  const input = z
    .object({
      id: uuid,
      workspaceId: uuid,
      runId: uuid,
      workerId: shortText,
      tokenHash: sha256,
      acquiredAt: timestamp,
      expiresAt: timestamp,
      claimedBy: automationActorSchema,
    })
    .strict()
    .parse(candidate);
  const base = runWorkerLeaseBaseSchema.parse({
    schemaVersion: "1.0.0",
    ...input,
    acquiredAt: new Date(input.acquiredAt).toISOString(),
    expiresAt: new Date(input.expiresAt).toISOString(),
  });
  return immutableClone(
    runWorkerLeaseSchema.parse({
      ...base,
      leaseHash: computeRunWorkerLeaseHash(base),
    }),
  );
}

export interface ClaimedRun {
  readonly run: Run;
  readonly scope: RunExecutionScope;
  readonly lease: RunWorkerLease;
  readonly leaseToken: string;
}

export interface FinalizedRun {
  readonly run: Run;
  readonly scope: RunExecutionScope;
  readonly lease?: RunWorkerLease;
  readonly manifest: RunManifest;
}

export interface RunRetry {
  readonly run: Run;
  readonly scope: RunExecutionScope;
}

export interface RunHistoryEntry {
  readonly run: Run;
  readonly scope: RunExecutionScope;
  readonly lease?: RunWorkerLease;
  readonly manifest?: RunManifest;
}

type StoredClaim = Omit<ClaimedRun, "leaseToken">;

interface StoredCommand {
  readonly commandType: string;
  readonly requestHash: string;
  readonly result: unknown;
}

interface CommandLookup {
  readonly found: boolean;
  readonly result?: unknown;
}

interface PreparedCommand {
  readonly workspaceId: string;
  readonly idempotencyKey: string;
  readonly commandType: string;
  readonly requestHash: string;
}

interface PreparedQueue extends PreparedCommand {
  readonly run: Run;
  readonly scope: RunExecutionScope;
}

interface PreparedClaim extends PreparedCommand {
  readonly leaseId: string;
  readonly eventId: string;
  readonly workerId: string;
  readonly tokenHash: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
  readonly actor: z.infer<typeof automationActorSchema>;
}

interface PreparedFinalization extends PreparedCommand {
  readonly runId: string;
  readonly tokenHash?: string;
  readonly event: RunEvent;
  readonly manifest: RunManifest;
  readonly requireLease: boolean;
}

interface PreparedIntegrityFailure extends PreparedCommand {
  readonly runId: string;
  readonly tokenHash?: string;
  readonly requireExpiredLease: boolean;
  readonly checkedAt: string;
  readonly event: RunEvent;
}

interface PreparedRetry extends PreparedCommand {
  readonly sourceRunId: string;
  readonly run: Run;
  readonly scope: RunExecutionScope;
}

export interface RunOrchestrationRepository {
  lookupCommand(command: PreparedCommand): Promise<CommandLookup>;
  queuePrepared(command: PreparedQueue): Promise<Run>;
  claimPrepared(command: PreparedClaim): Promise<StoredClaim | undefined>;
  finalizePrepared(command: PreparedFinalization): Promise<FinalizedRun>;
  failPrepared(command: PreparedIntegrityFailure): Promise<Run>;
  retryPrepared(command: PreparedRetry): Promise<RunRetry>;
  getHistoryEntry(
    workspaceId: string,
    runId: string,
  ): Promise<RunHistoryEntry | undefined>;
  getManifest(
    workspaceId: string,
    runId: string,
  ): Promise<RunManifest | undefined>;
  listHistory(
    workspaceId: string,
    softwareId: string,
  ): Promise<readonly RunHistoryEntry[]>;
}

export class RunOrchestrationConflictError extends Error {
  readonly code = "RUN_ORCHESTRATION_CONFLICT";
  readonly status = 409;

  constructor(message = "Run orchestration command conflicts with stored state") {
    super(message);
    this.name = "RunOrchestrationConflictError";
  }
}

export class RunLeaseError extends Error {
  readonly code = "RUN_LEASE_INVALID";
  readonly status = 409;

  constructor(message = "The run worker lease is missing, expired, or invalid") {
    super(message);
    this.name = "RunLeaseError";
  }
}

function commandKey(workspaceId: string, idempotencyKey: string): string {
  return `${uuid.parse(workspaceId)}:${idempotencyKeySchema.parse(idempotencyKey)}`;
}

function commandHash(value: unknown): string {
  return hashCanonical(value);
}

function tokenHash(token: string): string {
  return createHash("sha256")
    .update(leaseTokenSchema.parse(token), "utf8")
    .digest("hex");
}

function validateStoredCommand(
  stored: StoredCommand | undefined,
  command: PreparedCommand,
): CommandLookup {
  if (!stored) return { found: false };
  if (
    stored.commandType !== command.commandType ||
    stored.requestHash !== command.requestHash
  ) {
    throw new RunOrchestrationConflictError(
      "An idempotency key cannot be reused for a different run command",
    );
  }
  return { found: true, result: immutableClone(stored.result) };
}

function eventForTerminalStatus(
  run: Run,
  input: {
    readonly eventId: string;
    readonly terminalStatus: RunTerminalStatus;
    readonly actor: Actor;
    readonly occurredAt: string;
    readonly manifestHash: string;
  },
): RunEvent {
  const eventType =
    input.terminalStatus === "COMPLETED"
      ? "RUN_COMPLETED"
      : input.terminalStatus === "PARTIAL"
        ? "RUN_PARTIAL"
        : input.terminalStatus === "FAILED"
          ? "RUN_FAILED"
          : "RUN_CANCELED";
  return runEventSchema.parse({
    eventId: input.eventId,
    eventType,
    workspaceId: run.workspaceId,
    runId: run.id,
    from: run.state,
    to: input.terminalStatus,
    actor: input.actor,
    occurredAt: input.occurredAt,
    manifestHash: input.manifestHash,
  });
}

function parseNonModelActor(candidate: unknown): Actor {
  const actor = actorSchema.parse(candidate);
  if (actor.kind === "MODEL") {
    throw new TypeError("A model cannot queue, cancel, or retry a run");
  }
  return actor;
}

function finalizationResult(candidate: unknown): FinalizedRun {
  const result = z
    .object({
      run: runSchema,
      scope: runExecutionScopeSchema,
      lease: runWorkerLeaseSchema.optional(),
      manifest: runManifestSchema,
    })
    .strict()
    .parse(candidate);
  return immutableClone({
    run: result.run,
    scope: result.scope,
    ...(result.lease ? { lease: result.lease } : {}),
    manifest: result.manifest,
  });
}

function retryResult(candidate: unknown): RunRetry {
  return immutableClone(
    z
      .object({ run: runSchema, scope: runExecutionScopeSchema })
      .strict()
      .parse(candidate),
  );
}

function claimResult(candidate: unknown): StoredClaim | undefined {
  if (candidate === null || candidate === undefined) return undefined;
  return immutableClone(
    z
      .object({
        run: runSchema,
        scope: runExecutionScopeSchema,
        lease: runWorkerLeaseSchema,
      })
      .strict()
      .parse(candidate),
  );
}

export class InMemoryRunOrchestrationRepository
  implements RunOrchestrationRepository
{
  readonly #commands = new Map<string, StoredCommand>();
  readonly #leases = new Map<string, RunWorkerLease>();
  readonly #manifests = new Map<string, RunManifest>();
  readonly #runs = new Map<string, Run>();
  readonly #scopes = new Map<string, RunExecutionScope>();
  #writeTail: Promise<void> = Promise.resolve();

  async #exclusive<T>(work: () => T): Promise<T> {
    const prior = this.#writeTail;
    let release: (() => void) | undefined;
    this.#writeTail = new Promise((resolve) => {
      release = resolve;
    });
    await prior;
    try {
      return work();
    } finally {
      release?.();
    }
  }

  lookupCommand(command: PreparedCommand): Promise<CommandLookup> {
    const key = commandKey(command.workspaceId, command.idempotencyKey);
    return Promise.resolve(
      validateStoredCommand(this.#commands.get(key), command),
    );
  }

  queuePrepared(command: PreparedQueue): Promise<Run> {
    return this.#exclusive(() => {
      const key = commandKey(command.workspaceId, command.idempotencyKey);
      const existing = validateStoredCommand(this.#commands.get(key), command);
      if (existing.found) return runSchema.parse(existing.result);
      const run = runSchema.parse(command.run);
      const scope = runExecutionScopeSchema.parse(command.scope);
      const runKey = `${run.workspaceId}:${run.id}`;
      if (
        this.#runs.has(runKey) ||
        scope.runId !== run.id ||
        scope.workspaceId !== run.workspaceId ||
        scope.softwareId !== run.softwareId
      ) {
        throw new RunOrchestrationConflictError();
      }
      this.#runs.set(runKey, immutableClone(run));
      this.#scopes.set(runKey, immutableClone(scope));
      this.#commands.set(key, {
        commandType: command.commandType,
        requestHash: command.requestHash,
        result: immutableClone(run),
      });
      return immutableClone(run);
    });
  }

  claimPrepared(command: PreparedClaim): Promise<StoredClaim | undefined> {
    return this.#exclusive(() => {
      const key = commandKey(command.workspaceId, command.idempotencyKey);
      const existing = validateStoredCommand(this.#commands.get(key), command);
      if (existing.found) return claimResult(existing.result);
      const queued = [...this.#runs.values()]
        .filter(
          (run) =>
            run.workspaceId === command.workspaceId && run.state === "QUEUED",
        )
        .sort(
          (left, right) =>
            left.queuedAt.localeCompare(right.queuedAt) ||
            left.id.localeCompare(right.id),
        )[0];
      if (!queued) {
        this.#commands.set(key, {
          commandType: command.commandType,
          requestHash: command.requestHash,
          result: null,
        });
        return undefined;
      }
      const event = runEventSchema.parse({
        eventId: command.eventId,
        eventType: "RUN_STARTED",
        workspaceId: queued.workspaceId,
        runId: queued.id,
        from: "QUEUED",
        to: "RUNNING",
        actor: command.actor,
        occurredAt: command.acquiredAt,
      });
      const running = applyRunEvent(queued, event);
      const lease = buildRunWorkerLease({
        id: command.leaseId,
        workspaceId: queued.workspaceId,
        runId: queued.id,
        workerId: command.workerId,
        tokenHash: command.tokenHash,
        acquiredAt: command.acquiredAt,
        expiresAt: command.expiresAt,
        claimedBy: command.actor,
      });
      const runKey = `${queued.workspaceId}:${queued.id}`;
      const scope = this.#scopes.get(runKey);
      if (!scope) throw new RunOrchestrationConflictError();
      const result = immutableClone({ run: running, scope, lease });
      this.#runs.set(runKey, immutableClone(running));
      this.#leases.set(runKey, immutableClone(lease));
      this.#commands.set(key, {
        commandType: command.commandType,
        requestHash: command.requestHash,
        result,
      });
      return result;
    });
  }

  finalizePrepared(command: PreparedFinalization): Promise<FinalizedRun> {
    return this.#exclusive(() => {
      const key = commandKey(command.workspaceId, command.idempotencyKey);
      const existing = validateStoredCommand(this.#commands.get(key), command);
      if (existing.found) return finalizationResult(existing.result);
      const runKey = `${command.workspaceId}:${command.runId}`;
      const current = this.#runs.get(runKey);
      const scope = this.#scopes.get(runKey);
      const lease = this.#leases.get(runKey);
      if (!current || !scope) throw new RunOrchestrationConflictError();
      if (command.requireLease) {
        if (
          !lease ||
          lease.tokenHash !== command.tokenHash ||
          Date.parse(command.event.occurredAt) > Date.parse(lease.expiresAt)
        ) {
          throw new RunLeaseError();
        }
      }
      if (
        command.manifest.runId !== current.id ||
        command.manifest.executionScopeHash !== scope.scopeHash ||
        command.event.from !== current.state ||
        command.event.manifestHash !== command.manifest.manifestHash
      ) {
        throw new RunOrchestrationConflictError();
      }
      const terminal = applyRunEvent(current, command.event);
      const result = immutableClone({
        run: terminal,
        scope,
        ...(lease ? { lease } : {}),
        manifest: command.manifest,
      });
      this.#runs.set(runKey, immutableClone(terminal));
      this.#manifests.set(runKey, immutableClone(command.manifest));
      this.#commands.set(key, {
        commandType: command.commandType,
        requestHash: command.requestHash,
        result,
      });
      return result;
    });
  }

  failPrepared(command: PreparedIntegrityFailure): Promise<Run> {
    return this.#exclusive(() => {
      const key = commandKey(command.workspaceId, command.idempotencyKey);
      const existing = validateStoredCommand(this.#commands.get(key), command);
      if (existing.found) return runSchema.parse(existing.result);
      const runKey = `${command.workspaceId}:${command.runId}`;
      const current = this.#runs.get(runKey);
      const lease = this.#leases.get(runKey);
      if (!current || !lease || current.state !== "RUNNING") {
        throw new RunOrchestrationConflictError();
      }
      const validLease = command.requireExpiredLease
        ? Date.parse(command.checkedAt) > Date.parse(lease.expiresAt)
        : lease.tokenHash === command.tokenHash &&
          Date.parse(command.checkedAt) <= Date.parse(lease.expiresAt);
      if (!validLease) throw new RunLeaseError();
      const terminal = applyRunEvent(current, command.event);
      this.#runs.set(runKey, immutableClone(terminal));
      this.#commands.set(key, {
        commandType: command.commandType,
        requestHash: command.requestHash,
        result: immutableClone(terminal),
      });
      return immutableClone(terminal);
    });
  }

  retryPrepared(command: PreparedRetry): Promise<RunRetry> {
    return this.#exclusive(() => {
      const key = commandKey(command.workspaceId, command.idempotencyKey);
      const existing = validateStoredCommand(this.#commands.get(key), command);
      if (existing.found) return retryResult(existing.result);
      const sourceKey = `${command.workspaceId}:${command.sourceRunId}`;
      const source = this.#runs.get(sourceKey);
      const sourceScope = this.#scopes.get(sourceKey);
      const retry = runSchema.parse(command.run);
      const scope = runExecutionScopeSchema.parse(command.scope);
      const retryKey = `${retry.workspaceId}:${retry.id}`;
      if (
        !source ||
        !sourceScope ||
        this.#runs.has(retryKey) ||
        retry.retryOfRunId !== source.id ||
        canonicalJson(retry.snapshot) !== canonicalJson(source.snapshot) ||
        scope.runId !== retry.id ||
        canonicalJson(scope.requiredCheckpointIds) !==
          canonicalJson(sourceScope.requiredCheckpointIds) ||
        scope.modelIdentifier !== sourceScope.modelIdentifier
      ) {
        throw new RunOrchestrationConflictError();
      }
      const result = immutableClone({ run: retry, scope });
      this.#runs.set(retryKey, immutableClone(retry));
      this.#scopes.set(retryKey, immutableClone(scope));
      this.#commands.set(key, {
        commandType: command.commandType,
        requestHash: command.requestHash,
        result,
      });
      return result;
    });
  }

  getHistoryEntry(
    workspaceIdCandidate: string,
    runIdCandidate: string,
  ): Promise<RunHistoryEntry | undefined> {
    const key = `${uuid.parse(workspaceIdCandidate)}:${uuid.parse(runIdCandidate)}`;
    const run = this.#runs.get(key);
    const scope = this.#scopes.get(key);
    if (!run || !scope) return Promise.resolve(undefined);
    const lease = this.#leases.get(key);
    const manifest = this.#manifests.get(key);
    return Promise.resolve(
      immutableClone({
        run,
        scope,
        ...(lease ? { lease } : {}),
        ...(manifest ? { manifest } : {}),
      }),
    );
  }

  getManifest(
    workspaceIdCandidate: string,
    runIdCandidate: string,
  ): Promise<RunManifest | undefined> {
    const key = `${uuid.parse(workspaceIdCandidate)}:${uuid.parse(runIdCandidate)}`;
    const manifest = this.#manifests.get(key);
    return Promise.resolve(manifest ? immutableClone(manifest) : undefined);
  }

  listHistory(
    workspaceIdCandidate: string,
    softwareIdCandidate: string,
  ): Promise<readonly RunHistoryEntry[]> {
    const workspaceId = uuid.parse(workspaceIdCandidate);
    const softwareId = uuid.parse(softwareIdCandidate);
    return Promise.resolve(
      immutableClone(
        [...this.#runs.values()]
          .filter(
            (run) =>
              run.workspaceId === workspaceId && run.softwareId === softwareId,
          )
          .sort(
            (left, right) =>
              right.queuedAt.localeCompare(left.queuedAt) ||
              right.id.localeCompare(left.id),
          )
          .map((run) => {
            const key = `${run.workspaceId}:${run.id}`;
            const scope = this.#scopes.get(key)!;
            const lease = this.#leases.get(key);
            const manifest = this.#manifests.get(key);
            return {
              run,
              scope,
              ...(lease ? { lease } : {}),
              ...(manifest ? { manifest } : {}),
            };
          }),
      ),
    );
  }
}

function timestampValue(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function jsonValue<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

interface RunRow {
  readonly workspace_id: string;
  readonly id: string;
  readonly software_id: string;
  readonly state: Run["state"];
  readonly agreement_version_id: string;
  readonly journey_version_id: string;
  readonly authorization_id: string;
  readonly runner_config_version: string;
  readonly snapshot_hash: string;
  readonly retry_of_run_id: string | null;
  readonly queued_at: string | Date;
  readonly terminal_at: string | Date | null;
  readonly manifest_hash: string | null;
  readonly integrity_failure: unknown;
}

interface RunEventRow {
  readonly id: string;
  readonly event_type: RunEvent["eventType"];
  readonly workspace_id: string;
  readonly run_id: string;
  readonly source_run_id: string | null;
  readonly previous_state: RunEvent["from"];
  readonly next_state: RunEvent["to"];
  readonly actor: unknown;
  readonly occurred_at: string | Date;
  readonly manifest_hash: string | null;
  readonly integrity_failure: unknown;
}

interface PayloadRow {
  readonly payload: unknown;
}

interface CommandRow {
  readonly command_type: string;
  readonly request_hash: string;
  readonly result_payload: unknown;
}

async function runEventsFromDatabase(
  database: MigrationDatabase,
  workspaceId: string,
  runId: string,
): Promise<readonly RunEvent[]> {
  const rows = await database.query<RunEventRow>(
    "SELECT id, event_type, workspace_id, run_id, source_run_id, previous_state, next_state, actor, occurred_at, manifest_hash, integrity_failure FROM run_events WHERE workspace_id = $1 AND run_id = $2 ORDER BY occurred_at, id",
    [workspaceId, runId],
  );
  return rows.rows.map((row) =>
    runEventSchema.parse({
      eventId: row.id,
      eventType: row.event_type,
      workspaceId: row.workspace_id,
      runId: row.run_id,
      ...(row.source_run_id ? { sourceRunId: row.source_run_id } : {}),
      from: row.previous_state,
      to: row.next_state,
      actor: jsonValue(row.actor),
      occurredAt: timestampValue(row.occurred_at),
      ...(row.manifest_hash ? { manifestHash: row.manifest_hash } : {}),
      ...(row.integrity_failure
        ? { integrityFailure: jsonValue(row.integrity_failure) }
        : {}),
    }),
  );
}

async function runFromDatabase(
  database: MigrationDatabase,
  workspaceId: string,
  runId: string,
  lock = false,
): Promise<Run | undefined> {
  const rows = await database.query<RunRow>(
    `SELECT workspace_id, id, software_id, state, agreement_version_id, journey_version_id, authorization_id, runner_config_version, snapshot_hash, retry_of_run_id, queued_at, terminal_at, manifest_hash, integrity_failure FROM runs WHERE workspace_id = $1 AND id = $2${lock ? " FOR UPDATE" : ""}`,
    [workspaceId, runId],
  );
  const row = rows.rows[0];
  if (!row) return undefined;
  const events = await runEventsFromDatabase(database, workspaceId, runId);
  return runSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    softwareId: row.software_id,
    state: row.state,
    snapshot: {
      agreementVersionId: row.agreement_version_id,
      journeyVersionId: row.journey_version_id,
      authorizationId: row.authorization_id,
      runnerConfigVersion: row.runner_config_version,
      snapshotHash: row.snapshot_hash,
    },
    ...(row.retry_of_run_id ? { retryOfRunId: row.retry_of_run_id } : {}),
    events,
    queuedAt: timestampValue(row.queued_at),
    ...(row.terminal_at ? { terminalAt: timestampValue(row.terminal_at) } : {}),
    ...(row.manifest_hash ? { manifestHash: row.manifest_hash } : {}),
    ...(row.integrity_failure
      ? { integrityFailure: jsonValue(row.integrity_failure) }
      : {}),
  });
}

async function payloadFromDatabase<T>(
  database: MigrationDatabase,
  sql: string,
  params: readonly unknown[],
  parse: (value: unknown) => T,
): Promise<T | undefined> {
  const rows = await database.query<PayloadRow>(sql, params);
  const payload = rows.rows[0]?.payload;
  return payload === undefined ? undefined : parse(jsonValue(payload));
}

async function insertRunEvent(
  database: MigrationDatabase,
  event: RunEvent,
): Promise<void> {
  await database.query(
    "INSERT INTO run_events (workspace_id, id, run_id, source_run_id, event_type, previous_state, next_state, actor_kind, actor, occurred_at, manifest_hash, integrity_failure) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
    [
      event.workspaceId,
      event.eventId,
      event.runId,
      event.sourceRunId ?? null,
      event.eventType,
      event.from,
      event.to,
      event.actor.kind,
      event.actor,
      event.occurredAt,
      event.manifestHash ?? null,
      event.integrityFailure ?? null,
    ],
  );
}

async function insertRun(
  database: MigrationDatabase,
  run: Run,
): Promise<void> {
  await database.query(
    "INSERT INTO runs (workspace_id, id, software_id, state, agreement_version_id, journey_version_id, authorization_id, runner_config_version, snapshot_hash, retry_of_run_id, queued_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
    [
      run.workspaceId,
      run.id,
      run.softwareId,
      run.state,
      run.snapshot.agreementVersionId,
      run.snapshot.journeyVersionId,
      run.snapshot.authorizationId,
      run.snapshot.runnerConfigVersion,
      run.snapshot.snapshotHash,
      run.retryOfRunId ?? null,
      run.queuedAt,
    ],
  );
}

async function insertScope(
  database: MigrationDatabase,
  scope: RunExecutionScope,
): Promise<void> {
  await database.query(
    "INSERT INTO run_execution_scopes (workspace_id, run_id, software_id, scope_hash, model_identifier, required_checkpoint_ids, payload, created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [
      scope.workspaceId,
      scope.runId,
      scope.softwareId,
      scope.scopeHash,
      scope.modelIdentifier,
      scope.requiredCheckpointIds,
      scope,
      scope.createdAt,
      scope.createdBy,
    ],
  );
}

function resultRunId(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null;
  const record = result as Readonly<Record<string, unknown>>;
  if (typeof record["id"] === "string") return record["id"];
  const run = record["run"];
  return typeof run === "object" && run !== null && "id" in run
    ? String(run.id)
    : null;
}

export class PostgresRunOrchestrationRepository
  implements RunOrchestrationRepository
{
  readonly #database: MigrationDatabase;

  constructor(database: MigrationDatabase) {
    this.#database = database;
  }

  async #storedCommand(command: PreparedCommand): Promise<StoredCommand | undefined> {
    const rows = await this.#database.query<CommandRow>(
      "SELECT command_type, request_hash, result_payload FROM run_orchestration_commands WHERE workspace_id = $1 AND idempotency_key = $2",
      [
        uuid.parse(command.workspaceId),
        idempotencyKeySchema.parse(command.idempotencyKey),
      ],
    );
    const row = rows.rows[0];
    return row
      ? {
          commandType: row.command_type,
          requestHash: row.request_hash,
          result: jsonValue(row.result_payload),
        }
      : undefined;
  }

  async #insertCommand(
    command: PreparedCommand,
    result: unknown,
    createdAt: string,
  ): Promise<void> {
    await this.#database.query(
      "INSERT INTO run_orchestration_commands (workspace_id, idempotency_key, command_type, request_hash, run_id, result_payload, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [
        command.workspaceId,
        command.idempotencyKey,
        command.commandType,
        command.requestHash,
        resultRunId(result),
        result ?? null,
        createdAt,
      ],
    );
  }

  async #transaction<T>(work: () => Promise<T>): Promise<T> {
    await this.#database.exec("BEGIN");
    try {
      const result = await work();
      await this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async lookupCommand(command: PreparedCommand): Promise<CommandLookup> {
    return validateStoredCommand(await this.#storedCommand(command), command);
  }

  queuePrepared(command: PreparedQueue): Promise<Run> {
    return this.#transaction(async () => {
      const existing = validateStoredCommand(
        await this.#storedCommand(command),
        command,
      );
      if (existing.found) return runSchema.parse(existing.result);
      const run = runSchema.parse(command.run);
      const scope = runExecutionScopeSchema.parse(command.scope);
      await insertRun(this.#database, run);
      await insertScope(this.#database, scope);
      await this.#insertCommand(command, run, run.queuedAt);
      return immutableClone(run);
    });
  }

  claimPrepared(command: PreparedClaim): Promise<StoredClaim | undefined> {
    return this.#transaction(async () => {
      const existing = validateStoredCommand(
        await this.#storedCommand(command),
        command,
      );
      if (existing.found) return claimResult(existing.result);
      const rows = await this.#database.query<{ id: string }>(
        "SELECT id FROM runs WHERE workspace_id = $1 AND state = 'QUEUED' ORDER BY queued_at, id LIMIT 1 FOR UPDATE SKIP LOCKED",
        [command.workspaceId],
      );
      const runId = rows.rows[0]?.id;
      if (!runId) {
        await this.#insertCommand(command, null, command.acquiredAt);
        return undefined;
      }
      const queued = await runFromDatabase(
        this.#database,
        command.workspaceId,
        runId,
      );
      const scope = await payloadFromDatabase(
        this.#database,
        "SELECT payload FROM run_execution_scopes WHERE workspace_id = $1 AND run_id = $2",
        [command.workspaceId, runId],
        (value) => runExecutionScopeSchema.parse(value),
      );
      if (!queued || !scope) throw new RunOrchestrationConflictError();
      const event = runEventSchema.parse({
        eventId: command.eventId,
        eventType: "RUN_STARTED",
        workspaceId: queued.workspaceId,
        runId: queued.id,
        from: "QUEUED",
        to: "RUNNING",
        actor: command.actor,
        occurredAt: command.acquiredAt,
      });
      const running = applyRunEvent(queued, event);
      const lease = buildRunWorkerLease({
        id: command.leaseId,
        workspaceId: queued.workspaceId,
        runId: queued.id,
        workerId: command.workerId,
        tokenHash: command.tokenHash,
        acquiredAt: command.acquiredAt,
        expiresAt: command.expiresAt,
        claimedBy: command.actor,
      });
      await this.#database.query(
        "UPDATE runs SET state = 'RUNNING' WHERE workspace_id = $1 AND id = $2 AND state = 'QUEUED'",
        [queued.workspaceId, queued.id],
      );
      await insertRunEvent(this.#database, event);
      await this.#database.query(
        "INSERT INTO run_worker_leases (workspace_id, id, run_id, worker_id, token_hash, lease_hash, payload, acquired_at, expires_at, claimed_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        [
          lease.workspaceId,
          lease.id,
          lease.runId,
          lease.workerId,
          lease.tokenHash,
          lease.leaseHash,
          lease,
          lease.acquiredAt,
          lease.expiresAt,
          lease.claimedBy,
        ],
      );
      const result = immutableClone({ run: running, scope, lease });
      await this.#insertCommand(command, result, command.acquiredAt);
      return result;
    });
  }

  finalizePrepared(command: PreparedFinalization): Promise<FinalizedRun> {
    return this.#transaction(async () => {
      const existing = validateStoredCommand(
        await this.#storedCommand(command),
        command,
      );
      if (existing.found) return finalizationResult(existing.result);
      const current = await runFromDatabase(
        this.#database,
        command.workspaceId,
        command.runId,
        true,
      );
      const scope = await payloadFromDatabase(
        this.#database,
        "SELECT payload FROM run_execution_scopes WHERE workspace_id = $1 AND run_id = $2",
        [command.workspaceId, command.runId],
        (value) => runExecutionScopeSchema.parse(value),
      );
      const lease = await payloadFromDatabase(
        this.#database,
        "SELECT payload FROM run_worker_leases WHERE workspace_id = $1 AND run_id = $2",
        [command.workspaceId, command.runId],
        (value) => runWorkerLeaseSchema.parse(value),
      );
      if (!current || !scope) throw new RunOrchestrationConflictError();
      if (
        command.requireLease &&
        (!lease ||
          lease.tokenHash !== command.tokenHash ||
          Date.parse(command.event.occurredAt) > Date.parse(lease.expiresAt))
      ) {
        throw new RunLeaseError();
      }
      if (
        command.manifest.runId !== current.id ||
        command.manifest.executionScopeHash !== scope.scopeHash ||
        command.event.from !== current.state ||
        command.event.manifestHash !== command.manifest.manifestHash
      ) {
        throw new RunOrchestrationConflictError();
      }
      const terminal = applyRunEvent(current, command.event);
      await this.#database.query(
        "INSERT INTO run_manifests (workspace_id, id, run_id, software_id, terminal_status, manifest_hash, payload, finalized_at, finalized_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [
          command.manifest.workspaceId,
          command.manifest.id,
          command.manifest.runId,
          command.manifest.softwareId,
          command.manifest.terminalStatus,
          command.manifest.manifestHash,
          command.manifest,
          command.manifest.terminalAt,
          command.manifest.finalizedBy,
        ],
      );
      await this.#database.query(
        "UPDATE runs SET state = $3, terminal_at = $4, manifest_hash = $5, integrity_failure = NULL WHERE workspace_id = $1 AND id = $2",
        [
          terminal.workspaceId,
          terminal.id,
          terminal.state,
          terminal.terminalAt,
          terminal.manifestHash,
        ],
      );
      await insertRunEvent(this.#database, command.event);
      const result = immutableClone({
        run: terminal,
        scope,
        ...(lease ? { lease } : {}),
        manifest: command.manifest,
      });
      await this.#insertCommand(command, result, command.event.occurredAt);
      return finalizationResult(result);
    });
  }

  failPrepared(command: PreparedIntegrityFailure): Promise<Run> {
    return this.#transaction(async () => {
      const existing = validateStoredCommand(
        await this.#storedCommand(command),
        command,
      );
      if (existing.found) return runSchema.parse(existing.result);
      const current = await runFromDatabase(
        this.#database,
        command.workspaceId,
        command.runId,
        true,
      );
      const lease = await payloadFromDatabase(
        this.#database,
        "SELECT payload FROM run_worker_leases WHERE workspace_id = $1 AND run_id = $2",
        [command.workspaceId, command.runId],
        (value) => runWorkerLeaseSchema.parse(value),
      );
      if (!current || !lease || current.state !== "RUNNING") {
        throw new RunOrchestrationConflictError();
      }
      const validLease = command.requireExpiredLease
        ? Date.parse(command.checkedAt) > Date.parse(lease.expiresAt)
        : lease.tokenHash === command.tokenHash &&
          Date.parse(command.checkedAt) <= Date.parse(lease.expiresAt);
      if (!validLease) throw new RunLeaseError();
      const terminal = applyRunEvent(current, command.event);
      await this.#database.query(
        "UPDATE runs SET state = $3, terminal_at = $4, manifest_hash = NULL, integrity_failure = $5 WHERE workspace_id = $1 AND id = $2",
        [
          terminal.workspaceId,
          terminal.id,
          terminal.state,
          terminal.terminalAt,
          terminal.integrityFailure,
        ],
      );
      await insertRunEvent(this.#database, command.event);
      await this.#insertCommand(command, terminal, command.checkedAt);
      return immutableClone(terminal);
    });
  }

  retryPrepared(command: PreparedRetry): Promise<RunRetry> {
    return this.#transaction(async () => {
      const existing = validateStoredCommand(
        await this.#storedCommand(command),
        command,
      );
      if (existing.found) return retryResult(existing.result);
      const source = await runFromDatabase(
        this.#database,
        command.workspaceId,
        command.sourceRunId,
        true,
      );
      const sourceScope = await payloadFromDatabase(
        this.#database,
        "SELECT payload FROM run_execution_scopes WHERE workspace_id = $1 AND run_id = $2",
        [command.workspaceId, command.sourceRunId],
        (value) => runExecutionScopeSchema.parse(value),
      );
      const run = runSchema.parse(command.run);
      const scope = runExecutionScopeSchema.parse(command.scope);
      if (
        !source ||
        !sourceScope ||
        run.retryOfRunId !== source.id ||
        canonicalJson(run.snapshot) !== canonicalJson(source.snapshot) ||
        canonicalJson(scope.requiredCheckpointIds) !==
          canonicalJson(sourceScope.requiredCheckpointIds) ||
        scope.modelIdentifier !== sourceScope.modelIdentifier
      ) {
        throw new RunOrchestrationConflictError();
      }
      await insertRun(this.#database, run);
      await insertScope(this.#database, scope);
      await insertRunEvent(this.#database, run.events[0]!);
      const result = immutableClone({ run, scope });
      await this.#insertCommand(command, result, run.queuedAt);
      return result;
    });
  }

  async getHistoryEntry(
    workspaceIdCandidate: string,
    runIdCandidate: string,
  ): Promise<RunHistoryEntry | undefined> {
    const workspaceId = uuid.parse(workspaceIdCandidate);
    const runId = uuid.parse(runIdCandidate);
    const run = await runFromDatabase(this.#database, workspaceId, runId);
    if (!run) return undefined;
    const [scope, lease, manifest] = await Promise.all([
      payloadFromDatabase(
        this.#database,
        "SELECT payload FROM run_execution_scopes WHERE workspace_id = $1 AND run_id = $2",
        [workspaceId, runId],
        (value) => runExecutionScopeSchema.parse(value),
      ),
      payloadFromDatabase(
        this.#database,
        "SELECT payload FROM run_worker_leases WHERE workspace_id = $1 AND run_id = $2",
        [workspaceId, runId],
        (value) => runWorkerLeaseSchema.parse(value),
      ),
      payloadFromDatabase(
        this.#database,
        "SELECT payload FROM run_manifests WHERE workspace_id = $1 AND run_id = $2",
        [workspaceId, runId],
        (value) => runManifestSchema.parse(value),
      ),
    ]);
    if (!scope) throw new RunOrchestrationConflictError();
    return immutableClone({
      run,
      scope,
      ...(lease ? { lease } : {}),
      ...(manifest ? { manifest } : {}),
    });
  }

  getManifest(
    workspaceIdCandidate: string,
    runIdCandidate: string,
  ): Promise<RunManifest | undefined> {
    return payloadFromDatabase(
      this.#database,
      "SELECT payload FROM run_manifests WHERE workspace_id = $1 AND run_id = $2",
      [uuid.parse(workspaceIdCandidate), uuid.parse(runIdCandidate)],
      (value) => runManifestSchema.parse(value),
    );
  }

  async listHistory(
    workspaceIdCandidate: string,
    softwareIdCandidate: string,
  ): Promise<readonly RunHistoryEntry[]> {
    const workspaceId = uuid.parse(workspaceIdCandidate);
    const softwareId = uuid.parse(softwareIdCandidate);
    const rows = await this.#database.query<{ id: string }>(
      "SELECT id FROM runs WHERE workspace_id = $1 AND software_id = $2 ORDER BY queued_at DESC, id DESC",
      [workspaceId, softwareId],
    );
    const history = await Promise.all(
      rows.rows.map((row) => this.getHistoryEntry(workspaceId, row.id)),
    );
    return immutableClone(
      history.filter((entry): entry is RunHistoryEntry => entry !== undefined),
    );
  }
}

interface RunOrchestrationOptions {
  readonly idFactory?: () => string;
  readonly now?: () => string;
  readonly leaseDurationMs?: number;
}

export class RunOrchestrationService {
  readonly #idFactory: () => string;
  readonly #leaseDurationMs: number;
  readonly #now: () => string;
  readonly #repository: RunOrchestrationRepository;

  constructor(
    repository: RunOrchestrationRepository,
    options: RunOrchestrationOptions = {},
  ) {
    this.#repository = repository;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#leaseDurationMs = z
      .number()
      .int()
      .min(1_000)
      .max(86_400_000)
      .parse(options.leaseDurationMs ?? 300_000);
  }

  async #existing<T>(
    command: PreparedCommand,
    parse: (candidate: unknown) => T,
  ): Promise<T | undefined> {
    const lookup = await this.#repository.lookupCommand(command);
    return lookup.found ? parse(lookup.result) : undefined;
  }

  async queueRun(candidate: QueueRunInput): Promise<Run> {
    const input = z
      .object({
        workspaceId: uuid,
        softwareId: uuid,
        snapshot: runSnapshotSchema,
        requiredCheckpointIds: z.array(shortText).min(1).max(128),
        modelIdentifier: shortText,
        queuedBy: actorSchema,
        idempotencyKey: idempotencyKeySchema,
      })
      .strict()
      .parse(candidate);
    const queuedBy = parseNonModelActor(input.queuedBy);
    const command: PreparedCommand = {
      workspaceId: input.workspaceId,
      idempotencyKey: input.idempotencyKey,
      commandType: "QUEUE_RUN",
      requestHash: commandHash({ ...input, queuedBy }),
    };
    const existing = await this.#existing(command, (value) =>
      runSchema.parse(value),
    );
    if (existing) return immutableClone(existing);
    const queuedAt = new Date(this.#now()).toISOString();
    const runId = uuid.parse(this.#idFactory());
    const run = runSchema.parse({
      id: runId,
      workspaceId: input.workspaceId,
      softwareId: input.softwareId,
      state: "QUEUED",
      snapshot: input.snapshot,
      events: [],
      queuedAt,
    });
    const scope = buildRunExecutionScope({
      runId,
      workspaceId: run.workspaceId,
      softwareId: run.softwareId,
      requiredCheckpointIds: input.requiredCheckpointIds,
      modelIdentifier: input.modelIdentifier,
      createdAt: queuedAt,
      createdBy: queuedBy,
    });
    return this.#repository.queuePrepared({ ...command, run, scope });
  }

  async claimNext(candidate: unknown): Promise<ClaimedRun | undefined> {
    const input = z
      .object({
        workspaceId: uuid,
        workerId: shortText,
        leaseToken: leaseTokenSchema,
        actor: automationActorSchema,
        idempotencyKey: idempotencyKeySchema,
      })
      .strict()
      .parse(candidate);
    const hashedToken = tokenHash(input.leaseToken);
    const command: PreparedCommand = {
      workspaceId: input.workspaceId,
      idempotencyKey: input.idempotencyKey,
      commandType: "CLAIM_NEXT",
      requestHash: commandHash({
        workspaceId: input.workspaceId,
        workerId: input.workerId,
        tokenHash: hashedToken,
        actor: input.actor,
      }),
    };
    const existing = await this.#repository.lookupCommand(command);
    if (existing.found) {
      const stored = claimResult(existing.result);
      return stored
        ? immutableClone({ ...stored, leaseToken: input.leaseToken })
        : undefined;
    }
    const acquiredAt = new Date(this.#now()).toISOString();
    const expiresAt = new Date(
      Date.parse(acquiredAt) + this.#leaseDurationMs,
    ).toISOString();
    const claimed = await this.#repository.claimPrepared({
      ...command,
      leaseId: uuid.parse(this.#idFactory()),
      eventId: uuid.parse(this.#idFactory()),
      workerId: input.workerId,
      tokenHash: hashedToken,
      acquiredAt,
      expiresAt,
      actor: input.actor,
    });
    return claimed
      ? immutableClone({ ...claimed, leaseToken: input.leaseToken })
      : undefined;
  }

  async finalizeRun(candidate: unknown): Promise<FinalizedRun> {
    const input = z
      .object({
        workspaceId: uuid,
        runId: uuid,
        leaseToken: leaseTokenSchema,
        terminalStatus: z.enum(["COMPLETED", "PARTIAL", "FAILED"]),
        runnerVersion: shortText,
        observations: z.array(runManifestObservationSchema).max(10_000),
        coverage: z.array(runCheckpointCoverageSchema).min(1).max(128),
        limitations: z.array(boundedText).min(1).max(128),
        actor: automationActorSchema,
        idempotencyKey: idempotencyKeySchema,
      })
      .strict()
      .parse(candidate);
    return this.#finalizeWithManifest({
      ...input,
      commandType: "FINALIZE_RUN",
      eventActor: input.actor,
      finalizedBy: input.actor,
      requireLease: true,
      tokenHash: tokenHash(input.leaseToken),
    });
  }

  async cancelRun(candidate: unknown): Promise<FinalizedRun> {
    const input = z
      .object({
        workspaceId: uuid,
        runId: uuid,
        runnerVersion: shortText,
        observations: z.array(runManifestObservationSchema).max(10_000),
        coverage: z.array(runCheckpointCoverageSchema).min(1).max(128),
        limitations: z.array(boundedText).min(1).max(128),
        requestedBy: actorSchema,
        finalizedBy: automationActorSchema,
        idempotencyKey: idempotencyKeySchema,
      })
      .strict()
      .parse(candidate);
    const requestedBy = parseNonModelActor(input.requestedBy);
    return this.#finalizeWithManifest({
      workspaceId: input.workspaceId,
      runId: input.runId,
      terminalStatus: "CANCELED",
      runnerVersion: input.runnerVersion,
      observations: input.observations,
      coverage: input.coverage,
      limitations: input.limitations,
      idempotencyKey: input.idempotencyKey,
      commandType: "CANCEL_RUN",
      eventActor: requestedBy,
      finalizedBy: input.finalizedBy,
      requireLease: false,
    });
  }

  async #finalizeWithManifest(input: {
    readonly workspaceId: string;
    readonly runId: string;
    readonly terminalStatus: RunTerminalStatus;
    readonly runnerVersion: string;
    readonly observations: readonly RunManifestObservation[];
    readonly coverage: readonly RunCheckpointCoverage[];
    readonly limitations: readonly string[];
    readonly idempotencyKey: string;
    readonly commandType: string;
    readonly eventActor: Actor;
    readonly finalizedBy: z.infer<typeof automationActorSchema>;
    readonly requireLease: boolean;
    readonly tokenHash?: string;
  }): Promise<FinalizedRun> {
    const requestHash = commandHash({
      workspaceId: input.workspaceId,
      runId: input.runId,
      terminalStatus: input.terminalStatus,
      runnerVersion: input.runnerVersion,
      observations: input.observations,
      coverage: input.coverage,
      limitations: input.limitations,
      eventActor: input.eventActor,
      finalizedBy: input.finalizedBy,
      requireLease: input.requireLease,
      tokenHash: input.tokenHash,
    });
    const command: PreparedCommand = {
      workspaceId: input.workspaceId,
      idempotencyKey: input.idempotencyKey,
      commandType: input.commandType,
      requestHash,
    };
    const existing = await this.#existing(command, finalizationResult);
    if (existing) return existing;
    const entry = await this.#repository.getHistoryEntry(
      input.workspaceId,
      input.runId,
    );
    if (!entry) throw new RunOrchestrationConflictError("Run was not found");
    const terminalAt = new Date(this.#now()).toISOString();
    const manifest = buildRunManifest({
      id: uuid.parse(this.#idFactory()),
      run: entry.run,
      scope: entry.scope,
      terminalStatus: input.terminalStatus,
      runnerVersion: input.runnerVersion,
      terminalAt,
      observations: input.observations,
      coverage: input.coverage,
      limitations: input.limitations,
      finalizedBy: input.finalizedBy,
    });
    const event = eventForTerminalStatus(entry.run, {
      eventId: uuid.parse(this.#idFactory()),
      terminalStatus: input.terminalStatus,
      actor: input.eventActor,
      occurredAt: terminalAt,
      manifestHash: manifest.manifestHash,
    });
    return this.#repository.finalizePrepared({
      ...command,
      runId: input.runId,
      ...(input.tokenHash ? { tokenHash: input.tokenHash } : {}),
      event,
      manifest,
      requireLease: input.requireLease,
    });
  }

  async failExpiredLease(candidate: unknown): Promise<Run> {
    const input = z
      .object({
        workspaceId: uuid,
        runId: uuid,
        actor: automationActorSchema,
        idempotencyKey: idempotencyKeySchema,
      })
      .strict()
      .parse(candidate);
    return this.#failWithIntegrity({
      ...input,
      commandType: "FAIL_EXPIRED_LEASE",
      terminalStatus: "FAILED",
      failure: {
        code: "WORKER_LEASE_EXPIRED",
        message:
          "The worker lease expired before a terminal manifest could be finalized.",
      },
      requireExpiredLease: true,
    });
  }

  async failRunIntegrity(candidate: unknown): Promise<Run> {
    const input = z
      .object({
        workspaceId: uuid,
        runId: uuid,
        leaseToken: leaseTokenSchema,
        terminalStatus: z.enum(["PARTIAL", "FAILED"]),
        code: shortText,
        message: boundedText,
        actor: automationActorSchema,
        idempotencyKey: idempotencyKeySchema,
      })
      .strict()
      .parse(candidate);
    return this.#failWithIntegrity({
      workspaceId: input.workspaceId,
      runId: input.runId,
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
      commandType: "FAIL_RUN_INTEGRITY",
      terminalStatus: input.terminalStatus,
      failure: { code: input.code, message: input.message },
      requireExpiredLease: false,
      tokenHash: tokenHash(input.leaseToken),
    });
  }

  async #failWithIntegrity(input: {
    readonly workspaceId: string;
    readonly runId: string;
    readonly actor: z.infer<typeof automationActorSchema>;
    readonly idempotencyKey: string;
    readonly commandType: string;
    readonly terminalStatus: "PARTIAL" | "FAILED";
    readonly failure: { readonly code: string; readonly message: string };
    readonly requireExpiredLease: boolean;
    readonly tokenHash?: string;
  }): Promise<Run> {
    const requestHash = commandHash({
      workspaceId: input.workspaceId,
      runId: input.runId,
      actor: input.actor,
      terminalStatus: input.terminalStatus,
      failure: input.failure,
      requireExpiredLease: input.requireExpiredLease,
      tokenHash: input.tokenHash,
    });
    const command: PreparedCommand = {
      workspaceId: input.workspaceId,
      idempotencyKey: input.idempotencyKey,
      commandType: input.commandType,
      requestHash,
    };
    const existing = await this.#existing(command, (value) =>
      runSchema.parse(value),
    );
    if (existing) return immutableClone(existing);
    const entry = await this.#repository.getHistoryEntry(
      input.workspaceId,
      input.runId,
    );
    if (!entry) throw new RunOrchestrationConflictError("Run was not found");
    const checkedAt = new Date(this.#now()).toISOString();
    const event = runEventSchema.parse({
      eventId: uuid.parse(this.#idFactory()),
      eventType:
        input.terminalStatus === "PARTIAL" ? "RUN_PARTIAL" : "RUN_FAILED",
      workspaceId: entry.run.workspaceId,
      runId: entry.run.id,
      from: entry.run.state,
      to: input.terminalStatus,
      actor: input.actor,
      occurredAt: checkedAt,
      integrityFailure: input.failure,
    });
    return this.#repository.failPrepared({
      ...command,
      runId: input.runId,
      ...(input.tokenHash ? { tokenHash: input.tokenHash } : {}),
      requireExpiredLease: input.requireExpiredLease,
      checkedAt,
      event,
    });
  }

  async retryRun(candidate: unknown): Promise<RunRetry> {
    const input = z
      .object({
        workspaceId: uuid,
        sourceRunId: uuid,
        requestedBy: actorSchema,
        idempotencyKey: idempotencyKeySchema,
      })
      .strict()
      .parse(candidate);
    const requestedBy = parseNonModelActor(input.requestedBy);
    const command: PreparedCommand = {
      workspaceId: input.workspaceId,
      idempotencyKey: input.idempotencyKey,
      commandType: "RETRY_RUN",
      requestHash: commandHash({
        workspaceId: input.workspaceId,
        sourceRunId: input.sourceRunId,
        requestedBy,
      }),
    };
    const existing = await this.#existing(command, retryResult);
    if (existing) return existing;
    const source = await this.#repository.getHistoryEntry(
      input.workspaceId,
      input.sourceRunId,
    );
    if (!source) throw new RunOrchestrationConflictError("Source run was not found");
    const queuedAt = new Date(this.#now()).toISOString();
    const run = createRetryRun(source.run, {
      id: uuid.parse(this.#idFactory()),
      eventId: uuid.parse(this.#idFactory()),
      queuedAt,
      actor: requestedBy,
    });
    const scope = buildRunExecutionScope({
      runId: run.id,
      workspaceId: run.workspaceId,
      softwareId: run.softwareId,
      requiredCheckpointIds: source.scope.requiredCheckpointIds,
      modelIdentifier: source.scope.modelIdentifier,
      createdAt: queuedAt,
      createdBy: requestedBy,
    });
    return this.#repository.retryPrepared({
      ...command,
      sourceRunId: input.sourceRunId,
      run,
      scope,
    });
  }
}
