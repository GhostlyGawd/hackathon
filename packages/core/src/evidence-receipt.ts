import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  automationActorSchema,
  agreementVersionSchema,
  confirmedRequirementSchema,
  evidenceReceiptSchema,
  findingStateSchema,
  type ConfirmedRequirementVersion,
  type AgreementVersion,
} from "./domain.js";
import {
  boundedFindingEvaluationSchema,
  type BoundedFindingEvaluation,
} from "./finding-evaluation.js";
import { redactStructuredValueWithCount } from "./redaction.js";
import {
  runManifestSchema,
  type RunManifest,
} from "./run-orchestration.js";
import type { MigrationDatabase } from "./migrations.js";
import {
  DEFAULT_EVIDENCE_RETENTION_DAYS,
  evidenceRetentionPolicySchema,
  type EvidenceRetentionPolicy,
} from "./security-governance.js";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const nonEmpty = z.string().trim().min(1);
const boundedText = nonEmpty.max(4_000);

export const EVIDENCE_RECEIPT_VERSION =
  "pactwire-evidence-receipt-v1" as const;
export const EVIDENCE_RECEIPT_SCHEMA_VERSION = "1.0.0" as const;

export const evidenceReceiptArtifactKindSchema = z.enum([
  "FINDING_EVALUATION",
  "AGREEMENT_CITATION",
  "OBSERVED_EVENT",
  "CANARY_MATCH",
  "DESTINATION_RECORD",
  "SCREENSHOT",
  "ACTION_TRACE",
  "RUN_CONFIGURATION",
]);
export type EvidenceReceiptArtifactKind = z.infer<
  typeof evidenceReceiptArtifactKindSchema
>;

const requiredArtifactKinds: readonly EvidenceReceiptArtifactKind[] =
  evidenceReceiptArtifactKindSchema.options;

const artifactPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .regex(/^[a-z0-9][a-z0-9._/-]*$/u)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.endsWith("/") &&
      !value.split("/").includes("..") &&
      !value.includes("//"),
    "Artifact paths must be relative normalized paths",
  );

const base64Schema = z
  .string()
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u);

export const evidenceReceiptArtifactSchema = z
  .object({
    kind: evidenceReceiptArtifactKindSchema,
    path: artifactPathSchema,
    mediaType: nonEmpty.max(200),
    sha256,
    byteLength: z.number().int().nonnegative(),
    contentEncoding: z.literal("base64"),
    contentBase64: base64Schema,
    sanitized: z.literal(true),
    redactionCount: z.number().int().nonnegative(),
  })
  .strict();
export type EvidenceReceiptArtifact = z.infer<
  typeof evidenceReceiptArtifactSchema
>;

export const storedEvidenceReceiptArtifactSchema =
  evidenceReceiptArtifactSchema.omit({ contentBase64: true });
export type StoredEvidenceReceiptArtifact = z.infer<
  typeof storedEvidenceReceiptArtifactSchema
>;

const receiptScopeSchema = z
  .object({
    softwareId: uuid,
    softwareVersion: nonEmpty.max(500),
    agreementVersionId: uuid,
    requirementVersionId: uuid,
    role: z.enum(["TEACHER", "STUDENT"]),
    journeyVersionId: uuid,
    journeyName: nonEmpty.max(500),
    fields: z.array(nonEmpty.max(500)).min(1).max(100),
    observationWindow: z
      .object({ startedAt: timestamp, endedAt: timestamp })
      .strict(),
    visiblePaths: z.array(boundedText).max(128),
    untestedPaths: z.array(boundedText).max(128),
    notVisiblePaths: z.array(boundedText).max(128),
    limitations: z.array(boundedText).min(1).max(256),
  })
  .strict();

const receiptDeterministicBasisSchema = z
  .object({
    evaluatorVersion: nonEmpty.max(500),
    requirementAuthority: z.enum([
      "HUMAN_CONFIRMED_MACHINE_TESTABLE",
      "NOT_EXECUTABLE",
    ]),
    runManifestHash: sha256,
    matchedObservationIds: z.array(uuid),
    prohibitedDestinationVersionIds: z.array(uuid),
    lineageComplete: z.boolean(),
    missingLineage: z.array(nonEmpty.max(500)),
    modelNarrativeExcluded: z.literal(true),
  })
  .strict();

const receiptAgreementRuleSchema = z
  .object({
    agreementVersionId: uuid,
    requirementVersionId: uuid,
    requirementVersion: z.number().int().positive(),
    sourceSha256: sha256,
    sourceFileName: nonEmpty.max(255),
    sourceMimeType: z.enum(["application/pdf", "text/plain"]),
    quotedText: nonEmpty.max(20_000),
    plainLanguage: boundedText,
    dataField: nonEmpty.max(1_000),
    action: nonEmpty.max(1_000),
    recipientRestriction: nonEmpty.max(2_000),
    purposeRestriction: nonEmpty.max(2_000).nullable(),
    citation: z
      .object({
        page: z.number().int().positive().optional(),
        startOffset: z.number().int().nonnegative(),
        endOffset: z.number().int().positive(),
        quotedTextSha256: sha256,
      })
      .strict(),
    confirmedBy: z
      .object({ kind: z.literal("HUMAN"), actorId: nonEmpty.max(500) })
      .strict(),
    confirmedAt: timestamp,
  })
  .strict();

const receiptLineageSchema = z
  .object({
    findingEvaluationPath: artifactPathSchema,
    agreementCitationPath: artifactPathSchema,
    runConfigurationPath: artifactPathSchema,
    observedEventPaths: z.array(artifactPathSchema).min(1),
    canaryMatchPaths: z.array(artifactPathSchema).min(1),
    destinationRecordPaths: z.array(artifactPathSchema).min(1),
    screenshotPaths: z.array(artifactPathSchema).min(1),
    actionTracePaths: z.array(artifactPathSchema).min(1),
  })
  .strict();

export const evidenceReceiptContentSchema = z
  .object({
    finding: z
      .object({
        state: findingStateSchema,
        label: boundedText,
        meaning: boundedText,
        reasonCodes: z.array(nonEmpty.max(500)).min(1),
      })
      .strict(),
    observedFlow: z
      .object({
        eventType: nonEmpty.max(500),
        fictionalField: nonEmpty.max(1_000),
        action: nonEmpty.max(1_000),
        destinationHostname: nonEmpty.max(500),
        destinationName: nonEmpty.max(500),
        destinationStatus: z.enum(["ALLOWED", "PROHIBITED", "UNKNOWN"]),
      })
      .strict(),
    scope: receiptScopeSchema,
    agreementRule: receiptAgreementRuleSchema,
    deterministicBasis: receiptDeterministicBasisSchema,
    lineage: receiptLineageSchema,
    nextHumanDecision: boundedText,
  })
  .strict();
export type EvidenceReceiptContent = z.infer<
  typeof evidenceReceiptContentSchema
>;

export const evidenceReceiptManifestSchema = evidenceReceiptSchema
  .safeExtend({
    receiptVersion: z.literal(EVIDENCE_RECEIPT_VERSION),
    findingState: findingStateSchema,
    runManifestHash: sha256,
    artifactByteLengths: z.record(artifactPathSchema, z.number().int().nonnegative()),
    supersedesFindingId: uuid.optional(),
    createdBy: automationActorSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const hashPaths = Object.keys(value.artifactHashes).sort();
    const lengthPaths = Object.keys(value.artifactByteLengths).sort();
    if (JSON.stringify(hashPaths) !== JSON.stringify(lengthPaths)) {
      context.addIssue({
        code: "custom",
        path: ["artifactByteLengths"],
        message: "Artifact hashes and lengths must name the same paths",
      });
    }
    if (Boolean(value.supersedesReceiptId) !== Boolean(value.supersedesFindingId)) {
      context.addIssue({
        code: "custom",
        path: ["supersedesReceiptId"],
        message: "A correction must link both the prior receipt and prior finding",
      });
    }
  });
export type EvidenceReceiptManifest = z.infer<
  typeof evidenceReceiptManifestSchema
>;

export const evidenceReceiptBundleSchema = z
  .object({
    schemaVersion: z.literal(EVIDENCE_RECEIPT_SCHEMA_VERSION),
    receipt: evidenceReceiptManifestSchema,
    content: evidenceReceiptContentSchema,
    artifacts: z.array(evidenceReceiptArtifactSchema).min(requiredArtifactKinds.length),
  })
  .strict()
  .superRefine((value, context) => {
    const paths = value.artifacts.map((artifact) => artifact.path);
    if (new Set(paths).size !== paths.length) {
      context.addIssue({
        code: "custom",
        path: ["artifacts"],
        message: "Receipt artifact paths must be unique",
      });
    }
    for (const kind of requiredArtifactKinds) {
      if (!value.artifacts.some((artifact) => artifact.kind === kind)) {
        context.addIssue({
          code: "custom",
          path: ["artifacts"],
          message: `Receipt requires a ${kind.toLowerCase().replaceAll("_", " ")} artifact`,
        });
      }
    }
  });
