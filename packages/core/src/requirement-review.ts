import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  auditEventSchema,
  confirmedRequirementSchema,
  humanActorSchema,
  requirementProposalDetailsSchema,
  requirementVersionSchema,
  reviewedRequirementSchema,
  type ConfirmedRequirementVersion,
  type AuditEvent,
  type RequirementChange,
  type RequirementProposalDetails,
  type RequirementVersion,
  type ReviewedRequirementVersion,
} from "./domain.js";
import {
  workspacePrincipalSchema,
  type WorkspaceAuthorizationService,
} from "./authorization.js";
import type { AgreementIntakeService } from "./agreement-intake.js";
import type { MigrationDatabase } from "./migrations.js";
import type { RequirementProposalRepository } from "./requirement-proposals.js";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const rationale = z.string().trim().min(1).max(4_000);

const reviewEditsSchema = z
  .object({
    plainLanguage: z.string().trim().min(1).max(2_000).optional(),
    sourceText: z.string().min(1).max(20_000).optional(),
    pageNumber: z.number().int().positive().nullable().optional(),
    section: z.string().trim().min(1).max(500).nullable().optional(),
    dataField: z.string().trim().min(1).max(1_000).optional(),
    action: z.string().trim().min(1).max(1_000).optional(),
    recipientRestriction: z.string().trim().min(1).max(2_000).optional(),
    purposeRestriction: z.string().trim().min(1).max(2_000).nullable().optional(),
    ambiguity: z.enum(["CLEAR", "AMBIGUOUS"]).optional(),
    ambiguityReason: z.string().trim().min(1).max(2_000).nullable().optional(),
    suggestedObservableTest: z.string().trim().min(1).max(4_000).optional(),
  })
  .strict();

const reviewInputSchema = z
  .object({
    id: uuid,
    source: requirementVersionSchema,
    decision: z.enum(["CONFIRM", "REJECT", "AMBIGUOUS"]),
    executable: z.boolean().optional(),
    edits: reviewEditsSchema.optional(),
    rationale,
    reviewedBy: humanActorSchema,
    reviewedAt: timestamp,
  })
  .strict();

export type RequirementReviewDecision = z.infer<
  typeof reviewInputSchema
>["decision"];
export type RequirementReviewVersion =
  | ConfirmedRequirementVersion
  | ReviewedRequirementVersion;

const detailFields = [
  "plainLanguage",
  "sourceText",
  "pageNumber",
  "section",
  "dataField",
  "action",
  "recipientRestriction",
  "purposeRestriction",
  "ambiguity",
  "ambiguityReason",
  "suggestedObservableTest",
] as const satisfies readonly (keyof RequirementProposalDetails)[];

