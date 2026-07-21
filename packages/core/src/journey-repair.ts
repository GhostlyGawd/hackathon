import { createHash } from "node:crypto";
import { z } from "zod";
import {
  automationActorSchema,
  humanActorSchema,
  journeyVersionSchema,
  modelActorSchema,
} from "./domain.js";
import {
  buildDeterministicReplayVersion,
  deterministicReplayDraftSchema,
  deterministicReplayVersionSchema,
  type DeterministicReplayOperation,
  type DeterministicReplayVersion,
} from "./deterministic-replay.js";
import type { MigrationDatabase } from "./migrations.js";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const boundedText = z.string().trim().min(1).max(4_000);
const shortText = z.string().trim().min(1).max(500);

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

function equal(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
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

export const journeyRepairChangeSchema = z
  .object({
    operationId: shortText,
    field: z.enum(["path", "locator"]),
    before: shortText,
    after: shortText,
  })
  .strict();
export type JourneyRepairChange = z.infer<typeof journeyRepairChangeSchema>;

export const journeyRepairViolationCodeSchema = z.enum([
  "NO_CANDIDATE",
  "NO_REPAIR_CHANGE",
  "BINDING_SCOPE_CHANGED",
  "OPERATION_SET_CHANGED",
  "OPERATION_KIND_CHANGED",
  "ACTION_SCOPE_CHANGED",
  "CHECKPOINT_CONTRACT_CHANGED",
  "ASSERTION_CONTRACT_CHANGED",
  "OPERATION_CONTRACT_CHANGED",
]);
export type JourneyRepairViolationCode = z.infer<
  typeof journeyRepairViolationCodeSchema
>;

export const journeyRepairViolationSchema = z
  .object({
    code: journeyRepairViolationCodeSchema,
    operationId: shortText.nullable(),
    message: shortText,
  })
  .strict();
export type JourneyRepairViolation = z.infer<
  typeof journeyRepairViolationSchema
>;

export const journeyRepairDraftStatusSchema = z.enum([
  "BOUNDED_DRAFT",
  "HUMAN_REVIEW_REQUIRED",
  "UNRESOLVED",
]);
export type JourneyRepairDraftStatus = z.infer<
  typeof journeyRepairDraftStatusSchema
>;

const journeyRepairDraftBaseSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: uuid,
    workspaceId: uuid,
    softwareId: uuid,
    journeyVersionId: uuid,
    authorizationId: uuid,
    sourceReplayVersionId: uuid,
    sourceReplayHash: z.string().regex(/^[a-f0-9]{64}$/u),
    sourceSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/u),
    requiredCheckpointIds: z.array(shortText).min(1).max(64),
    status: journeyRepairDraftStatusSchema,
    diagnosis: boundedText,
    candidate: deterministicReplayDraftSchema.nullable(),
    changes: z.array(journeyRepairChangeSchema).max(128),
    violations: z.array(journeyRepairViolationSchema).max(128),
    modelInvocationCount: z.number().int().positive().max(1_000),
    proposedBy: modelActorSchema.extend({ model: z.literal("gpt-5.6-sol") }),
    createdAt: timestamp,
  })
  .strict();

export function computeJourneyRepairHash(
  candidate: z.infer<typeof journeyRepairDraftBaseSchema>,
): string {
  return createHash("sha256")
    .update(canonicalJson(candidate), "utf8")
    .digest("hex");
}