export type EvidenceReceiptBundle = z.infer<
  typeof evidenceReceiptBundleSchema
>;

export const storedEvidenceReceiptBundleSchema = z
  .object({
    schemaVersion: z.literal(EVIDENCE_RECEIPT_SCHEMA_VERSION),
    receipt: evidenceReceiptManifestSchema,
    content: evidenceReceiptContentSchema,
    artifacts: z
      .array(storedEvidenceReceiptArtifactSchema)
      .min(requiredArtifactKinds.length),
  })
  .strict()
  .superRefine((value, context) => {
    const paths = value.artifacts.map((artifact) => artifact.path);
    if (new Set(paths).size !== paths.length) {
      context.addIssue({
        code: "custom",
        path: ["artifacts"],
        message: "Stored receipt artifact paths must be unique",
      });
    }
    for (const kind of requiredArtifactKinds) {
      if (!value.artifacts.some((artifact) => artifact.kind === kind)) {
        context.addIssue({
          code: "custom",
          path: ["artifacts"],
          message: `Stored receipt requires a ${kind.toLowerCase().replaceAll("_", " ")} artifact`,
        });
      }
    }
  });
export type StoredEvidenceReceiptBundle = z.infer<
  typeof storedEvidenceReceiptBundleSchema
>;

export function toStoredEvidenceReceiptBundle(
  candidate: EvidenceReceiptBundle,
): StoredEvidenceReceiptBundle {
  const bundle = evidenceReceiptBundleSchema.parse(candidate);
  return immutableClone(
    storedEvidenceReceiptBundleSchema.parse({
      schemaVersion: bundle.schemaVersion,
      receipt: bundle.receipt,
      content: bundle.content,
      artifacts: bundle.artifacts.map(
        ({ contentBase64: _contentBase64, ...artifact }) => artifact,
      ),
    }),
  );
}

export interface EvidenceReceiptArtifactInput {
  readonly kind: Exclude<
    EvidenceReceiptArtifactKind,
    "FINDING_EVALUATION" | "AGREEMENT_CITATION" | "RUN_CONFIGURATION"
  >;
  readonly path: string;
  readonly mediaType: string;
  readonly content: unknown;
}

export interface CreateEvidenceReceiptBundleInput {
  readonly receiptId: string;
  readonly findingEvaluation: BoundedFindingEvaluation;
  readonly runManifest: RunManifest;
  readonly requirement: ConfirmedRequirementVersion;
  readonly agreementVersion: AgreementVersion;
  readonly artifacts: readonly EvidenceReceiptArtifactInput[];
  readonly secretValues?: readonly string[];
  readonly createdAt: string;
  readonly createdBy: z.input<typeof automationActorSchema>;
  readonly supersedes?: Readonly<{
    receiptId: string;
    findingId: string;
  }>;
}

type CanonicalJsonPrimitive = null | boolean | number | string;
interface CanonicalJsonObject {
  readonly [key: string]: CanonicalJsonValue;
}
type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | readonly CanonicalJsonValue[]
  | CanonicalJsonObject;

