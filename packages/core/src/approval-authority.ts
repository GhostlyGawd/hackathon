import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { WorkspaceAuthorizationService } from "./authorization.js";
import { workspacePrincipalSchema } from "./authorization.js";
import {
  approvalEventSchema,
  approvalOriginSchema,
  approvalStateSchema,
  automationActorSchema,
  humanActorSchema,
  humanDecisionSchema,
  type ApprovalEvent,
  type ApprovalOrigin,
  type ApprovalState,
  type SoftwareRecord,
} from "./domain.js";
import {
  boundedFindingEvaluationSchema,
  type BoundedFindingEvaluation,
} from "./finding-evaluation.js";
import {
  evidenceReceiptBundleSchema,
  verifyEvidenceReceiptBundle,
  type EvidenceReceiptBundle,
} from "./evidence-receipt.js";
import type { InMemorySoftwareInventoryRepository } from "./inventory.js";
import type { MigrationDatabase } from "./migrations.js";

const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const nonEmpty = z.string().trim().min(1);
const timestamp = z.iso.datetime({ offset: true });

export const holdReceiptContributionSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    softwareId: uuid,
    receiptId: uuid,
    findingId: uuid,
    findingState: z.enum(["WITNESSED_CONFLICT", "NOT_VISIBLE"]),
    reason: z.enum(["WITNESSED_CONFLICT", "REQUIRED_VISIBILITY_LOSS"]),
    checkpointId: nonEmpty.optional(),
    actor: automationActorSchema,
    occurredAt: timestamp,
  })
  .strict();
export type HoldReceiptContribution = z.infer<
  typeof holdReceiptContributionSchema
>;

const reviewedRunSchema = z
  .object({
    runId: uuid,
    findingState: z.enum([
      "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS",
      "NOT_REOBSERVED_IN_NAMED_TESTS",
      "WITNESSED_CONFLICT",
      "NOT_TESTED",
      "NOT_VISIBLE",
      "NEEDS_REVIEW",
    ]),
  })
  .strict();

export const signedApprovalDecisionSchema = humanDecisionSchema
  .safeExtend({
    receiptId: uuid,
    reviewedRun: reviewedRunSchema.optional(),
  })
  .strict();
export type SignedApprovalDecision = z.infer<
  typeof signedApprovalDecisionSchema
>;

export const approvalAuthoritySubjectSchema = z
  .object({
    workspaceId: uuid,
    softwareId: uuid,
    softwareName: nonEmpty,
    state: approvalStateSchema,
    approvalOrigin: approvalOriginSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.approvalOrigin.workspaceId !== value.workspaceId ||
      value.approvalOrigin.softwareId !== value.softwareId ||
      value.approvalOrigin.state !== value.state
    ) {
      context.addIssue({
        code: "custom",
        path: ["approvalOrigin"],
        message: "Approval subject provenance must match its current state",
      });
    }
  });
export type ApprovalAuthoritySubject = z.infer<
  typeof approvalAuthoritySubjectSchema
>;

export const approvalAuthoritySnapshotSchema = approvalAuthoritySubjectSchema
  .safeExtend({
    events: z.array(approvalEventSchema),
    decisions: z.array(signedApprovalDecisionSchema),
    holdReceipts: z.array(holdReceiptContributionSchema),
  })
  .strict()
  .superRefine((value, context) => {
    for (let index = 1; index < value.events.length; index += 1) {
      if (value.events[index - 1]?.to !== value.events[index]?.from) {
        context.addIssue({
          code: "custom",
          path: ["events", index],
          message: "Approval events must form one append-only state chain",
        });
      }
    }
    const latest = value.events.at(-1);
    if (latest && latest.to !== value.state) {
      context.addIssue({
        code: "custom",
        path: ["state"],
        message: "Current approval state must equal the latest event",
      });
    }
  });
export type ApprovalAuthoritySnapshot = z.infer<
  typeof approvalAuthoritySnapshotSchema
>;

const visibilityAttemptSchema = z
  .object({
    findingId: uuid,
    runId: uuid,
    state: z.literal("NOT_VISIBLE"),
    snapshotHash: sha256,
  })
  .strict();

const priorVisibleAttemptSchema = z
  .object({
    runId: uuid,
    state: z.literal("VERIFIED"),
    snapshotHash: sha256,
  })
  .strict();

export const visibilityLossProofSchema = z
  .object({
    checkpointId: nonEmpty,
    priorVisibleAttempt: priorVisibleAttemptSchema.optional(),
    firstAttempt: visibilityAttemptSchema,
    retryAttempt: visibilityAttemptSchema
      .safeExtend({ retryOfRunId: uuid })
      .strict(),
  })
  .strict();
export type VisibilityLossProof = z.infer<typeof visibilityLossProofSchema>;

