import { createHash } from "node:crypto";
import { z } from "zod";
import {
  auditEventSchema,
  authorizationActionSchema,
  humanActorSchema,
  journeyVersionSchema,
  runSnapshotSchema,
  type AuditEvent,
  type JourneyVersion,
  type RunSnapshot,
} from "./domain.js";
import type { MigrationDatabase } from "./migrations.js";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const shortText = z.string().trim().min(1).max(240);
const relativePath = z
  .string()
  .trim()
  .min(1)
  .max(1_024)
  .regex(/^\/(?!\/)/u)
  .refine((value) => !value.includes("://"), {
    message: "Replay navigation must stay relative to the authorized base URL",
  })
  .refine(
    (value) => {
      if (value.includes("\\")) return false;
      const authorizedOrigin = "https://authorized.pactwire.invalid";
      return new URL(value, authorizedOrigin).origin === authorizedOrigin;
    },
    {
      message: "Replay paths cannot escape the authorized base origin",
    },
  );

export const replayLocatorSchema = z
  .object({
    kind: z.literal("TEST_ID"),
    value: shortText,
  })
  .strict();
export type ReplayLocator = z.infer<typeof replayLocatorSchema>;

export const deterministicReplayBindingSchema = z
  .object({
    bindingId: shortText,
    journeyFieldId: shortText,
  })
  .strict();
export type DeterministicReplayBinding = z.infer<
  typeof deterministicReplayBindingSchema
>;

const navigateOperationSchema = z
  .object({
    operationId: shortText,
    kind: z.literal("NAVIGATE"),
    authorizedAction: authorizationActionSchema,
    path: relativePath,
    expectedStatus: z.number().int().min(100).max(599),
  })
  .strict();

const assertValueOperationSchema = z
  .object({
    operationId: shortText,
    kind: z.literal("ASSERT_VALUE"),
    locator: replayLocatorSchema,
    bindingId: shortText,
  })
  .strict();

const fillOperationSchema = z
  .object({
    operationId: shortText,
    kind: z.literal("FILL"),
    authorizedAction: authorizationActionSchema,
    locator: replayLocatorSchema,
    bindingId: shortText,
  })
  .strict();

const clickOperationSchema = z
  .object({
    operationId: shortText,
    kind: z.literal("CLICK"),
    authorizedAction: authorizationActionSchema,
    locator: replayLocatorSchema,
  })
  .strict();

export const replayCheckpointAssertionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("RESPONSE"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
      path: relativePath,
      status: z.number().int().min(100).max(599),
    })
    .strict(),
  z
    .object({
      kind: z.literal("VISIBLE_TEXT"),
      locator: replayLocatorSchema,
      text: shortText,
    })
    .strict(),
]);
export type ReplayCheckpointAssertion = z.infer<
  typeof replayCheckpointAssertionSchema
>;

const checkpointOperationSchema = z
  .object({
    operationId: shortText,
    kind: z.literal("CHECKPOINT"),
    checkpointId: shortText,
    assertion: replayCheckpointAssertionSchema,
  })
  .strict();

const assertTextOperationSchema = z
  .object({
    operationId: shortText,
    kind: z.literal("ASSERT_TEXT"),
    locator: replayLocatorSchema,
    text: shortText,
  })
  .strict();

export const deterministicReplayOperationSchema = z.discriminatedUnion("kind", [
  navigateOperationSchema,
  assertValueOperationSchema,
  fillOperationSchema,
  clickOperationSchema,
  checkpointOperationSchema,
  assertTextOperationSchema,
]);
export type DeterministicReplayOperation = z.infer<
  typeof deterministicReplayOperationSchema
>;

export const deterministicReplayDraftSchema = z
  .object({
    bindings: z.array(deterministicReplayBindingSchema).min(1).max(32),
    operations: z.array(deterministicReplayOperationSchema).min(1).max(128),
  })
  .strict();
export type DeterministicReplayDraft = z.infer<
  typeof deterministicReplayDraftSchema