export const journeyRepairDraftSchema = journeyRepairDraftBaseSchema
  .extend({
    repairHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict()
  .superRefine((value, context) => {
    const { repairHash: _repairHash, ...base } = value;
    if (computeJourneyRepairHash(base) !== value.repairHash) {
      context.addIssue({
        code: "custom",
        path: ["repairHash"],
        message: "Repair hash must match the canonical draft",
      });
    }
    if (
      value.status === "BOUNDED_DRAFT" &&
      (value.candidate === null ||
        value.changes.length === 0 ||
        value.violations.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "A bounded repair needs a changed candidate without violations",
      });
    }
  });
export type JourneyRepairDraft = z.infer<typeof journeyRepairDraftSchema>;

function withoutKey(
  operation: DeterministicReplayOperation,
  key: "path" | "locator",
): Readonly<Record<string, unknown>> {
  const record = operation as unknown as Readonly<Record<string, unknown>>;
  return Object.fromEntries(Object.entries(record).filter(([field]) => field !== key));
}

function addViolation(
  violations: JourneyRepairViolation[],
  code: JourneyRepairViolationCode,
  message: string,
  operationId: string | null = null,
): void {
  if (
    violations.some(
      (violation) =>
        violation.code === code && violation.operationId === operationId,
    )
  ) {
    return;
  }
  violations.push({ code, operationId, message });
}

function assessOperation(
  source: DeterministicReplayOperation,
  candidate: DeterministicReplayOperation,
  changes: JourneyRepairChange[],
  violations: JourneyRepairViolation[],
): void {
  if (source.operationId !== candidate.operationId) {
    addViolation(
      violations,
      "OPERATION_SET_CHANGED",
      "Repair operations must keep the frozen identifiers and order.",
      source.operationId,
    );
    return;
  }
  if (source.kind !== candidate.kind) {
    addViolation(
      violations,
      "OPERATION_KIND_CHANGED",
      "A repair cannot change the kind of a frozen operation.",
      source.operationId,
    );
    return;
  }

  if (
    "authorizedAction" in source &&
    "authorizedAction" in candidate &&
    source.authorizedAction !== candidate.authorizedAction
  ) {
    addViolation(
      violations,
      "ACTION_SCOPE_CHANGED",
      "A repair cannot change the frozen authorization action.",
      source.operationId,
    );
  }

  if (source.kind === "NAVIGATE" && candidate.kind === "NAVIGATE") {
    if (source.path !== candidate.path) {
      changes.push({
        operationId: source.operationId,
        field: "path",
        before: source.path,
        after: candidate.path,
      });
    }
    if (!equal(withoutKey(source, "path"), withoutKey(candidate, "path"))) {
      addViolation(
        violations,
        "OPERATION_CONTRACT_CHANGED",
        "Navigation repair may change only the relative path.",
        source.operationId,
      );
    }
    return;
  }

  if (
    (source.kind === "ASSERT_VALUE" ||
      source.kind === "FILL" ||
      source.kind === "CLICK" ||
      source.kind === "ASSERT_TEXT") &&
    candidate.kind === source.kind
  ) {
    if (source.locator.value !== candidate.locator.value) {
      changes.push({
        operationId: source.operationId,
        field: "locator",
        before: source.locator.value,
        after: candidate.locator.value,
      });
    }
    if (!equal(withoutKey(source, "locator"), withoutKey(candidate, "locator"))) {
      const bindingChanged =
        "bindingId" in source &&
        "bindingId" in candidate &&
        source.bindingId !== candidate.bindingId;
      addViolation(
        violations,
        bindingChanged
          ? "BINDING_SCOPE_CHANGED"
          : "ASSERTION_CONTRACT_CHANGED",
        bindingChanged
          ? "A repair cannot change which fictional field supplies an operation."
          : "A selector repair cannot change the frozen assertion or action contract.",
        source.operationId,
      );
    }
    return;
  }

  if (source.kind === "CHECKPOINT" && candidate.kind === "CHECKPOINT") {
    if (!equal(source, candidate)) {
      addViolation(
        violations,
        "CHECKPOINT_CONTRACT_CHANGED",
        "A repair cannot change a human-confirmed checkpoint or its assertion.",
        source.operationId,
      );
    }
    return;
  }

  if (!equal(source, candidate)) {
    addViolation(
      violations,
      "OPERATION_CONTRACT_CHANGED",
      "The repair changed a frozen operation contract.",
      source.operationId,
    );
  }
}

export function buildJourneyRepairDraft(candidateInput: unknown): JourneyRepairDraft {
  const input = z
    .object({
      id: uuid,
      sourceReplay: deterministicReplayVersionSchema,
      candidate: deterministicReplayDraftSchema.nullable(),
      diagnosis: boundedText,
      modelInvocationCount: z.number().int().positive().max(1_000),
      proposedBy: modelActorSchema.extend({ model: z.literal("gpt-5.6-sol") }),
      createdAt: timestamp,
    })
    .strict()
    .parse(candidateInput);
  const changes: JourneyRepairChange[] = [];
  const violations: JourneyRepairViolation[] = [];

  if (input.candidate === null) {
    addViolation(
      violations,
      "NO_CANDIDATE",
      "The model did not produce a structurally usable repair candidate.",
    );
  } else {
    if (!equal(input.sourceReplay.bindings, input.candidate.bindings)) {
      addViolation(
        violations,
        "BINDING_SCOPE_CHANGED",
        "A repair cannot add, remove, reorder, or remap fictional bindings.",
      );
    }
    if (input.sourceReplay.operations.length !== input.candidate.operations.length) {
      addViolation(
        violations,
        "OPERATION_SET_CHANGED",
        "A repair cannot add or remove frozen operations.",
      );
    }
    const length = Math.min(
      input.sourceReplay.operations.length,
      input.candidate.operations.length,
    );
    for (let index = 0; index < length; index += 1) {
      assessOperation(
        input.sourceReplay.operations[index]!,
        input.candidate.operations[index]!,
        changes,
        violations,
      );
    }
    if (changes.length === 0 && violations.length === 0) {
      addViolation(
        violations,
        "NO_REPAIR_CHANGE",
        "The proposal did not identify a changed path or selector.",
      );
    }
  }

  const status: JourneyRepairDraftStatus =
    input.candidate === null ||
    (changes.length === 0 &&
      violations.every((violation) => violation.code === "NO_REPAIR_CHANGE"))
      ? "UNRESOLVED"
      : violations.length > 0
        ? "HUMAN_REVIEW_REQUIRED"
        : "BOUNDED_DRAFT";
  const base = journeyRepairDraftBaseSchema.parse({
    schemaVersion: "1.0.0",
    id: input.id,
    workspaceId: input.sourceReplay.workspaceId,
    softwareId: input.sourceReplay.softwareId,
    journeyVersionId: input.sourceReplay.journeyVersionId,
    authorizationId: input.sourceReplay.authorizationId,
    sourceReplayVersionId: input.sourceReplay.id,
    sourceReplayHash: input.sourceReplay.replayHash,
    sourceSnapshotHash: input.sourceReplay.snapshot.snapshotHash,
    requiredCheckpointIds: input.sourceReplay.requiredCheckpointIds,
    status,
    diagnosis: input.diagnosis,
    candidate: input.candidate,
    changes,
    violations,
    modelInvocationCount: input.modelInvocationCount,
    proposedBy: input.proposedBy,
    createdAt: new Date(input.createdAt).toISOString(),
  });
  return immutableClone(
    journeyRepairDraftSchema.parse({
      ...base,
      repairHash: computeJourneyRepairHash(base),
    }),
  );
}

export function journeyRepairMatchesFrozenSource(
  repairCandidate: unknown,
  sourceReplayCandidate: unknown,
): boolean {
  const repair = journeyRepairDraftSchema.parse(repairCandidate);
  const sourceReplay = deterministicReplayVersionSchema.parse(
    sourceReplayCandidate,
  );
  const rebuilt = buildJourneyRepairDraft({
    id: repair.id,
    sourceReplay,
    candidate: repair.candidate,
    diagnosis: repair.diagnosis,
    modelInvocationCount: repair.modelInvocationCount,
    proposedBy: repair.proposedBy,
    createdAt: repair.createdAt,
  });
  return equal(repair, rebuilt);
}

export const journeyRepairCheckpointResultSchema = z
  .object({
    checkpointId: shortText,
    status: z.enum(["VERIFIED", "MISSING", "NOT_REACHED"]),
  })
  .strict();

export const journeyRepairVerificationSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: uuid,
    repairId: uuid,
    workspaceId: uuid,
    sourceReplayVersionId: uuid,
    repairHash: z.string().regex(/^[a-f0-9]{64}$/u),
    status: z.enum(["VERIFIED_DRAFT", "PARTIAL", "NOT_TESTED"]),
    reasonCode: z.enum([
      "EXACT_FROZEN_CHECKPOINTS_VERIFIED",
      "REPAIR_NOT_BOUNDED",
      "EXECUTION_DID_NOT_COMPLETE",
      "FROZEN_CHECKPOINT_NOT_VERIFIED",
      "RECORDER_VISIBILITY_NOT_VERIFIED",
    ]),
    executionState: z.enum(["COMPLETED", "DRIFTED", "FAILED"]),
    checkpoints: z.array(journeyRepairCheckpointResultSchema).max(64),
    verifiedCheckpointIds: z.array(shortText).max(64),
    recorderVisibility: z.enum(["VISIBLE", "NOT_VISIBLE", "NOT_TESTED"]),
    verifiedAt: timestamp,
    verifiedBy: automationActorSchema,
  })
  .strict();