const considerFindingInputSchema = z
  .object({
    workspaceId: uuid,
    softwareId: uuid,
    findingEvaluation: boundedFindingEvaluationSchema,
    receiptBundle: evidenceReceiptBundleSchema.optional(),
    actor: automationActorSchema,
    idempotencyKey: nonEmpty,
    visibilityLossProof: visibilityLossProofSchema.optional(),
  })
  .strict();

const humanDecisionInputSchema = z
  .object({
    principal: workspacePrincipalSchema,
    workspaceId: uuid,
    softwareId: uuid,
    outcome: z.enum(["KEEP_HOLD", "RESTORE_APPROVED", "REJECT", "RETIRE"]),
    rationale: nonEmpty,
    namedScopeAcknowledged: z.literal(true),
    receiptId: uuid,
    reviewedRun: reviewedRunSchema.optional(),
  })
  .strict();

interface AutomatedHoldCommand {
  readonly contribution: HoldReceiptContribution;
  readonly event: ApprovalEvent;
  readonly approvalOrigin: ApprovalOrigin;
}

interface HumanDecisionCommand {
  readonly decision: SignedApprovalDecision;
  readonly event?: ApprovalEvent;
  readonly approvalOrigin?: ApprovalOrigin;
}

export interface AutomatedHoldRepositoryResult {
  readonly outcome: "HOLD_APPLIED" | "ALREADY_RECORDED" | "ALREADY_HOLD" | "NOT_APPROVED";
  readonly snapshot: ApprovalAuthoritySnapshot;
}

