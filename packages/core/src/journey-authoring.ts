import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  auditEventSchema,
  authorizationActionSchema,
  humanActorSchema,
  journeyCheckpointSchema,
  journeyStepSchema,
  journeyTestFieldSchema,
  journeyVersionSchema,
  type AuditEvent,
  type HumanActor,
  type JourneyVersion,
  type Persona,
  type RequirementVersion,
} from "./domain.js";
import {
  workspacePrincipalSchema,
  type WorkspaceAuthorizationService,
  type WorkspacePrincipal,
} from "./authorization.js";
import type { RequirementReviewRepository } from "./requirement-review.js";
import type { SyntheticDataRepository } from "./synthetic-data.js";
import type { TestAuthorizationRepository } from "./test-authorization.js";
import type { MigrationDatabase } from "./migrations.js";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const nonEmpty = z.string().trim().min(1).max(4_000);

export const journeyAuthoringDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    role: z.enum(["TEACHER", "STUDENT"]),
    goal: nonEmpty,
    startState: nonEmpty,
    requirementVersionIds: z.array(uuid).min(1).max(24),
    authorizationId: uuid,
    personaId: uuid,
    testFields: z.array(journeyTestFieldSchema).min(1).max(24),
    allowedActions: z.array(authorizationActionSchema).min(1),
    prohibitedActions: z.array(authorizationActionSchema),
    checkpoints: z.array(journeyCheckpointSchema).min(1).max(32),
    steps: z.array(journeyStepSchema).min(1).max(64),
  })
  .strict();
export type JourneyAuthoringDraft = z.infer<typeof journeyAuthoringDraftSchema>;

const buildJourneyVersionInputSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    softwareId: uuid,
    agreementVersionId: uuid,
    journeyId: uuid,
    version: z.number().int().positive(),
    sourceVersionId: uuid.nullable(),
    draft: journeyAuthoringDraftSchema,
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

export function buildJourneyVersion(candidate: unknown): JourneyVersion {
  const input = buildJourneyVersionInputSchema.parse(candidate);
  return immutableClone(
    journeyVersionSchema.parse({
      id: input.id,
      workspaceId: input.workspaceId,
      softwareId: input.softwareId,
      agreementVersionId: input.agreementVersionId,
      journeyId: input.journeyId,
      version: input.version,
      sourceVersionId: input.sourceVersionId,
      ...input.draft,
      createdAt: new Date(input.createdAt).toISOString(),
      createdBy: input.createdBy,
    }),
  );
}

export interface JourneyAuthoringRepository {
  appendVersion(version: JourneyVersion, audit: AuditEvent): Promise<JourneyVersion>;
  getVersion(
    workspaceId: string,
    softwareId: string,
    versionId: string,
  ): Promise<JourneyVersion | undefined>;
  listVersions(
    workspaceId: string,
    softwareId: string,
  ): Promise<readonly JourneyVersion[]>;
}

export interface JourneyAuthoringDependencies {
  readonly requirements: Pick<
    RequirementReviewRepository,
    "getVersion" | "listVersions"
  >;
  readonly authorizations: Pick<
    TestAuthorizationRepository,
    "readAuthorization" | "listAuthorizations"
  >;
  readonly personas: Pick<SyntheticDataRepository, "readPersona">;
}

export type JourneyReadinessBlockerCode =
  | "REQUIREMENT_UNAVAILABLE"
  | "REQUIREMENT_NOT_CURRENT"
  | "REQUIREMENT_NOT_EXECUTABLE"
  | "AUTHORIZATION_UNAVAILABLE"
  | "AUTHORIZATION_NOT_CURRENT"
  | "AUTHORIZATION_INACTIVE"
  | "ACTION_OUTSIDE_AUTHORIZATION"
  | "PROHIBITED_ACTION_MISSING"
  | "PERSONA_UNAVAILABLE"
  | "PERSONA_ROLE_MISMATCH"
  | "TEST_FIELD_UNAVAILABLE";