>;

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function hashCanonical(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

export function computeReplaySnapshotHash(
  snapshot: Omit<RunSnapshot, "snapshotHash">,
  journeyHash: string,
): string {
  return hashCanonical({ ...snapshot, journeyHash });
}

export function computeDeterministicReplayHash(
  candidate: Readonly<Record<string, unknown>>,
): string {
  const { replayHash: _ignored, ...content } = candidate;
  return hashCanonical(content);
}

export const deterministicReplayVersionSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: uuid,
    workspaceId: uuid,
    softwareId: uuid,
    agreementVersionId: uuid,
    journeyVersionId: uuid,
    authorizationId: uuid,
    replayId: uuid,
    version: z.number().int().positive(),
    sourceVersionId: uuid.nullable(),
    arm: z.literal("HUMAN_AUTHORED_DETERMINISTIC"),
    modelInvocationCount: z.literal(0),
    journeyHash: sha256,
    replayHash: sha256,
    snapshot: runSnapshotSchema,
    allowedActions: z.array(authorizationActionSchema).min(1),
    requiredCheckpointIds: z.array(shortText).min(1),
    bindings: z.array(deterministicReplayBindingSchema).min(1).max(32),
    operations: z.array(deterministicReplayOperationSchema).min(1).max(128),
    createdAt: timestamp,
    createdBy: humanActorSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.version === 1 && value.sourceVersionId !== null) ||
      (value.version > 1 && value.sourceVersionId === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceVersionId"],
        message: "Replay lineage must start at null and later versions need a source",
      });
    }
    const bindingIds = value.bindings.map((binding) => binding.bindingId);
    const journeyFieldIds = value.bindings.map(
      (binding) => binding.journeyFieldId,
    );
    const operationIds = value.operations.map(
      (operation) => operation.operationId,
    );
    const checkpointIds = value.operations
      .filter(
        (operation): operation is Extract<
          DeterministicReplayOperation,
          { kind: "CHECKPOINT" }
        > => operation.kind === "CHECKPOINT",
      )
      .map((operation) => operation.checkpointId);
    if (
      hasDuplicates(bindingIds) ||
      hasDuplicates(journeyFieldIds) ||
      hasDuplicates(operationIds) ||
      hasDuplicates(checkpointIds) ||
      hasDuplicates(value.allowedActions) ||
      hasDuplicates(value.requiredCheckpointIds)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Replay bindings, fields, operations, checkpoints, and actions must be unique",
      });
    }
    const knownBindings = new Set(bindingIds);
    const referencedBindings = new Set<string>();
    for (const operation of value.operations) {
      if (operation.kind === "FILL" || operation.kind === "ASSERT_VALUE") {
        referencedBindings.add(operation.bindingId);
        if (!knownBindings.has(operation.bindingId)) {
          context.addIssue({
            code: "custom",
            path: ["operations"],
            message: "Every replay value reference needs a declared binding",
          });
        }
      }
      if (
        (operation.kind === "NAVIGATE" ||
          operation.kind === "FILL" ||
          operation.kind === "CLICK") &&
        !value.allowedActions.includes(operation.authorizedAction)
      ) {
        context.addIssue({
          code: "custom",
          path: ["operations"],
          message: "Replay actions cannot exceed the frozen journey action scope",
        });
      }
    }
    if (bindingIds.some((bindingId) => !referencedBindings.has(bindingId))) {
      context.addIssue({
        code: "custom",
        path: ["bindings"],
        message: "Every replay binding must be used by an operation",
      });
    }
    if (
      JSON.stringify([...checkpointIds].sort()) !==
      JSON.stringify([...value.requiredCheckpointIds].sort())
    ) {
      context.addIssue({
        code: "custom",
        path: ["operations"],
        message: "Every required journey checkpoint needs one replay assertion",
      });
    }
    if (
      value.snapshot.agreementVersionId !== value.agreementVersionId ||
      value.snapshot.journeyVersionId !== value.journeyVersionId ||
      value.snapshot.authorizationId !== value.authorizationId
    ) {
      context.addIssue({
        code: "custom",
        path: ["snapshot"],
        message: "Replay snapshot scope must match the saved replay",
      });
    }
    const expectedSnapshotHash = computeReplaySnapshotHash(
      {
        agreementVersionId: value.snapshot.agreementVersionId,
        journeyVersionId: value.snapshot.journeyVersionId,
        authorizationId: value.snapshot.authorizationId,
        runnerConfigVersion: value.snapshot.runnerConfigVersion,
      },
      value.journeyHash,
    );
    if (value.snapshot.snapshotHash !== expectedSnapshotHash) {
      context.addIssue({
        code: "custom",
        path: ["snapshot", "snapshotHash"],
        message: "Replay snapshot hash must bind the frozen journey scope",
      });
    }
    if (
      value.replayHash !==
      computeDeterministicReplayHash(value)
    ) {
      context.addIssue({
        code: "custom",
        path: ["replayHash"],
        message: "Replay hash must match the canonical saved content",
      });
    }
  });
export type DeterministicReplayVersion = z.infer<
  typeof deterministicReplayVersionSchema
>;