export interface ApprovalAuthorityRepository {
  initialize(subject: ApprovalAuthoritySubject): Promise<void>;
  getSnapshot(
    workspaceId: string,
    softwareId: string,
  ): Promise<ApprovalAuthoritySnapshot | undefined>;
  applyAutomatedHold(
    command: AutomatedHoldCommand,
  ): Promise<AutomatedHoldRepositoryResult>;
  recordHumanDecision(
    command: HumanDecisionCommand,
  ): Promise<ApprovalAuthoritySnapshot>;
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

function keyOf(workspaceId: string, softwareId: string): string {
  return `${uuid.parse(workspaceId)}:${uuid.parse(softwareId)}`;
}

interface MutableInventoryStore {
  readonly readSoftware: (
    workspaceId: string,
    softwareId: string,
  ) => Promise<SoftwareRecord | undefined>;
  readonly recordApprovalTransition: (
    workspaceId: string,
    softwareId: string,
    approvalOrigin: ApprovalOrigin,
  ) => Promise<SoftwareRecord>;
}

export class InMemoryApprovalAuthorityRepository
  implements ApprovalAuthorityRepository
{
  readonly #subjects = new Map<string, ApprovalAuthoritySubject>();
  readonly #events = new Map<string, ApprovalEvent[]>();
  readonly #decisions = new Map<string, SignedApprovalDecision[]>();
  readonly #contributions = new Map<string, HoldReceiptContribution[]>();
  readonly #locks = new Map<string, Promise<void>>();
  readonly #inventory: MutableInventoryStore | undefined;

  constructor(inventory?: InMemorySoftwareInventoryRepository) {
    this.#inventory = inventory;
  }

  async initialize(subjectCandidate: ApprovalAuthoritySubject): Promise<void> {
    const subject = approvalAuthoritySubjectSchema.parse(subjectCandidate);
    const key = keyOf(subject.workspaceId, subject.softwareId);
    if (this.#subjects.has(key)) throw new Error("Approval subject already exists");
    if (this.#inventory) {
      const software = await this.#inventory.readSoftware(
        subject.workspaceId,
        subject.softwareId,
      );
      if (!software) throw new Error("Approval subject software does not exist");
      if (
        software.name !== subject.softwareName ||
        software.approvalState !== subject.state
      ) {
        throw new Error("Approval subject must match the inventory record");
      }
    }
    this.#subjects.set(key, immutableClone(subject));
    this.#events.set(key, []);
    this.#decisions.set(key, []);
    this.#contributions.set(key, []);
  }

  async #withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#locks.get(key) ?? Promise.resolve();
    let release = (): void => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.#locks.set(key, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.#locks.get(key) === queued) this.#locks.delete(key);
    }
  }

  getSnapshot(
    workspaceId: string,
    softwareId: string,
  ): Promise<ApprovalAuthoritySnapshot | undefined> {
    const key = keyOf(workspaceId, softwareId);
    const subject = this.#subjects.get(key);
    if (!subject) return Promise.resolve(undefined);
    return Promise.resolve(
      immutableClone(
        approvalAuthoritySnapshotSchema.parse({
          ...subject,
          events: this.#events.get(key) ?? [],
          decisions: this.#decisions.get(key) ?? [],
          holdReceipts: this.#contributions.get(key) ?? [],
        }),
      ),
    );
  }

  async applyAutomatedHold(
    command: AutomatedHoldCommand,
  ): Promise<AutomatedHoldRepositoryResult> {
    const contribution = holdReceiptContributionSchema.parse(
      command.contribution,
    );
    const event = approvalEventSchema.parse(command.event);
    const approvalOrigin = approvalOriginSchema.parse(command.approvalOrigin);
    const key = keyOf(contribution.workspaceId, contribution.softwareId);
    return this.#withLock(key, async () => {
      const subject = this.#subjects.get(key);
      if (!subject) throw new Error("Approval subject does not exist");
      const contributions = this.#contributions.get(key) ?? [];
      if (
        contributions.some(
          (prior) => prior.receiptId === contribution.receiptId,
        )
      ) {
        const snapshot = await this.getSnapshot(
          contribution.workspaceId,
          contribution.softwareId,
        );
        if (!snapshot) throw new Error("Approval subject disappeared");
        return { outcome: "ALREADY_RECORDED", snapshot };
      }
      this.#contributions.set(key, [
        ...contributions,
        immutableClone(contribution),
      ]);
      if (subject.state !== "APPROVED") {
        const snapshot = await this.getSnapshot(
          contribution.workspaceId,
          contribution.softwareId,
        );
        if (!snapshot) throw new Error("Approval subject disappeared");
        return {
          outcome: subject.state === "HOLD" ? "ALREADY_HOLD" : "NOT_APPROVED",
          snapshot,
        };
      }
      if (
        event.from !== "APPROVED" ||
        event.to !== "HOLD" ||
        event.workspaceId !== subject.workspaceId ||
        event.softwareId !== subject.softwareId ||
        event.receiptId !== contribution.receiptId
      ) {
        throw new Error("Automated hold event does not match its contribution");
      }
      const nextSubject = approvalAuthoritySubjectSchema.parse({
        ...subject,
        state: "HOLD",
        approvalOrigin,
      });
      if (this.#inventory) {
        await this.#inventory.recordApprovalTransition(
          subject.workspaceId,
          subject.softwareId,
          approvalOrigin,
        );
      }
      this.#subjects.set(key, immutableClone(nextSubject));
      this.#events.set(key, [
        ...(this.#events.get(key) ?? []),
        immutableClone(event),
      ]);
      const snapshot = await this.getSnapshot(
        contribution.workspaceId,
        contribution.softwareId,
      );
      if (!snapshot) throw new Error("Approval subject disappeared");
      return { outcome: "HOLD_APPLIED", snapshot };
    });
  }

  async recordHumanDecision(
    command: HumanDecisionCommand,
  ): Promise<ApprovalAuthoritySnapshot> {
    const decision = signedApprovalDecisionSchema.parse(command.decision);
    const key = keyOf(decision.workspaceId, decision.softwareId);
    return this.#withLock(key, async () => {
      const subject = this.#subjects.get(key);
      if (!subject) throw new Error("Approval subject does not exist");
      if (subject.state !== "HOLD") {
        throw new Error("Human hold decisions require current HOLD state");
      }
      const contributions = this.#contributions.get(key) ?? [];
      if (!contributions.some(({ receiptId }) => receiptId === decision.receiptId)) {
        throw new Error("Decision receipt did not contribute to this hold");
      }
      const decisions = this.#decisions.get(key) ?? [];
      if (decisions.some(({ id }) => id === decision.id)) {
        throw new Error("Human decision already exists");
      }
      this.#decisions.set(key, [...decisions, immutableClone(decision)]);
      if (command.event && command.approvalOrigin) {
        const event = approvalEventSchema.parse(command.event);
        const approvalOrigin = approvalOriginSchema.parse(
          command.approvalOrigin,
        );
        if (
          event.from !== subject.state ||
          event.workspaceId !== subject.workspaceId ||
          event.softwareId !== subject.softwareId ||
          event.receiptId !== decision.receiptId
        ) {
          throw new Error("Human decision event does not match its hold");
        }
        if (this.#inventory) {
          await this.#inventory.recordApprovalTransition(
            subject.workspaceId,
            subject.softwareId,
            approvalOrigin,
          );
        }
        this.#subjects.set(
          key,
          immutableClone(
            approvalAuthoritySubjectSchema.parse({
              ...subject,
              state: event.to,
              approvalOrigin,
            }),
          ),
        );
        this.#events.set(key, [
          ...(this.#events.get(key) ?? []),
          immutableClone(event),
        ]);
      }
      const snapshot = await this.getSnapshot(
        decision.workspaceId,
        decision.softwareId,
      );
      if (!snapshot) throw new Error("Approval subject disappeared");
      return snapshot;
    });
  }
}

