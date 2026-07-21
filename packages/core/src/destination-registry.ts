import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { z } from "zod";
import {
  auditEventSchema,
  automationActorSchema,
  humanActorSchema,
  importedSystemActorSchema,
  type AgreementVersion,
  type AuditEvent,
} from "./domain.js";
import {
  workspacePrincipalSchema,
  type WorkspaceAuthorizationService,
} from "./authorization.js";
import type { AgreementIntakeService } from "./agreement-intake.js";
import type { MigrationDatabase } from "./migrations.js";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const nonEmpty = z.string().trim().min(1);
const nonModelActorSchema = z.discriminatedUnion("kind", [
  humanActorSchema,
  importedSystemActorSchema,
  automationActorSchema,
]);

export const destinationEvidenceKindSchema = z.enum([
  "DETERMINISTIC_OBSERVATION",
  "DISTRICT_INVENTORY",
  "SIGNED_AGREEMENT",
  "VENDOR_ATTESTATION",
  "VENDOR_CONTROLLED_DOCUMENT",
]);
export type DestinationEvidenceKind = z.infer<
  typeof destinationEvidenceKindSchema
>;

const destinationMappingEvidenceKindSchema = z.enum([
  "DISTRICT_INVENTORY",
  "SIGNED_AGREEMENT",
  "VENDOR_ATTESTATION",
  "VENDOR_CONTROLLED_DOCUMENT",
]);

export const destinationSourceEvidenceSchema = z
  .object({
    evidenceId: uuid,
    role: z.enum([
      "DOMAIN_OBSERVATION",
      "ENTITY_MAPPING",
      "AGREEMENT_CLASSIFICATION",
    ]),
    kind: destinationEvidenceKindSchema,
    title: nonEmpty.max(500),
    locator: nonEmpty.max(2_000),
    sourceSha256: sha256,
    excerpt: nonEmpty.max(8_000),
    pageNumber: z.number().int().positive().nullable(),
    capturedAt: timestamp,
    recordedBy: nonModelActorSchema,
    recordedAt: timestamp,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.role === "DOMAIN_OBSERVATION" &&
      value.kind !== "DETERMINISTIC_OBSERVATION"
    ) {
      context.addIssue({
        code: "custom",
        path: ["kind"],
        message: "Domain observations must come from deterministic instrumentation",
      });
    }
    if (
      value.role === "ENTITY_MAPPING" &&
      value.kind === "DETERMINISTIC_OBSERVATION"
    ) {
      context.addIssue({
        code: "custom",
        path: ["kind"],
        message: "A technical observation cannot establish entity ownership",
      });
    }
    if (
      value.role === "AGREEMENT_CLASSIFICATION" &&
      value.kind !== "SIGNED_AGREEMENT"
    ) {
      context.addIssue({
        code: "custom",
        path: ["kind"],
        message: "Agreement classification must cite the stored signed agreement",
      });
    }
  });
export type DestinationSourceEvidence = z.infer<
  typeof destinationSourceEvidenceSchema
>;

const unknownOwnershipSchema = z.object({ status: z.literal("UNKNOWN") }).strict();
const confirmedOwnershipSchema = z
  .object({
    status: z.literal("CONFIRMED"),
    entityId: nonEmpty.max(500),
    entityName: nonEmpty.max(500),
    evidenceIds: z.array(uuid).min(1).max(16),
    confirmedBy: humanActorSchema,
    confirmedAt: timestamp,
    rationale: nonEmpty.max(4_000),
  })
  .strict();

export const destinationOwnershipSchema = z.discriminatedUnion("status", [
  unknownOwnershipSchema,
  confirmedOwnershipSchema,
]);
export type DestinationOwnership = z.infer<typeof destinationOwnershipSchema>;

export const destinationAgreementClassificationSchema = z
  .object({
    softwareId: uuid,
    agreementVersionId: uuid,
    status: z.enum(["ALLOWED", "PROHIBITED"]),
    evidenceIds: z.array(uuid).min(1).max(16),
    reviewedBy: humanActorSchema,
    reviewedAt: timestamp,
    rationale: nonEmpty.max(4_000),
  })
  .strict();
export type DestinationAgreementClassification = z.infer<
  typeof destinationAgreementClassificationSchema
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

export function computeDestinationVersionHash(
  candidate: Readonly<Record<string, unknown>>,
): string {
  const { versionHash: _ignored, ...content } = candidate;
  return hashCanonical(content);
}