export type JourneyRepairVerification = z.infer<
  typeof journeyRepairVerificationSchema
>;

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value) => right.includes(value)) &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length
  );
}

export function buildJourneyRepairVerification(
  candidateInput: unknown,
): JourneyRepairVerification {
  const input = z
    .object({
      id: uuid,
      repair: journeyRepairDraftSchema,
      sourceReplay: deterministicReplayVersionSchema,
      executionState: z.enum(["COMPLETED", "DRIFTED", "FAILED"]),
      checkpoints: z.array(journeyRepairCheckpointResultSchema).max(64),
      recorderVisibility: z.enum(["VISIBLE", "NOT_VISIBLE", "NOT_TESTED"]),
      verifiedAt: timestamp,
      verifiedBy: automationActorSchema,
    })
    .strict()
    .parse(candidateInput);
  const verifiedCheckpointSet = new Set(
    input.checkpoints
      .filter((checkpoint) => checkpoint.status === "VERIFIED")
      .map((checkpoint) => checkpoint.checkpointId),
  );
  const verifiedCheckpointIds = input.repair.requiredCheckpointIds.filter(
    (checkpointId) => verifiedCheckpointSet.has(checkpointId),
  );
  const exactFrozenCheckpoints =
    sameStringSet(
      input.checkpoints.map((checkpoint) => checkpoint.checkpointId),
      input.repair.requiredCheckpointIds,
    ) &&
    sameStringSet(verifiedCheckpointIds, input.repair.requiredCheckpointIds);

  let status: JourneyRepairVerification["status"] = "NOT_TESTED";
  let reasonCode: JourneyRepairVerification["reasonCode"] =
    "REPAIR_NOT_BOUNDED";
  if (
    input.repair.status === "BOUNDED_DRAFT" &&
    journeyRepairMatchesFrozenSource(input.repair, input.sourceReplay)
  ) {
    if (input.executionState !== "COMPLETED") {
      status = verifiedCheckpointIds.length > 0 ? "PARTIAL" : "NOT_TESTED";
      reasonCode = "EXECUTION_DID_NOT_COMPLETE";
    } else if (!exactFrozenCheckpoints) {
      status = verifiedCheckpointIds.length > 0 ? "PARTIAL" : "NOT_TESTED";
      reasonCode = "FROZEN_CHECKPOINT_NOT_VERIFIED";
    } else if (input.recorderVisibility !== "VISIBLE") {
      status = "NOT_TESTED";
      reasonCode = "RECORDER_VISIBILITY_NOT_VERIFIED";
    } else {
      status = "VERIFIED_DRAFT";
      reasonCode = "EXACT_FROZEN_CHECKPOINTS_VERIFIED";
    }
  }

  return immutableClone(
    journeyRepairVerificationSchema.parse({
      schemaVersion: "1.0.0",
      id: input.id,
      repairId: input.repair.id,
      workspaceId: input.repair.workspaceId,
      sourceReplayVersionId: input.repair.sourceReplayVersionId,
      repairHash: input.repair.repairHash,
      status,
      reasonCode,
      executionState: input.executionState,
      checkpoints: input.checkpoints,
      verifiedCheckpointIds,
      recorderVisibility: input.recorderVisibility,
      verifiedAt: new Date(input.verifiedAt).toISOString(),
      verifiedBy: input.verifiedBy,
    }),
  );
}