export interface JourneyReadinessBlocker {
  readonly code: JourneyReadinessBlockerCode;
  readonly message: string;
}

export interface JourneyReadiness {
  readonly status: "RUNNABLE" | "BLOCKED";
  readonly blockers: readonly JourneyReadinessBlocker[];
}

export interface JourneyCausalLink {
  readonly requirementVersionId: string;
  readonly requirementText: string | null;
  readonly personaId: string;
  readonly personaDisplayName: string | null;
  readonly fieldId: string;
  readonly sourceField: string;
  readonly checkpointIds: readonly string[];
}

export interface JourneyAuthoringView {
  readonly version: JourneyVersion;
  readonly readiness: JourneyReadiness;
  readonly causalLinks: readonly JourneyCausalLink[];
  readonly lastSuccessfulVersion: null;
  readonly repairHistory: readonly [];
}

export interface JourneyHistoryView {
  readonly versions: readonly JourneyAuthoringView[];
  readonly current: readonly JourneyAuthoringView[];
}

export class JourneyPrerequisiteError extends Error {
  readonly code = "JOURNEY_PREREQUISITE_BLOCKED";
  readonly status = 422;
  readonly publicMessage =
    "This journey is missing a current rule, authorization, fictional field, or required checkpoint.";
  readonly blockers: readonly JourneyReadinessBlocker[];

  constructor(blockers: readonly JourneyReadinessBlocker[]) {
    super("A named journey cannot run with incomplete prerequisites");
    this.name = "JourneyPrerequisiteError";
    this.blockers = immutableClone(blockers);
  }
}

export class JourneyVersionConflictError extends Error {
  readonly code = "JOURNEY_VERSION_CONFLICT";
  readonly status = 409;
  readonly publicMessage =
    "This journey changed after it was loaded. Review the latest version and try again.";

  constructor() {
    super("A journey version must append to the current immutable version");
    this.name = "JourneyVersionConflictError";
  }
}

export class JourneyVersionUnavailableError extends Error {
  readonly code = "JOURNEY_VERSION_UNAVAILABLE";
  readonly status = 404;
  readonly publicMessage = "Journey version not found or not available.";

  constructor() {
    super("The journey version is outside the authorized software boundary");
    this.name = "JourneyVersionUnavailableError";
  }
}

function validateVersionAppend(
  source: JourneyVersion | undefined,
  latest: JourneyVersion | undefined,
  version: JourneyVersion,
  audit: AuditEvent,
): void {
  const initial = version.version === 1 && version.sourceVersionId === null;
  const appended =
    source !== undefined &&
    latest?.id === source.id &&
    version.sourceVersionId === source.id &&
    version.version === source.version + 1 &&
    version.journeyId === source.journeyId &&
    version.workspaceId === source.workspaceId &&
    version.softwareId === source.softwareId &&
    version.agreementVersionId === source.agreementVersionId;
  if (!initial && !appended) throw new JourneyVersionConflictError();
  if (
    audit.workspaceId !== version.workspaceId ||
    audit.subjectType !== "journey_version" ||
    audit.subjectId !== version.id ||
    audit.actor.kind !== "HUMAN"
  ) {
    throw new TypeError("Journey version and audit must share one human subject");
  }
}