export const destinationVersionSchema = z
  .object({
    schemaVersion: z.literal("destination-registry-v1"),
    id: uuid,
    recordId: uuid,
    workspaceId: uuid,
    hostname: nonEmpty.max(253),
    version: z.number().int().positive(),
    sourceVersionId: uuid.nullable(),
    domainFacts: z
      .object({
        firstObservedAt: timestamp,
        lastObservedAt: timestamp,
        observationHashes: z.array(sha256).min(1).max(10_000),
      })
      .strict(),
    ownership: destinationOwnershipSchema,
    classifications: z
      .array(destinationAgreementClassificationSchema)
      .max(1_000),
    sourceEvidence: z.array(destinationSourceEvidenceSchema).min(1).max(10_000),
    createdAt: timestamp,
    createdBy: nonModelActorSchema,
    versionHash: sha256,
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
        message: "Destination version lineage must begin at one and append directly",
      });
    }
    if (value.domainFacts.firstObservedAt > value.domainFacts.lastObservedAt) {
      context.addIssue({
        code: "custom",
        path: ["domainFacts", "lastObservedAt"],
        message: "Last observation cannot precede the first observation",
      });
    }
    if (hasDuplicates(value.domainFacts.observationHashes)) {
      context.addIssue({
        code: "custom",
        path: ["domainFacts", "observationHashes"],
        message: "Observation hashes must be unique",
      });
    }
    const evidenceIds = value.sourceEvidence.map((evidence) => evidence.evidenceId);
    if (hasDuplicates(evidenceIds)) {
      context.addIssue({
        code: "custom",
        path: ["sourceEvidence"],
        message: "Source evidence identifiers must be unique",
      });
    }
    const evidenceById = new Map(
      value.sourceEvidence.map((evidence) => [evidence.evidenceId, evidence]),
    );
    const observationEvidenceHashes = new Set(
      value.sourceEvidence
        .filter((evidence) => evidence.role === "DOMAIN_OBSERVATION")
        .map((evidence) => evidence.sourceSha256),
    );
    for (const observationHash of value.domainFacts.observationHashes) {
      if (!observationEvidenceHashes.has(observationHash)) {
        context.addIssue({
          code: "custom",
          path: ["domainFacts", "observationHashes"],
          message: "Every domain fact must retain its deterministic source evidence",
        });
      }
    }
    if (value.ownership.status === "UNKNOWN" && value.classifications.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["classifications"],
        message: "Unknown ownership cannot carry agreement classifications",
      });
    }
    if (value.ownership.status === "CONFIRMED") {
      for (const evidenceId of value.ownership.evidenceIds) {
        if (evidenceById.get(evidenceId)?.role !== "ENTITY_MAPPING") {
          context.addIssue({
            code: "custom",
            path: ["ownership", "evidenceIds"],
            message: "Confirmed ownership requires retained entity-mapping evidence",
          });
        }
      }
    }
    const classificationKeys = value.classifications.map(
      (classification) =>
        `${classification.softwareId}:${classification.agreementVersionId}`,
    );
    if (hasDuplicates(classificationKeys)) {
      context.addIssue({
        code: "custom",
        path: ["classifications"],
        message: "Each exact agreement version can have only one current classification",
      });
    }
    for (const classification of value.classifications) {
      for (const evidenceId of classification.evidenceIds) {
        if (evidenceById.get(evidenceId)?.role !== "AGREEMENT_CLASSIFICATION") {
          context.addIssue({
            code: "custom",
            path: ["classifications"],
            message: "Every classification must cite exact agreement evidence",
          });
        }
      }
    }
    if (value.versionHash !== computeDestinationVersionHash(value)) {
      context.addIssue({
        code: "custom",
        path: ["versionHash"],
        message: "Destination version hash must match its canonical immutable content",
      });
    }
  });
export type DestinationVersion = z.infer<typeof destinationVersionSchema>;

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

const exactHostnamePattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