export class JourneyRepairPromotionError extends Error {
  readonly code = "JOURNEY_REPAIR_NOT_PROMOTABLE";

  constructor() {
    super(
      "Only an exactly verified repair draft can be promoted by a named human.",
    );
    this.name = "JourneyRepairPromotionError";
  }
}

export function buildPromotedRepairReplayVersion(
  candidateInput: unknown,
): DeterministicReplayVersion {
  const input = z
    .object({
      id: uuid,
      repair: journeyRepairDraftSchema,
      verification: journeyRepairVerificationSchema,
      sourceReplay: deterministicReplayVersionSchema,
      journey: journeyVersionSchema,
      createdAt: timestamp,
      createdBy: humanActorSchema,
    })
    .strict()
    .parse(candidateInput);
  const valid =
    input.repair.status === "BOUNDED_DRAFT" &&
    input.repair.candidate !== null &&
    journeyRepairMatchesFrozenSource(input.repair, input.sourceReplay) &&
    input.verification.status === "VERIFIED_DRAFT" &&
    input.verification.repairId === input.repair.id &&
    input.verification.repairHash === input.repair.repairHash &&
    input.verification.sourceReplayVersionId === input.sourceReplay.id &&
    input.repair.sourceReplayVersionId === input.sourceReplay.id &&
    input.repair.sourceReplayHash === input.sourceReplay.replayHash &&
    input.repair.sourceSnapshotHash === input.sourceReplay.snapshot.snapshotHash &&
    input.repair.workspaceId === input.sourceReplay.workspaceId &&
    input.repair.softwareId === input.sourceReplay.softwareId &&
    input.repair.journeyVersionId === input.journey.id &&
    input.sourceReplay.journeyVersionId === input.journey.id &&
    sameStringSet(
      input.verification.verifiedCheckpointIds,
      input.sourceReplay.requiredCheckpointIds,
    );
  if (!valid) throw new JourneyRepairPromotionError();

  return buildDeterministicReplayVersion({
    id: input.id,
    replayId: input.sourceReplay.replayId,
    version: input.sourceReplay.version + 1,
    sourceVersionId: input.sourceReplay.id,
    journey: input.journey,
    runnerConfigVersion: input.sourceReplay.snapshot.runnerConfigVersion,
    draft: input.repair.candidate,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
  });
}