const buildReplayInputSchema = z
  .object({
    id: uuid,
    replayId: uuid,
    version: z.number().int().positive(),
    sourceVersionId: uuid.nullable(),
    journey: journeyVersionSchema,
    runnerConfigVersion: shortText,
    draft: deterministicReplayDraftSchema,
    createdAt: timestamp,
    createdBy: humanActorSchema,
  })
  .strict();

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

function equalSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value) => right.includes(value))
  );
}

function validateAgainstJourney(
  journey: JourneyVersion,
  draft: DeterministicReplayDraft,
): void {
  const journeyFieldIds = journey.testFields.map((field) => field.fieldId);
  const replayFieldIds = draft.bindings.map((binding) => binding.journeyFieldId);
  if (!equalSet(journeyFieldIds, replayFieldIds)) {
    throw new Error("Replay bindings must cover every fictional journey field exactly once");
  }
  const requiredCheckpoints = journey.checkpoints.filter(
    (checkpoint) => checkpoint.required,
  );
  const checkpointOperations = draft.operations.filter(
    (operation): operation is Extract<
      DeterministicReplayOperation,
      { kind: "CHECKPOINT" }
    > => operation.kind === "CHECKPOINT",
  );
  if (
    !equalSet(
      requiredCheckpoints.map((checkpoint) => checkpoint.checkpointId),
      checkpointOperations.map((operation) => operation.checkpointId),
    )
  ) {
    throw new Error("Every required journey checkpoint needs one replay assertion");
  }
  for (const checkpoint of requiredCheckpoints) {
    const operation = checkpointOperations.find(
      (candidate) => candidate.checkpointId === checkpoint.checkpointId,
    );
    if (
      !operation ||
      (checkpoint.observationSource === "NETWORK" &&
        operation.assertion.kind !== "RESPONSE") ||
      (checkpoint.observationSource !== "NETWORK" &&
        operation.assertion.kind !== "VISIBLE_TEXT")
    ) {
      throw new Error(
        "Replay checkpoint assertions must match the journey observation source",
      );
    }
  }
}

export function buildDeterministicReplayVersion(
  candidate: unknown,
): DeterministicReplayVersion {
  const input = buildReplayInputSchema.parse(candidate);
  validateAgainstJourney(input.journey, input.draft);
  const journeyHash = hashCanonical(input.journey);
  const snapshotWithoutHash = {
    agreementVersionId: input.journey.agreementVersionId,
    journeyVersionId: input.journey.id,
    authorizationId: input.journey.authorizationId,
    runnerConfigVersion: input.runnerConfigVersion,
  };
  const base = {
    schemaVersion: "1.0.0" as const,
    id: input.id,
    workspaceId: input.journey.workspaceId,
    softwareId: input.journey.softwareId,
    agreementVersionId: input.journey.agreementVersionId,
    journeyVersionId: input.journey.id,
    authorizationId: input.journey.authorizationId,
    replayId: input.replayId,
    version: input.version,
    sourceVersionId: input.sourceVersionId,
    arm: "HUMAN_AUTHORED_DETERMINISTIC" as const,
    modelInvocationCount: 0 as const,
    journeyHash,
    snapshot: {
      ...snapshotWithoutHash,
      snapshotHash: computeReplaySnapshotHash(
        snapshotWithoutHash,
        journeyHash,
      ),
    },
    allowedActions: [...input.journey.allowedActions],
    requiredCheckpointIds: input.journey.checkpoints
      .filter((checkpoint) => checkpoint.required)
      .map((checkpoint) => checkpoint.checkpointId),
    bindings: input.draft.bindings,
    operations: input.draft.operations,
    createdAt: new Date(input.createdAt).toISOString(),
    createdBy: input.createdBy,
  };
  const version = deterministicReplayVersionSchema.parse({
    ...base,
    replayHash: computeDeterministicReplayHash(base),
  });
  return immutableClone(version);
}

export interface DeterministicReplayRepository {
  appendVersion(
    version: DeterministicReplayVersion,
    audit: AuditEvent,
  ): Promise<DeterministicReplayVersion>;
  getVersion(
    workspaceId: string,
    softwareId: string,
    versionId: string,
  ): Promise<DeterministicReplayVersion | undefined>;
  listVersions(
    workspaceId: string,
    softwareId: string,
    journeyVersionId: string,
  ): Promise<readonly DeterministicReplayVersion[]>;
}

export class ReplayVersionConflictError extends Error {
  readonly code = "REPLAY_VERSION_CONFLICT";
  readonly status = 409;

  constructor() {
    super("A replay version must append to the current immutable version");
    this.name = "ReplayVersionConflictError";
  }
}