export function canonicalizeDestinationHostname(candidate: string): string {
  const trimmed = candidate.trim();
  if (
    trimmed.length === 0 ||
    trimmed.includes("://") ||
    /[/?#@*\\]/u.test(trimmed)
  ) {
    throw new TypeError("Destination must be an exact hostname without a URL or wildcard");
  }
  const withoutTerminalDot = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
  const hostname = domainToASCII(withoutTerminalDot).toLowerCase();
  if (
    hostname.length === 0 ||
    isIP(hostname) !== 0 ||
    !exactHostnamePattern.test(hostname)
  ) {
    throw new TypeError("Destination must be an exact hostname without a URL or wildcard");
  }
  return hostname;
}

interface BuildObservationInput {
  readonly id: string;
  readonly recordId: string;
  readonly workspaceId: string;
  readonly hostname: string;
  readonly observationSha256: string;
  readonly sourceTitle: string;
  readonly sourceLocator: string;
  readonly observedAt: string;
  readonly evidenceId: string;
  readonly source?: DestinationVersion;
}

function withDestinationHash(
  candidate: Omit<DestinationVersion, "versionHash">,
): DestinationVersion {
  return destinationVersionSchema.parse({
    ...candidate,
    versionHash: computeDestinationVersionHash(candidate),
  });
}

export function buildObservedDestinationVersion(
  input: BuildObservationInput,
): DestinationVersion {
  const hostname = canonicalizeDestinationHostname(input.hostname);
  const observedAt = new Date(timestamp.parse(input.observedAt)).toISOString();
  const observationSha256 = sha256.parse(input.observationSha256);
  const source = input.source;
  if (
    source &&
    (source.recordId !== input.recordId ||
      source.workspaceId !== input.workspaceId ||
      source.hostname !== hostname)
  ) {
    throw new DestinationRegistryConflictError();
  }
  const createdBy = {
    kind: "AUTOMATION" as const,
    actorId: "destination-observer",
    component: "deterministic-recorder",
  };
  const evidence: DestinationSourceEvidence = {
    evidenceId: uuid.parse(input.evidenceId),
    role: "DOMAIN_OBSERVATION",
    kind: "DETERMINISTIC_OBSERVATION",
    title: nonEmpty.max(500).parse(input.sourceTitle),
    locator: nonEmpty.max(2_000).parse(input.sourceLocator),
    sourceSha256: observationSha256,
    excerpt: `Observed request hostname ${hostname}`,
    pageNumber: null,
    capturedAt: observedAt,
    recordedBy: createdBy,
    recordedAt: observedAt,
  };
  const priorHashes = source?.domainFacts.observationHashes ?? [];
  const observationHashes = priorHashes.includes(observationSha256)
    ? priorHashes
    : [...priorHashes, observationSha256];
  const sourceEvidence = priorHashes.includes(observationSha256)
    ? (source?.sourceEvidence ?? [evidence])
    : [...(source?.sourceEvidence ?? []), evidence];
  return immutableClone(
    withDestinationHash({
      schemaVersion: "destination-registry-v1",
      id: uuid.parse(input.id),
      recordId: uuid.parse(input.recordId),
      workspaceId: uuid.parse(input.workspaceId),
      hostname,
      version: source ? source.version + 1 : 1,
      sourceVersionId: source?.id ?? null,
      domainFacts: {
        firstObservedAt: source?.domainFacts.firstObservedAt ?? observedAt,
        lastObservedAt: observedAt,
        observationHashes,
      },
      ownership: source?.ownership ?? { status: "UNKNOWN" },
      classifications: source?.classifications ?? [],
      sourceEvidence,
      createdAt: observedAt,
      createdBy,
    }),
  );
}

const reviewEvidenceInputSchema = z
  .object({
    evidenceId: uuid,
    kind: destinationMappingEvidenceKindSchema,
    title: nonEmpty.max(500),
    locator: nonEmpty.max(2_000),
    sourceSha256: sha256,
    excerpt: nonEmpty.max(8_000),
    pageNumber: z.number().int().positive().nullable(),
  })
  .strict();

const agreementEvidenceInputSchema = z
  .object({
    evidenceId: uuid,
    title: nonEmpty.max(500),
    locator: nonEmpty.max(2_000),
    sourceSha256: sha256,
    excerpt: nonEmpty.max(8_000),
    pageNumber: z.number().int().positive(),
  })
  .strict();

const buildReviewSchema = z
  .object({
    id: uuid,
    source: destinationVersionSchema,
    softwareId: uuid,
    agreementVersionId: uuid,
    entityId: nonEmpty.max(500),
    entityName: nonEmpty.max(500),
    classification: z.enum(["ALLOWED", "PROHIBITED"]),
    mappingEvidence: reviewEvidenceInputSchema,
    agreementEvidence: agreementEvidenceInputSchema,
    rationale: nonEmpty.max(4_000),
    reviewedBy: humanActorSchema,
    reviewedAt: timestamp,
  })
  .strict();

export function buildDestinationReviewVersion(
  candidate: unknown,
): DestinationVersion {
  const input = buildReviewSchema.parse(candidate);
  const { versionHash: _sourceHash, ...sourceContent } = input.source;
  const reviewedAt = new Date(input.reviewedAt).toISOString();
  const mappingEvidence: DestinationSourceEvidence = {
    ...input.mappingEvidence,
    role: "ENTITY_MAPPING",
    capturedAt: reviewedAt,
    recordedBy: input.reviewedBy,
    recordedAt: reviewedAt,
  };
  const agreementEvidence: DestinationSourceEvidence = {
    ...input.agreementEvidence,
    role: "AGREEMENT_CLASSIFICATION",
    kind: "SIGNED_AGREEMENT",
    capturedAt: reviewedAt,
    recordedBy: input.reviewedBy,
    recordedAt: reviewedAt,
  };
  const sameEntity =
    input.source.ownership.status === "CONFIRMED" &&
    input.source.ownership.entityId === input.entityId;
  const priorClassifications = sameEntity
    ? input.source.classifications.filter(
        (classification) =>
          !(
            classification.softwareId === input.softwareId &&
            classification.agreementVersionId === input.agreementVersionId
          ),
      )
    : [];
  return immutableClone(
    withDestinationHash({
      ...sourceContent,
      id: input.id,
      version: input.source.version + 1,
      sourceVersionId: input.source.id,
      ownership: {
        status: "CONFIRMED",
        entityId: input.entityId,
        entityName: input.entityName,
        evidenceIds: [mappingEvidence.evidenceId],
        confirmedBy: input.reviewedBy,
        confirmedAt: reviewedAt,
        rationale: input.rationale,
      },
      classifications: [
        ...priorClassifications,
        {
          softwareId: input.softwareId,
          agreementVersionId: input.agreementVersionId,
          status: input.classification,
          evidenceIds: [agreementEvidence.evidenceId],
          reviewedBy: input.reviewedBy,
          reviewedAt,
          rationale: input.rationale,
        },
      ],
      sourceEvidence: [
        ...input.source.sourceEvidence,
        mappingEvidence,
        agreementEvidence,
      ],
      createdAt: reviewedAt,
      createdBy: input.reviewedBy,
    }),
  );
}

export type DestinationResolution =
  | {
      readonly status: "UNKNOWN";
      readonly hostname: string;
      readonly reason:
        | "DESTINATION_UNSEEN"
        | "ENTITY_NOT_CONFIRMED"
        | "AGREEMENT_NOT_REVIEWED";
    }
  | {
      readonly status: "ALLOWED" | "PROHIBITED";
      readonly hostname: string;
      readonly entityId: string;
      readonly entityName: string;
      readonly softwareId: string;
      readonly agreementVersionId: string;
      readonly destinationVersionId: string;
      readonly destinationVersionHash: string;
      readonly humanConfirmed: true;
    };

export function resolveDestination(input: {
  readonly hostname?: string;
  readonly version?: DestinationVersion;
  readonly agreementVersionId: string;
}): DestinationResolution {
  const hostname = canonicalizeDestinationHostname(
    input.hostname ?? input.version?.hostname ?? "",
  );
  if (!input.version || input.version.hostname !== hostname) {
    return { status: "UNKNOWN", hostname, reason: "DESTINATION_UNSEEN" };
  }
  const version = destinationVersionSchema.parse(input.version);
  if (version.ownership.status !== "CONFIRMED") {
    return { status: "UNKNOWN", hostname, reason: "ENTITY_NOT_CONFIRMED" };
  }
  const classification = version.classifications.find(
    (item) => item.agreementVersionId === input.agreementVersionId,
  );
  if (!classification) {
    return { status: "UNKNOWN", hostname, reason: "AGREEMENT_NOT_REVIEWED" };
  }
  return {
    status: classification.status,
    hostname,
    entityId: version.ownership.entityId,
    entityName: version.ownership.entityName,
    softwareId: classification.softwareId,
    agreementVersionId: classification.agreementVersionId,
    destinationVersionId: version.id,
    destinationVersionHash: version.versionHash,
    humanConfirmed: true,
  };
}

export class DestinationUnavailableError extends Error {
  readonly code = "DESTINATION_UNAVAILABLE";
  readonly status = 404;
  readonly publicMessage = "Destination record not found or not available.";

  constructor() {
    super("Destination record is outside the authorized workspace boundary");
    this.name = "DestinationUnavailableError";
  }
}

export class DestinationRegistryConflictError extends Error {
  readonly code = "DESTINATION_REGISTRY_CONFLICT";
  readonly status = 409;
  readonly publicMessage =
    "This destination changed after it was loaded. Review the latest version and try again.";

  constructor() {
    super("Destination registry versions must append to the current latest source");
    this.name = "DestinationRegistryConflictError";
  }
}

export class DestinationEvidenceMismatchError extends Error {
  readonly code = "DESTINATION_EVIDENCE_MISMATCH";
  readonly status = 422;
  readonly publicMessage =
    "The cited destination evidence does not match the stored source.";

  constructor(message = "Destination review evidence is not present in its cited source") {
    super(message);
    this.name = "DestinationEvidenceMismatchError";
  }
}

export interface DestinationRegistryRepository {
  findLatest(
    workspaceId: string,
    hostname: string,
  ): Promise<DestinationVersion | undefined>;
  getVersion(
    workspaceId: string,
    recordId: string,
    versionId: string,
  ): Promise<DestinationVersion | undefined>;
  listLatest(workspaceId: string): Promise<readonly DestinationVersion[]>;
  listVersions(
    workspaceId: string,
    recordId: string,
  ): Promise<readonly DestinationVersion[]>;
  appendVersion(
    version: DestinationVersion,
    audit: AuditEvent,
  ): Promise<DestinationVersion>;
}

function validateAppend(
  latest: DestinationVersion | undefined,
  version: DestinationVersion,
  audit: AuditEvent,
): void {
  const startsHistory = version.version === 1 && version.sourceVersionId === null;
  const appendsHistory =
    latest !== undefined &&
    version.recordId === latest.recordId &&
    version.workspaceId === latest.workspaceId &&
    version.hostname === latest.hostname &&
    version.sourceVersionId === latest.id &&
    version.version === latest.version + 1;
  if ((latest === undefined && !startsHistory) || (latest !== undefined && !appendsHistory)) {
    throw new DestinationRegistryConflictError();
  }
  if (
    audit.workspaceId !== version.workspaceId ||
    audit.subjectType !== "destination_version" ||
    audit.subjectId !== version.id ||
    audit.actor.kind === "MODEL"
  ) {
    throw new TypeError("Destination version and audit must share one non-model subject");
  }
  if (version.version === 1 && version.ownership.status !== "UNKNOWN") {
    throw new TypeError("A newly observed destination must begin UNKNOWN");
  }
}

export class InMemoryDestinationRegistryRepository
  implements DestinationRegistryRepository
{
  readonly #versions: DestinationVersion[] = [];
  #writeTail: Promise<void> = Promise.resolve();
  readonly #auditSink:
    | { appendAuditEvent(audit: AuditEvent): Promise<void> }
    | undefined;

  constructor(auditSink?: { appendAuditEvent(audit: AuditEvent): Promise<void> }) {
    this.#auditSink = auditSink;
  }

  findLatest(
    workspaceId: string,
    hostname: string,
  ): Promise<DestinationVersion | undefined> {
    const canonical = canonicalizeDestinationHostname(hostname);
    const version = this.#versions
      .filter(
        (item) => item.workspaceId === workspaceId && item.hostname === canonical,
      )
      .sort((left, right) => right.version - left.version)[0];
    return Promise.resolve(version ? immutableClone(version) : undefined);
  }

  getVersion(
    workspaceId: string,
    recordId: string,
    versionId: string,
  ): Promise<DestinationVersion | undefined> {
    const version = this.#versions.find(
      (item) =>
        item.workspaceId === workspaceId &&
        item.recordId === recordId &&
        item.id === versionId,
    );
    return Promise.resolve(version ? immutableClone(version) : undefined);
  }

  listLatest(workspaceId: string): Promise<readonly DestinationVersion[]> {
    const latest = new Map<string, DestinationVersion>();
    for (const version of this.#versions) {
      if (version.workspaceId !== workspaceId) continue;
      const prior = latest.get(version.recordId);
      if (!prior || version.version > prior.version) latest.set(version.recordId, version);
    }
    return Promise.resolve(immutableClone(
      [...latest.values()].sort((left, right) =>
        left.hostname.localeCompare(right.hostname),
      ),
    ));
  }

  listVersions(
    workspaceId: string,
    recordId: string,
  ): Promise<readonly DestinationVersion[]> {
    return Promise.resolve(immutableClone(
      this.#versions
        .filter(
          (item) => item.workspaceId === workspaceId && item.recordId === recordId,
        )
        .sort((left, right) => right.version - left.version),
    ));
  }

  async appendVersion(
    versionCandidate: DestinationVersion,
    auditCandidate: AuditEvent,
  ): Promise<DestinationVersion> {
    const version = destinationVersionSchema.parse(versionCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    const previousWrite = this.#writeTail;
    let releaseWrite: (() => void) | undefined;
    this.#writeTail = new Promise((resolve) => {
      releaseWrite = resolve;
    });
    await previousWrite;
    try {
      const latest = this.#versions
        .filter(
          (item) =>
            item.workspaceId === version.workspaceId &&
            (item.recordId === version.recordId || item.hostname === version.hostname),
        )
        .sort((left, right) => right.version - left.version)[0];
      validateAppend(latest, version, audit);
      if (this.#auditSink) await this.#auditSink.appendAuditEvent(audit);
      this.#versions.push(immutableClone(version));
      return immutableClone(version);
    } finally {
      releaseWrite?.();
    }
  }
}