export const journeyRepairPromotionSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: uuid,
    repairId: uuid,
    verificationId: uuid,
    workspaceId: uuid,
    softwareId: uuid,
    journeyVersionId: uuid,
    sourceReplayVersionId: uuid,
    repairHash: z.string().regex(/^[a-f0-9]{64}$/u),
    promotedReplayVersionId: uuid,
    promotedReplayVersion: z.number().int().min(2),
    promotedReplayHash: z.string().regex(/^[a-f0-9]{64}$/u),
    rationale: boundedText,
    reviewedAt: timestamp,
    reviewedBy: humanActorSchema,
  })
  .strict();
export type JourneyRepairPromotion = z.infer<
  typeof journeyRepairPromotionSchema
>;

function promotionMatchesReplay(
  promotion: JourneyRepairPromotion,
  replay: DeterministicReplayVersion,
): boolean {
  return (
    promotion.workspaceId === replay.workspaceId &&
    promotion.softwareId === replay.softwareId &&
    promotion.journeyVersionId === replay.journeyVersionId &&
    promotion.sourceReplayVersionId === replay.sourceVersionId &&
    promotion.promotedReplayVersionId === replay.id &&
    promotion.promotedReplayVersion === replay.version &&
    promotion.promotedReplayHash === replay.replayHash &&
    promotion.reviewedBy.actorId === replay.createdBy.actorId
  );
}

export function buildJourneyRepairPromotion(
  candidateInput: unknown,
): JourneyRepairPromotion {
  const input = z
    .object({
      id: uuid,
      repair: journeyRepairDraftSchema,
      verification: journeyRepairVerificationSchema,
      sourceReplay: deterministicReplayVersionSchema,
      promotedReplay: deterministicReplayVersionSchema,
      rationale: boundedText,
      reviewedAt: timestamp,
      reviewedBy: humanActorSchema,
    })
    .strict()
    .parse(candidateInput);
  const candidate = input.repair.candidate;
  if (
    input.repair.status !== "BOUNDED_DRAFT" ||
    candidate === null ||
    !journeyRepairMatchesFrozenSource(input.repair, input.sourceReplay) ||
    input.verification.status !== "VERIFIED_DRAFT" ||
    input.verification.repairId !== input.repair.id ||
    input.verification.repairHash !== input.repair.repairHash ||
    input.verification.sourceReplayVersionId !== input.sourceReplay.id ||
    input.repair.sourceReplayVersionId !== input.sourceReplay.id ||
    input.promotedReplay.sourceVersionId !==
      input.repair.sourceReplayVersionId ||
    input.promotedReplay.version !== input.sourceReplay.version + 1 ||
    input.promotedReplay.workspaceId !== input.repair.workspaceId ||
    input.promotedReplay.softwareId !== input.repair.softwareId ||
    input.promotedReplay.journeyVersionId !== input.repair.journeyVersionId ||
    input.promotedReplay.createdBy.actorId !== input.reviewedBy.actorId ||
    !equal(input.promotedReplay.bindings, candidate.bindings) ||
    !equal(input.promotedReplay.operations, candidate.operations)
  ) {
    throw new JourneyRepairPromotionError();
  }
  return immutableClone(
    journeyRepairPromotionSchema.parse({
      schemaVersion: "1.0.0",
      id: input.id,
      repairId: input.repair.id,
      verificationId: input.verification.id,
      workspaceId: input.repair.workspaceId,
      softwareId: input.repair.softwareId,
      journeyVersionId: input.repair.journeyVersionId,
      sourceReplayVersionId: input.repair.sourceReplayVersionId,
      repairHash: input.repair.repairHash,
      promotedReplayVersionId: input.promotedReplay.id,
      promotedReplayVersion: input.promotedReplay.version,
      promotedReplayHash: input.promotedReplay.replayHash,
      rationale: input.rationale,
      reviewedAt: new Date(input.reviewedAt).toISOString(),
      reviewedBy: input.reviewedBy,
    }),
  );
}

