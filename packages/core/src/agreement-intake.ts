import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { z } from "zod";
import {
  agreementVersionSchema,
  auditEventSchema,
  humanActorSchema,
  type AgreementVersion,
  type AuditEvent,
} from "./domain.js";
import {
  workspacePrincipalSchema,
  type WorkspaceAuthorizationService,
  type WorkspacePrincipal,
} from "./authorization.js";
import type { SoftwareInventoryRepository } from "./inventory.js";
import type { MigrationDatabase } from "./migrations.js";

const MAX_AGREEMENT_BYTES = 10 * 1024 * 1024;
const MAX_AGREEMENT_PAGES = 500;
const MAX_EXTRACTED_CHARACTERS = 2_000_000;
const PAGE_SEPARATOR = "\n\f\n";
const timestamp = z.string().datetime({ offset: true });

function canonicalTimestamp(value: string): string {
  return new Date(timestamp.parse(value)).toISOString();
}

export const supportedAgreementMimeTypes = [
  "application/pdf",
  "text/plain",
] as const;
export type AgreementMimeType = (typeof supportedAgreementMimeTypes)[number];

export interface AgreementPageMapEntry {
  readonly pageNumber: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly text: string;
  readonly textSha256: string;
}

export interface ExtractedAgreementSource {
  readonly normalizedText: string;
  readonly pageMap: readonly AgreementPageMapEntry[];
}

export class UnsupportedAgreementTypeError extends Error {
  readonly code = "UNSUPPORTED_AGREEMENT_TYPE";
  readonly status = 415;
  readonly publicMessage = "Upload a PDF or plain-text agreement.";

  constructor() {
    super("Agreement input must use application/pdf or text/plain");
    this.name = "UnsupportedAgreementTypeError";
  }
}

export class AgreementCorruptError extends Error {
  readonly code = "AGREEMENT_CORRUPT";
  readonly status = 422;
  readonly publicMessage =
    "Pactwire could not read this agreement. Check the file and try again.";

  constructor(message = "Agreement bytes are empty, corrupt, or unreadable") {
    super(message);
    this.name = "AgreementCorruptError";
  }
}

export class AgreementTooLargeError extends Error {
  readonly code = "AGREEMENT_TOO_LARGE";
  readonly status = 413;
  readonly publicMessage = "Agreement files must be 10 MB or smaller.";

  constructor() {
    super("Agreement bytes exceed the configured ten-megabyte limit");
    this.name = "AgreementTooLargeError";
  }
}

export function hashAgreementBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function agreementMimeType(candidate: string): AgreementMimeType {
  const normalized = candidate.split(";", 1)[0]?.trim().toLowerCase();
  if (
    normalized === "application/pdf" ||
    normalized === "text/plain"
  ) {
    return normalized;
  }
  throw new UnsupportedAgreementTypeError();
}

function assertAgreementSize(bytes: Uint8Array): void {
  if (bytes.length === 0) throw new AgreementCorruptError();
  if (bytes.length > MAX_AGREEMENT_BYTES) throw new AgreementTooLargeError();
}

function buildPageMap(pageTexts: readonly string[]): ExtractedAgreementSource {
  if (pageTexts.length === 0 || pageTexts.length > MAX_AGREEMENT_PAGES) {
    throw new AgreementCorruptError("Agreement has an unsupported page count");
  }
  const normalizedText = pageTexts.join(PAGE_SEPARATOR);
  if (
    normalizedText.trim().length === 0 ||
    normalizedText.length > MAX_EXTRACTED_CHARACTERS
  ) {
    throw new AgreementCorruptError("Agreement contains no readable bounded text");
  }
  let offset = 0;
  const pageMap = pageTexts.map((text, index) => {
    const startOffset = offset;
    const endOffset = startOffset + text.length;
    offset = endOffset + (index === pageTexts.length - 1 ? 0 : PAGE_SEPARATOR.length);
    return Object.freeze({
      pageNumber: index + 1,
      startOffset,
      endOffset,
      text,
      textSha256: hashAgreementBytes(new TextEncoder().encode(text)),
    });
  });
  return Object.freeze({
    normalizedText,
    pageMap: Object.freeze(pageMap),
  });
}

function extractTextSource(bytes: Uint8Array): ExtractedAgreementSource {
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AgreementCorruptError("Plain-text agreement is not valid UTF-8");
  }
  if (decoded.includes("\u0000")) {
    throw new AgreementCorruptError("Plain-text agreement contains binary bytes");
  }
  const normalized = decoded
    .replace(/^\uFEFF/u, "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");
  return buildPageMap(normalized.split("\f"));
}