function validateReplayAppend(
  source: DeterministicReplayVersion | undefined,
  latest: DeterministicReplayVersion | undefined,
  version: DeterministicReplayVersion,
  audit: AuditEvent,
): void {
  const initial = version.version === 1 && version.sourceVersionId === null;
  const appended =
    source !== undefined &&
    latest?.id === source.id &&
    version.sourceVersionId === source.id &&
    version.version === source.version + 1 &&
    version.replayId === source.replayId &&
    version.workspaceId === source.workspaceId &&
    version.softwareId === source.softwareId &&
    version.journeyVersionId === source.journeyVersionId &&
    version.snapshot.snapshotHash === source.snapshot.snapshotHash;
  if (!initial && !appended) throw new ReplayVersionConflictError();
  if (
    audit.workspaceId !== version.workspaceId ||
    audit.subjectType !== "deterministic_replay_version" ||
    audit.subjectId !== version.id ||
    audit.actor.kind !== "HUMAN" ||
    audit.actor.actorId !== version.createdBy.actorId
  ) {
    throw new TypeError("Replay version and audit must share one human subject");
  }
}

export class InMemoryDeterministicReplayRepository
  implements DeterministicReplayRepository
{
  readonly #versions: DeterministicReplayVersion[] = [];
  #writeTail: Promise<void> = Promise.resolve();
  readonly #auditSink:
    | { appendAuditEvent(audit: AuditEvent): Promise<void> }
    | undefined;

  constructor(auditSink?: { appendAuditEvent(audit: AuditEvent): Promise<void> }) {
    this.#auditSink = auditSink;
  }

  async appendVersion(
    versionCandidate: DeterministicReplayVersion,
    auditCandidate: AuditEvent,
  ): Promise<DeterministicReplayVersion> {
    const version = deterministicReplayVersionSchema.parse(versionCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    const priorWrite = this.#writeTail;
    let releaseWrite: (() => void) | undefined;
    this.#writeTail = new Promise((resolve) => {
      releaseWrite = resolve;
    });
    await priorWrite;
    try {
      const source = version.sourceVersionId
        ? this.#versions.find(
            (candidate) =>
              candidate.workspaceId === version.workspaceId &&
              candidate.softwareId === version.softwareId &&
              candidate.id === version.sourceVersionId,
          )
        : undefined;
      const latest = this.#versions
        .filter(
          (candidate) =>
            candidate.workspaceId === version.workspaceId &&
            candidate.softwareId === version.softwareId &&
            candidate.replayId === version.replayId,
        )
        .sort((left, right) => right.version - left.version)[0];
      if (
        (version.version === 1 && latest !== undefined) ||
        this.#versions.some(
          (candidate) =>
            candidate.workspaceId === version.workspaceId &&
            candidate.id === version.id,
        )
      ) {
        throw new ReplayVersionConflictError();
      }
      validateReplayAppend(source, latest, version, audit);
      if (this.#auditSink) await this.#auditSink.appendAuditEvent(audit);
      this.#versions.push(immutableClone(version));
      return immutableClone(version);
    } finally {
      releaseWrite?.();
    }
  }

  getVersion(
    workspaceIdCandidate: string,
    softwareIdCandidate: string,
    versionIdCandidate: string,
  ): Promise<DeterministicReplayVersion | undefined> {
    const workspaceId = uuid.parse(workspaceIdCandidate);
    const softwareId = uuid.parse(softwareIdCandidate);
    const versionId = uuid.parse(versionIdCandidate);
    const found = this.#versions.find(
      (version) =>
        version.workspaceId === workspaceId &&
        version.softwareId === softwareId &&
        version.id === versionId,
    );
    return Promise.resolve(found ? immutableClone(found) : undefined);
  }

  listVersions(
    workspaceIdCandidate: string,
    softwareIdCandidate: string,
    journeyVersionIdCandidate: string,
  ): Promise<readonly DeterministicReplayVersion[]> {
    const workspaceId = uuid.parse(workspaceIdCandidate);
    const softwareId = uuid.parse(softwareIdCandidate);
    const journeyVersionId = uuid.parse(journeyVersionIdCandidate);
    return Promise.resolve(
      immutableClone(
        this.#versions
          .filter(
            (version) =>
              version.workspaceId === workspaceId &&
              version.softwareId === softwareId &&
              version.journeyVersionId === journeyVersionId,
          )
          .sort(
            (left, right) =>
              right.version - left.version ||
              right.createdAt.localeCompare(left.createdAt),
          ),
      ),
    );
  }
}