export interface JourneyRepairHistoryEntry {
  readonly draft: JourneyRepairDraft;
  readonly verification?: JourneyRepairVerification;
  readonly promotion?: JourneyRepairPromotion;
}

export interface JourneyRepairRepository {
  appendDraft(draft: JourneyRepairDraft): Promise<JourneyRepairDraft>;
  appendVerification(
    verification: JourneyRepairVerification,
  ): Promise<JourneyRepairVerification>;
  appendPromotion(
    promotion: JourneyRepairPromotion,
    promotedReplay: DeterministicReplayVersion,
  ): Promise<JourneyRepairPromotion>;
  getDraft(
    workspaceId: string,
    softwareId: string,
    repairId: string,
  ): Promise<JourneyRepairDraft | undefined>;
  listHistory(
    workspaceId: string,
    softwareId: string,
    journeyVersionId: string,
  ): Promise<readonly JourneyRepairHistoryEntry[]>;
}

export class JourneyRepairHistoryConflictError extends Error {
  readonly code = "JOURNEY_REPAIR_HISTORY_CONFLICT";
  readonly status = 409;

  constructor(message = "Journey repair history conflict") {
    super(message);
    this.name = "JourneyRepairHistoryConflictError";
  }
}

function validateVerificationLink(
  draft: JourneyRepairDraft | undefined,
  verification: JourneyRepairVerification,
): void {
  if (
    !draft ||
    draft.id !== verification.repairId ||
    draft.workspaceId !== verification.workspaceId ||
    draft.sourceReplayVersionId !== verification.sourceReplayVersionId ||
    draft.repairHash !== verification.repairHash
  ) {
    throw new JourneyRepairHistoryConflictError(
      "A verification requires its exact stored repair draft",
    );
  }
}

function validatePromotionLink(
  draft: JourneyRepairDraft | undefined,
  verification: JourneyRepairVerification | undefined,
  promotion: JourneyRepairPromotion,
  replay: DeterministicReplayVersion,
): void {
  if (
    !draft ||
    !verification ||
    draft.status !== "BOUNDED_DRAFT" ||
    verification.status !== "VERIFIED_DRAFT" ||
    promotion.repairId !== draft.id ||
    promotion.verificationId !== verification.id ||
    promotion.repairHash !== draft.repairHash ||
    !promotionMatchesReplay(promotion, replay) ||
    !equal(replay.bindings, draft.candidate?.bindings) ||
    !equal(replay.operations, draft.candidate?.operations)
  ) {
    throw new JourneyRepairHistoryConflictError(
      "A promotion requires its exact verified draft and human replay",
    );
  }
}