export class ApprovalAuthorityIntegrityError extends Error {
  readonly code = "APPROVAL_EVIDENCE_INTEGRITY_ERROR";
  readonly status = 409;
  readonly publicMessage =
    "The stored finding and receipt could not authorize an approval change.";

  constructor(message: string) {
    super(message);
    this.name = "ApprovalAuthorityIntegrityError";
  }
}

export class ApprovalAuthorityNotFoundError extends Error {
  readonly code = "APPROVAL_SUBJECT_UNAVAILABLE";
  readonly status = 404;
  readonly publicMessage = "Software approval record not found or not available.";

  constructor() {
    super("Approval subject does not exist in the active workspace");
    this.name = "ApprovalAuthorityNotFoundError";
  }
}

interface ApprovalAuthorityServiceOptions {
  readonly idFactory?: () => string;
  readonly now?: () => string;
}

export type ConsiderFindingResult =
  | AutomatedHoldRepositoryResult
  | {
      readonly outcome: "NO_CHANGE";
      readonly reason:
        | "FINDING_DOES_NOT_AUTHORIZE_A_STATE_CHANGE"
        | "FROZEN_RETRY_REQUIRED";
      readonly snapshot: ApprovalAuthoritySnapshot;
    };

function exactReceiptForFinding(
  bundle: EvidenceReceiptBundle | undefined,
  finding: BoundedFindingEvaluation,
  workspaceId: string,
  softwareId: string,
): EvidenceReceiptBundle {
  if (!bundle) {
    throw new ApprovalAuthorityIntegrityError(
      "A consequential approval hold requires a stored evidence receipt",
    );
  }
  const verification = verifyEvidenceReceiptBundle(bundle);
  if (verification.status !== "VALID") {
    throw new ApprovalAuthorityIntegrityError(
      "The evidence receipt did not pass independent verification",
    );
  }
  if (
    bundle.receipt.workspaceId !== workspaceId ||
    bundle.receipt.findingId !== finding.finding.id ||
    bundle.receipt.runId !== finding.finding.runId ||
    bundle.receipt.findingState !== finding.finding.state ||
    bundle.receipt.runManifestHash !==
      finding.deterministicBasis.runManifestHash ||
    bundle.content.scope.softwareId !== softwareId
  ) {
    throw new ApprovalAuthorityIntegrityError(
      "The evidence receipt is not the exact receipt for this software finding",
    );
  }
  return bundle;
}

function frozenVisibilityRetry(
  proof: VisibilityLossProof | undefined,
  finding: BoundedFindingEvaluation,
): proof is VisibilityLossProof {
  if (!proof) return false;
  return (
    Boolean(proof.priorVisibleAttempt) &&
    proof.priorVisibleAttempt?.runId !== proof.firstAttempt.runId &&
    proof.priorVisibleAttempt?.runId !== proof.retryAttempt.runId &&
    proof.priorVisibleAttempt?.snapshotHash ===
      proof.firstAttempt.snapshotHash &&
    proof.firstAttempt.findingId !== proof.retryAttempt.findingId &&
    proof.retryAttempt.findingId === finding.finding.id &&
    proof.retryAttempt.runId === finding.finding.runId &&
    proof.retryAttempt.retryOfRunId === proof.firstAttempt.runId &&
    proof.firstAttempt.snapshotHash === proof.retryAttempt.snapshotHash &&
    finding.finding.checkpoints.some(
      ({ checkpointId, required, visible }) =>
        checkpointId === proof.checkpointId && required && !visible,
    )
  );
}

export class ApprovalAuthorityService {
  readonly #repository: ApprovalAuthorityRepository;
  readonly #authorization: Pick<WorkspaceAuthorizationService, "checkPermission">;
  readonly #idFactory: () => string;
  readonly #now: () => string;

  constructor(
    repository: ApprovalAuthorityRepository,
    authorization: Pick<WorkspaceAuthorizationService, "checkPermission">,
    options: ApprovalAuthorityServiceOptions = {},
  ) {
    this.#repository = repository;
    this.#authorization = authorization;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async #requiredSnapshot(
    workspaceId: string,
    softwareId: string,
  ): Promise<ApprovalAuthoritySnapshot> {
    const snapshot = await this.#repository.getSnapshot(workspaceId, softwareId);
    if (!snapshot) throw new ApprovalAuthorityNotFoundError();
    return snapshot;
  }