async function extractPdfSource(bytes: Uint8Array): Promise<ExtractedAgreementSource> {
  let loadingTask: ReturnType<typeof getDocument> | undefined;
  try {
    loadingTask = getDocument({
      data: bytes.slice(),
      useSystemFonts: true,
      verbosity: 0,
    });
    const document = await loadingTask.promise;
    if (document.numPages < 1 || document.numPages > MAX_AGREEMENT_PAGES) {
      throw new AgreementCorruptError("PDF has an unsupported page count");
    }
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => {
          if (!("str" in item)) return "";
          return `${item.str}${item.hasEOL ? "\n" : " "}`;
        })
        .join("")
        .replaceAll(/[ \t]+\n/gu, "\n")
        .trim();
      pageTexts.push(text);
      page.cleanup();
    }
    return buildPageMap(pageTexts);
  } catch (error) {
    if (error instanceof AgreementCorruptError) throw error;
    throw new AgreementCorruptError(
      error instanceof Error ? `Unreadable PDF: ${error.message}` : undefined,
    );
  } finally {
    await loadingTask?.destroy().catch(() => undefined);
  }
}

export async function extractAgreementSource(input: {
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}): Promise<ExtractedAgreementSource> {
  const mimeType = agreementMimeType(input.mimeType);
  assertAgreementSize(input.bytes);
  return mimeType === "text/plain"
    ? extractTextSource(input.bytes)
    : extractPdfSource(input.bytes);
}

export class AgreementHashMismatchError extends Error {
  readonly code = "AGREEMENT_HASH_MISMATCH";
  readonly status = 422;
  readonly publicMessage =
    "The uploaded bytes do not match the expected SHA-256 hash.";

  constructor() {
    super("Agreement expected hash does not match the uploaded bytes");
    this.name = "AgreementHashMismatchError";
  }
}

export class AgreementUnavailableError extends Error {
  readonly code = "AGREEMENT_UNAVAILABLE";
  readonly status = 404;
  readonly publicMessage = "Agreement version not found or not available.";

  constructor() {
    super("Agreement version is outside the authorized software boundary");
    this.name = "AgreementUnavailableError";
  }
}

export class AgreementIntegrityError extends Error {
  readonly code = "AGREEMENT_INTEGRITY_FAILURE";
  readonly status = 409;
  readonly publicMessage =
    "The stored agreement source failed integrity verification.";

  constructor() {
    super("Agreement object bytes are missing or do not match immutable metadata");
    this.name = "AgreementIntegrityError";
  }
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

export interface AgreementObjectStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
}

function assertContentAddressMatches(key: string, bytes: Uint8Array): void {
  const match = /^agreements\/sha256\/([a-f0-9]{64})\.(?:pdf|txt)$/u.exec(key);
  if (!match || match[1] !== hashAgreementBytes(bytes)) {
    throw new AgreementIntegrityError();
  }
}

export class InMemoryAgreementObjectStore implements AgreementObjectStore {
  readonly #objects = new Map<string, Uint8Array>();

  put(key: string, bytes: Uint8Array): Promise<void> {
    try {
      assertContentAddressMatches(key, bytes);
      const existing = this.#objects.get(key);
      if (existing && hashAgreementBytes(existing) !== hashAgreementBytes(bytes)) {
        throw new AgreementIntegrityError();
      }
      this.#objects.set(key, bytes.slice());
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new AgreementIntegrityError(),
      );
    }
  }

  get(key: string): Promise<Uint8Array | undefined> {
    const value = this.#objects.get(key);
    if (!value) return Promise.resolve(undefined);
    try {
      assertContentAddressMatches(key, value);
      return Promise.resolve(value.slice());
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new AgreementIntegrityError(),
      );
    }
  }
}

export class FileSystemAgreementObjectStore implements AgreementObjectStore {
  readonly #root: string;

  constructor(root: string) {
    this.#root = path.resolve(root);
  }