function canonicalValue(value: unknown): string {
  return JSON.stringify(value ?? null);
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

function changed(
  field: string,
  oldValue: unknown,
  newValue: unknown,
): RequirementChange | undefined {
  const canonicalOld = canonicalValue(oldValue);
  const canonicalNew = canonicalValue(newValue);
  return canonicalOld === canonicalNew
    ? undefined
    : { field, oldValue: canonicalOld, newValue: canonicalNew };
}

function sourceRationale(source: RequirementVersion): string | null {
  return source.status === "PROPOSED" ? null : source.reviewRationale;
}

export function buildRequirementReviewVersion(
  candidate: unknown,
): RequirementReviewVersion {
  const input = reviewInputSchema.parse(candidate);
  const source = input.source;
  const decision = input.decision;
  const executable = decision === "CONFIRM" ? (input.executable ?? true) : false;
  const mergedDetails = {
    ...source.details,
    ...(input.edits ?? {}),
    ...(decision === "AMBIGUOUS"
      ? {
          ambiguity: "AMBIGUOUS" as const,
          ambiguityReason: input.rationale,
        }
      : {}),
  };
  if (
    decision === "CONFIRM" &&
    executable &&
    mergedDetails.ambiguity === "AMBIGUOUS"
  ) {
    throw new TypeError("Ambiguous details cannot become an executable rule");
  }
  const details = requirementProposalDetailsSchema.parse(mergedDetails);
  const status =
    decision === "CONFIRM"
      ? ("CONFIRMED" as const)
      : decision === "REJECT"
        ? ("REJECTED" as const)
        : ("AMBIGUOUS" as const);
  const changes = detailFields
    .map((field) =>
      changed(`details.${field}`, source.details[field], details[field]),
    )
    .filter((item): item is RequirementChange => item !== undefined);
  for (const item of [
    changed("status", source.status, status),
    changed("executable", source.executable, executable),
    changed("reviewRationale", sourceRationale(source), input.rationale),
  ]) {
    if (item) changes.push(item);
  }
  const common = {
    id: input.id,
    workspaceId: source.workspaceId,
    agreementVersionId: source.agreementVersionId,
    requirementKey: source.requirementKey,
    version: source.version + 1,
    sourceVersionId: source.id,
    status,
    executable,
    plainLanguage: details.plainLanguage,
    details,
    citation: source.citation,
    reviewRationale: input.rationale,
    changes,
    createdAt: new Date(input.reviewedAt).toISOString(),
  };
  if (decision === "CONFIRM") {
    const reviewed = confirmedRequirementSchema.parse({
      ...common,
      ...(executable
        ? {
            predicate: {
              kind: "OBSERVABLE_DATA_FLOW",
              dataField: details.dataField,
              action: details.action,
              recipientRestriction: details.recipientRestriction,
              purposeRestriction: details.purposeRestriction,
              suggestedObservableTest: details.suggestedObservableTest,
            },
          }
        : {}),
      confirmedBy: input.reviewedBy,
      confirmedAt: new Date(input.reviewedAt).toISOString(),
    });
    return immutableClone(reviewed);
  }
  const reviewed = reviewedRequirementSchema.parse({
    ...common,
    reviewedBy: input.reviewedBy,
    reviewedAt: new Date(input.reviewedAt).toISOString(),
  });
  return immutableClone(reviewed);
}

export class RequirementVersionUnavailableError extends Error {
  readonly code = "REQUIREMENT_VERSION_UNAVAILABLE";
  readonly status = 404;
  readonly publicMessage = "Requirement version not found or not available.";

  constructor() {
    super("Requirement version is outside the authorized agreement boundary");
    this.name = "RequirementVersionUnavailableError";
  }
}

export class RequirementReviewConflictError extends Error {
  readonly code = "REQUIREMENT_REVIEW_CONFLICT";
  readonly status = 409;
  readonly publicMessage =
    "This requirement changed after it was loaded. Review the latest version and try again.";

  constructor() {
    super("Requirement review must append to the current latest version");
    this.name = "RequirementReviewConflictError";
  }
}

export interface RequirementReviewRepository {
  getVersion(
    workspaceId: string,
    agreementVersionId: string,
    requirementVersionId: string,
  ): Promise<RequirementVersion | undefined>;
  listVersions(
    workspaceId: string,
    agreementVersionId: string,
  ): Promise<readonly RequirementVersion[]>;
  appendReview(
    version: RequirementReviewVersion,
    audit: AuditEvent,
  ): Promise<RequirementReviewVersion>;
}

function validateReviewAppend(
  source: RequirementVersion | undefined,
  latest: RequirementVersion | undefined,
  version: RequirementReviewVersion,
  audit: AuditEvent,
): void {
  if (!source) throw new RequirementVersionUnavailableError();
  if (
    latest?.id !== source.id ||
    version.sourceVersionId !== source.id ||
    version.workspaceId !== source.workspaceId ||
    version.agreementVersionId !== source.agreementVersionId ||
    version.requirementKey !== source.requirementKey ||
    version.version !== source.version + 1
  ) {
    throw new RequirementReviewConflictError();
  }
  if (
    audit.workspaceId !== version.workspaceId ||
    audit.subjectType !== "requirement_version" ||
    audit.subjectId !== version.id ||
    audit.actor.kind !== "HUMAN"
  ) {
    throw new TypeError("Requirement review and audit must share one human subject");
  }
}

type ProposalHistorySource = Pick<RequirementProposalRepository, "listProposals">;

export class InMemoryRequirementReviewRepository
  implements RequirementReviewRepository
{
  readonly #proposals: ProposalHistorySource;
  readonly #reviews: RequirementReviewVersion[] = [];
  #writeTail: Promise<void> = Promise.resolve();
  readonly #auditSink:
    | { appendAuditEvent(audit: AuditEvent): Promise<void> }
    | undefined;

  constructor(
    proposals: ProposalHistorySource,
    auditSink?: { appendAuditEvent(audit: AuditEvent): Promise<void> },
  ) {
    this.#proposals = proposals;
    this.#auditSink = auditSink;
  }

  async #all(
    workspaceId: string,
    agreementVersionId: string,
  ): Promise<readonly RequirementVersion[]> {
    const proposals = await this.#proposals.listProposals(
      workspaceId,
      agreementVersionId,
    );
    return [...proposals, ...this.#reviews].filter(
      (version) =>
        version.workspaceId === workspaceId &&
        version.agreementVersionId === agreementVersionId,
    );
  }

  async getVersion(
    workspaceId: string,
    agreementVersionId: string,
    requirementVersionId: string,
  ): Promise<RequirementVersion | undefined> {
    const versions = await this.#all(workspaceId, agreementVersionId);
    const version = versions.find((item) => item.id === requirementVersionId);
    return version ? immutableClone(version) : undefined;
  }

  async listVersions(
    workspaceId: string,
    agreementVersionId: string,
  ): Promise<readonly RequirementVersion[]> {
    const versions = await this.#all(workspaceId, agreementVersionId);
    return immutableClone(
      [...versions].sort(
        (left, right) =>
          right.version - left.version ||
          right.createdAt.localeCompare(left.createdAt),
      ),
    );
  }

  async appendReview(
    versionCandidate: RequirementReviewVersion,
    auditCandidate: AuditEvent,
  ): Promise<RequirementReviewVersion> {
    const version = requirementVersionSchema.parse(
      versionCandidate,
    ) as RequirementReviewVersion;
    const audit = auditEventSchema.parse(auditCandidate);
    const previousWrite = this.#writeTail;
    let releaseWrite: (() => void) | undefined;
    this.#writeTail = new Promise((resolve) => {
      releaseWrite = resolve;
    });
    await previousWrite;
    try {
      const versions = await this.#all(
        version.workspaceId,
        version.agreementVersionId,
      );
      const source = versions.find((item) => item.id === version.sourceVersionId);
      const latest = versions
        .filter((item) => item.requirementKey === version.requirementKey)
        .sort((left, right) => right.version - left.version)[0];
      validateReviewAppend(source, latest, version, audit);
      if (this.#auditSink) await this.#auditSink.appendAuditEvent(audit);
      this.#reviews.push(immutableClone(version));
      return immutableClone(version);
    } finally {
      releaseWrite?.();
    }
  }
}