export class InMemoryJourneyAuthoringRepository
  implements JourneyAuthoringRepository
{
  readonly #versions: JourneyVersion[] = [];
  #writeTail: Promise<void> = Promise.resolve();
  readonly #auditSink:
    | { appendAuditEvent(audit: AuditEvent): Promise<void> }
    | undefined;

  constructor(auditSink?: { appendAuditEvent(audit: AuditEvent): Promise<void> }) {
    this.#auditSink = auditSink;
  }

  async appendVersion(
    versionCandidate: JourneyVersion,
    auditCandidate: AuditEvent,
  ): Promise<JourneyVersion> {
    const version = journeyVersionSchema.parse(versionCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    const previousWrite = this.#writeTail;
    let releaseWrite: (() => void) | undefined;
    this.#writeTail = new Promise((resolve) => {
      releaseWrite = resolve;
    });
    await previousWrite;
    try {
      const source = version.sourceVersionId
        ? this.#versions.find(
            (item) =>
              item.workspaceId === version.workspaceId &&
              item.softwareId === version.softwareId &&
              item.id === version.sourceVersionId,
          )
        : undefined;
      const latest = this.#versions
        .filter(
          (item) =>
            item.workspaceId === version.workspaceId &&
            item.softwareId === version.softwareId &&
            item.journeyId === version.journeyId,
        )
        .sort((left, right) => right.version - left.version)[0];
      if (
        (version.version === 1 && latest !== undefined) ||
        this.#versions.some(
          (item) =>
            item.workspaceId === version.workspaceId && item.id === version.id,
        )
      ) {
        throw new JourneyVersionConflictError();
      }
      validateVersionAppend(source, latest, version, audit);
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
  ): Promise<JourneyVersion | undefined> {
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
  ): Promise<readonly JourneyVersion[]> {
    const workspaceId = uuid.parse(workspaceIdCandidate);
    const softwareId = uuid.parse(softwareIdCandidate);
    return Promise.resolve(
      immutableClone(
        this.#versions
          .filter(
            (version) =>
              version.workspaceId === workspaceId &&
              version.softwareId === softwareId,
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

interface JourneyPayloadRow {
  readonly payload: unknown;
}

function jsonValue<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

export class PostgresJourneyAuthoringRepository
  implements JourneyAuthoringRepository
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
    versionCandidate: JourneyVersion,
    auditCandidate: AuditEvent,
  ): Promise<JourneyVersion> {
    const version = journeyVersionSchema.parse(versionCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    await this.#database.exec("BEGIN");
    try {
      const sourceResult = version.sourceVersionId
        ? await this.#database.query<JourneyPayloadRow>(
            "SELECT payload FROM journey_versions WHERE workspace_id = $1 AND software_id = $2 AND id = $3 FOR UPDATE",
            [version.workspaceId, version.softwareId, version.sourceVersionId],
          )
        : { rows: [] };
      const latestResult = await this.#database.query<JourneyPayloadRow>(
        "SELECT payload FROM journey_versions WHERE workspace_id = $1 AND software_id = $2 AND journey_id = $3 ORDER BY version DESC LIMIT 1 FOR UPDATE",
        [version.workspaceId, version.softwareId, version.journeyId],
      );
      const sourcePayload = sourceResult.rows[0]?.payload;
      const latestPayload = latestResult.rows[0]?.payload;
      const source =
        sourcePayload === undefined
          ? undefined
          : journeyVersionSchema.parse(jsonValue(sourcePayload));
      const latest =
        latestPayload === undefined
          ? undefined
          : journeyVersionSchema.parse(jsonValue(latestPayload));
      if (version.version === 1 && latest !== undefined) {
        throw new JourneyVersionConflictError();
      }
      validateVersionAppend(source, latest, version, audit);
      await this.#database.query(
        "INSERT INTO journey_versions (workspace_id, id, software_id, agreement_version_id, journey_id, version, source_journey_version_id, authorization_id, persona_id, payload, created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        [
          version.workspaceId,
          version.id,
          version.softwareId,
          version.agreementVersionId,
          version.journeyId,
          version.version,
          version.sourceVersionId,
          version.authorizationId,
          version.personaId,
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
  ): Promise<JourneyVersion | undefined> {
    const result = await this.#database.query<JourneyPayloadRow>(
      "SELECT payload FROM journey_versions WHERE workspace_id = $1 AND software_id = $2 AND id = $3",
      [
        uuid.parse(workspaceIdCandidate),
        uuid.parse(softwareIdCandidate),
        uuid.parse(versionIdCandidate),
      ],
    );
    const payload = result.rows[0]?.payload;
    return payload === undefined
      ? undefined
      : immutableClone(journeyVersionSchema.parse(jsonValue(payload)));
  }

  async listVersions(
    workspaceIdCandidate: string,
    softwareIdCandidate: string,
  ): Promise<readonly JourneyVersion[]> {
    const result = await this.#database.query<JourneyPayloadRow>(
      "SELECT payload FROM journey_versions WHERE workspace_id = $1 AND software_id = $2 ORDER BY version DESC, created_at DESC, id DESC",
      [uuid.parse(workspaceIdCandidate), uuid.parse(softwareIdCandidate)],
    );
    return immutableClone(
      result.rows.map((row) =>
        journeyVersionSchema.parse(jsonValue(row.payload)),
      ),
    );
  }
}