export class InMemoryJourneyRepairRepository
  implements JourneyRepairRepository
{
  readonly #drafts: JourneyRepairDraft[] = [];
  readonly #promotions: JourneyRepairPromotion[] = [];
  readonly #verifications: JourneyRepairVerification[] = [];
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

  appendDraft(draftCandidate: JourneyRepairDraft): Promise<JourneyRepairDraft> {
    const draft = journeyRepairDraftSchema.parse(draftCandidate);
    return this.#exclusive(() => {
      if (
        this.#drafts.some(
          (stored) =>
            stored.workspaceId === draft.workspaceId && stored.id === draft.id,
        )
      ) {
        throw new JourneyRepairHistoryConflictError();
      }
      this.#drafts.push(immutableClone(draft));
      return immutableClone(draft);
    });
  }

  appendVerification(
    verificationCandidate: JourneyRepairVerification,
  ): Promise<JourneyRepairVerification> {
    const verification = journeyRepairVerificationSchema.parse(
      verificationCandidate,
    );
    return this.#exclusive(() => {
      const draft = this.#drafts.find(
        (stored) =>
          stored.workspaceId === verification.workspaceId &&
          stored.id === verification.repairId,
      );
      validateVerificationLink(draft, verification);
      if (
        this.#verifications.some(
          (stored) =>
            stored.workspaceId === verification.workspaceId &&
            (stored.id === verification.id ||
              stored.repairId === verification.repairId),
        )
      ) {
        throw new JourneyRepairHistoryConflictError();
      }
      this.#verifications.push(immutableClone(verification));
      return immutableClone(verification);
    });
  }

  appendPromotion(
    promotionCandidate: JourneyRepairPromotion,
    replayCandidate: DeterministicReplayVersion,
  ): Promise<JourneyRepairPromotion> {
    const promotion = journeyRepairPromotionSchema.parse(promotionCandidate);
    const replay = deterministicReplayVersionSchema.parse(replayCandidate);
    return this.#exclusive(() => {
      const draft = this.#drafts.find(
        (stored) =>
          stored.workspaceId === promotion.workspaceId &&
          stored.id === promotion.repairId,
      );
      const verification = this.#verifications.find(
        (stored) =>
          stored.workspaceId === promotion.workspaceId &&
          stored.id === promotion.verificationId,
      );
      validatePromotionLink(draft, verification, promotion, replay);
      if (
        this.#promotions.some(
          (stored) =>
            stored.workspaceId === promotion.workspaceId &&
            (stored.id === promotion.id || stored.repairId === promotion.repairId),
        )
      ) {
        throw new JourneyRepairHistoryConflictError();
      }
      this.#promotions.push(immutableClone(promotion));
      return immutableClone(promotion);
    });
  }

  getDraft(
    workspaceIdCandidate: string,
    softwareIdCandidate: string,
    repairIdCandidate: string,
  ): Promise<JourneyRepairDraft | undefined> {
    const workspaceId = uuid.parse(workspaceIdCandidate);
    const softwareId = uuid.parse(softwareIdCandidate);
    const repairId = uuid.parse(repairIdCandidate);
    const found = this.#drafts.find(
      (draft) =>
        draft.workspaceId === workspaceId &&
        draft.softwareId === softwareId &&
        draft.id === repairId,
    );
    return Promise.resolve(found ? immutableClone(found) : undefined);
  }

  listHistory(
    workspaceIdCandidate: string,
    softwareIdCandidate: string,
    journeyVersionIdCandidate: string,
  ): Promise<readonly JourneyRepairHistoryEntry[]> {
    const workspaceId = uuid.parse(workspaceIdCandidate);
    const softwareId = uuid.parse(softwareIdCandidate);
    const journeyVersionId = uuid.parse(journeyVersionIdCandidate);
    return Promise.resolve(
      immutableClone(
        this.#drafts
          .filter(
            (draft) =>
              draft.workspaceId === workspaceId &&
              draft.softwareId === softwareId &&
              draft.journeyVersionId === journeyVersionId,
          )
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .map((draft) => {
            const verification = this.#verifications.find(
              (stored) =>
                stored.workspaceId === draft.workspaceId &&
                stored.repairId === draft.id,
            );
            const promotion = this.#promotions.find(
              (stored) =>
                stored.workspaceId === draft.workspaceId &&
                stored.repairId === draft.id,
            );
            return {
              draft,
              ...(verification ? { verification } : {}),
              ...(promotion ? { promotion } : {}),
            };
          }),
      ),
    );
  }
}

interface PayloadRow {
  readonly payload: unknown;
}

function jsonPayload<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