interface PayloadRow {
  readonly payload: unknown;
}

function jsonValue<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function projectionClassification(version: DestinationVersion): string {
  if (version.ownership.status === "UNKNOWN") return "UNREVIEWED";
  return version.classifications.at(-1)?.status ?? "UNREVIEWED";
}

export class PostgresDestinationRegistryRepository
  implements DestinationRegistryRepository
{
  readonly #database: MigrationDatabase;

  constructor(database: MigrationDatabase) {
    this.#database = database;
  }

  async findLatest(
    workspaceId: string,
    hostname: string,
  ): Promise<DestinationVersion | undefined> {
    const result = await this.#database.query<PayloadRow>(
      "SELECT payload FROM destination_record_versions WHERE workspace_id = $1 AND hostname = $2 ORDER BY version DESC LIMIT 1",
      [workspaceId, canonicalizeDestinationHostname(hostname)],
    );
    return result.rows[0]
      ? destinationVersionSchema.parse(jsonValue(result.rows[0].payload))
      : undefined;
  }

  async getVersion(
    workspaceId: string,
    recordId: string,
    versionId: string,
  ): Promise<DestinationVersion | undefined> {
    const result = await this.#database.query<PayloadRow>(
      "SELECT payload FROM destination_record_versions WHERE workspace_id = $1 AND record_id = $2 AND id = $3",
      [workspaceId, recordId, versionId],
    );
    return result.rows[0]
      ? destinationVersionSchema.parse(jsonValue(result.rows[0].payload))
      : undefined;
  }

  async listLatest(workspaceId: string): Promise<readonly DestinationVersion[]> {
    const result = await this.#database.query<PayloadRow>(
      "SELECT DISTINCT ON (record_id) payload FROM destination_record_versions WHERE workspace_id = $1 ORDER BY record_id, version DESC",
      [workspaceId],
    );
    return immutableClone(
      result.rows
        .map((row) => destinationVersionSchema.parse(jsonValue(row.payload)))
        .sort((left, right) => left.hostname.localeCompare(right.hostname)),
    );
  }

  async listVersions(
    workspaceId: string,
    recordId: string,
  ): Promise<readonly DestinationVersion[]> {
    const result = await this.#database.query<PayloadRow>(
      "SELECT payload FROM destination_record_versions WHERE workspace_id = $1 AND record_id = $2 ORDER BY version DESC",
      [workspaceId, recordId],
    );
    return immutableClone(
      result.rows.map((row) => destinationVersionSchema.parse(jsonValue(row.payload))),
    );
  }

  async appendVersion(
    versionCandidate: DestinationVersion,
    auditCandidate: AuditEvent,
  ): Promise<DestinationVersion> {
    const version = destinationVersionSchema.parse(versionCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    await this.#database.exec("BEGIN");
    try {
      const latestResult = await this.#database.query<PayloadRow>(
        "SELECT payload FROM destination_record_versions WHERE workspace_id = $1 AND record_id = $2 ORDER BY version DESC LIMIT 1 FOR UPDATE",
        [version.workspaceId, version.recordId],
      );
      const latest = latestResult.rows[0]
        ? destinationVersionSchema.parse(jsonValue(latestResult.rows[0].payload))
        : undefined;
      validateAppend(latest, version, audit);
      if (version.version === 1) {
        await this.#database.query(
          "INSERT INTO destination_records (workspace_id, id, hostname, ownership, classification, payload, created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
          [
            version.workspaceId,
            version.recordId,
            version.hostname,
            version.ownership.status,
            projectionClassification(version),
            version,
            version.createdAt,
            version.createdBy,
          ],
        );
      } else {
        await this.#database.query(
          "UPDATE destination_records SET ownership = $3, classification = $4, payload = $5 WHERE workspace_id = $1 AND id = $2",
          [
            version.workspaceId,
            version.recordId,
            version.ownership.status,
            projectionClassification(version),
            version,
          ],
        );
      }
      await this.#database.query(
        "INSERT INTO destination_record_versions (workspace_id, id, record_id, hostname, version, source_destination_version_id, ownership, classification, version_hash, payload, created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        [
          version.workspaceId,
          version.id,
          version.recordId,
          version.hostname,
          version.version,
          version.sourceVersionId,
          version.ownership.status,
          projectionClassification(version),
          version.versionHash,
          version,
          version.createdAt,
          version.createdBy,
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