interface RequirementPayloadRow {
  readonly payload: unknown;
}

function jsonValue<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

export class PostgresRequirementReviewRepository
  implements RequirementReviewRepository
{
  readonly #database: MigrationDatabase;

  constructor(database: MigrationDatabase) {
    this.#database = database;
  }

  async getVersion(
    workspaceId: string,
    agreementVersionId: string,
    requirementVersionId: string,
  ): Promise<RequirementVersion | undefined> {
    const result = await this.#database.query<RequirementPayloadRow>(
      "SELECT payload FROM requirement_versions WHERE workspace_id = $1 AND agreement_version_id = $2 AND id = $3",
      [workspaceId, agreementVersionId, requirementVersionId],
    );
    const payload = result.rows[0]?.payload;
    return payload === undefined
      ? undefined
      : requirementVersionSchema.parse(jsonValue(payload));
  }

  async listVersions(
    workspaceId: string,
    agreementVersionId: string,
  ): Promise<readonly RequirementVersion[]> {
    const result = await this.#database.query<RequirementPayloadRow>(
      "SELECT payload FROM requirement_versions WHERE workspace_id = $1 AND agreement_version_id = $2 ORDER BY requirement_key, version DESC, created_at DESC, id DESC",
      [workspaceId, agreementVersionId],
    );
    return immutableClone(
      result.rows.map((row) =>
        requirementVersionSchema.parse(jsonValue(row.payload)),
      ),
    );
  }

  async appendReview(
    versionCandidate: RequirementReviewVersion,
    auditCandidate: AuditEvent,
  ): Promise<RequirementReviewVersion> {
    const version = requirementVersionSchema.parse(
      versionCandidate,
    ) as RequirementReviewVersion;
    const audit = auditEventSchema.parse(auditCandidate);
    await this.#database.exec("BEGIN");
    try {
      const sourceResult = await this.#database.query<RequirementPayloadRow>(
        "SELECT payload FROM requirement_versions WHERE workspace_id = $1 AND agreement_version_id = $2 AND id = $3 FOR UPDATE",
        [version.workspaceId, version.agreementVersionId, version.sourceVersionId],
      );
      const latestResult = await this.#database.query<RequirementPayloadRow>(
        "SELECT payload FROM requirement_versions WHERE workspace_id = $1 AND agreement_version_id = $2 AND requirement_key = $3 ORDER BY version DESC LIMIT 1 FOR UPDATE",
        [version.workspaceId, version.agreementVersionId, version.requirementKey],
      );
      const sourcePayload = sourceResult.rows[0]?.payload;
      const latestPayload = latestResult.rows[0]?.payload;
      const source =
        sourcePayload === undefined
          ? undefined
          : requirementVersionSchema.parse(jsonValue(sourcePayload));
      const latest =
        latestPayload === undefined
          ? undefined
          : requirementVersionSchema.parse(jsonValue(latestPayload));
      validateReviewAppend(source, latest, version, audit);
      await this.#database.query(
        "INSERT INTO requirement_versions (workspace_id, id, agreement_version_id, requirement_key, version, source_requirement_version_id, status, executable, payload, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        [
          version.workspaceId,
          version.id,
          version.agreementVersionId,
          version.requirementKey,
          version.version,
          version.sourceVersionId,
          version.status,
          version.executable,
          version,
          version.createdAt,
        ],
      );
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
      await this.#database.exec("COMMIT");
      return immutableClone(version);
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }
}