const scopeSchema = z
  .object({
    principal: workspacePrincipalSchema,
    workspaceId: uuid,
    softwareId: uuid,
    agreementVersionId: uuid,
  })
  .strict();

const saveJourneySchema = scopeSchema
  .extend({
    sourceVersionId: uuid.optional(),
    draft: journeyAuthoringDraftSchema,
  })
  .strict();

function scopeFromCandidate(candidate: unknown): z.infer<typeof scopeSchema> {
  const record =
    typeof candidate === "object" && candidate !== null
      ? (candidate as Readonly<Record<string, unknown>>)
      : {};
  return scopeSchema.parse({
    principal: record["principal"],
    workspaceId: record["workspaceId"],
    softwareId: record["softwareId"],
    agreementVersionId: record["agreementVersionId"],
  });
}

interface JourneyAuthoringServiceOptions {
  readonly idFactory?: () => string;
  readonly now?: () => string;
}

function humanActor(principal: WorkspacePrincipal): HumanActor {
  return humanActorSchema.parse({ kind: "HUMAN", actorId: principal.userId });
}

function addBlocker(
  blockers: JourneyReadinessBlocker[],
  code: JourneyReadinessBlockerCode,
  message: string,
): void {
  if (!blockers.some((blocker) => blocker.code === code)) {
    blockers.push({ code, message });
  }
}

function currentRequirement(
  requirement: RequirementVersion,
  versions: readonly RequirementVersion[],
): boolean {
  const latest = versions
    .filter((version) => version.requirementKey === requirement.requirementKey)
    .sort((left, right) => right.version - left.version)[0];
  return latest?.id === requirement.id;
}

export class JourneyAuthoringService {
  readonly #repository: JourneyAuthoringRepository;
  readonly #dependencies: JourneyAuthoringDependencies;
  readonly #authorization: Pick<WorkspaceAuthorizationService, "checkPermission">;
  readonly #idFactory: () => string;
  readonly #now: () => string;

  constructor(
    repository: JourneyAuthoringRepository,
    dependencies: JourneyAuthoringDependencies,
    authorization: Pick<WorkspaceAuthorizationService, "checkPermission">,
    options: JourneyAuthoringServiceOptions = {},
  ) {
    this.#repository = repository;
    this.#dependencies = dependencies;
    this.#authorization = authorization;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  #audit(
    principal: WorkspacePrincipal,
    version: JourneyVersion,
  ): AuditEvent {
    return auditEventSchema.parse({
      eventId: this.#idFactory(),
      eventType: "AUDIT_RECORDED",
      workspaceId: version.workspaceId,
      subjectType: "journey_version",
      subjectId: version.id,
      action: version.version === 1 ? "journey.created" : "journey.versioned",
      actor: humanActor(principal),
      occurredAt: version.createdAt,
      details: {
        journeyId: version.journeyId,
        version: version.version,
        sourceVersionId: version.sourceVersionId,
        requirementVersionIds: version.requirementVersionIds,
        personaId: version.personaId,
        checkpointIds: version.checkpoints.map(
          (checkpoint) => checkpoint.checkpointId,
        ),
      },
    });
  }