export class PostgresJourneyRepairRepository
  implements JourneyRepairRepository
{
  readonly #database: MigrationDatabase;

  constructor(database: MigrationDatabase) {
    this.#database = database;
  }

  async appendDraft(
    draftCandidate: JourneyRepairDraft,
  ): Promise<JourneyRepairDraft> {
    const draft = journeyRepairDraftSchema.parse(draftCandidate);
    await this.#database.query(
      "INSERT INTO journey_repair_drafts (workspace_id, id, software_id, journey_version_id, authorization_id, source_replay_version_id, status, repair_hash, payload, created_at, proposed_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
      [
        draft.workspaceId,
        draft.id,
        draft.softwareId,
        draft.journeyVersionId,
        draft.authorizationId,
        draft.sourceReplayVersionId,
        draft.status,
        draft.repairHash,
        draft,
        draft.createdAt,
        draft.proposedBy,
      ],
    );
    return immutableClone(draft);
  }

  async appendVerification(
    verificationCandidate: JourneyRepairVerification,
  ): Promise<JourneyRepairVerification> {
    const verification = journeyRepairVerificationSchema.parse(
      verificationCandidate,
    );
    await this.#database.query(
      "INSERT INTO journey_repair_verifications (workspace_id, id, repair_id, source_replay_version_id, status, repair_hash, payload, verified_at, verified_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [
        verification.workspaceId,
        verification.id,
        verification.repairId,
        verification.sourceReplayVersionId,
        verification.status,
        verification.repairHash,
        verification,
        verification.verifiedAt,
        verification.verifiedBy,
      ],
    );
    return immutableClone(verification);
  }

  async appendPromotion(
    promotionCandidate: JourneyRepairPromotion,
    replayCandidate: DeterministicReplayVersion,
  ): Promise<JourneyRepairPromotion> {
    const promotion = journeyRepairPromotionSchema.parse(promotionCandidate);
    const replay = deterministicReplayVersionSchema.parse(replayCandidate);
    if (!promotionMatchesReplay(promotion, replay)) {
      throw new JourneyRepairHistoryConflictError();
    }
    await this.#database.query(
      "INSERT INTO journey_repair_promotions (workspace_id, id, repair_id, verification_id, promoted_replay_version_id, repair_hash, rationale, payload, reviewed_at, reviewed_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
      [
        promotion.workspaceId,
        promotion.id,
        promotion.repairId,
        promotion.verificationId,
        promotion.promotedReplayVersionId,
        promotion.repairHash,
        promotion.rationale,
        promotion,
        promotion.reviewedAt,
        promotion.reviewedBy,
      ],
    );
    return immutableClone(promotion);
  }

  async getDraft(
    workspaceIdCandidate: string,
    softwareIdCandidate: string,
    repairIdCandidate: string,
  ): Promise<JourneyRepairDraft | undefined> {
    const result = await this.#database.query<PayloadRow>(
      "SELECT payload FROM journey_repair_drafts WHERE workspace_id = $1 AND software_id = $2 AND id = $3",
      [
        uuid.parse(workspaceIdCandidate),
        uuid.parse(softwareIdCandidate),
        uuid.parse(repairIdCandidate),
      ],
    );
    const payload = result.rows[0]?.payload;
    return payload === undefined
      ? undefined
      : immutableClone(journeyRepairDraftSchema.parse(jsonPayload(payload)));
  }

  async listHistory(
    workspaceIdCandidate: string,
    softwareIdCandidate: string,
    journeyVersionIdCandidate: string,
  ): Promise<readonly JourneyRepairHistoryEntry[]> {
    const workspaceId = uuid.parse(workspaceIdCandidate);
    const softwareId = uuid.parse(softwareIdCandidate);
    const journeyVersionId = uuid.parse(journeyVersionIdCandidate);
    const [draftRows, verificationRows, promotionRows] = await Promise.all([
      this.#database.query<PayloadRow>(
        "SELECT payload FROM journey_repair_drafts WHERE workspace_id = $1 AND software_id = $2 AND journey_version_id = $3 ORDER BY created_at DESC, id DESC",
        [workspaceId, softwareId, journeyVersionId],
      ),
      this.#database.query<PayloadRow>(
        "SELECT verification.payload FROM journey_repair_verifications verification JOIN journey_repair_drafts draft ON draft.workspace_id = verification.workspace_id AND draft.id = verification.repair_id WHERE draft.workspace_id = $1 AND draft.software_id = $2 AND draft.journey_version_id = $3",
        [workspaceId, softwareId, journeyVersionId],
      ),
      this.#database.query<PayloadRow>(
        "SELECT promotion.payload FROM journey_repair_promotions promotion JOIN journey_repair_drafts draft ON draft.workspace_id = promotion.workspace_id AND draft.id = promotion.repair_id WHERE draft.workspace_id = $1 AND draft.software_id = $2 AND draft.journey_version_id = $3",
        [workspaceId, softwareId, journeyVersionId],
      ),
    ]);
    const drafts = draftRows.rows.map((row) =>
      journeyRepairDraftSchema.parse(jsonPayload(row.payload)),
    );
    const verifications = verificationRows.rows.map((row) =>
      journeyRepairVerificationSchema.parse(jsonPayload(row.payload)),
    );
    const promotions = promotionRows.rows.map((row) =>
      journeyRepairPromotionSchema.parse(jsonPayload(row.payload)),
    );
    return immutableClone(
      drafts.map((draft) => {
        const verification = verifications.find(
          (candidate) => candidate.repairId === draft.id,
        );
        const promotion = promotions.find(
          (candidate) => candidate.repairId === draft.id,
        );
        return {
          draft,
          ...(verification ? { verification } : {}),
          ...(promotion ? { promotion } : {}),
        };
      }),
    );
  }
}