function toCanonicalValue(value: unknown, trail = "$", seen = new WeakSet<object>()): CanonicalJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Canonical JSON cannot encode a non-finite number at ${trail}`);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`Canonical JSON cannot encode ${typeof value} at ${trail}`);
  }
  if (seen.has(value)) {
    throw new TypeError(`Canonical JSON cannot encode a cycle at ${trail}`);
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        toCanonicalValue(item, `${trail}[${index}]`, seen),
      );
    }
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`Canonical JSON requires a plain object at ${trail}`);
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [
          key,
          toCanonicalValue(nested, `${trail}.${key}`, seen),
        ]),
    );
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(toCanonicalValue(value));
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256CanonicalValue(value: unknown): string {
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

function artifactBytes(content: unknown): Uint8Array {
  if (content instanceof Uint8Array) return new Uint8Array(content);
  return Buffer.from(canonicalJson(content), "utf8");
}

function buildArtifact(
  input: Readonly<{
    kind: EvidenceReceiptArtifactKind;
    path: string;
    mediaType: string;
    content: unknown;
  }>,
  secretValues: readonly string[],
): EvidenceReceiptArtifact {
  const parsedPath = artifactPathSchema.parse(input.path);
  const binary = input.content instanceof Uint8Array;
  if (binary && secretValues.length > 0) {
    for (const secret of secretValues) {
      if (Buffer.from(input.content).includes(Buffer.from(secret, "utf8"))) {
        throw new EvidenceReceiptIntegrityError(
          `Binary artifact ${parsedPath} contains a configured secret and cannot be exported`,
        );
      }
    }
  }
  const redacted = binary
    ? { value: input.content, redactionCount: 0 }
    : redactStructuredValueWithCount(input.content, secretValues);
  const bytes = artifactBytes(redacted.value);
  return evidenceReceiptArtifactSchema.parse({
    kind: input.kind,
    path: parsedPath,
    mediaType: input.mediaType,
    sha256: sha256Bytes(bytes),
    byteLength: bytes.byteLength,
    contentEncoding: "base64",
    contentBase64: Buffer.from(bytes).toString("base64"),
    sanitized: true,
    redactionCount: redacted.redactionCount,
  });
}

function pathsFor(
  artifacts: readonly EvidenceReceiptArtifact[],
  kind: EvidenceReceiptArtifactKind,
): string[] {
  return artifacts
    .filter((artifact) => artifact.kind === kind)
    .map((artifact) => artifact.path)
    .sort();
}

function recordValue(candidate: unknown, field: string): unknown {
  return typeof candidate === "object" && candidate !== null
    ? (candidate as Record<string, unknown>)[field]
    : undefined;
}

function requiredSummaryText(
  candidate: unknown,
  fields: readonly string[],
  description: string,
): string {
  for (const field of fields) {
    const value = recordValue(candidate, field);
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  throw new EvidenceReceiptIntegrityError(
    `Receipt ${description} requires ${fields.join(" or ")}`,
  );
}

function nextHumanDecision(state: z.infer<typeof findingStateSchema>): string {
  if (state === "WITNESSED_CONFLICT") {
    return "A human reviewer must review the recorded conflict and decide whether the software approval should change.";
  }
  if (state === "NOT_REOBSERVED_IN_NAMED_TESTS") {
    return "A human reviewer must compare this rerun with the prior finding and decide whether the correction is sufficient.";
  }
  return "A human reviewer must interpret this bounded result and decide what, if anything, changes next.";
}

function manifestHashInput(
  receipt: Omit<EvidenceReceiptManifest, "manifestHash">,
): unknown {
  return receipt;
}

export function createEvidenceReceiptBundle(
  candidate: CreateEvidenceReceiptBundleInput,
): EvidenceReceiptBundle {
  const evaluation = boundedFindingEvaluationSchema.parse(
    candidate.findingEvaluation,
  );
  const manifest = runManifestSchema.parse(candidate.runManifest);
  const requirement = confirmedRequirementSchema.parse(candidate.requirement);
  const agreement = agreementVersionSchema.parse(candidate.agreementVersion);
  const createdBy = automationActorSchema.parse(candidate.createdBy);
  const finding = evaluation.finding;

  if (
    finding.workspaceId !== manifest.workspaceId ||
    finding.runId !== manifest.runId ||
    evaluation.deterministicBasis.runManifestHash !== manifest.manifestHash
  ) {
    throw new EvidenceReceiptIntegrityError(
      "Receipt finding must bind the exact finalized run manifest",
    );
  }
  if (
    agreement.id !== requirement.agreementVersionId ||
    agreement.workspaceId !== finding.workspaceId ||
    agreement.softwareId !== evaluation.scope.softwareId
  ) {
    throw new EvidenceReceiptIntegrityError(
      "Receipt agreement source must be the exact finding agreement version",
    );
  }
  const citation = requirement.citation;
  const quotedText = agreement.normalizedText.slice(
    citation.startOffset,
    citation.endOffset,
  );
  const citedPage =
    citation.page === undefined
      ? undefined
      : agreement.pageMap.find(({ pageNumber }) => pageNumber === citation.page);
  if (
    quotedText.length !== citation.endOffset - citation.startOffset ||
    sha256Bytes(Buffer.from(quotedText, "utf8")) !== citation.quotedTextSha256 ||
    quotedText !== requirement.details.sourceText ||
    (citation.page !== undefined &&
      (!citedPage ||
        citation.startOffset < citedPage.startOffset ||
        citation.endOffset > citedPage.endOffset))
  ) {
    throw new EvidenceReceiptIntegrityError(
      "Receipt agreement citation must resolve to the exact human-confirmed source span",
    );
  }
  if (
    requirement.workspaceId !== finding.workspaceId ||
    requirement.id !== finding.requirementVersionId ||
    requirement.agreementVersionId !== evaluation.scope.agreementVersionId ||
    requirement.status !== "CONFIRMED"
  ) {
    throw new EvidenceReceiptIntegrityError(
      "Receipt agreement rule must be the exact human-confirmed finding rule",
    );
  }
  if (candidate.supersedes) {
    if (
      candidate.supersedes.findingId === finding.id ||
      finding.priorFindingId !== candidate.supersedes.findingId
    ) {
      throw new EvidenceReceiptIntegrityError(
        "A correction must create a new finding linked to the finding it supersedes",
      );
    }
  } else if (finding.priorFindingId) {
    throw new EvidenceReceiptIntegrityError(
      "A linked finding receipt must name the receipt it supersedes",
    );
  }

  const secretValues = candidate.secretValues ?? [];
  const deterministicEvaluation = {
    schemaVersion: evaluation.schemaVersion,
    finding: evaluation.finding,
    reasonCodes: evaluation.reasonCodes,
    scope: evaluation.scope,
    deterministicBasis: evaluation.deterministicBasis,
    display: evaluation.display,
  };
  const automatic = [
    {
      kind: "FINDING_EVALUATION" as const,
      path: "findings/evaluation.json",
      mediaType: "application/json",
      content: deterministicEvaluation,
    },
    {
      kind: "AGREEMENT_CITATION" as const,
      path: "agreement/confirmed-citation.json",
      mediaType: "application/json",
      content: {
        agreementVersionId: requirement.agreementVersionId,
        agreementVersion: agreement.version,
        sourceSha256: agreement.sourceSha256,
        sourceFileName: agreement.sourceFileName,
        sourceMimeType: agreement.sourceMimeType,
        requirementVersionId: requirement.id,
        requirementVersion: requirement.version,
        quotedText,
        citation: requirement.citation,
        confirmedBy: requirement.confirmedBy,
        confirmedAt: requirement.confirmedAt,
      },
    },
    {
      kind: "RUN_CONFIGURATION" as const,
      path: "configuration/frozen-run.json",
      mediaType: "application/json",
      content: {
        runId: manifest.runId,
        softwareId: manifest.softwareId,
        snapshot: manifest.snapshot,
        executionScopeHash: manifest.executionScopeHash,
        modelIdentifier: manifest.modelIdentifier,
        runnerConfigVersion: manifest.runnerConfigVersion,
        runnerVersion: manifest.runnerVersion,
        requiredCheckpointIds: manifest.requiredCheckpointIds,
        checkpointCoverage: manifest.checkpointCoverage,
        limitations: manifest.limitations,
        manifestHash: manifest.manifestHash,
      },
    },
  ];
  const artifacts = [...automatic, ...candidate.artifacts]
    .map((artifact) => buildArtifact(artifact, secretValues))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(artifacts.map(({ path: artifactPath }) => artifactPath)).size !== artifacts.length) {
    throw new EvidenceReceiptIntegrityError("Receipt artifact paths must be unique");
  }
  for (const kind of requiredArtifactKinds) {
    if (!artifacts.some((artifact) => artifact.kind === kind)) {
      throw new EvidenceReceiptIntegrityError(
        `Receipt requires a ${kind.toLowerCase().replaceAll("_", " ")} artifact`,
      );
    }
  }
  const observedEventInput = candidate.artifacts.find(
    ({ kind }) => kind === "OBSERVED_EVENT",
  );
  const destinationInput = candidate.artifacts.find(
    ({ kind }) => kind === "DESTINATION_RECORD",
  );
  const destinationStatus = requiredSummaryText(
    destinationInput?.content,
    ["classification", "status"],
    "destination summary",
  );
  if (!["ALLOWED", "PROHIBITED", "UNKNOWN"].includes(destinationStatus)) {
    throw new EvidenceReceiptIntegrityError(
      "Receipt destination summary requires ALLOWED, PROHIBITED, or UNKNOWN status",
    );
  }
  const observedHostname = requiredSummaryText(
    observedEventInput?.content,
    ["hostname"],
    "observed event summary",
  );
  const destinationHostname = requiredSummaryText(
    destinationInput?.content,
    ["hostname"],
    "destination summary",
  );
  if (observedHostname !== destinationHostname) {
    throw new EvidenceReceiptIntegrityError(
      "Receipt observed event and destination record must name the same hostname",
    );
  }

  const content = evidenceReceiptContentSchema.parse({
    finding: {
      state: finding.state,
      label: evaluation.display.label,
      meaning: evaluation.display.meaning,
      reasonCodes: evaluation.reasonCodes,
    },
    observedFlow: {
      eventType: requiredSummaryText(
        observedEventInput?.content,
        ["eventType"],
        "observed event summary",
      ),
      fictionalField: requirement.details.dataField,
      action: requirement.details.action,
      destinationHostname,
      destinationName: requiredSummaryText(
        destinationInput?.content,
        ["entityName", "hostname"],
        "destination summary",
      ),
      destinationStatus,
    },
    scope: evaluation.scope,
    agreementRule: {
      agreementVersionId: requirement.agreementVersionId,
      requirementVersionId: requirement.id,
      requirementVersion: requirement.version,
      sourceSha256: agreement.sourceSha256,
      sourceFileName: agreement.sourceFileName,
      sourceMimeType: agreement.sourceMimeType,
      quotedText,
      plainLanguage: requirement.plainLanguage,
      dataField: requirement.details.dataField,
      action: requirement.details.action,
      recipientRestriction: requirement.details.recipientRestriction,
      purposeRestriction: requirement.details.purposeRestriction,
      citation: requirement.citation,
      confirmedBy: requirement.confirmedBy,
      confirmedAt: requirement.confirmedAt,
    },
    deterministicBasis: evaluation.deterministicBasis,
    lineage: {
      findingEvaluationPath: pathsFor(artifacts, "FINDING_EVALUATION")[0],
      agreementCitationPath: pathsFor(artifacts, "AGREEMENT_CITATION")[0],
      runConfigurationPath: pathsFor(artifacts, "RUN_CONFIGURATION")[0],
      observedEventPaths: pathsFor(artifacts, "OBSERVED_EVENT"),
      canaryMatchPaths: pathsFor(artifacts, "CANARY_MATCH"),
      destinationRecordPaths: pathsFor(artifacts, "DESTINATION_RECORD"),
      screenshotPaths: pathsFor(artifacts, "SCREENSHOT"),
      actionTracePaths: pathsFor(artifacts, "ACTION_TRACE"),
    },
    nextHumanDecision: nextHumanDecision(finding.state),
  });
  const artifactHashes = Object.fromEntries(
    artifacts.map((artifact) => [artifact.path, artifact.sha256]),
  );
  const artifactByteLengths = Object.fromEntries(
    artifacts.map((artifact) => [artifact.path, artifact.byteLength]),
  );
  const receiptWithoutManifestHash = {
    id: uuid.parse(candidate.receiptId),
    workspaceId: finding.workspaceId,
    runId: finding.runId,
    findingId: finding.id,
    manifestHash: "0".repeat(64),
    receiptVersion: EVIDENCE_RECEIPT_VERSION,
    findingState: finding.state,
    runManifestHash: manifest.manifestHash,
    contentHash: sha256CanonicalValue(content),
    artifactHashes,
    artifactByteLengths,
    ...(candidate.supersedes
      ? {
          supersedesReceiptId: uuid.parse(candidate.supersedes.receiptId),
          supersedesFindingId: uuid.parse(candidate.supersedes.findingId),
        }
      : {}),
    createdAt: new Date(timestamp.parse(candidate.createdAt)).toISOString(),
    createdBy,
  };
  const { manifestHash: _placeholder, ...hashableReceipt } = receiptWithoutManifestHash;
  const receipt = evidenceReceiptManifestSchema.parse({
    ...hashableReceipt,
    manifestHash: sha256CanonicalValue(manifestHashInput(hashableReceipt)),
  });
  return immutableClone(
    evidenceReceiptBundleSchema.parse({
      schemaVersion: EVIDENCE_RECEIPT_SCHEMA_VERSION,
      receipt,
      content,
      artifacts,
    }),
  );
}

export const receiptVerificationIssueCodeSchema = z.enum([
  "BUNDLE_SCHEMA_INVALID",
  "CONTENT_HASH_MISMATCH",
  "MANIFEST_HASH_MISMATCH",
  "ARTIFACT_HASH_MISMATCH",
  "ARTIFACT_LENGTH_MISMATCH",
  "ARTIFACT_SET_MISMATCH",
  "LINEAGE_PATH_MISMATCH",
  "LINEAGE_CONTENT_MISMATCH",
]);
export type ReceiptVerificationIssueCode = z.infer<
  typeof receiptVerificationIssueCodeSchema
>;

export interface ReceiptVerificationIssue {
  readonly code: ReceiptVerificationIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface ReceiptVerificationReport {
  readonly verifierVersion: typeof EVIDENCE_RECEIPT_VERSION;
  readonly receiptId: string | null;
  readonly status: "VALID" | "INVALID";
  readonly verifiedArtifactCount: number;
  readonly verifiedHashCount: number;
  readonly issues: readonly ReceiptVerificationIssue[];
}

function invalidSchemaReport(candidate: unknown, message: string): ReceiptVerificationReport {
  const receiptId =
    typeof candidate === "object" &&
    candidate !== null &&
    "receipt" in candidate &&
    typeof candidate.receipt === "object" &&
    candidate.receipt !== null &&
    "id" in candidate.receipt &&
    typeof candidate.receipt.id === "string"
      ? candidate.receipt.id
      : null;
  return immutableClone({
    verifierVersion: EVIDENCE_RECEIPT_VERSION,
    receiptId,
    status: "INVALID" as const,
    verifiedArtifactCount: 0,
    verifiedHashCount: 0,
    issues: [
      {
        code: "BUNDLE_SCHEMA_INVALID" as const,
        path: "$",
        message,
      },
    ],
  });
}

function lineagePaths(content: EvidenceReceiptContent): string[] {
  return [
    content.lineage.findingEvaluationPath,
    content.lineage.agreementCitationPath,
    content.lineage.runConfigurationPath,
    ...content.lineage.observedEventPaths,
    ...content.lineage.canaryMatchPaths,
    ...content.lineage.destinationRecordPaths,
    ...content.lineage.screenshotPaths,
    ...content.lineage.actionTracePaths,
  ].sort();
}

function nestedRecordValue(
  candidate: unknown,
  fields: readonly string[],
): unknown {
  let value = candidate;
  for (const field of fields) value = recordValue(value, field);
  return value;
}

function decodeJsonArtifact(
  bundle: EvidenceReceiptBundle,
  kind: EvidenceReceiptArtifactKind,
): unknown {
  const artifact = bundle.artifacts.find((candidate) => candidate.kind === kind);
  if (!artifact) return undefined;
  try {
    return JSON.parse(
      Buffer.from(artifact.contentBase64, "base64").toString("utf8"),
    ) as unknown;
  } catch {
    return undefined;
  }
}

function canonicalValuesEqual(left: unknown, right: unknown): boolean {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

export function verifyEvidenceReceiptBundle(
  candidate: unknown,
): ReceiptVerificationReport {
  const parsed = evidenceReceiptBundleSchema.safeParse(candidate);
  if (!parsed.success) {
    return invalidSchemaReport(candidate, z.prettifyError(parsed.error));
  }
  const bundle = parsed.data;
  const issues: ReceiptVerificationIssue[] = [];
  let verifiedArtifactCount = 0;
  let verifiedHashCount = 0;
  const artifactPaths = bundle.artifacts.map(({ path: artifactPath }) => artifactPath).sort();
  const receiptPaths = Object.keys(bundle.receipt.artifactHashes).sort();
  if (JSON.stringify(artifactPaths) !== JSON.stringify(receiptPaths)) {
    issues.push({
      code: "ARTIFACT_SET_MISMATCH",
      path: "$.receipt.artifactHashes",
      message: "The receipt manifest and bundle contain different artifact paths.",
    });
  }
  if (JSON.stringify(lineagePaths(bundle.content)) !== JSON.stringify(artifactPaths)) {
    issues.push({
      code: "LINEAGE_PATH_MISMATCH",
      path: "$.content.lineage",
      message: "Every bundled artifact must be named exactly once by receipt lineage.",
    });
  }
  for (const artifact of bundle.artifacts) {
    const bytes = Buffer.from(artifact.contentBase64, "base64");
    const actualHash = sha256Bytes(bytes);
    const expectedHash = bundle.receipt.artifactHashes[artifact.path];
    const expectedLength = bundle.receipt.artifactByteLengths[artifact.path];
    if (
      actualHash !== artifact.sha256 ||
      actualHash !== expectedHash
    ) {
      issues.push({
        code: "ARTIFACT_HASH_MISMATCH",
        path: `$.artifacts[${artifact.path}]`,
        message: `Artifact ${artifact.path} does not match its recorded SHA-256 hash.`,
      });
    } else {
      verifiedHashCount += 1;
    }
    if (
      bytes.byteLength !== artifact.byteLength ||
      bytes.byteLength !== expectedLength
    ) {
      issues.push({
        code: "ARTIFACT_LENGTH_MISMATCH",
        path: `$.artifacts[${artifact.path}]`,
        message: `Artifact ${artifact.path} does not match its recorded byte length.`,
      });
    }
    if (
      actualHash === artifact.sha256 &&
      actualHash === expectedHash &&
      bytes.byteLength === artifact.byteLength &&
      bytes.byteLength === expectedLength
    ) {
      verifiedArtifactCount += 1;
    }
  }
  const semanticMismatches: string[] = [];
  if (
    bundle.receipt.findingState !== bundle.content.finding.state ||
    bundle.receipt.runManifestHash !==
      bundle.content.deterministicBasis.runManifestHash
  ) {
    semanticMismatches.push(
      "Receipt summary does not match its finding state or run-manifest basis",
    );
  }
  const findingArtifact = decodeJsonArtifact(bundle, "FINDING_EVALUATION");
  if (
    nestedRecordValue(findingArtifact, ["finding", "id"]) !==
      bundle.receipt.findingId ||
    nestedRecordValue(findingArtifact, ["finding", "workspaceId"]) !==
      bundle.receipt.workspaceId ||
    nestedRecordValue(findingArtifact, ["finding", "runId"]) !==
      bundle.receipt.runId ||
    nestedRecordValue(findingArtifact, ["finding", "state"]) !==
      bundle.receipt.findingState ||
    nestedRecordValue(findingArtifact, ["finding", "requirementVersionId"]) !==
      bundle.content.scope.requirementVersionId ||
    nestedRecordValue(findingArtifact, ["deterministicBasis", "runManifestHash"]) !==
      bundle.receipt.runManifestHash
  ) {
    semanticMismatches.push(
      "Finding artifact does not match the receipt finding and run lineage",
    );
  }
  const agreementArtifact = decodeJsonArtifact(bundle, "AGREEMENT_CITATION");
  const artifactCitation = recordValue(agreementArtifact, "citation");
  const quotedText = recordValue(agreementArtifact, "quotedText");
  if (
    recordValue(agreementArtifact, "agreementVersionId") !==
      bundle.content.agreementRule.agreementVersionId ||
    recordValue(agreementArtifact, "requirementVersionId") !==
      bundle.content.agreementRule.requirementVersionId ||
    recordValue(agreementArtifact, "sourceSha256") !==
      bundle.content.agreementRule.sourceSha256 ||
    recordValue(agreementArtifact, "sourceFileName") !==
      bundle.content.agreementRule.sourceFileName ||
    quotedText !== bundle.content.agreementRule.quotedText ||
    !canonicalValuesEqual(
      artifactCitation,
      bundle.content.agreementRule.citation,
    ) ||
    typeof quotedText !== "string" ||
    sha256Bytes(Buffer.from(quotedText, "utf8")) !==
      bundle.content.agreementRule.citation.quotedTextSha256
  ) {
    semanticMismatches.push(
      "Agreement artifact does not match the exact confirmed citation span",
    );
  }
  const runArtifact = decodeJsonArtifact(bundle, "RUN_CONFIGURATION");
  if (
    recordValue(runArtifact, "runId") !== bundle.receipt.runId ||
    recordValue(runArtifact, "softwareId") !== bundle.content.scope.softwareId ||
    recordValue(runArtifact, "manifestHash") !== bundle.receipt.runManifestHash
  ) {
    semanticMismatches.push(
      "Run configuration artifact does not match the frozen receipt manifest",
    );
  }
  const observedArtifact = decodeJsonArtifact(bundle, "OBSERVED_EVENT");
  if (
    recordValue(observedArtifact, "eventType") !==
      bundle.content.observedFlow.eventType ||
    recordValue(observedArtifact, "hostname") !==
      bundle.content.observedFlow.destinationHostname
  ) {
    semanticMismatches.push(
      "Observed event artifact does not match the readable recorded-flow summary",
    );
  }
  const destinationArtifact = decodeJsonArtifact(bundle, "DESTINATION_RECORD");
  const destinationStatus =
    recordValue(destinationArtifact, "classification") ??
    recordValue(destinationArtifact, "status");
  const destinationName =
    recordValue(destinationArtifact, "entityName") ??
    recordValue(destinationArtifact, "hostname");
  if (
    recordValue(destinationArtifact, "hostname") !==
      bundle.content.observedFlow.destinationHostname ||
    destinationName !== bundle.content.observedFlow.destinationName ||
    destinationStatus !== bundle.content.observedFlow.destinationStatus
  ) {
    semanticMismatches.push(
      "Destination artifact does not match the readable recorded-flow summary",
    );
  }
  const canaryArtifact = decodeJsonArtifact(bundle, "CANARY_MATCH");
  if (
    recordValue(canaryArtifact, "sourceField") !==
    bundle.content.observedFlow.fictionalField
  ) {
    semanticMismatches.push(
      "Canary match artifact does not match the receipt fictional field",
    );
  }
  for (const message of semanticMismatches) {
    issues.push({
      code: "LINEAGE_CONTENT_MISMATCH",
      path: "$.content.lineage",
      message,
    });
  }
  if (sha256CanonicalValue(bundle.content) !== bundle.receipt.contentHash) {
    issues.push({
      code: "CONTENT_HASH_MISMATCH",
      path: "$.receipt.contentHash",
      message: "Receipt content does not match its recorded SHA-256 hash.",
    });
  } else {
    verifiedHashCount += 1;
  }
  const { manifestHash, ...hashableReceipt } = bundle.receipt;
  if (
    sha256CanonicalValue(manifestHashInput(hashableReceipt)) !== manifestHash
  ) {
    issues.push({
      code: "MANIFEST_HASH_MISMATCH",
      path: "$.receipt.manifestHash",
      message: "Receipt manifest does not match its recorded SHA-256 hash.",
    });
  } else {
    verifiedHashCount += 1;
  }
  return immutableClone({
    verifierVersion: EVIDENCE_RECEIPT_VERSION,
    receiptId: bundle.receipt.id,
    status: issues.length === 0 ? ("VALID" as const) : ("INVALID" as const),
    verifiedArtifactCount,
    verifiedHashCount,
    issues,
  });
}

export function serializeEvidenceReceiptBundle(candidate: unknown): string {
  const bundle = evidenceReceiptBundleSchema.parse(candidate);
  return `${canonicalJson(bundle)}\n`;
}

export function parseEvidenceReceiptBundle(serialized: string): EvidenceReceiptBundle {
  const parsed = JSON.parse(serialized) as unknown;
  return immutableClone(evidenceReceiptBundleSchema.parse(parsed));
}

export class EvidenceReceiptIntegrityError extends Error {
  readonly code = "EVIDENCE_RECEIPT_INTEGRITY_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "EvidenceReceiptIntegrityError";
  }
}

export class EvidenceReceiptConflictError extends Error {
  readonly code = "EVIDENCE_RECEIPT_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "EvidenceReceiptConflictError";
  }
}

export class EvidenceReceiptUnavailableError extends Error {
  readonly code = "EVIDENCE_RECEIPT_UNAVAILABLE";
  readonly status = 404;
  readonly publicMessage = "Evidence receipt not found or not available.";

  constructor(message = "Evidence receipt is unavailable") {
    super(message);
    this.name = "EvidenceReceiptUnavailableError";
  }
}

export class EvidenceReceiptContentDeletedError extends Error {
  readonly code = "EVIDENCE_RECEIPT_CONTENT_DELETED";
  readonly status = 410;
  readonly publicMessage =
    "The retained artifact content was deleted. Immutable receipt metadata remains available for audit.";

  constructor() {
    super("Evidence receipt artifact content has a deletion tombstone");
    this.name = "EvidenceReceiptContentDeletedError";
  }
}

export class EvidenceReceiptDeletionDeniedError extends Error {
  readonly code = "EVIDENCE_RECEIPT_DELETION_DENIED";
  readonly status = 403;
  readonly publicMessage =
    "Retained evidence was not deleted because explicit human confirmation was missing or invalid.";

  constructor(message: string) {
    super(message);
    this.name = "EvidenceReceiptDeletionDeniedError";
  }
}

export const evidenceReceiptDeletionEventSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    receiptId: uuid,
    status: z.enum(["REQUESTED", "COMPLETED"]),
    trigger: z.enum(["MANUAL", "RETENTION_EXPIRY"]),
    reason: nonEmpty.max(2_000),
    occurredAt: timestamp,
    requestedBy: z.discriminatedUnion("kind", [
      z
        .object({ kind: z.literal("HUMAN"), actorId: nonEmpty.max(500) })
        .strict(),
      z
        .object({
          kind: z.literal("AUTOMATION"),
          actorId: nonEmpty.max(500),
        })
        .strict(),
    ]),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.trigger === "MANUAL" && value.requestedBy.kind !== "HUMAN") ||
      (value.trigger === "RETENTION_EXPIRY" &&
        value.requestedBy.kind !== "AUTOMATION")
    ) {
      context.addIssue({
        code: "custom",
        path: ["requestedBy", "kind"],
        message: "Deletion actor must match the deletion trigger",
      });
    }
  });
export type EvidenceReceiptDeletionEvent = z.infer<
  typeof evidenceReceiptDeletionEventSchema
>;

const deleteRetainedContentInputSchema = z
  .object({
    workspaceId: uuid,
    receiptId: uuid,
    confirmation: nonEmpty.max(100),
    reason: nonEmpty.max(2_000),
    requestedAt: timestamp,
    requestedBy: z
      .object({ kind: z.literal("HUMAN"), actorId: nonEmpty.max(500) })
      .strict(),
  })
  .strict();
export type DeleteRetainedContentInput = z.input<
  typeof deleteRetainedContentInputSchema
>;

const setRetentionPolicyInputSchema = z
  .object({
    workspaceId: uuid,
    retentionDays: z.number().int().min(1).max(365),
    updatedAt: timestamp,
    updatedBy: z
      .object({ kind: z.literal("HUMAN"), actorId: nonEmpty.max(500) })
      .strict(),
  })
  .strict();

const purgeExpiredContentInputSchema = z
  .object({
    workspaceId: uuid,
    asOf: timestamp,
    requestedBy: z
      .object({
        kind: z.literal("AUTOMATION"),
        actorId: nonEmpty.max(500),
      })
      .strict(),
  })
  .strict();

export interface EvidenceReceiptRepository {
  append(bundle: StoredEvidenceReceiptBundle): Promise<void>;
  get(
    workspaceId: string,
    receiptId: string,
  ): Promise<StoredEvidenceReceiptBundle | undefined>;
  listForFinding(
    workspaceId: string,
    findingId: string,
  ): Promise<readonly StoredEvidenceReceiptBundle[]>;
  appendDeletionEvent(event: EvidenceReceiptDeletionEvent): Promise<void>;
  listDeletionEvents(
    workspaceId: string,
    receiptId: string,
  ): Promise<readonly EvidenceReceiptDeletionEvent[]>;
  countRetainedArtifactReferences(sha256: string): Promise<number>;
  appendRetentionPolicy(policy: EvidenceRetentionPolicy): Promise<void>;
  getLatestRetentionPolicy(
    workspaceId: string,
  ): Promise<EvidenceRetentionPolicy | undefined>;
  listRetainedCreatedBefore(
    workspaceId: string,
    cutoff: string,
  ): Promise<readonly StoredEvidenceReceiptBundle[]>;
}

function receiptKey(workspaceId: string, receiptId: string): string {
  return `${workspaceId}:${receiptId}`;
}

export class InMemoryEvidenceReceiptRepository
  implements EvidenceReceiptRepository
{
  readonly #bundles = new Map<string, StoredEvidenceReceiptBundle>();
  readonly #deletionEvents = new Map<string, EvidenceReceiptDeletionEvent[]>();
  readonly #retentionPolicies = new Map<string, EvidenceRetentionPolicy[]>();

  append(candidate: StoredEvidenceReceiptBundle): Promise<void> {
    const bundle = storedEvidenceReceiptBundleSchema.parse(candidate);
    const key = receiptKey(bundle.receipt.workspaceId, bundle.receipt.id);
    if (this.#bundles.has(key)) {
      return Promise.reject(
        new EvidenceReceiptConflictError(
          "Evidence receipt already exists and cannot be replaced",
        ),
      );
    }
    this.#bundles.set(key, immutableClone(bundle));
    return Promise.resolve();
  }

  get(
    workspaceId: string,
    receiptId: string,
  ): Promise<StoredEvidenceReceiptBundle | undefined> {
    const bundle = this.#bundles.get(
      receiptKey(uuid.parse(workspaceId), uuid.parse(receiptId)),
    );
    return Promise.resolve(bundle ? immutableClone(bundle) : undefined);
  }

  listForFinding(
    workspaceId: string,
    findingId: string,
  ): Promise<readonly StoredEvidenceReceiptBundle[]> {
    const parsedWorkspaceId = uuid.parse(workspaceId);
    const parsedFindingId = uuid.parse(findingId);
    return Promise.resolve(
      [...this.#bundles.values()]
        .filter(
          ({ receipt }) =>
            receipt.workspaceId === parsedWorkspaceId &&
            (receipt.findingId === parsedFindingId ||
              receipt.supersedesFindingId === parsedFindingId),
        )
        .sort((left, right) =>
          left.receipt.createdAt.localeCompare(right.receipt.createdAt),
        )
        .map((bundle) => immutableClone(bundle)),
    );
  }

  appendDeletionEvent(candidate: EvidenceReceiptDeletionEvent): Promise<void> {
    const event = evidenceReceiptDeletionEventSchema.parse(candidate);
    const key = receiptKey(event.workspaceId, event.receiptId);
    if (!this.#bundles.has(key)) {
      return Promise.reject(new EvidenceReceiptUnavailableError());
    }
    const existing = this.#deletionEvents.get(key) ?? [];
    if (existing.some(({ status }) => status === event.status)) {
      return Promise.reject(
        new EvidenceReceiptConflictError(
          `Evidence receipt deletion already has a ${event.status.toLowerCase()} event`,
        ),
      );
    }
    this.#deletionEvents.set(key, [...existing, immutableClone(event)]);
    return Promise.resolve();
  }

  listDeletionEvents(
    workspaceId: string,
    receiptId: string,
  ): Promise<readonly EvidenceReceiptDeletionEvent[]> {
    const events =
      this.#deletionEvents.get(
        receiptKey(uuid.parse(workspaceId), uuid.parse(receiptId)),
      ) ?? [];
    return Promise.resolve(immutableClone(events));
  }

  countRetainedArtifactReferences(hashCandidate: string): Promise<number> {
    const hash = sha256.parse(hashCandidate);
    let count = 0;
    for (const [key, bundle] of this.#bundles) {
      if ((this.#deletionEvents.get(key)?.length ?? 0) > 0) continue;
      if (bundle.artifacts.some((artifact) => artifact.sha256 === hash)) count += 1;
    }
    return Promise.resolve(count);
  }

  appendRetentionPolicy(candidate: EvidenceRetentionPolicy): Promise<void> {
    const policy = evidenceRetentionPolicySchema.parse(candidate);
    const existing = this.#retentionPolicies.get(policy.workspaceId) ?? [];
    if (existing.some(({ updatedAt }) => updatedAt === policy.updatedAt)) {
      return Promise.reject(
        new EvidenceReceiptConflictError(
          "Evidence retention policy timestamp already exists",
        ),
      );
    }
    this.#retentionPolicies.set(policy.workspaceId, [
      ...existing,
      immutableClone(policy),
    ]);
    return Promise.resolve();
  }

  getLatestRetentionPolicy(
    workspaceId: string,
  ): Promise<EvidenceRetentionPolicy | undefined> {
    const policies = this.#retentionPolicies.get(uuid.parse(workspaceId)) ?? [];
    const latest = [...policies].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )[0];
    return Promise.resolve(latest ? immutableClone(latest) : undefined);
  }

  listRetainedCreatedBefore(
    workspaceId: string,
    cutoff: string,
  ): Promise<readonly StoredEvidenceReceiptBundle[]> {
    const parsedWorkspaceId = uuid.parse(workspaceId);
    const parsedCutoff = timestamp.parse(cutoff);
    return Promise.resolve(
      [...this.#bundles.entries()]
        .filter(
          ([key, bundle]) =>
            bundle.receipt.workspaceId === parsedWorkspaceId &&
            bundle.receipt.createdAt <= parsedCutoff &&
            (this.#deletionEvents.get(key)?.length ?? 0) === 0,
        )
        .map(([, bundle]) => immutableClone(bundle)),
    );
  }
}

interface ReceiptBundleRow {
  readonly bundle_metadata: unknown;
}

interface DeletionEventRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly receipt_id: string;
  readonly status: string;
  readonly trigger: string;
  readonly reason: string;
  readonly occurred_at: string | Date;
  readonly requested_by: unknown;
}

interface CountRow {
  readonly count: string | number;
}

interface RetentionPolicyRow {
  readonly workspace_id: string;
  readonly retention_days: number;
  readonly basis: string;
  readonly updated_at: string | Date;
  readonly updated_by: unknown;
}

interface ReceiptLineageRow {
  readonly finding_state: string;
  readonly manifest_hash: string;
}

function jsonValue(value: unknown): unknown {
  return typeof value === "string" ? (JSON.parse(value) as unknown) : value;
}

export class PostgresEvidenceReceiptRepository
  implements EvidenceReceiptRepository
{
  constructor(private readonly database: MigrationDatabase) {}

  async append(candidate: StoredEvidenceReceiptBundle): Promise<void> {
    const bundle = storedEvidenceReceiptBundleSchema.parse(candidate);
    const receipt = bundle.receipt;
    const lineage = await this.database.query<ReceiptLineageRow>(
      "SELECT f.state AS finding_state, rm.manifest_hash FROM findings f JOIN run_manifests rm ON rm.workspace_id = f.workspace_id AND rm.run_id = f.run_id WHERE f.workspace_id = $1 AND f.id = $2 AND f.run_id = $3",
      [receipt.workspaceId, receipt.findingId, receipt.runId],
    );
    const row = lineage.rows[0];
    if (
      !row ||
      row.finding_state !== receipt.findingState ||
      row.manifest_hash !== receipt.runManifestHash
    ) {
      throw new EvidenceReceiptIntegrityError(
        "Evidence receipt requires the exact stored finding and finalized run manifest",
      );
    }
    try {
      await this.database.query(
        "INSERT INTO evidence_receipts (workspace_id, id, run_id, finding_id, manifest_hash, content_hash, artifact_hashes, supersedes_receipt_id, created_at, receipt_version, finding_state, run_manifest_hash, artifact_byte_lengths, supersedes_finding_id, bundle_metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)",
        [
          receipt.workspaceId,
          receipt.id,
          receipt.runId,
          receipt.findingId,
          receipt.manifestHash,
          receipt.contentHash,
          receipt.artifactHashes,
          receipt.supersedesReceiptId ?? null,
          receipt.createdAt,
          receipt.receiptVersion,
          receipt.findingState,
          receipt.runManifestHash,
          receipt.artifactByteLengths,
          receipt.supersedesFindingId ?? null,
          bundle,
        ],
      );
    } catch (error) {
      if (
        error instanceof Error &&
        /duplicate|unique|already exists/iu.test(error.message)
      ) {
        throw new EvidenceReceiptConflictError(
          "Evidence receipt already exists and cannot be replaced",
        );
      }
      throw error;
    }
  }

  async get(
    workspaceId: string,
    receiptId: string,
  ): Promise<StoredEvidenceReceiptBundle | undefined> {
    const result = await this.database.query<ReceiptBundleRow>(
      "SELECT bundle_metadata FROM evidence_receipts WHERE workspace_id = $1 AND id = $2",
      [uuid.parse(workspaceId), uuid.parse(receiptId)],
    );
    const bundle = result.rows[0]?.bundle_metadata;
    return bundle === undefined
      ? undefined
      : immutableClone(storedEvidenceReceiptBundleSchema.parse(jsonValue(bundle)));
  }

  async listForFinding(
    workspaceId: string,
    findingId: string,
  ): Promise<readonly StoredEvidenceReceiptBundle[]> {
    const result = await this.database.query<ReceiptBundleRow>(
      "SELECT bundle_metadata FROM evidence_receipts WHERE workspace_id = $1 AND (finding_id = $2 OR supersedes_finding_id = $2) ORDER BY created_at, id",
      [uuid.parse(workspaceId), uuid.parse(findingId)],
    );
    return result.rows.map(({ bundle_metadata }) =>
      immutableClone(
        storedEvidenceReceiptBundleSchema.parse(jsonValue(bundle_metadata)),
      ),
    );
  }

  async appendDeletionEvent(candidate: EvidenceReceiptDeletionEvent): Promise<void> {
    const event = evidenceReceiptDeletionEventSchema.parse(candidate);
    try {
      await this.database.query(
        "INSERT INTO evidence_receipt_deletion_events (workspace_id, id, receipt_id, status, trigger, reason, occurred_at, requested_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [
          event.workspaceId,
          event.id,
          event.receiptId,
          event.status,
          event.trigger,
          event.reason,
          event.occurredAt,
          event.requestedBy,
        ],
      );
    } catch (error) {
      if (
        error instanceof Error &&
        /duplicate|unique|already exists/iu.test(error.message)
      ) {
        throw new EvidenceReceiptConflictError(
          `Evidence receipt deletion already has a ${event.status.toLowerCase()} event`,
        );
      }
      throw error;
    }
  }

  async listDeletionEvents(
    workspaceId: string,
    receiptId: string,
  ): Promise<readonly EvidenceReceiptDeletionEvent[]> {
    const result = await this.database.query<DeletionEventRow>(
      "SELECT id, workspace_id, receipt_id, status, trigger, reason, occurred_at, requested_by FROM evidence_receipt_deletion_events WHERE workspace_id = $1 AND receipt_id = $2 ORDER BY occurred_at, status DESC",
      [uuid.parse(workspaceId), uuid.parse(receiptId)],
    );
    return result.rows.map((row) =>
      immutableClone(
        evidenceReceiptDeletionEventSchema.parse({
          id: row.id,
          workspaceId: row.workspace_id,
          receiptId: row.receipt_id,
          status: row.status,
          trigger: row.trigger,
          reason: row.reason,
          occurredAt:
            row.occurred_at instanceof Date
              ? row.occurred_at.toISOString()
              : row.occurred_at,
          requestedBy: jsonValue(row.requested_by),
        }),
      ),
    );
  }

  async countRetainedArtifactReferences(hashCandidate: string): Promise<number> {
    const result = await this.database.query<CountRow>(
      "SELECT count(*) AS count FROM evidence_receipts er WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(er.bundle_metadata->'artifacts') artifact WHERE artifact->>'sha256' = $1) AND NOT EXISTS (SELECT 1 FROM evidence_receipt_deletion_events deletion WHERE deletion.workspace_id = er.workspace_id AND deletion.receipt_id = er.id)",
      [sha256.parse(hashCandidate)],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async appendRetentionPolicy(candidate: EvidenceRetentionPolicy): Promise<void> {
    const policy = evidenceRetentionPolicySchema.parse(candidate);
    try {
      await this.database.query(
        "INSERT INTO evidence_retention_policies (workspace_id, retention_days, basis, updated_at, updated_by) VALUES ($1, $2, $3, $4, $5)",
        [
          policy.workspaceId,
          policy.retentionDays,
          policy.basis,
          policy.updatedAt,
          policy.updatedBy,
        ],
      );
    } catch (error) {
      if (
        error instanceof Error &&
        /duplicate|unique|already exists/iu.test(error.message)
      ) {
        throw new EvidenceReceiptConflictError(
          "Evidence retention policy timestamp already exists",
        );
      }
      throw error;
    }
  }

  async getLatestRetentionPolicy(
    workspaceId: string,
  ): Promise<EvidenceRetentionPolicy | undefined> {
    const result = await this.database.query<RetentionPolicyRow>(
      "SELECT workspace_id, retention_days, basis, updated_at, updated_by FROM evidence_retention_policies WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT 1",
      [uuid.parse(workspaceId)],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return immutableClone(
      evidenceRetentionPolicySchema.parse({
        workspaceId: row.workspace_id,
        retentionDays: row.retention_days,
        basis: row.basis,
        updatedAt:
          row.updated_at instanceof Date
            ? row.updated_at.toISOString()
            : row.updated_at,
        updatedBy: jsonValue(row.updated_by),
      }),
    );
  }

  async listRetainedCreatedBefore(
    workspaceId: string,
    cutoff: string,
  ): Promise<readonly StoredEvidenceReceiptBundle[]> {
    const result = await this.database.query<ReceiptBundleRow>(
      "SELECT er.bundle_metadata FROM evidence_receipts er WHERE er.workspace_id = $1 AND er.created_at <= $2 AND NOT EXISTS (SELECT 1 FROM evidence_receipt_deletion_events deletion WHERE deletion.workspace_id = er.workspace_id AND deletion.receipt_id = er.id) ORDER BY er.created_at, er.id",
      [uuid.parse(workspaceId), timestamp.parse(cutoff)],
    );
    return result.rows.map(({ bundle_metadata }) =>
      immutableClone(
        storedEvidenceReceiptBundleSchema.parse(jsonValue(bundle_metadata)),
      ),
    );
  }
}

export interface EvidenceObjectStore {
  put(expectedSha256: string, bytes: Uint8Array): Promise<void>;
  get(expectedSha256: string): Promise<Uint8Array | undefined>;
  delete(expectedSha256: string): Promise<void>;
}

export class InMemoryEvidenceObjectStore implements EvidenceObjectStore {
  readonly #objects = new Map<string, Uint8Array>();

  put(expectedSha256: string, bytes: Uint8Array): Promise<void> {
    const hash = sha256.parse(expectedSha256);
    if (sha256Bytes(bytes) !== hash) {
      return Promise.reject(
        new EvidenceReceiptIntegrityError("Object bytes do not match their content address"),
      );
    }
    const existing = this.#objects.get(hash);
    if (existing && !Buffer.from(existing).equals(Buffer.from(bytes))) {
      return Promise.reject(
        new EvidenceReceiptIntegrityError("Content address collision detected"),
      );
    }
    this.#objects.set(hash, new Uint8Array(bytes));
    return Promise.resolve();
  }

  get(expectedSha256: string): Promise<Uint8Array | undefined> {
    const bytes = this.#objects.get(sha256.parse(expectedSha256));
    return Promise.resolve(bytes ? new Uint8Array(bytes) : undefined);
  }

  delete(expectedSha256: string): Promise<void> {
    this.#objects.delete(sha256.parse(expectedSha256));
    return Promise.resolve();
  }
}

export class FileSystemEvidenceObjectStore implements EvidenceObjectStore {
  readonly #encryptionKey: Buffer;

  constructor(
    private readonly rootDirectory: string,
    encryptionKey: Uint8Array,
  ) {
    if (encryptionKey.byteLength !== 32) {
      throw new TypeError("Evidence object encryption key must contain 32 bytes");
    }
    this.#encryptionKey = Buffer.from(encryptionKey);
  }

  #objectPath(hash: string): string {
    const parsed = sha256.parse(hash);
    return path.join(this.rootDirectory, "sha256", parsed.slice(0, 2), parsed);
  }

  #encrypt(hash: string, bytes: Uint8Array): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#encryptionKey, iv);
    cipher.setAAD(Buffer.from(hash, "ascii"));
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(bytes)),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([
      Buffer.from("PACTWIRE-EVIDENCE-OBJECT-V1\0", "ascii"),
      iv,
      tag,
      ciphertext,
    ]);
  }

  #decrypt(hash: string, encrypted: Uint8Array): Uint8Array {
    const magic = Buffer.from("PACTWIRE-EVIDENCE-OBJECT-V1\0", "ascii");
    const payload = Buffer.from(encrypted);
    if (
      payload.byteLength < magic.byteLength + 12 + 16 ||
      !payload.subarray(0, magic.byteLength).equals(magic)
    ) {
      throw new EvidenceReceiptIntegrityError(
        "Stored evidence object has an invalid encrypted envelope",
      );
    }
    const ivStart = magic.byteLength;
    const tagStart = ivStart + 12;
    const ciphertextStart = tagStart + 16;
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.#encryptionKey,
        payload.subarray(ivStart, tagStart),
      );
      decipher.setAAD(Buffer.from(hash, "ascii"));
      decipher.setAuthTag(payload.subarray(tagStart, ciphertextStart));
      return new Uint8Array(
        Buffer.concat([
          decipher.update(payload.subarray(ciphertextStart)),
          decipher.final(),
        ]),
      );
    } catch {
      throw new EvidenceReceiptIntegrityError(
        "Stored evidence object could not be authenticated or decrypted",
      );
    }
  }

  async put(expectedSha256: string, bytes: Uint8Array): Promise<void> {
    const hash = sha256.parse(expectedSha256);
    if (sha256Bytes(bytes) !== hash) {
      throw new EvidenceReceiptIntegrityError(
        "Object bytes do not match their content address",
      );
    }
    const objectPath = this.#objectPath(hash);
    await mkdir(path.dirname(objectPath), { recursive: true });
    try {
      await writeFile(objectPath, this.#encrypt(hash, bytes), { flag: "wx" });
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
      const existing = await this.get(hash);
      if (!existing || !Buffer.from(existing).equals(Buffer.from(bytes))) {
        throw new EvidenceReceiptIntegrityError("Content address collision detected");
      }
    }
  }

  async get(expectedSha256: string): Promise<Uint8Array | undefined> {
    const hash = sha256.parse(expectedSha256);
    try {
      const encrypted = await readFile(this.#objectPath(hash));
      const bytes = this.#decrypt(hash, encrypted);
      if (sha256Bytes(bytes) !== hash) {
        throw new EvidenceReceiptIntegrityError(
          "Stored object no longer matches its content address",
        );
      }
      return new Uint8Array(bytes);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async delete(expectedSha256: string): Promise<void> {
    const objectPath = this.#objectPath(sha256.parse(expectedSha256));
    await rm(objectPath, { force: true });
  }
}

interface EvidenceReceiptServiceOptions {
  readonly idFactory?: () => string;
}

export class EvidenceReceiptService {
  readonly #idFactory: () => string;

  constructor(
    private readonly repository: EvidenceReceiptRepository,
    private readonly objectStore: EvidenceObjectStore,
    options: EvidenceReceiptServiceOptions = {},
  ) {
    this.#idFactory = options.idFactory ?? (() => randomUUID());
  }

  async append(candidate: EvidenceReceiptBundle): Promise<void> {
    const bundle = evidenceReceiptBundleSchema.parse(candidate);
    const report = verifyEvidenceReceiptBundle(bundle);
    if (report.status !== "VALID") {
      throw new EvidenceReceiptIntegrityError(
        `Evidence receipt failed verification: ${report.issues.map(({ code }) => code).join(", ")}`,
      );
    }
    if (bundle.receipt.supersedesReceiptId) {
      const prior = await this.repository.get(
        bundle.receipt.workspaceId,
        bundle.receipt.supersedesReceiptId,
      );
      if (
        !prior ||
        prior.receipt.findingId !== bundle.receipt.supersedesFindingId
      ) {
        throw new EvidenceReceiptIntegrityError(
          "A correction must link an existing immutable receipt and finding",
        );
      }
    }
    for (const artifact of bundle.artifacts) {
      await this.objectStore.put(
        artifact.sha256,
        Buffer.from(artifact.contentBase64, "base64"),
      );
    }
    await this.repository.append(toStoredEvidenceReceiptBundle(bundle));
  }

  async get(workspaceId: string, receiptId: string): Promise<EvidenceReceiptBundle> {
    const stored = await this.repository.get(workspaceId, receiptId);
    if (!stored) throw new EvidenceReceiptUnavailableError();
    if (
      (await this.repository.listDeletionEvents(workspaceId, receiptId)).length > 0
    ) {
      throw new EvidenceReceiptContentDeletedError();
    }
    const artifacts: EvidenceReceiptArtifact[] = [];
    for (const artifact of stored.artifacts) {
      const bytes = await this.objectStore.get(artifact.sha256);
      if (!bytes || sha256Bytes(bytes) !== artifact.sha256) {
        throw new EvidenceReceiptIntegrityError(
          `Stored artifact ${artifact.path} is unavailable or corrupt`,
        );
      }
      artifacts.push(
        evidenceReceiptArtifactSchema.parse({
          ...artifact,
          contentBase64: Buffer.from(bytes).toString("base64"),
        }),
      );
    }
    const bundle = evidenceReceiptBundleSchema.parse({ ...stored, artifacts });
    const verification = verifyEvidenceReceiptBundle(bundle);
    if (verification.status !== "VALID") {
      throw new EvidenceReceiptIntegrityError(
        `Stored evidence receipt failed verification: ${verification.issues
          .map(({ code }) => code)
          .join(", ")}`,
      );
    }
    return immutableClone(bundle);
  }

  async listForFinding(
    workspaceId: string,
    findingId: string,
  ): Promise<readonly EvidenceReceiptBundle[]> {
    const stored = await this.repository.listForFinding(workspaceId, findingId);
    const active: EvidenceReceiptBundle[] = [];
    for (const bundle of stored) {
      const events = await this.repository.listDeletionEvents(
        bundle.receipt.workspaceId,
        bundle.receipt.id,
      );
      if (events.length === 0) {
        active.push(
          await this.get(bundle.receipt.workspaceId, bundle.receipt.id),
        );
      }
    }
    return immutableClone(active);
  }

  async exportSanitizedBundle(workspaceId: string, receiptId: string): Promise<string> {
    return serializeEvidenceReceiptBundle(await this.get(workspaceId, receiptId));
  }

  async getRetentionPolicy(workspaceId: string): Promise<EvidenceRetentionPolicy> {
    const parsedWorkspaceId = uuid.parse(workspaceId);
    const configured =
      await this.repository.getLatestRetentionPolicy(parsedWorkspaceId);
    if (configured) return immutableClone(configured);
    return immutableClone(
      evidenceRetentionPolicySchema.parse({
        workspaceId: parsedWorkspaceId,
        retentionDays: DEFAULT_EVIDENCE_RETENTION_DAYS,
        basis: "PACTWIRE_PRODUCT_DEFAULT",
        updatedAt: "1970-01-01T00:00:00.000Z",
        updatedBy: {
          kind: "AUTOMATION",
          actorId: "pactwire-product-default",
        },
      }),
    );
  }

  async setRetentionPolicy(
    candidate: z.input<typeof setRetentionPolicyInputSchema>,
  ): Promise<EvidenceRetentionPolicy> {
    const input = setRetentionPolicyInputSchema.parse(candidate);
    const policy = evidenceRetentionPolicySchema.parse({
      ...input,
      basis: "HUMAN_CONFIGURED",
    });
    await this.repository.appendRetentionPolicy(policy);
    return immutableClone(policy);
  }

  async #purgeStoredContent(
    stored: StoredEvidenceReceiptBundle,
    input: Readonly<{
      trigger: "MANUAL" | "RETENTION_EXPIRY";
      reason: string;
      occurredAt: string;
      requestedBy:
        | Readonly<{ kind: "HUMAN"; actorId: string }>
        | Readonly<{ kind: "AUTOMATION"; actorId: string }>;
    }>,
  ): Promise<EvidenceReceiptDeletionEvent> {
    const workspaceId = stored.receipt.workspaceId;
    const receiptId = stored.receipt.id;
    const existing = await this.repository.listDeletionEvents(
      workspaceId,
      receiptId,
    );
    const completed = existing.find(({ status }) => status === "COMPLETED");
    if (completed) return immutableClone(completed);

    const requested = existing.find(({ status }) => status === "REQUESTED");
    const operationId = requested?.id ?? uuid.parse(this.#idFactory());
    if (!requested) {
      await this.repository.appendDeletionEvent(
        evidenceReceiptDeletionEventSchema.parse({
          id: operationId,
          workspaceId,
          receiptId,
          status: "REQUESTED",
          trigger: input.trigger,
          reason: input.reason,
          occurredAt: input.occurredAt,
          requestedBy: input.requestedBy,
        }),
      );
    }

    for (const artifact of stored.artifacts) {
      const retainedReferences =
        await this.repository.countRetainedArtifactReferences(artifact.sha256);
      if (retainedReferences === 0) {
        await this.objectStore.delete(artifact.sha256);
      }
    }
    const completedEvent = evidenceReceiptDeletionEventSchema.parse({
      id: operationId,
      workspaceId,
      receiptId,
      status: "COMPLETED",
      trigger: input.trigger,
      reason: input.reason,
      occurredAt: input.occurredAt,
      requestedBy: input.requestedBy,
    });
    await this.repository.appendDeletionEvent(completedEvent);
    return immutableClone(completedEvent);
  }

  async deleteRetainedContent(
    candidate: DeleteRetainedContentInput,
  ): Promise<EvidenceReceiptDeletionEvent> {
    const input = deleteRetainedContentInputSchema.parse(candidate);
    if (input.confirmation !== `DELETE ${input.receiptId}`) {
      throw new EvidenceReceiptDeletionDeniedError(
        "Deletion confirmation did not name the exact evidence receipt",
      );
    }
    const stored = await this.repository.get(input.workspaceId, input.receiptId);
    if (!stored) throw new EvidenceReceiptUnavailableError();
    return this.#purgeStoredContent(stored, {
      trigger: "MANUAL",
      reason: input.reason,
      occurredAt: input.requestedAt,
      requestedBy: input.requestedBy,
    });
  }

  async purgeExpiredContent(
    candidate: z.input<typeof purgeExpiredContentInputSchema>,
  ): Promise<readonly EvidenceReceiptDeletionEvent[]> {
    const input = purgeExpiredContentInputSchema.parse(candidate);
    const policy = await this.getRetentionPolicy(input.workspaceId);
    const cutoff = new Date(
      new Date(input.asOf).getTime() - policy.retentionDays * 86_400_000,
    ).toISOString();
    const expired = await this.repository.listRetainedCreatedBefore(
      input.workspaceId,
      cutoff,
    );
    const completed: EvidenceReceiptDeletionEvent[] = [];
    for (const stored of expired) {
      completed.push(
        await this.#purgeStoredContent(stored, {
          trigger: "RETENTION_EXPIRY",
          reason: "RETENTION_PERIOD_EXPIRED",
          occurredAt: input.asOf,
          requestedBy: input.requestedBy,
        }),
      );
    }
    return immutableClone(completed);
  }
}