  async #assess(
    version: JourneyVersion,
  ): Promise<{
    readonly readiness: JourneyReadiness;
    readonly requirements: ReadonlyMap<string, RequirementVersion>;
    readonly persona: Persona | undefined;
  }> {
    const blockers: JourneyReadinessBlocker[] = [];
    const allRequirements = await this.#dependencies.requirements.listVersions(
      version.workspaceId,
      version.agreementVersionId,
    );
    const requirements = new Map<string, RequirementVersion>();
    for (const requirementVersionId of version.requirementVersionIds) {
      const requirement = await this.#dependencies.requirements.getVersion(
        version.workspaceId,
        version.agreementVersionId,
        requirementVersionId,
      );
      if (!requirement) {
        addBlocker(
          blockers,
          "REQUIREMENT_UNAVAILABLE",
          "A linked requirement is unavailable in this agreement.",
        );
        continue;
      }
      requirements.set(requirement.id, requirement);
      if (!currentRequirement(requirement, allRequirements)) {
        addBlocker(
          blockers,
          "REQUIREMENT_NOT_CURRENT",
          "A linked requirement is not the current immutable version.",
        );
      }
      if (requirement.status !== "CONFIRMED" || !requirement.executable) {
        addBlocker(
          blockers,
          "REQUIREMENT_NOT_EXECUTABLE",
          "A linked requirement is not human-confirmed and executable.",
        );
      }
    }

    const authorization =
      await this.#dependencies.authorizations.readAuthorization(
        version.workspaceId,
        version.softwareId,
        version.authorizationId,
      );
    if (!authorization) {
      addBlocker(
        blockers,
        "AUTHORIZATION_UNAVAILABLE",
        "The linked test authorization is unavailable.",
      );
    } else {
      const authorizations =
        await this.#dependencies.authorizations.listAuthorizations(
          version.workspaceId,
          version.softwareId,
        );
      const latest = [...authorizations].sort(
        (left, right) => right.version - left.version,
      )[0];
      if (latest?.id !== authorization.id) {
        addBlocker(
          blockers,
          "AUTHORIZATION_NOT_CURRENT",
          "The linked authorization is not the current version.",
        );
      }
      const now = Date.parse(this.#now());
      if (
        authorization.status !== "ACTIVE" ||
        now < Date.parse(authorization.validFrom) ||
        now >= Date.parse(authorization.reviewAt) ||
        now >= Date.parse(authorization.expiresAt)
      ) {
        addBlocker(
          blockers,
          "AUTHORIZATION_INACTIVE",
          "The linked authorization is not active or its human review is due.",
        );
      }
      if (
        version.allowedActions.some(
          (action) => !authorization.allowedActions.includes(action),
        )
      ) {
        addBlocker(
          blockers,
          "ACTION_OUTSIDE_AUTHORIZATION",
          "A journey action is outside the authorization allowlist.",
        );
      }
      if (
        authorization.prohibitedActions.some(
          (action) => !version.prohibitedActions.includes(action),
        )
      ) {
        addBlocker(
          blockers,
          "PROHIBITED_ACTION_MISSING",
          "The journey omits an action prohibited by the authorization.",
        );
      }
    }

    const persona = await this.#dependencies.personas.readPersona(
      version.workspaceId,
      version.personaId,
    );
    if (!persona) {
      addBlocker(
        blockers,
        "PERSONA_UNAVAILABLE",
        "The linked fictional persona is unavailable.",
      );
    } else {
      if (persona.role !== version.role) {
        addBlocker(
          blockers,
          "PERSONA_ROLE_MISMATCH",
          "The fictional persona role does not match this journey.",
        );
      }
      const availableFields = new Set([
        "displayName",
        "email",
        ...Object.keys(persona.fields),
      ]);
      if (
        version.testFields.some(
          (field) => !availableFields.has(field.sourceField),
        )
      ) {
        addBlocker(
          blockers,
          "TEST_FIELD_UNAVAILABLE",
          "A linked fictional field is not configured on this persona.",
        );
      }
    }

    return immutableClone({
      readiness: {
        status: blockers.length === 0 ? "RUNNABLE" : "BLOCKED",
        blockers,
      },
      requirements,
      persona,
    });
  }

  async #view(version: JourneyVersion): Promise<JourneyAuthoringView> {
    const assessment = await this.#assess(version);
    const causalLinks = version.testFields.map((field) => {
      const requirement = assessment.requirements.get(
        field.requirementVersionId,
      );
      return {
        requirementVersionId: field.requirementVersionId,
        requirementText: requirement?.plainLanguage ?? null,
        personaId: version.personaId,
        personaDisplayName: assessment.persona?.displayName ?? null,
        fieldId: field.fieldId,
        sourceField: field.sourceField,
        checkpointIds: version.checkpoints
          .filter((checkpoint) => checkpoint.testFieldIds.includes(field.fieldId))
          .map((checkpoint) => checkpoint.checkpointId),
      };
    });
    return immutableClone({
      version,
      readiness: assessment.readiness,
      causalLinks,
      lastSuccessfulVersion: null,
      repairHistory: [],
    });
  }

  async saveJourney(candidate: unknown): Promise<JourneyAuthoringView> {
    const scope = scopeFromCandidate(candidate);
    await this.#authorization.checkPermission({
      principal: scope.principal,
      workspaceId: scope.workspaceId,
      permission: "JOURNEY_MANAGE",
    });
    const input = saveJourneySchema.parse(candidate);
    const source = input.sourceVersionId
      ? await this.#repository.getVersion(
          input.workspaceId,
          input.softwareId,
          input.sourceVersionId,
        )
      : undefined;
    if (input.sourceVersionId && !source) {
      throw new JourneyVersionUnavailableError();
    }
    if (
      source &&
      (source.workspaceId !== input.workspaceId ||
        source.softwareId !== input.softwareId ||
        source.agreementVersionId !== input.agreementVersionId)
    ) {
      throw new JourneyVersionUnavailableError();
    }
    const journeyId = source?.journeyId ?? this.#idFactory();
    const version = buildJourneyVersion({
      id: this.#idFactory(),
      workspaceId: input.workspaceId,
      softwareId: input.softwareId,
      agreementVersionId: input.agreementVersionId,
      journeyId,
      version: source ? source.version + 1 : 1,
      sourceVersionId: source?.id ?? null,
      draft: input.draft,
      createdAt: this.#now(),
      createdBy: humanActor(input.principal),
    });
    const assessment = await this.#assess(version);
    if (assessment.readiness.status !== "RUNNABLE") {
      throw new JourneyPrerequisiteError(assessment.readiness.blockers);
    }
    const stored = await this.#repository.appendVersion(
      version,
      this.#audit(input.principal, version),
    );
    return this.#view(stored);
  }

  async listJourneys(candidate: unknown): Promise<JourneyHistoryView> {
    const input = scopeSchema.parse(candidate);
    await this.#authorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "JOURNEY_READ",
    });
    const versions = await this.#repository.listVersions(
      input.workspaceId,
      input.softwareId,
    );
    const scopedVersions = versions.filter(
      (version) => version.agreementVersionId === input.agreementVersionId,
    );
    const views = await Promise.all(
      scopedVersions.map((version) => this.#view(version)),
    );
    const seen = new Set<string>();
    const current = views.filter((view) => {
      if (seen.has(view.version.journeyId)) return false;
      seen.add(view.version.journeyId);
      return true;
    });
    return immutableClone({ versions: views, current });
  }
}