  async considerFinding(candidate: unknown): Promise<ConsiderFindingResult> {
    const input = considerFindingInputSchema.parse(candidate);
    if (input.findingEvaluation.finding.workspaceId !== input.workspaceId) {
      throw new ApprovalAuthorityIntegrityError(
        "The finding is outside the approval workspace",
      );
    }
    let reason: "WITNESSED_CONFLICT" | "REQUIRED_VISIBILITY_LOSS";
    let checkpointId: string | undefined;
    if (input.findingEvaluation.finding.state === "WITNESSED_CONFLICT") {
      reason = "WITNESSED_CONFLICT";
    } else if (input.findingEvaluation.finding.state === "NOT_VISIBLE") {
      if (
        !frozenVisibilityRetry(
          input.visibilityLossProof,
          input.findingEvaluation,
        )
      ) {
        return {
          outcome: "NO_CHANGE",
          reason: "FROZEN_RETRY_REQUIRED",
          snapshot: await this.#requiredSnapshot(
            input.workspaceId,
            input.softwareId,
          ),
        };
      }
      reason = "REQUIRED_VISIBILITY_LOSS";
      checkpointId = input.visibilityLossProof.checkpointId;
    } else {
      return {
        outcome: "NO_CHANGE",
        reason: "FINDING_DOES_NOT_AUTHORIZE_A_STATE_CHANGE",
        snapshot: await this.#requiredSnapshot(
          input.workspaceId,
          input.softwareId,
        ),
      };
    }
    const receiptBundle = exactReceiptForFinding(
      input.receiptBundle,
      input.findingEvaluation,
      input.workspaceId,
      input.softwareId,
    );
    const occurredAt = this.#now();
    const contribution = holdReceiptContributionSchema.parse({
      id: this.#idFactory(),
      workspaceId: input.workspaceId,
      softwareId: input.softwareId,
      receiptId: receiptBundle.receipt.id,
      findingId: input.findingEvaluation.finding.id,
      findingState: input.findingEvaluation.finding.state,
      reason,
      ...(checkpointId ? { checkpointId } : {}),
      actor: input.actor,
      occurredAt,
    });
    const event = approvalEventSchema.parse({
      eventId: this.#idFactory(),
      workspaceId: input.workspaceId,
      softwareId: input.softwareId,
      from: "APPROVED",
      to: "HOLD",
      reason,
      receiptId: receiptBundle.receipt.id,
      idempotencyKey: input.idempotencyKey,
      actor: input.actor,
      occurredAt,
    });
    const approvalOrigin = approvalOriginSchema.parse({
      id: this.#idFactory(),
      workspaceId: input.workspaceId,
      softwareId: input.softwareId,
      state: "HOLD",
      setBy: {
        ...input.actor,
        displayName: "Pactwire deterministic approval authority",
      },
      reason,
      sourceReference: receiptBundle.receipt.id,
      recordedBy: input.actor,
      recordedAt: occurredAt,
    });
    return this.#repository.applyAutomatedHold({
      contribution,
      event,
      approvalOrigin,
    });
  }

  async getApproval(candidate: unknown): Promise<ApprovalAuthoritySnapshot> {
    const input = z
      .object({
        principal: workspacePrincipalSchema,
        workspaceId: uuid,
        softwareId: uuid,
      })
      .strict()
      .parse(candidate);
    await this.#authorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "EVIDENCE_REVIEW",
    });
    return this.#requiredSnapshot(input.workspaceId, input.softwareId);
  }

  async recordHumanDecision(candidate: unknown): Promise<{
    readonly outcome: "DECISION_RECORDED";
    readonly snapshot: ApprovalAuthoritySnapshot;
  }> {
    const input = humanDecisionInputSchema.parse(candidate);
    await this.#authorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "APPROVAL_RESTORE",
    });
    if (
      input.outcome === "RESTORE_APPROVED" &&
      (!input.reviewedRun ||
        ![
          "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS",
          "NOT_REOBSERVED_IN_NAMED_TESTS",
        ].includes(input.reviewedRun.findingState))
    ) {
      throw new ApprovalAuthorityIntegrityError(
        "Approval restoration requires a named clean rerun for human review",
      );
    }
    const signedAt = this.#now();
    const decisionId = this.#idFactory();
    const actor = humanActorSchema.parse({
      kind: "HUMAN",
      actorId: input.principal.userId,
    });
    const decision = signedApprovalDecisionSchema.parse({
      id: decisionId,
      workspaceId: input.workspaceId,
      softwareId: input.softwareId,
      ...(input.reviewedRun ? { runId: input.reviewedRun.runId } : {}),
      outcome: input.outcome,
      rationale: input.rationale,
      namedScopeAcknowledged: true,
      actor,
      signedAt,
      receiptId: input.receiptId,
      ...(input.reviewedRun ? { reviewedRun: input.reviewedRun } : {}),
    });
    const target = {
      RESTORE_APPROVED: "APPROVED",
      REJECT: "REJECTED",
      RETIRE: "RETIRED",
    } as const;
    if (input.outcome === "KEEP_HOLD") {
      return {
        outcome: "DECISION_RECORDED",
        snapshot: await this.#repository.recordHumanDecision({ decision }),
      };
    }
    const to = target[input.outcome];
    const reason =
      input.outcome === "RESTORE_APPROVED"
        ? "HUMAN_DECISION"
        : input.outcome === "REJECT"
          ? "HUMAN_REJECTION"
          : "HUMAN_RETIREMENT";
    const event = approvalEventSchema.parse({
      eventId: this.#idFactory(),
      workspaceId: input.workspaceId,
      softwareId: input.softwareId,
      from: "HOLD",
      to,
      reason,
      receiptId: input.receiptId,
      idempotencyKey: `decision:${decision.id}`,
      ...(input.outcome === "RESTORE_APPROVED"
        ? { humanDecisionId: decision.id }
        : {}),
      actor,
      occurredAt: signedAt,
    });
    const approvalOrigin = approvalOriginSchema.parse({
      id: this.#idFactory(),
      workspaceId: input.workspaceId,
      softwareId: input.softwareId,
      state: to,
      setBy: {
        ...actor,
        displayName: input.principal.displayName,
      },
      reason: input.rationale,
      sourceReference: decision.id,
      recordedBy: actor,
      recordedAt: signedAt,
    });
    return {
      outcome: "DECISION_RECORDED",
      snapshot: await this.#repository.recordHumanDecision({
        decision,
        event,
        approvalOrigin,
      }),
    };
  }
}

function toTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function jsonValue<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

export class PostgresApprovalAuthorityRepository
  implements ApprovalAuthorityRepository
{
  readonly #database: MigrationDatabase;

  constructor(database: MigrationDatabase) {
    this.#database = database;
  }

  initialize(): Promise<void> {
    return Promise.reject(
      new Error("PostgreSQL approval subjects are initialized by software inventory"),
    );
  }

  async getSnapshot(
    workspaceId: string,
    softwareId: string,
  ): Promise<ApprovalAuthoritySnapshot | undefined> {
    const scope = uuid.parse(workspaceId);
    const id = uuid.parse(softwareId);
    const software = await this.#database.query<{
      readonly name: string;
      readonly approval_state: ApprovalState;
      readonly origin_id: string;
      readonly origin_state: ApprovalState;
      readonly set_by: unknown;
      readonly reason: string;
      readonly source_reference: string | null;
      readonly recorded_by: unknown;
      readonly recorded_at: string | Date;
    }>(
      `SELECT software.name, software.approval_state,
              origin.id AS origin_id, origin.state AS origin_state,
              origin.set_by, origin.reason, origin.source_reference,
              origin.recorded_by, origin.recorded_at
         FROM software_records AS software
         INNER JOIN LATERAL (
           SELECT candidate.* FROM software_approval_origins AS candidate
            WHERE candidate.workspace_id = software.workspace_id
              AND candidate.software_id = software.id
            ORDER BY candidate.recorded_at DESC, candidate.id DESC LIMIT 1
         ) AS origin ON true
        WHERE software.workspace_id = $1 AND software.id = $2`,
      [scope, id],
    );
    const row = software.rows[0];
    if (!row) return undefined;
    const eventRows = await this.#database.query<{
      readonly id: string;
      readonly previous_state: ApprovalState;
      readonly next_state: ApprovalState;
      readonly reason: string;
      readonly receipt_id: string | null;
      readonly idempotency_key: string | null;
      readonly human_decision_id: string | null;
      readonly actor: unknown;
      readonly occurred_at: string | Date;
    }>(
      "SELECT id, previous_state, next_state, reason, receipt_id, idempotency_key, human_decision_id, actor, occurred_at FROM approval_events WHERE workspace_id = $1 AND software_id = $2 ORDER BY occurred_at, id",
      [scope, id],
    );
    const decisionRows = await this.#database.query<{
      readonly id: string;
      readonly run_id: string | null;
      readonly outcome: SignedApprovalDecision["outcome"];
      readonly rationale: string;
      readonly named_scope_acknowledged: boolean;
      readonly actor: unknown;
      readonly signed_at: string | Date;
      readonly receipt_id: string;
      readonly reviewed_finding_state: SignedApprovalDecision["reviewedRun"] extends {
        findingState: infer State;
      }
        ? State
        : string | null;
    }>(
      "SELECT id, run_id, outcome, rationale, named_scope_acknowledged, actor, signed_at, receipt_id, reviewed_finding_state FROM human_decisions WHERE workspace_id = $1 AND software_id = $2 ORDER BY signed_at, id",
      [scope, id],
    );
    const contributionRows = await this.#database.query<{
      readonly id: string;
      readonly receipt_id: string;
      readonly finding_id: string;
      readonly finding_state: "WITNESSED_CONFLICT" | "NOT_VISIBLE";
      readonly reason: "WITNESSED_CONFLICT" | "REQUIRED_VISIBILITY_LOSS";
      readonly checkpoint_id: string | null;
      readonly actor: unknown;
      readonly occurred_at: string | Date;
    }>(
      "SELECT id, receipt_id, finding_id, finding_state, reason, checkpoint_id, actor, occurred_at FROM approval_hold_receipts WHERE workspace_id = $1 AND software_id = $2 ORDER BY occurred_at, id",
      [scope, id],
    );
    return immutableClone(
      approvalAuthoritySnapshotSchema.parse({
        workspaceId: scope,
        softwareId: id,
        softwareName: row.name,
        state: row.approval_state,
        approvalOrigin: {
          id: row.origin_id,
          workspaceId: scope,
          softwareId: id,
          state: row.origin_state,
          setBy: jsonValue(row.set_by),
          reason: row.reason,
          ...(row.source_reference
            ? { sourceReference: row.source_reference }
            : {}),
          recordedBy: jsonValue(row.recorded_by),
          recordedAt: toTimestamp(row.recorded_at),
        },
        events: eventRows.rows.map((event) => ({
          eventId: event.id,
          workspaceId: scope,
          softwareId: id,
          from: event.previous_state,
          to: event.next_state,
          reason: event.reason,
          ...(event.receipt_id ? { receiptId: event.receipt_id } : {}),
          ...(event.idempotency_key
            ? { idempotencyKey: event.idempotency_key }
            : {}),
          ...(event.human_decision_id
            ? { humanDecisionId: event.human_decision_id }
            : {}),
          actor: jsonValue(event.actor),
          occurredAt: toTimestamp(event.occurred_at),
        })),
        decisions: decisionRows.rows.map((decision) => ({
          id: decision.id,
          workspaceId: scope,
          softwareId: id,
          ...(decision.run_id ? { runId: decision.run_id } : {}),
          outcome: decision.outcome,
          rationale: decision.rationale,
          namedScopeAcknowledged: decision.named_scope_acknowledged,
          actor: jsonValue(decision.actor),
          signedAt: toTimestamp(decision.signed_at),
          receiptId: decision.receipt_id,
          ...(decision.run_id && decision.reviewed_finding_state
            ? {
                reviewedRun: {
                  runId: decision.run_id,
                  findingState: decision.reviewed_finding_state,
                },
              }
            : {}),
        })),
        holdReceipts: contributionRows.rows.map((contribution) => ({
          id: contribution.id,
          workspaceId: scope,
          softwareId: id,
          receiptId: contribution.receipt_id,
          findingId: contribution.finding_id,
          findingState: contribution.finding_state,
          reason: contribution.reason,
          ...(contribution.checkpoint_id
            ? { checkpointId: contribution.checkpoint_id }
            : {}),
          actor: jsonValue(contribution.actor),
          occurredAt: toTimestamp(contribution.occurred_at),
        })),
      }),
    );
  }

  async applyAutomatedHold(
    command: AutomatedHoldCommand,
  ): Promise<AutomatedHoldRepositoryResult> {
    const contribution = holdReceiptContributionSchema.parse(
      command.contribution,
    );
    const event = approvalEventSchema.parse(command.event);
    const origin = approvalOriginSchema.parse(command.approvalOrigin);
    await this.#database.exec("BEGIN");
    try {
      const current = await this.#database.query<{ approval_state: ApprovalState }>(
        "SELECT approval_state FROM software_records WHERE workspace_id = $1 AND id = $2 FOR UPDATE",
        [contribution.workspaceId, contribution.softwareId],
      );
      const state = current.rows[0]?.approval_state;
      if (!state) throw new ApprovalAuthorityNotFoundError();
      const existing = await this.#database.query<{ id: string }>(
        "SELECT id FROM approval_hold_receipts WHERE workspace_id = $1 AND software_id = $2 AND receipt_id = $3",
        [contribution.workspaceId, contribution.softwareId, contribution.receiptId],
      );
      if (existing.rows[0]) {
        await this.#database.exec("COMMIT");
        const snapshot = await this.getSnapshot(
          contribution.workspaceId,
          contribution.softwareId,
        );
        if (!snapshot) throw new ApprovalAuthorityNotFoundError();
        return { outcome: "ALREADY_RECORDED", snapshot };
      }
      await this.#database.query(
        "INSERT INTO approval_hold_receipts (workspace_id, id, software_id, receipt_id, finding_id, finding_state, reason, checkpoint_id, actor, occurred_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        [
          contribution.workspaceId,
          contribution.id,
          contribution.softwareId,
          contribution.receiptId,
          contribution.findingId,
          contribution.findingState,
          contribution.reason,
          contribution.checkpointId ?? null,
          contribution.actor,
          contribution.occurredAt,
        ],
      );
      let outcome: AutomatedHoldRepositoryResult["outcome"] =
        state === "HOLD" ? "ALREADY_HOLD" : "NOT_APPROVED";
      if (state === "APPROVED") {
        await this.#database.query(
          "INSERT INTO approval_events (workspace_id, id, software_id, previous_state, next_state, reason, receipt_id, idempotency_key, actor_kind, actor, occurred_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
          [
            event.workspaceId,
            event.eventId,
            event.softwareId,
            event.from,
            event.to,
            event.reason,
            event.receiptId,
            event.idempotencyKey,
            event.actor.kind,
            event.actor,
            event.occurredAt,
          ],
        );
        await this.#database.query(
          "UPDATE software_records SET approval_state = 'HOLD', approval_owner = 'AUTOMATION' WHERE workspace_id = $1 AND id = $2 AND approval_state = 'APPROVED'",
          [event.workspaceId, event.softwareId],
        );
        await this.#database.query(
          "INSERT INTO software_approval_origins (workspace_id, id, software_id, state, actor_kind, set_by, reason, source_reference, recorded_by, recorded_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
          [
            origin.workspaceId,
            origin.id,
            origin.softwareId,
            origin.state,
            origin.setBy.kind,
            origin.setBy,
            origin.reason,
            origin.sourceReference ?? null,
            origin.recordedBy,
            origin.recordedAt,
          ],
        );
        outcome = "HOLD_APPLIED";
      }
      await this.#database.exec("COMMIT");
      const snapshot = await this.getSnapshot(
        contribution.workspaceId,
        contribution.softwareId,
      );
      if (!snapshot) throw new ApprovalAuthorityNotFoundError();
      return { outcome, snapshot };
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async recordHumanDecision(
    command: HumanDecisionCommand,
  ): Promise<ApprovalAuthoritySnapshot> {
    const decision = signedApprovalDecisionSchema.parse(command.decision);
    await this.#database.exec("BEGIN");
    try {
      const current = await this.#database.query<{ approval_state: ApprovalState }>(
        "SELECT approval_state FROM software_records WHERE workspace_id = $1 AND id = $2 FOR UPDATE",
        [decision.workspaceId, decision.softwareId],
      );
      if (current.rows[0]?.approval_state !== "HOLD") {
        throw new Error("Human hold decisions require current HOLD state");
      }
      const receipt = await this.#database.query<{ id: string }>(
        "SELECT id FROM approval_hold_receipts WHERE workspace_id = $1 AND software_id = $2 AND receipt_id = $3",
        [decision.workspaceId, decision.softwareId, decision.receiptId],
      );
      if (!receipt.rows[0]) {
        throw new Error("Decision receipt did not contribute to this hold");
      }
      await this.#database.query(
        "INSERT INTO human_decisions (workspace_id, id, software_id, run_id, outcome, rationale, named_scope_acknowledged, actor, signed_at, receipt_id, reviewed_finding_state) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        [
          decision.workspaceId,
          decision.id,
          decision.softwareId,
          decision.runId ?? null,
          decision.outcome,
          decision.rationale,
          decision.namedScopeAcknowledged,
          decision.actor,
          decision.signedAt,
          decision.receiptId,
          decision.reviewedRun?.findingState ?? null,
        ],
      );
      if (command.event && command.approvalOrigin) {
        const event = approvalEventSchema.parse(command.event);
        const origin = approvalOriginSchema.parse(command.approvalOrigin);
        await this.#database.query(
          "INSERT INTO approval_events (workspace_id, id, software_id, previous_state, next_state, reason, receipt_id, idempotency_key, human_decision_id, actor_kind, actor, occurred_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
          [
            event.workspaceId,
            event.eventId,
            event.softwareId,
            event.from,
            event.to,
            event.reason,
            event.receiptId,
            event.idempotencyKey,
            event.humanDecisionId ?? null,
            event.actor.kind,
            event.actor,
            event.occurredAt,
          ],
        );
        await this.#database.query(
          "UPDATE software_records SET approval_state = $3, approval_owner = 'HUMAN' WHERE workspace_id = $1 AND id = $2 AND approval_state = 'HOLD'",
          [event.workspaceId, event.softwareId, event.to],
        );
        await this.#database.query(
          "INSERT INTO software_approval_origins (workspace_id, id, software_id, state, actor_kind, set_by, reason, source_reference, recorded_by, recorded_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
          [
            origin.workspaceId,
            origin.id,
            origin.softwareId,
            origin.state,
            origin.setBy.kind,
            origin.setBy,
            origin.reason,
            origin.sourceReference ?? null,
            origin.recordedBy,
            origin.recordedAt,
          ],
        );
      }
      await this.#database.exec("COMMIT");
      const snapshot = await this.getSnapshot(decision.workspaceId, decision.softwareId);
      if (!snapshot) throw new ApprovalAuthorityNotFoundError();
      return snapshot;
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }
}