const observeRequestSchema = z
  .object({
    principal: workspacePrincipalSchema,
    workspaceId: uuid,
    hostname: nonEmpty,
    observationSha256: sha256,
    sourceTitle: nonEmpty.max(500),
    sourceLocator: nonEmpty.max(2_000),
  })
  .strict();

const reviewRequestSchema = z
  .object({
    principal: workspacePrincipalSchema,
    workspaceId: uuid,
    recordId: uuid,
    sourceVersionId: uuid,
    softwareId: uuid,
    agreementVersionId: uuid,
    entityId: nonEmpty.max(500),
    entityName: nonEmpty.max(500),
    classification: z.enum(["ALLOWED", "PROHIBITED"]),
    mappingEvidence: reviewEvidenceInputSchema.omit({ evidenceId: true }),
    agreementQuote: nonEmpty.max(8_000),
    agreementPageNumber: z.number().int().positive(),
    rationale: nonEmpty.max(4_000),
  })
  .strict();

const workspaceScopeSchema = z
  .object({
    principal: workspacePrincipalSchema,
    workspaceId: uuid,
  })
  .strict();

interface DestinationRegistryServiceOptions {
  readonly idFactory?: () => string;
  readonly now?: () => string;
}

function pageContainingExactQuote(
  agreement: AgreementVersion,
  pageNumber: number,
  quote: string,
): boolean {
  const page = agreement.pageMap.find((item) => item.pageNumber === pageNumber);
  return page?.text.includes(quote) ?? false;
}