const reviewScopeSchema = z
  .object({
    principal: workspacePrincipalSchema,
    workspaceId: uuid,
    softwareId: uuid,
    agreementVersionId: uuid,
  })
  .strict();

const reviewRequestSchema = reviewScopeSchema.extend({
  sourceVersionId: uuid,
  decision: z.enum(["CONFIRM", "REJECT", "AMBIGUOUS"]),
  executable: z.boolean().optional(),
  edits: reviewEditsSchema.optional(),
  rationale,
});

interface RequirementReviewServiceOptions {
  readonly idFactory?: () => string;
  readonly now?: () => string;
}

export interface RequirementHistory {
  readonly versions: readonly RequirementVersion[];
  readonly current: readonly RequirementVersion[];
}

function currentVersions(
  versions: readonly RequirementVersion[],
): readonly RequirementVersion[] {
  const current = new Map<string, RequirementVersion>();
  for (const version of versions) {
    const prior = current.get(version.requirementKey);
    if (!prior || version.version > prior.version) {
      current.set(version.requirementKey, version);
    }
  }
  return [...current.values()].sort((left, right) =>
    left.requirementKey.localeCompare(right.requirementKey),
  );
}

export class RequirementReviewService {
  readonly #repository: RequirementReviewRepository;
  readonly #agreements: Pick<AgreementIntakeService, "getAgreement">;
  readonly #authorization: Pick<WorkspaceAuthorizationService, "checkPermission">;
  readonly #idFactory: () => string;
  readonly #now: () => string;

  constructor(
    repository: RequirementReviewRepository,
    agreements: Pick<AgreementIntakeService, "getAgreement">,
    authorization: Pick<WorkspaceAuthorizationService, "checkPermission">,
    options: RequirementReviewServiceOptions = {},
  ) {
    this.#repository = repository;
    this.#agreements = agreements;
    this.#authorization = authorization;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async #authorize(
    input: z.infer<typeof reviewScopeSchema>,
    permission: "AGREEMENT_READ" | "REQUIREMENT_CONFIRM",
  ): Promise<void> {
    await this.#authorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission,
    });
    await this.#agreements.getAgreement({
      principal: input.principal,
      workspaceId: input.workspaceId,
      softwareId: input.softwareId,
      agreementVersionId: input.agreementVersionId,
    });
  }

  async reviewRequirement(candidate: unknown): Promise<RequirementReviewVersion> {
    const input = reviewRequestSchema.parse(candidate);
    await this.#authorize(input, "REQUIREMENT_CONFIRM");
    const source = await this.#repository.getVersion(
      input.workspaceId,
      input.agreementVersionId,
      input.sourceVersionId,
    );
    if (!source) throw new RequirementVersionUnavailableError();
    const reviewedAt = new Date(timestamp.parse(this.#now())).toISOString();
    const version = buildRequirementReviewVersion({
      id: this.#idFactory(),
      source,
      decision: input.decision,
      ...(input.executable === undefined
        ? {}
        : { executable: input.executable }),
      ...(input.edits === undefined ? {} : { edits: input.edits }),
      rationale: input.rationale,
      reviewedBy: { kind: "HUMAN", actorId: input.principal.userId },
      reviewedAt,
    });
    const action =
      version.status === "CONFIRMED"
        ? "requirement.confirmed"
        : version.status === "AMBIGUOUS"
          ? "requirement.marked_ambiguous"
          : "requirement.rejected";
    const audit = auditEventSchema.parse({
      eventId: this.#idFactory(),
      eventType: "AUDIT_RECORDED",
      workspaceId: input.workspaceId,
      subjectType: "requirement_version",
      subjectId: version.id,
      action,
      actor: humanActorSchema.parse({
        kind: "HUMAN",
        actorId: input.principal.userId,
      }),
      occurredAt: reviewedAt,
      details: {
        agreementVersionId: input.agreementVersionId,
        requirementKey: version.requirementKey,
        sourceVersionId: version.sourceVersionId,
        version: version.version,
        status: version.status,
        executable: version.executable,
      },
    });
    return this.#repository.appendReview(version, audit);
  }

  async listRequirementHistory(candidate: unknown): Promise<RequirementHistory> {
    const input = reviewScopeSchema.parse(candidate);
    await this.#authorize(input, "AGREEMENT_READ");
    const versions = await this.#repository.listVersions(
      input.workspaceId,
      input.agreementVersionId,
    );
    return immutableClone({ versions, current: currentVersions(versions) });
  }
}