  #target(key: string): string {
    if (!/^agreements\/sha256\/[a-f0-9]{64}\.(?:pdf|txt)$/u.test(key)) {
      throw new AgreementIntegrityError();
    }
    const target = path.resolve(this.#root, ...key.split("/"));
    if (!target.startsWith(`${this.#root}${path.sep}`)) {
      throw new AgreementIntegrityError();
    }
    return target;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    assertContentAddressMatches(key, bytes);
    const target = this.#target(key);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await writeFile(target, bytes, { flag: "wx" });
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "EEXIST"
      ) {
        throw error;
      }
      const existing = await readFile(target);
      if (hashAgreementBytes(existing) !== hashAgreementBytes(bytes)) {
        throw new AgreementIntegrityError();
      }
    }
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    try {
      const bytes = new Uint8Array(await readFile(this.#target(key)));
      assertContentAddressMatches(key, bytes);
      return bytes;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }
  }
}

type AgreementVersionCandidate = Omit<AgreementVersion, "version">;

export interface AgreementIntakeRepository {
  findByHash(
    workspaceId: string,
    softwareId: string,
    sourceSha256: string,
  ): Promise<AgreementVersion | undefined>;
  readAgreement(
    workspaceId: string,
    softwareId: string,
    agreementVersionId: string,
  ): Promise<AgreementVersion | undefined>;
  listAgreements(
    workspaceId: string,
    softwareId: string,
  ): Promise<readonly AgreementVersion[]>;
  createNextVersionWithAudit(
    candidate: AgreementVersionCandidate,
    audit: AuditEvent,
  ): Promise<{ readonly agreement: AgreementVersion; readonly created: boolean }>;
  appendAuditEvent(audit: AuditEvent): Promise<void>;
}

export class InMemoryAgreementIntakeRepository
  implements AgreementIntakeRepository
{
  readonly #agreements: AgreementVersion[] = [];
  readonly #auditSink:
    | { appendAuditEvent(audit: AuditEvent): Promise<void> }
    | undefined;

  constructor(auditSink?: { appendAuditEvent(audit: AuditEvent): Promise<void> }) {
    this.#auditSink = auditSink;
  }

  findByHash(
    workspaceId: string,
    softwareId: string,
    sourceSha256: string,
  ): Promise<AgreementVersion | undefined> {
    const found = this.#agreements.find(
      (item) =>
        item.workspaceId === workspaceId &&
        item.softwareId === softwareId &&
        item.sourceSha256 === sourceSha256,
    );
    return Promise.resolve(found ? immutableClone(found) : undefined);
  }

  readAgreement(
    workspaceId: string,
    softwareId: string,
    agreementVersionId: string,
  ): Promise<AgreementVersion | undefined> {
    const found = this.#agreements.find(
      (item) =>
        item.workspaceId === workspaceId &&
        item.softwareId === softwareId &&
        item.id === agreementVersionId,
    );
    return Promise.resolve(found ? immutableClone(found) : undefined);
  }

  listAgreements(
    workspaceId: string,
    softwareId: string,
  ): Promise<readonly AgreementVersion[]> {
    return Promise.resolve(
      immutableClone(
        this.#agreements
          .filter(
            (item) =>
              item.workspaceId === workspaceId && item.softwareId === softwareId,
          )
          .sort((left, right) => right.version - left.version),
      ),
    );
  }

  async createNextVersionWithAudit(
    candidate: AgreementVersionCandidate,
    auditCandidate: AuditEvent,
  ): Promise<{ readonly agreement: AgreementVersion; readonly created: boolean }> {
    const existing = await this.findByHash(
      candidate.workspaceId,
      candidate.softwareId,
      candidate.sourceSha256,
    );
    if (existing) return { agreement: existing, created: false };
    const versions = this.#agreements.filter(
      (item) =>
        item.workspaceId === candidate.workspaceId &&
        item.softwareId === candidate.softwareId,
    );
    const agreement = agreementVersionSchema.parse({
      ...candidate,
      version: Math.max(0, ...versions.map((item) => item.version)) + 1,
    });
    const audit = auditEventSchema.parse(auditCandidate);
    if (
      audit.workspaceId !== agreement.workspaceId ||
      audit.subjectType !== "agreement_version" ||
      audit.subjectId !== agreement.id
    ) {
      throw new Error("Agreement and audit records must share one subject");
    }
    if (this.#auditSink) await this.#auditSink.appendAuditEvent(audit);
    this.#agreements.push(immutableClone(agreement));
    return { agreement: immutableClone(agreement), created: true };
  }

  async appendAuditEvent(auditCandidate: AuditEvent): Promise<void> {
    const audit = auditEventSchema.parse(auditCandidate);
    if (this.#auditSink) await this.#auditSink.appendAuditEvent(audit);
  }
}