interface ReplayPayloadRow {
  readonly payload: unknown;
}

function jsonValue<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

export class PostgresDeterministicReplayRepository
  implements DeterministicReplayRepository
{
  readonly #database: MigrationDatabase;

  constructor(database: MigrationDatabase) {
    this.#database = database;
  }

  async #insertAudit(audit: AuditEvent): Promise<void> {
    await this.#database.query(
      "INSERT INTO audit_events (workspace_id, id, subject_type, subject_id, action, actor_kind, actor, occurred_at, details) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [
        audit.workspaceId,
        audit.eventId,
        audit.subjectType,
        audit.subjectId,
        audit.action,
        audit.actor.kind,
        audit.actor,
        audit.occurredAt,
        audit.details,
      ],
    );
  }

  async appendVersion(
    versionCandidate: DeterministicReplayVersion,
    auditCandidate: AuditEvent,
  ): Promise<DeterministicReplayVersion> {
    const version = deterministicReplayVersionSchema.parse(versionCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    await this.#database.exec("BEGIN");
    try {
      const sourceResult = version.sourceVersionId
        ? await this.#database.query<ReplayPayloadRow>(
            "SELECT payload FROM deterministic_replay_versions WHERE workspace_id = $1 AND software_id = $2 AND id = $3 FOR UPDATE",
            [version.workspaceId, version.softwareId, version.sourceVersionId],
          )
        : { rows: [] };
      const latestResult = await this.#database.query<ReplayPayloadRow>(
        "SELECT payload FROM deterministic_replay_versions WHERE workspace_id = $1 AND software_id = $2 AND replay_id = $3 ORDER BY version DESC LIMIT 1 FOR UPDATE",
        [version.workspaceId, version.softwareId, version.replayId],
      );
      const sourcePayload = sourceResult.rows[0]?.payload;
      const latestPayload = latestResult.rows[0]?.payload;
      const source =
        sourcePayload === undefined
          ? undefined
          : deterministicReplayVersionSchema.parse(jsonValue(sourcePayload));
      const latest =
        latestPayload === undefined
          ? undefined
          : deterministicReplayVersionSchema.parse(jsonValue(latestPayload));
      if (version.version === 1 && latest !== undefined) {
        throw new ReplayVersionConflictError();
      }
      validateReplayAppend(source, latest, version, audit);
      await this.#database.query(
        "INSERT INTO deterministic_replay_versions (workspace_id, id, software_id, agreement_version_id, journey_version_id, authorization_id, replay_id, version, source_replay_version_id, replay_hash, snapshot_hash, payload, created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
        [
          version.workspaceId,
          version.id,
          version.softwareId,
          version.agreementVersionId,
          version.journeyVersionId,
          version.authorizationId,
          version.replayId,
          version.version,
          version.sourceVersionId,
          version.replayHash,
          version.snapshot.snapshotHash,
          version,
          version.createdAt,
          version.createdBy,
        ],
      );
      await this.#insertAudit(audit);
      await this.#database.exec("COMMIT");
      return immutableClone(version);
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async getVersion(
    workspaceIdCandidate: string,
    softwareIdCandidate: string,
    versionIdCandidate: string,
  ): Promise<DeterministicReplayVersion | undefined> {
    const result = await this.#database.query<ReplayPayloadRow>(
      "SELECT payload FROM deterministic_replay_versions WHERE workspace_id = $1 AND software_id = $2 AND id = $3",
      [
        uuid.parse(workspaceIdCandidate),
        uuid.parse(softwareIdCandidate),
        uuid.parse(versionIdCandidate),
      ],
    );
    const payload = result.rows[0]?.payload;
    return payload === undefined
      ? undefined
      : immutableClone(
          deterministicReplayVersionSchema.parse(jsonValue(payload)),
        );
  }

  async listVersions(
    workspaceIdCandidate: string,
    softwareIdCandidate: string,
    journeyVersionIdCandidate: string,
  ): Promise<readonly DeterministicReplayVersion[]> {
    const result = await this.#database.query<ReplayPayloadRow>(
      "SELECT payload FROM deterministic_replay_versions WHERE workspace_id = $1 AND software_id = $2 AND journey_version_id = $3 ORDER BY version DESC, created_at DESC, id DESC",
      [
        uuid.parse(workspaceIdCandidate),
        uuid.parse(softwareIdCandidate),
        uuid.parse(journeyVersionIdCandidate),
      ],
    );
    return immutableClone(
      result.rows.map((row) =>
        deterministicReplayVersionSchema.parse(jsonValue(row.payload)),
      ),
    );
  }
}