export class DestinationRegistryService {
  readonly #repository: DestinationRegistryRepository;
  readonly #authorization: Pick<WorkspaceAuthorizationService, "checkPermission">;
  readonly #agreements: Pick<AgreementIntakeService, "getAgreement">;
  readonly #idFactory: () => string;
  readonly #now: () => string;

  constructor(
    repository: DestinationRegistryRepository,
    authorization: Pick<WorkspaceAuthorizationService, "checkPermission">,
    agreements: Pick<AgreementIntakeService, "getAgreement">,
    options: DestinationRegistryServiceOptions = {},
  ) {
    this.#repository = repository;
    this.#authorization = authorization;
    this.#agreements = agreements;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async observeDestination(candidate: unknown): Promise<DestinationVersion> {
    const input = observeRequestSchema.parse(candidate);
    await this.#authorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "WORKSPACE_READ",
    });
    const hostname = canonicalizeDestinationHostname(input.hostname);
    const latest = await this.#repository.findLatest(input.workspaceId, hostname);
    if (latest?.domainFacts.observationHashes.includes(input.observationSha256)) {
      return latest;
    }
    const observedAt = new Date(timestamp.parse(this.#now())).toISOString();
    const recordId = latest?.recordId ?? this.#idFactory();
    const version = buildObservedDestinationVersion({
      id: this.#idFactory(),
      recordId,
      workspaceId: input.workspaceId,
      hostname,
      observationSha256: input.observationSha256,
      sourceTitle: input.sourceTitle,
      sourceLocator: input.sourceLocator,
      observedAt,
      evidenceId: this.#idFactory(),
      ...(latest ? { source: latest } : {}),
    });
    return this.#repository.appendVersion(
      version,
      auditEventSchema.parse({
        eventId: this.#idFactory(),
        eventType: "AUDIT_RECORDED",
        workspaceId: input.workspaceId,
        subjectType: "destination_version",
        subjectId: version.id,
        action: "destination.observed",
        actor: version.createdBy,
        occurredAt: observedAt,
        details: { hostname, version: version.version },
      }),
    );
  }

  async reviewDestination(candidate: unknown): Promise<DestinationVersion> {
    const input = reviewRequestSchema.parse(candidate);
    await this.#authorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "DESTINATION_CONFIRM",
    });
    const agreement = await this.#agreements.getAgreement({
      principal: input.principal,
      workspaceId: input.workspaceId,
      softwareId: input.softwareId,
      agreementVersionId: input.agreementVersionId,
    });
    const source = await this.#repository.getVersion(
      input.workspaceId,
      input.recordId,
      input.sourceVersionId,
    );
    if (!source) throw new DestinationUnavailableError();
    const normalizedExcerpt = input.mappingEvidence.excerpt.toLocaleLowerCase();
    if (
      !normalizedExcerpt.includes(source.hostname.toLocaleLowerCase()) ||
      !normalizedExcerpt.includes(input.entityName.toLocaleLowerCase())
    ) {
      throw new DestinationEvidenceMismatchError(
        "Entity-mapping evidence must name the exact hostname and confirmed entity",
      );
    }
    if (
      !input.agreementQuote.toLocaleLowerCase().includes(source.hostname) ||
      !pageContainingExactQuote(
        agreement,
        input.agreementPageNumber,
        input.agreementQuote,
      )
    ) {
      throw new DestinationEvidenceMismatchError();
    }
    if (
      input.mappingEvidence.kind === "SIGNED_AGREEMENT" &&
      (input.mappingEvidence.sourceSha256 !== agreement.sourceSha256 ||
        input.mappingEvidence.pageNumber === null ||
        !pageContainingExactQuote(
          agreement,
          input.mappingEvidence.pageNumber,
          input.mappingEvidence.excerpt,
        ))
    ) {
      throw new DestinationEvidenceMismatchError(
        "Signed-agreement mapping evidence must match the exact stored agreement page",
      );
    }
    const reviewedAt = new Date(timestamp.parse(this.#now())).toISOString();
    const reviewedBy = { kind: "HUMAN" as const, actorId: input.principal.userId };
    const version = buildDestinationReviewVersion({
      id: this.#idFactory(),
      source,
      softwareId: input.softwareId,
      agreementVersionId: input.agreementVersionId,
      entityId: input.entityId,
      entityName: input.entityName,
      classification: input.classification,
      mappingEvidence: {
        evidenceId: this.#idFactory(),
        ...input.mappingEvidence,
      },
      agreementEvidence: {
        evidenceId: this.#idFactory(),
        title: agreement.sourceFileName,
        locator: `agreement://${agreement.id}/page/${input.agreementPageNumber}`,
        sourceSha256: agreement.sourceSha256,
        excerpt: input.agreementQuote,
        pageNumber: input.agreementPageNumber,
      },
      rationale: input.rationale,
      reviewedBy,
      reviewedAt,
    });
    return this.#repository.appendVersion(
      version,
      auditEventSchema.parse({
        eventId: this.#idFactory(),
        eventType: "AUDIT_RECORDED",
        workspaceId: input.workspaceId,
        subjectType: "destination_version",
        subjectId: version.id,
        action: "destination.reviewed",
        actor: reviewedBy,
        occurredAt: reviewedAt,
        details: {
          sourceVersionId: source.id,
          agreementVersionId: input.agreementVersionId,
          classification: input.classification,
        },
      }),
    );
  }

  async listDestinations(candidate: unknown): Promise<readonly DestinationVersion[]> {
    const input = workspaceScopeSchema.parse(candidate);
    await this.#authorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "WORKSPACE_READ",
    });
    return this.#repository.listLatest(input.workspaceId);
  }

  async listDestinationHistory(
    candidate: unknown,
  ): Promise<readonly DestinationVersion[]> {
    const input = workspaceScopeSchema
      .extend({ recordId: uuid })
      .strict()
      .parse(candidate);
    await this.#authorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "WORKSPACE_READ",
    });
    return this.#repository.listVersions(input.workspaceId, input.recordId);
  }

  async resolveDestination(candidate: unknown): Promise<DestinationResolution> {
    const input = workspaceScopeSchema
      .extend({ hostname: nonEmpty, agreementVersionId: uuid })
      .strict()
      .parse(candidate);
    await this.#authorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "WORKSPACE_READ",
    });
    const hostname = canonicalizeDestinationHostname(input.hostname);
    const version = await this.#repository.findLatest(input.workspaceId, hostname);
    return resolveDestination({
      hostname,
      ...(version ? { version } : {}),
      agreementVersionId: input.agreementVersionId,
    });
  }
}