interface AgreementRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly software_id: string;
  readonly version: number;
  readonly source_object_key: string;
  readonly source_sha256: string;
  readonly source_mime_type: AgreementMimeType;
  readonly source_file_name: string;
  readonly source_byte_length: number;
  readonly effective_from: string | Date | null;
  readonly effective_until: string | Date | null;
  readonly normalized_text: string;
  readonly page_map: unknown;
  readonly created_at: string | Date;
  readonly created_by: unknown;
}

const agreementSelect =
  "SELECT id, workspace_id, software_id, version, source_object_key, source_sha256, source_mime_type, source_file_name, source_byte_length, effective_from, effective_until, normalized_text, page_map, created_at, created_by FROM agreement_versions";

function jsonValue<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function dateOnly(value: string | Date | null): string | undefined {
  if (value === null) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function agreementFromRow(row: AgreementRow): AgreementVersion {
  return agreementVersionSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    softwareId: row.software_id,
    version: row.version,
    sourceObjectKey: row.source_object_key,
    sourceSha256: row.source_sha256,
    sourceMimeType: row.source_mime_type,
    sourceFileName: row.source_file_name,
    sourceByteLength: Number(row.source_byte_length),
    ...(dateOnly(row.effective_from)
      ? { effectiveFrom: dateOnly(row.effective_from) }
      : {}),
    ...(dateOnly(row.effective_until)
      ? { effectiveUntil: dateOnly(row.effective_until) }
      : {}),
    normalizedText: row.normalized_text,
    pageMap: jsonValue(row.page_map),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    createdBy: jsonValue(row.created_by),
  });
}

export class PostgresAgreementIntakeRepository
  implements AgreementIntakeRepository
{
  readonly #database: MigrationDatabase;

  constructor(database: MigrationDatabase) {
    this.#database = database;
  }

  async findByHash(
    workspaceId: string,
    softwareId: string,
    sourceSha256: string,
  ): Promise<AgreementVersion | undefined> {
    const result = await this.#database.query<AgreementRow>(
      `${agreementSelect} WHERE workspace_id = $1 AND software_id = $2 AND source_sha256 = $3`,
      [workspaceId, softwareId, sourceSha256],
    );
    return result.rows[0] ? immutableClone(agreementFromRow(result.rows[0])) : undefined;
  }

  async readAgreement(
    workspaceId: string,
    softwareId: string,
    agreementVersionId: string,
  ): Promise<AgreementVersion | undefined> {
    const result = await this.#database.query<AgreementRow>(
      `${agreementSelect} WHERE workspace_id = $1 AND software_id = $2 AND id = $3`,
      [workspaceId, softwareId, agreementVersionId],
    );
    return result.rows[0] ? immutableClone(agreementFromRow(result.rows[0])) : undefined;
  }

  async listAgreements(
    workspaceId: string,
    softwareId: string,
  ): Promise<readonly AgreementVersion[]> {
    const result = await this.#database.query<AgreementRow>(
      `${agreementSelect} WHERE workspace_id = $1 AND software_id = $2 ORDER BY version DESC`,
      [workspaceId, softwareId],
    );
    return immutableClone(result.rows.map(agreementFromRow));
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

  async createNextVersionWithAudit(
    candidate: AgreementVersionCandidate,
    auditCandidate: AuditEvent,
  ): Promise<{ readonly agreement: AgreementVersion; readonly created: boolean }> {
    const audit = auditEventSchema.parse(auditCandidate);
    await this.#database.exec("BEGIN");
    try {
      const software = await this.#database.query<{ readonly id: string }>(
        "SELECT id FROM software_records WHERE workspace_id = $1 AND id = $2 FOR UPDATE",
        [candidate.workspaceId, candidate.softwareId],
      );
      if (!software.rows[0]) throw new AgreementUnavailableError();
      const existing = await this.findByHash(
        candidate.workspaceId,
        candidate.softwareId,
        candidate.sourceSha256,
      );
      if (existing) {
        await this.#database.exec("COMMIT");
        return { agreement: existing, created: false };
      }
      const versionResult = await this.#database.query<{
        readonly next_version: number;
      }>(
        "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM agreement_versions WHERE workspace_id = $1 AND software_id = $2",
        [candidate.workspaceId, candidate.softwareId],
      );
      const agreement = agreementVersionSchema.parse({
        ...candidate,
        version: Number(versionResult.rows[0]?.next_version ?? 1),
      });
      await this.#database.query(
        "INSERT INTO agreement_versions (workspace_id, id, software_id, version, source_object_key, source_sha256, source_mime_type, source_file_name, source_byte_length, effective_from, effective_until, normalized_text, page_map, created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)",
        [
          agreement.workspaceId,
          agreement.id,
          agreement.softwareId,
          agreement.version,
          agreement.sourceObjectKey,
          agreement.sourceSha256,
          agreement.sourceMimeType,
          agreement.sourceFileName,
          agreement.sourceByteLength,
          agreement.effectiveFrom ?? null,
          agreement.effectiveUntil ?? null,
          agreement.normalizedText,
          agreement.pageMap,
          agreement.createdAt,
          agreement.createdBy,
        ],
      );
      await this.#insertAudit(audit);
      await this.#database.exec("COMMIT");
      return { agreement: immutableClone(agreement), created: true };
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async appendAuditEvent(auditCandidate: AuditEvent): Promise<void> {
    await this.#insertAudit(auditEventSchema.parse(auditCandidate));
  }
}

const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const agreementDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const uploadAgreementSchema = z
  .object({
    principal: workspacePrincipalSchema,
    workspaceId: uuid,
    softwareId: uuid,
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((value) => !/[\\/]/u.test(value)),
    mimeType: z.enum(supportedAgreementMimeTypes),
    bytes: z.instanceof(Uint8Array),
    expectedSha256: sha256.optional(),
    effectiveFrom: agreementDateSchema.optional(),
    effectiveUntil: agreementDateSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const requiredExtension = value.mimeType === "application/pdf" ? ".pdf" : ".txt";
    if (!value.fileName.toLowerCase().endsWith(requiredExtension)) {
      context.addIssue({
        code: "custom",
        path: ["fileName"],
        message: "Agreement file extension must match its media type",
      });
    }
    if (
      value.effectiveFrom &&
      value.effectiveUntil &&
      value.effectiveUntil < value.effectiveFrom
    ) {
      context.addIssue({
        code: "custom",
        path: ["effectiveUntil"],
        message: "Agreement end date cannot precede its start date",
      });
    }
  });

const agreementScopeSchema = z
  .object({
    principal: workspacePrincipalSchema,
    workspaceId: uuid,
    softwareId: uuid,
  })
  .strict();

const agreementReadSchema = agreementScopeSchema.extend({
  agreementVersionId: uuid,
}).strict();

function scopeFromCandidate(candidate: unknown): {
  readonly principal: WorkspacePrincipal;
  readonly workspaceId: string;
  readonly softwareId: string;
} {
  if (typeof candidate !== "object" || candidate === null) {
    return agreementScopeSchema.parse(candidate);
  }
  const value = candidate as Readonly<Record<string, unknown>>;
  return agreementScopeSchema.parse({
    principal: value["principal"],
    workspaceId: value["workspaceId"],
    softwareId: value["softwareId"],
  });
}

export interface AgreementUploadResult {
  readonly agreement: AgreementVersion;
  readonly duplicate: boolean;
}

interface AgreementIntakeServiceOptions {
  readonly idFactory?: () => string;
  readonly now?: () => string;
}

export class AgreementIntakeService {
  readonly #repository: AgreementIntakeRepository;
  readonly #objectStore: AgreementObjectStore;
  readonly #authorization: Pick<WorkspaceAuthorizationService, "checkPermission">;
  readonly #software: Pick<SoftwareInventoryRepository, "readSoftware">;
  readonly #idFactory: () => string;
  readonly #now: () => string;

  constructor(
    repository: AgreementIntakeRepository,
    objectStore: AgreementObjectStore,
    authorization: Pick<WorkspaceAuthorizationService, "checkPermission">,
    software: Pick<SoftwareInventoryRepository, "readSoftware">,
    options: AgreementIntakeServiceOptions = {},
  ) {
    this.#repository = repository;
    this.#objectStore = objectStore;
    this.#authorization = authorization;
    this.#software = software;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  #audit(
    principal: WorkspacePrincipal,
    workspaceId: string,
    action: string,
    subjectId: string,
    details: Readonly<Record<string, unknown>>,
  ): AuditEvent {
    return auditEventSchema.parse({
      eventId: this.#idFactory(),
      eventType: "AUDIT_RECORDED",
      workspaceId,
      subjectType: "agreement_version",
      subjectId,
      action,
      actor: humanActorSchema.parse({
        kind: "HUMAN",
        actorId: principal.userId,
      }),
      occurredAt: canonicalTimestamp(this.#now()),
      details,
    });
  }

  async #assertSoftware(workspaceId: string, softwareId: string): Promise<void> {
    if (!(await this.#software.readSoftware(workspaceId, softwareId))) {
      throw new AgreementUnavailableError();
    }
  }

  async #verifiedBytes(agreement: AgreementVersion): Promise<Uint8Array> {
    const bytes = await this.#objectStore.get(agreement.sourceObjectKey);
    if (
      !bytes ||
      bytes.length !== agreement.sourceByteLength ||
      hashAgreementBytes(bytes) !== agreement.sourceSha256
    ) {
      throw new AgreementIntegrityError();
    }
    return bytes;
  }

  async uploadAgreement(candidate: unknown): Promise<AgreementUploadResult> {
    const scope = scopeFromCandidate(candidate);
    await this.#authorization.checkPermission({
      principal: scope.principal,
      workspaceId: scope.workspaceId,
      permission: "AGREEMENT_UPLOAD",
    });
    const input = uploadAgreementSchema.parse(candidate);
    await this.#assertSoftware(input.workspaceId, input.softwareId);
    const bytes = input.bytes.slice();
    const sourceSha256 = hashAgreementBytes(bytes);
    if (input.expectedSha256 && input.expectedSha256 !== sourceSha256) {
      throw new AgreementHashMismatchError();
    }
    const extracted = await extractAgreementSource({
      mimeType: input.mimeType,
      bytes,
    });
    const extension = input.mimeType === "application/pdf" ? "pdf" : "txt";
    const sourceObjectKey = `agreements/sha256/${sourceSha256}.${extension}`;
    const existing = await this.#repository.findByHash(
      input.workspaceId,
      input.softwareId,
      sourceSha256,
    );
    if (existing) {
      await this.#verifiedBytes(existing);
      await this.#repository.appendAuditEvent(
        this.#audit(
          input.principal,
          input.workspaceId,
          "agreement.duplicate_reused",
          existing.id,
          { sourceSha256, version: existing.version },
        ),
      );
      return { agreement: existing, duplicate: true };
    }
    await this.#objectStore.put(sourceObjectKey, bytes);
    const agreementId = this.#idFactory();
    const createdAt = canonicalTimestamp(this.#now());
    const result = await this.#repository.createNextVersionWithAudit(
      {
        id: agreementId,
        workspaceId: input.workspaceId,
        softwareId: input.softwareId,
        sourceObjectKey,
        sourceSha256,
        sourceMimeType: input.mimeType,
        sourceFileName: input.fileName,
        sourceByteLength: bytes.length,
        ...(input.effectiveFrom ? { effectiveFrom: input.effectiveFrom } : {}),
        ...(input.effectiveUntil ? { effectiveUntil: input.effectiveUntil } : {}),
        normalizedText: extracted.normalizedText,
        pageMap: extracted.pageMap.map((page) => ({ ...page })),
        createdAt,
        createdBy: humanActorSchema.parse({
          kind: "HUMAN",
          actorId: input.principal.userId,
        }),
      },
      this.#audit(
        input.principal,
        input.workspaceId,
        "agreement.version_created",
        agreementId,
        {
          sourceSha256,
          sourceByteLength: bytes.length,
          sourceMimeType: input.mimeType,
          pageCount: extracted.pageMap.length,
        },
      ),
    );
    if (!result.created) await this.#verifiedBytes(result.agreement);
    return { agreement: result.agreement, duplicate: !result.created };
  }

  async listAgreements(candidate: unknown): Promise<readonly AgreementVersion[]> {
    const input = agreementScopeSchema.parse(candidate);
    await this.#authorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "AGREEMENT_READ",
    });
    await this.#assertSoftware(input.workspaceId, input.softwareId);
    return this.#repository.listAgreements(input.workspaceId, input.softwareId);
  }

  async getAgreement(candidate: unknown): Promise<AgreementVersion> {
    const input = agreementReadSchema.parse(candidate);
    await this.#authorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "AGREEMENT_READ",
    });
    await this.#assertSoftware(input.workspaceId, input.softwareId);
    const agreement = await this.#repository.readAgreement(
      input.workspaceId,
      input.softwareId,
      input.agreementVersionId,
    );
    if (!agreement) throw new AgreementUnavailableError();
    return agreement;
  }

  async readOriginal(candidate: unknown): Promise<{
    readonly agreement: AgreementVersion;
    readonly bytes: Uint8Array;
  }> {
    const agreement = await this.getAgreement(candidate);
    return { agreement, bytes: await this.#verifiedBytes(agreement) };
  }
}
