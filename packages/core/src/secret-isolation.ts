import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import {
  auditEventSchema,
  humanActorSchema,
  type AuditEvent,
  type HumanActor,
} from "./domain.js";
import type {
  WorkspaceAuthorizationRepository,
  WorkspaceAuthorizationService,
  WorkspacePrincipal,
} from "./authorization.js";
import { workspacePrincipalSchema } from "./authorization.js";
import type { SoftwareInventoryRepository } from "./inventory.js";
import type { MigrationDatabase } from "./migrations.js";
import {
  REDACTED_SECRET,
  SECRET_SCREENSHOT_MASK_SELECTORS,
  configuredSecretRepresentations,
  redactStructuredValueWithCount,
  secretValueSchema,
} from "./redaction.js";

export {
  REDACTED_SECRET,
  SECRET_SCREENSHOT_MASK_SELECTORS,
  configuredSecretRepresentations,
  containsSecretRepresentation,
  redactSecretText,
  redactStructuredValue,
  redactStructuredValueWithCount,
  secretValueSchema,
} from "./redaction.js";

const uuid = z.string().uuid();
const nonEmpty = z.string().trim().min(1);
const boundedText = nonEmpty.max(240);
const timestamp = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);

function timestampMillis(value: string): number {
  return new Date(value).getTime();
}

function canonicalTimestamp(value: string): string {
  return new Date(timestamp.parse(value)).toISOString();
}

export const secretKindSchema = z.enum([
  "PASSWORD",
  "API_TOKEN",
  "SESSION_COOKIE",
]);
export type SecretKind = z.infer<typeof secretKindSchema>;

export const secretStatusSchema = z.enum(["ACTIVE", "REVOKED"]);
export type SecretStatus = z.infer<typeof secretStatusSchema>;

export const encryptedSecretEnvelopeSchema = z
  .object({
    algorithm: z.literal("AES-256-GCM"),
    keyVersion: boundedText,
    iv: z.string().min(16).max(32),
    ciphertext: z.string().min(1),
    authTag: z.string().min(16).max(32),
  })
  .strict();
export type EncryptedSecretEnvelope = z.infer<
  typeof encryptedSecretEnvelopeSchema
>;

export const secretMetadataSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    softwareId: uuid,
    label: boundedText,
    kind: secretKindSchema,
    status: secretStatusSchema,
    keyVersion: boundedText,
    createdAt: timestamp,
    createdBy: humanActorSchema,
    expiresAt: timestamp.optional(),
    revokedAt: timestamp.optional(),
    revokedBy: humanActorSchema.optional(),
    revocationReason: boundedText.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const revoked = value.status === "REVOKED";
    if (
      revoked !==
      Boolean(value.revokedAt && value.revokedBy && value.revocationReason)
    ) {
      context.addIssue({
        code: "custom",
        message: "Revoked secret metadata requires complete revocation provenance",
      });
    }
    if (
      value.expiresAt &&
      timestampMillis(value.expiresAt) <= timestampMillis(value.createdAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Secret expiry must be after creation",
      });
    }
  });
export type SecretMetadata = z.infer<typeof secretMetadataSchema>;

export const encryptedSecretRecordSchema = z
  .object({
    metadata: secretMetadataSchema,
    envelope: encryptedSecretEnvelopeSchema,
  })
  .strict();
export type EncryptedSecretRecord = z.infer<typeof encryptedSecretRecordSchema>;

export const harnessSecretLeaseSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    softwareId: uuid,
    secretId: uuid,
    purpose: boundedText,
    issuedAt: timestamp,
    expiresAt: timestamp,
    status: z.enum(["AVAILABLE", "CONSUMED"]),
    consumedAt: timestamp.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (timestampMillis(value.expiresAt) <= timestampMillis(value.issuedAt)) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Harness lease expiry must be after issue time",
      });
    }
    if ((value.status === "CONSUMED") !== Boolean(value.consumedAt)) {
      context.addIssue({
        code: "custom",
        message: "Consumed harness leases require consumedAt",
      });
    }
  });
export type HarnessSecretLease = z.infer<typeof harnessSecretLeaseSchema>;

const storedHarnessLeaseSchema = z
  .object({
    lease: harnessSecretLeaseSchema,
    tokenHash: sha256,
    browserContextHash: sha256,
    issuedBy: humanActorSchema,
  })
  .strict();
type StoredHarnessLease = z.infer<typeof storedHarnessLeaseSchema>;

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

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeDigestEqual(value: string, expectedDigest: string): boolean {
  const actual = Buffer.from(digest(value), "hex");
  const expected = Buffer.from(expectedDigest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function secretAad(metadata: SecretMetadata): string {
  return JSON.stringify([
    metadata.workspaceId,
    metadata.softwareId,
    metadata.id,
    metadata.kind,
    metadata.keyVersion,
  ]);
}

export class Aes256GcmSecretCipher {
  readonly #key: Buffer;
  readonly keyVersion: string;

  constructor(keyMaterial: Uint8Array, keyVersionCandidate: string) {
    if (keyMaterial.byteLength !== 32) {
      throw new Error("AES-256-GCM requires exactly 32 bytes of key material");
    }
    this.#key = Buffer.from(keyMaterial);
    this.keyVersion = boundedText.parse(keyVersionCandidate);
  }

  encrypt(plaintextCandidate: unknown, aad: string): EncryptedSecretEnvelope {
    const plaintext = secretValueSchema.parse(plaintextCandidate);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    return encryptedSecretEnvelopeSchema.parse({
      algorithm: "AES-256-GCM",
      keyVersion: this.keyVersion,
      iv: iv.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    });
  }

  decrypt(envelopeCandidate: unknown, aad: string): string {
    const envelope = encryptedSecretEnvelopeSchema.parse(envelopeCandidate);
    if (envelope.keyVersion !== this.keyVersion) {
      throw new Error("Encrypted secret key version is unavailable");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.#key,
      Buffer.from(envelope.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}

export class SecretUnavailableError extends Error {
  readonly code = "SECRET_UNAVAILABLE";
  readonly status = 404;
  readonly publicMessage = "Secret not found or not available.";

  constructor() {
    super("The requested secret is outside the active boundary or unavailable");
    this.name = "SecretUnavailableError";
  }
}

export class RawSecretAccessDeniedError extends Error {
  readonly code = "SECRET_RAW_ACCESS_DENIED";
  readonly status = 403;
  readonly auditRecorded = true;
  readonly publicMessage =
    "Raw secret values are unavailable to users, pages, and models. Browser harness injection only.";

  constructor() {
    super("Normal product channels cannot reveal raw secret values");
    this.name = "RawSecretAccessDeniedError";
  }
}

export class SecretLeaseUnavailableError extends Error {
  readonly code = "SECRET_LEASE_UNAVAILABLE";

  constructor() {
    super("The harness lease is expired, consumed, invalid, or bound elsewhere");
    this.name = "SecretLeaseUnavailableError";
  }
}

export interface SecretIsolationRepository {
  createSecretWithAudit(
    record: EncryptedSecretRecord,
    auditEvent: AuditEvent,
  ): Promise<void>;
  readSecret(
    workspaceId: string,
    softwareId: string,
    secretId: string,
  ): Promise<EncryptedSecretRecord | undefined>;
  listSecretRecords(
    workspaceId: string,
    softwareId?: string,
  ): Promise<readonly EncryptedSecretRecord[]>;
  revokeSecretWithAudit(
    record: EncryptedSecretRecord,
    auditEvent: AuditEvent,
  ): Promise<void>;
  createLeaseWithAudit(
    lease: StoredHarnessLease,
    auditEvent: AuditEvent,
  ): Promise<void>;
  readLease(leaseId: string): Promise<StoredHarnessLease | undefined>;
  consumeLeaseWithAudit(
    lease: StoredHarnessLease,
    auditEvent: AuditEvent,
  ): Promise<void>;
  appendAuditEvent(auditEvent: AuditEvent): Promise<void>;
}

export class InMemorySecretIsolationRepository
  implements SecretIsolationRepository
{
  readonly #records = new Map<string, EncryptedSecretRecord>();
  readonly #leases = new Map<string, StoredHarnessLease>();
  readonly #auditSink:
    | Pick<WorkspaceAuthorizationRepository, "appendAuditEvent">
    | undefined;

  constructor(
    auditSink?: Pick<WorkspaceAuthorizationRepository, "appendAuditEvent">,
  ) {
    this.#auditSink = auditSink;
  }

  async createSecretWithAudit(
    recordCandidate: EncryptedSecretRecord,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const record = encryptedSecretRecordSchema.parse(recordCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    const key = `${record.metadata.workspaceId}:${record.metadata.id}`;
    if (this.#records.has(key)) throw new Error("Secret already exists");
    if (
      audit.workspaceId !== record.metadata.workspaceId ||
      audit.subjectId !== record.metadata.id
    ) {
      throw new Error("Secret and audit must share one workspace and subject");
    }
    if (this.#auditSink) await this.#auditSink.appendAuditEvent(audit);
    this.#records.set(key, immutableClone(record));
  }

  readSecret(
    workspaceId: string,
    softwareId: string,
    secretId: string,
  ): Promise<EncryptedSecretRecord | undefined> {
    const record = this.#records.get(`${uuid.parse(workspaceId)}:${uuid.parse(secretId)}`);
    if (!record || record.metadata.softwareId !== uuid.parse(softwareId)) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(immutableClone(record));
  }

  listSecretRecords(
    workspaceId: string,
    softwareId?: string,
  ): Promise<readonly EncryptedSecretRecord[]> {
    const workspaceScope = uuid.parse(workspaceId);
    const softwareScope = softwareId ? uuid.parse(softwareId) : undefined;
    return Promise.resolve(
      immutableClone(
        [...this.#records.values()]
          .filter(
            (record) =>
              record.metadata.workspaceId === workspaceScope &&
              (!softwareScope || record.metadata.softwareId === softwareScope),
          )
          .sort(
            (left, right) =>
              timestampMillis(left.metadata.createdAt) -
                timestampMillis(right.metadata.createdAt) ||
              left.metadata.id.localeCompare(right.metadata.id),
          ),
      ),
    );
  }

  async revokeSecretWithAudit(
    recordCandidate: EncryptedSecretRecord,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const record = encryptedSecretRecordSchema.parse(recordCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    const key = `${record.metadata.workspaceId}:${record.metadata.id}`;
    const prior = this.#records.get(key);
    if (!prior || prior.envelope.ciphertext !== record.envelope.ciphertext) {
      throw new Error("Secret revocation cannot change encrypted bytes");
    }
    if (this.#auditSink) await this.#auditSink.appendAuditEvent(audit);
    this.#records.set(key, immutableClone(record));
  }

  async createLeaseWithAudit(
    leaseCandidate: StoredHarnessLease,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const lease = storedHarnessLeaseSchema.parse(leaseCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    if (this.#leases.has(lease.lease.id)) {
      throw new Error("Harness lease already exists");
    }
    if (
      audit.workspaceId !== lease.lease.workspaceId ||
      audit.subjectId !== lease.lease.id
    ) {
      throw new Error("Harness lease and audit must share one subject");
    }
    if (this.#auditSink) await this.#auditSink.appendAuditEvent(audit);
    this.#leases.set(lease.lease.id, immutableClone(lease));
  }

  readLease(leaseId: string): Promise<StoredHarnessLease | undefined> {
    const lease = this.#leases.get(uuid.parse(leaseId));
    return Promise.resolve(lease ? immutableClone(lease) : undefined);
  }

  async consumeLeaseWithAudit(
    leaseCandidate: StoredHarnessLease,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const lease = storedHarnessLeaseSchema.parse(leaseCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    const prior = this.#leases.get(lease.lease.id);
    if (!prior || prior.lease.status !== "AVAILABLE") {
      throw new SecretLeaseUnavailableError();
    }
    if (this.#auditSink) await this.#auditSink.appendAuditEvent(audit);
    this.#leases.set(lease.lease.id, immutableClone(lease));
  }

  async appendAuditEvent(auditCandidate: AuditEvent): Promise<void> {
    const audit = auditEventSchema.parse(auditCandidate);
    if (this.#auditSink) await this.#auditSink.appendAuditEvent(audit);
  }
}

interface SecretIsolationServiceOptions {
  readonly idFactory?: () => string;
  readonly tokenFactory?: () => string;
  readonly now?: () => string;
}

const secretRequestBaseSchema = z
  .object({
    principal: workspacePrincipalSchema,
    workspaceId: uuid,
    softwareId: uuid,
  })
  .strict();

const createSecretInputSchema = secretRequestBaseSchema
  .extend({
    label: boundedText,
    kind: secretKindSchema,
    value: secretValueSchema,
    expiresAt: timestamp.optional(),
  })
  .strict();

const secretRequestSchema = secretRequestBaseSchema
  .extend({ secretId: uuid })
  .strict();

const normalOutputChannelSchema = z.enum([
  "PROMPT",
  "LOG",
  "EVIDENCE",
  "EXPORT",
]);
export type NormalOutputChannel = z.infer<typeof normalOutputChannelSchema>;

function humanActor(principal: WorkspacePrincipal): HumanActor {
  return humanActorSchema.parse({ kind: "HUMAN", actorId: principal.userId });
}

function automationActor() {
  return {
    kind: "AUTOMATION" as const,
    actorId: "pactwire-browser-harness",
    component: "runner.secret-injection",
  };
}

export class SecretIsolationService {
  readonly #repository: SecretIsolationRepository;
  readonly #workspaceAuthorization: Pick<
    WorkspaceAuthorizationService,
    "checkPermission"
  >;
  readonly #softwareRepository: Pick<SoftwareInventoryRepository, "readSoftware">;
  readonly #cipher: Aes256GcmSecretCipher;
  readonly #idFactory: () => string;
  readonly #tokenFactory: () => string;
  readonly #now: () => string;

  constructor(
    repository: SecretIsolationRepository,
    workspaceAuthorization: Pick<
      WorkspaceAuthorizationService,
      "checkPermission"
    >,
    softwareRepository: Pick<SoftwareInventoryRepository, "readSoftware">,
    cipher: Aes256GcmSecretCipher,
    options: SecretIsolationServiceOptions = {},
  ) {
    this.#repository = repository;
    this.#workspaceAuthorization = workspaceAuthorization;
    this.#softwareRepository = softwareRepository;
    this.#cipher = cipher;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#tokenFactory =
      options.tokenFactory ?? (() => randomBytes(32).toString("base64url"));
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async createSecret(candidate: unknown): Promise<SecretMetadata> {
    const input = createSecretInputSchema.parse(candidate);
    await this.#workspaceAuthorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "SECRET_MANAGE",
    });
    await this.#assertSoftware(input.workspaceId, input.softwareId);
    const createdAt = canonicalTimestamp(this.#now());
    const metadata = secretMetadataSchema.parse({
      id: this.#idFactory(),
      workspaceId: input.workspaceId,
      softwareId: input.softwareId,
      label: input.label,
      kind: input.kind,
      status: "ACTIVE",
      keyVersion: this.#cipher.keyVersion,
      createdAt,
      createdBy: humanActor(input.principal),
      ...(input.expiresAt
        ? { expiresAt: canonicalTimestamp(input.expiresAt) }
        : {}),
    });
    const record = encryptedSecretRecordSchema.parse({
      metadata,
      envelope: this.#cipher.encrypt(input.value, secretAad(metadata)),
    });
    const audit = this.#humanAudit(
      input.principal,
      input.workspaceId,
      metadata.id,
      "secret.created",
      {
        softwareId: input.softwareId,
        kind: metadata.kind,
        keyVersion: metadata.keyVersion,
        expiresAt: metadata.expiresAt ?? null,
      },
    );
    await this.#repository.createSecretWithAudit(record, audit);
    return immutableClone(metadata);
  }

  async listSecrets(candidate: unknown): Promise<readonly SecretMetadata[]> {
    const input = secretRequestBaseSchema.parse(candidate);
    await this.#workspaceAuthorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "SECRET_USE",
    });
    await this.#assertSoftware(input.workspaceId, input.softwareId);
    return immutableClone(
      (await this.#repository.listSecretRecords(
        input.workspaceId,
        input.softwareId,
      )).map((record) => record.metadata),
    );
  }

  async revokeSecret(candidate: unknown): Promise<SecretMetadata> {
    const input = secretRequestSchema
      .extend({ reason: boundedText })
      .strict()
      .parse(candidate);
    await this.#workspaceAuthorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "SECRET_MANAGE",
    });
    const record = await this.#requireSecret(input);
    if (record.metadata.status === "REVOKED") return record.metadata;
    const metadata = secretMetadataSchema.parse({
      ...record.metadata,
      status: "REVOKED",
      revokedAt: canonicalTimestamp(this.#now()),
      revokedBy: humanActor(input.principal),
      revocationReason: input.reason,
    });
    const updated = encryptedSecretRecordSchema.parse({
      metadata,
      envelope: record.envelope,
    });
    await this.#repository.revokeSecretWithAudit(
      updated,
      this.#humanAudit(
        input.principal,
        input.workspaceId,
        metadata.id,
        "secret.revoked",
        { softwareId: input.softwareId, reason: input.reason },
      ),
    );
    return immutableClone(metadata);
  }

  async attemptRawAccess(candidate: unknown): Promise<never> {
    const input = secretRequestSchema.parse(candidate);
    await this.#workspaceAuthorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "SECRET_USE",
    });
    await this.#requireSecret(input);
    await this.#repository.appendAuditEvent(
      this.#humanAudit(
        input.principal,
        input.workspaceId,
        input.secretId,
        "secret.raw_access_denied",
        {
          softwareId: input.softwareId,
          outcome: "DENY",
          reason: "HARNESS_ONLY",
        },
      ),
    );
    throw new RawSecretAccessDeniedError();
  }

  async issueHarnessLease(candidate: unknown): Promise<{
    readonly lease: HarnessSecretLease;
    readonly token: string;
  }> {
    const input = secretRequestSchema
      .extend({
        browserContextId: boundedText,
        purpose: boundedText,
        ttlSeconds: z.number().int().min(15).max(300).default(60),
      })
      .strict()
      .parse(candidate);
    await this.#workspaceAuthorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "SECRET_USE",
    });
    const record = await this.#requireUsableSecret(input);
    const issuedAt = canonicalTimestamp(this.#now());
    const requestedExpiry = new Date(
      new Date(issuedAt).getTime() + input.ttlSeconds * 1_000,
    ).toISOString();
    const expiresAt =
      record.metadata.expiresAt &&
      timestampMillis(record.metadata.expiresAt) < timestampMillis(requestedExpiry)
        ? record.metadata.expiresAt
        : requestedExpiry;
    if (timestampMillis(expiresAt) <= timestampMillis(issuedAt)) {
      throw new SecretLeaseUnavailableError();
    }
    const token = this.#tokenFactory();
    if (token.length < 32) throw new Error("Harness lease token is too short");
    const lease = harnessSecretLeaseSchema.parse({
      id: this.#idFactory(),
      workspaceId: input.workspaceId,
      softwareId: input.softwareId,
      secretId: input.secretId,
      purpose: input.purpose,
      issuedAt,
      expiresAt,
      status: "AVAILABLE",
    });
    const stored = storedHarnessLeaseSchema.parse({
      lease,
      tokenHash: digest(token),
      browserContextHash: digest(
        `${input.workspaceId}:${input.softwareId}:${input.browserContextId}`,
      ),
      issuedBy: humanActor(input.principal),
    });
    await this.#repository.createLeaseWithAudit(
      stored,
      this.#humanAudit(
        input.principal,
        input.workspaceId,
        lease.id,
        "secret.harness_lease_issued",
        {
          softwareId: input.softwareId,
          secretId: input.secretId,
          expiresAt,
          purpose: input.purpose,
        },
      ),
    );
    return immutableClone({ lease, token });
  }

  async consumeHarnessLease(candidate: unknown): Promise<{
    readonly value: string;
    readonly kind: SecretKind;
    readonly secretId: string;
  }> {
    const input = z
      .object({
        leaseId: uuid,
        token: z.string().min(32).max(512),
        browserContextId: boundedText,
      })
      .strict()
      .parse(candidate);
    const stored = await this.#repository.readLease(input.leaseId);
    if (!stored) throw new SecretLeaseUnavailableError();
    const contextValue = `${stored.lease.workspaceId}:${stored.lease.softwareId}:${input.browserContextId}`;
    const checkedAt = canonicalTimestamp(this.#now());
    const valid =
      stored.lease.status === "AVAILABLE" &&
      timestampMillis(stored.lease.expiresAt) > timestampMillis(checkedAt) &&
      safeDigestEqual(input.token, stored.tokenHash) &&
      safeDigestEqual(contextValue, stored.browserContextHash);
    if (!valid) {
      await this.#repository.appendAuditEvent(
        this.#automationAudit(
          stored.lease.workspaceId,
          stored.lease.id,
          "secret.harness_injection_denied",
          {
            softwareId: stored.lease.softwareId,
            secretId: stored.lease.secretId,
            outcome: "DENY",
            reason: "LEASE_UNAVAILABLE",
          },
        ),
      );
      throw new SecretLeaseUnavailableError();
    }
    const record = await this.#repository.readSecret(
      stored.lease.workspaceId,
      stored.lease.softwareId,
      stored.lease.secretId,
    );
    if (
      !record ||
      record.metadata.status !== "ACTIVE" ||
      (record.metadata.expiresAt &&
        timestampMillis(record.metadata.expiresAt) <= timestampMillis(checkedAt))
    ) {
      await this.#repository.appendAuditEvent(
        this.#automationAudit(
          stored.lease.workspaceId,
          stored.lease.id,
          "secret.harness_injection_denied",
          {
            softwareId: stored.lease.softwareId,
            secretId: stored.lease.secretId,
            outcome: "DENY",
            reason: "SECRET_UNAVAILABLE",
          },
        ),
      );
      throw new SecretLeaseUnavailableError();
    }
    const consumedAt = canonicalTimestamp(this.#now());
    const consumed = storedHarnessLeaseSchema.parse({
      ...stored,
      lease: {
        ...stored.lease,
        status: "CONSUMED",
        consumedAt,
      },
    });
    await this.#repository.consumeLeaseWithAudit(
      consumed,
      this.#automationAudit(
        stored.lease.workspaceId,
        stored.lease.id,
        "secret.harness_injected",
        {
          softwareId: stored.lease.softwareId,
          secretId: stored.lease.secretId,
          browserContextBound: true,
          consumedAt,
        },
      ),
    );
    return Object.freeze({
      value: this.#decrypt(record),
      kind: record.metadata.kind,
      secretId: record.metadata.id,
    });
  }

  async redactNormalOutput(candidate: unknown): Promise<{
    readonly channel: NormalOutputChannel;
    readonly content: unknown;
    readonly redactionCount: number;
    readonly marker: typeof REDACTED_SECRET;
  }> {
    const input = secretRequestBaseSchema
      .extend({
        channel: normalOutputChannelSchema,
        content: z.unknown(),
      })
      .strict()
      .parse(candidate);
    await this.#workspaceAuthorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: input.channel === "EXPORT" ? "WORKSPACE_EXPORT" : "SECRET_USE",
    });
    await this.#assertSoftware(input.workspaceId, input.softwareId);
    const records = await this.#repository.listSecretRecords(
      input.workspaceId,
      input.softwareId,
    );
    const secrets = records.map((record) => this.#decrypt(record));
    const result = redactStructuredValueWithCount(input.content, secrets);
    await this.#repository.appendAuditEvent(
      this.#humanAudit(
        input.principal,
        input.workspaceId,
        input.softwareId,
        "secret.normal_output_redacted",
        {
          channel: input.channel,
          redactionCount: result.redactionCount,
          secretCount: records.length,
        },
      ),
    );
    return immutableClone({
      channel: input.channel,
      content: result.value,
      redactionCount: result.redactionCount,
      marker: REDACTED_SECRET,
    });
  }

  async createRedactionPreview(candidate: unknown): Promise<{
    readonly before: {
      readonly configuredRepresentationCount: number;
      readonly detected: true;
    };
    readonly after: unknown;
    readonly redactionCount: number;
    readonly marker: typeof REDACTED_SECRET;
    readonly screenshotMaskSelectors: readonly string[];
  }> {
    const input = secretRequestSchema.parse(candidate);
    await this.#workspaceAuthorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "SECRET_MANAGE",
    });
    const record = await this.#requireSecret(input);
    const secret = this.#decrypt(record);
    const representations = configuredSecretRepresentations(secret);
    const unsafe = {
      prompt: `Untrusted page requested ${representations[0]}`,
      log: {
        authorization: `Bearer ${representations[0]}`,
        encoded: representations.slice(1).join(" | "),
      },
      evidence: { password: secret, destination: "fixture.invalid" },
      export: `cookie=session=${secret}`,
    };
    const redacted = redactStructuredValueWithCount(unsafe, [secret]);
    await this.#repository.appendAuditEvent(
      this.#humanAudit(
        input.principal,
        input.workspaceId,
        input.secretId,
        "secret.redaction_previewed",
        {
          representationCount: representations.length,
          redactionCount: redacted.redactionCount,
        },
      ),
    );
    return immutableClone({
      before: {
        configuredRepresentationCount: representations.length,
        detected: true as const,
      },
      after: redacted.value,
      redactionCount: redacted.redactionCount,
      marker: REDACTED_SECRET,
      screenshotMaskSelectors: SECRET_SCREENSHOT_MASK_SELECTORS,
    });
  }

  async redactWorkspaceExport(candidate: unknown): Promise<Record<string, unknown>> {
    const input = z
      .object({
        principal: workspacePrincipalSchema,
        workspaceId: uuid,
        content: z.record(z.string(), z.unknown()),
      })
      .strict()
      .parse(candidate);
    await this.#workspaceAuthorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "WORKSPACE_EXPORT",
    });
    const records = await this.#repository.listSecretRecords(input.workspaceId);
    const secrets = records.map((record) => this.#decrypt(record));
    const redacted = redactStructuredValueWithCount(input.content, secrets);
    await this.#repository.appendAuditEvent(
      this.#humanAudit(
        input.principal,
        input.workspaceId,
        input.workspaceId,
        "secret.workspace_export_redacted",
        {
          redactionCount: redacted.redactionCount,
          secretCount: records.length,
        },
      ),
    );
    return immutableClone({
      ...redacted.value,
      secretMetadata: records.map((record) => record.metadata),
      redaction: {
        rawValuesIncluded: false,
        marker: REDACTED_SECRET,
        redactionCount: redacted.redactionCount,
      },
    });
  }

  async #assertSoftware(workspaceId: string, softwareId: string): Promise<void> {
    const software = await this.#softwareRepository.readSoftware(
      workspaceId,
      softwareId,
    );
    if (!software) throw new SecretUnavailableError();
  }

  async #requireSecret(input: {
    readonly workspaceId: string;
    readonly softwareId: string;
    readonly secretId: string;
  }): Promise<EncryptedSecretRecord> {
    const record = await this.#repository.readSecret(
      input.workspaceId,
      input.softwareId,
      input.secretId,
    );
    if (!record) throw new SecretUnavailableError();
    return record;
  }

  async #requireUsableSecret(input: {
    readonly workspaceId: string;
    readonly softwareId: string;
    readonly secretId: string;
  }): Promise<EncryptedSecretRecord> {
    const record = await this.#requireSecret(input);
    if (
      record.metadata.status !== "ACTIVE" ||
      (record.metadata.expiresAt &&
        timestampMillis(record.metadata.expiresAt) <=
          timestampMillis(canonicalTimestamp(this.#now())))
    ) {
      throw new SecretUnavailableError();
    }
    return record;
  }

  #decrypt(record: EncryptedSecretRecord): string {
    return this.#cipher.decrypt(record.envelope, secretAad(record.metadata));
  }

  #humanAudit(
    principal: WorkspacePrincipal,
    workspaceId: string,
    subjectId: string,
    action: string,
    details: Record<string, unknown>,
  ): AuditEvent {
    return auditEventSchema.parse({
      eventId: this.#idFactory(),
      eventType: "AUDIT_RECORDED",
      workspaceId,
      subjectType: "secret_control",
      subjectId,
      action,
      actor: humanActor(principal),
      occurredAt: canonicalTimestamp(this.#now()),
      details,
    });
  }

  #automationAudit(
    workspaceId: string,
    subjectId: string,
    action: string,
    details: Record<string, unknown>,
  ): AuditEvent {
    return auditEventSchema.parse({
      eventId: this.#idFactory(),
      eventType: "AUDIT_RECORDED",
      workspaceId,
      subjectType: "secret_control",
      subjectId,
      action,
      actor: automationActor(),
      occurredAt: canonicalTimestamp(this.#now()),
      details,
    });
  }
}

function toTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function jsonValue<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

interface SecretRecordRow {
  readonly workspace_id: string;
  readonly id: string;
  readonly software_id: string;
  readonly label: string;
  readonly kind: SecretKind;
  readonly status: SecretStatus;
  readonly key_version: string;
  readonly encrypted_value: unknown;
  readonly created_at: string | Date;
  readonly created_by: unknown;
  readonly expires_at: string | Date | null;
  readonly revoked_at: string | Date | null;
  readonly revoked_by: unknown;
  readonly revocation_reason: string | null;
}

interface SecretLeaseRow {
  readonly workspace_id: string;
  readonly id: string;
  readonly software_id: string;
  readonly secret_id: string;
  readonly purpose: string;
  readonly token_hash: string;
  readonly browser_context_hash: string;
  readonly status: HarnessSecretLease["status"];
  readonly issued_at: string | Date;
  readonly expires_at: string | Date;
  readonly issued_by: unknown;
  readonly consumed_at: string | Date | null;
}

function secretRecordFromRow(row: SecretRecordRow): EncryptedSecretRecord {
  return encryptedSecretRecordSchema.parse({
    metadata: {
      id: row.id,
      workspaceId: row.workspace_id,
      softwareId: row.software_id,
      label: row.label,
      kind: row.kind,
      status: row.status,
      keyVersion: row.key_version,
      createdAt: toTimestamp(row.created_at),
      createdBy: jsonValue(row.created_by),
      ...(row.expires_at ? { expiresAt: toTimestamp(row.expires_at) } : {}),
      ...(row.revoked_at ? { revokedAt: toTimestamp(row.revoked_at) } : {}),
      ...(row.revoked_by ? { revokedBy: jsonValue(row.revoked_by) } : {}),
      ...(row.revocation_reason
        ? { revocationReason: row.revocation_reason }
        : {}),
    },
    envelope: jsonValue(row.encrypted_value),
  });
}

function secretLeaseFromRow(row: SecretLeaseRow): StoredHarnessLease {
  return storedHarnessLeaseSchema.parse({
    lease: {
      id: row.id,
      workspaceId: row.workspace_id,
      softwareId: row.software_id,
      secretId: row.secret_id,
      purpose: row.purpose,
      issuedAt: toTimestamp(row.issued_at),
      expiresAt: toTimestamp(row.expires_at),
      status: row.status,
      ...(row.consumed_at ? { consumedAt: toTimestamp(row.consumed_at) } : {}),
    },
    tokenHash: row.token_hash,
    browserContextHash: row.browser_context_hash,
    issuedBy: jsonValue(row.issued_by),
  });
}

const secretRecordColumns =
  "workspace_id, id, software_id, label, kind, status, key_version, encrypted_value, created_at, created_by, expires_at, revoked_at, revoked_by, revocation_reason";
const secretLeaseColumns =
  "workspace_id, id, software_id, secret_id, purpose, token_hash, browser_context_hash, status, issued_at, expires_at, issued_by, consumed_at";

export class PostgresSecretIsolationRepository
  implements SecretIsolationRepository
{
  readonly #database: MigrationDatabase;

  constructor(database: MigrationDatabase) {
    this.#database = database;
  }

  async createSecretWithAudit(
    recordCandidate: EncryptedSecretRecord,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const record = encryptedSecretRecordSchema.parse(recordCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    await this.#database.exec("BEGIN");
    try {
      await this.#database.query(
        "INSERT INTO secret_records (workspace_id, id, software_id, label, kind, status, key_version, encrypted_value, created_at, created_by, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        [
          record.metadata.workspaceId,
          record.metadata.id,
          record.metadata.softwareId,
          record.metadata.label,
          record.metadata.kind,
          record.metadata.status,
          record.metadata.keyVersion,
          record.envelope,
          record.metadata.createdAt,
          record.metadata.createdBy,
          record.metadata.expiresAt ?? null,
        ],
      );
      await this.#insertAudit(audit);
      await this.#database.exec("COMMIT");
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async readSecret(
    workspaceId: string,
    softwareId: string,
    secretId: string,
  ): Promise<EncryptedSecretRecord | undefined> {
    const result = await this.#database.query<SecretRecordRow>(
      `SELECT ${secretRecordColumns} FROM secret_records WHERE workspace_id = $1 AND software_id = $2 AND id = $3`,
      [uuid.parse(workspaceId), uuid.parse(softwareId), uuid.parse(secretId)],
    );
    const row = result.rows[0];
    return row ? secretRecordFromRow(row) : undefined;
  }

  async listSecretRecords(
    workspaceId: string,
    softwareId?: string,
  ): Promise<readonly EncryptedSecretRecord[]> {
    const result = softwareId
      ? await this.#database.query<SecretRecordRow>(
          `SELECT ${secretRecordColumns} FROM secret_records WHERE workspace_id = $1 AND software_id = $2 ORDER BY created_at, id`,
          [uuid.parse(workspaceId), uuid.parse(softwareId)],
        )
      : await this.#database.query<SecretRecordRow>(
          `SELECT ${secretRecordColumns} FROM secret_records WHERE workspace_id = $1 ORDER BY created_at, id`,
          [uuid.parse(workspaceId)],
        );
    return immutableClone(result.rows.map(secretRecordFromRow));
  }

  async revokeSecretWithAudit(
    recordCandidate: EncryptedSecretRecord,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const record = encryptedSecretRecordSchema.parse(recordCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    await this.#database.exec("BEGIN");
    try {
      const updated = await this.#database.query<{ readonly id: string }>(
        "UPDATE secret_records SET status = $4, revoked_at = $5, revoked_by = $6, revocation_reason = $7 WHERE workspace_id = $1 AND software_id = $2 AND id = $3 AND status = 'ACTIVE' RETURNING id",
        [
          record.metadata.workspaceId,
          record.metadata.softwareId,
          record.metadata.id,
          record.metadata.status,
          record.metadata.revokedAt ?? null,
          record.metadata.revokedBy ?? null,
          record.metadata.revocationReason ?? null,
        ],
      );
      if (!updated.rows[0]) throw new SecretUnavailableError();
      await this.#insertAudit(audit);
      await this.#database.exec("COMMIT");
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async createLeaseWithAudit(
    leaseCandidate: StoredHarnessLease,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const stored = storedHarnessLeaseSchema.parse(leaseCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    await this.#database.exec("BEGIN");
    try {
      await this.#database.query(
        "INSERT INTO secret_access_leases (workspace_id, id, software_id, secret_id, purpose, token_hash, browser_context_hash, status, issued_at, expires_at, issued_by, consumed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        [
          stored.lease.workspaceId,
          stored.lease.id,
          stored.lease.softwareId,
          stored.lease.secretId,
          stored.lease.purpose,
          stored.tokenHash,
          stored.browserContextHash,
          stored.lease.status,
          stored.lease.issuedAt,
          stored.lease.expiresAt,
          stored.issuedBy,
          stored.lease.consumedAt ?? null,
        ],
      );
      await this.#insertAudit(audit);
      await this.#database.exec("COMMIT");
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async readLease(leaseId: string): Promise<StoredHarnessLease | undefined> {
    const result = await this.#database.query<SecretLeaseRow>(
      `SELECT ${secretLeaseColumns} FROM secret_access_leases WHERE id = $1`,
      [uuid.parse(leaseId)],
    );
    const row = result.rows[0];
    return row ? secretLeaseFromRow(row) : undefined;
  }

  async consumeLeaseWithAudit(
    leaseCandidate: StoredHarnessLease,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const stored = storedHarnessLeaseSchema.parse(leaseCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    await this.#database.exec("BEGIN");
    try {
      const updated = await this.#database.query<{ readonly id: string }>(
        "UPDATE secret_access_leases SET status = 'CONSUMED', consumed_at = $3 WHERE workspace_id = $1 AND id = $2 AND status = 'AVAILABLE' RETURNING id",
        [
          stored.lease.workspaceId,
          stored.lease.id,
          stored.lease.consumedAt ?? null,
        ],
      );
      if (!updated.rows[0]) throw new SecretLeaseUnavailableError();
      await this.#insertAudit(audit);
      await this.#database.exec("COMMIT");
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  appendAuditEvent(auditCandidate: AuditEvent): Promise<void> {
    return this.#insertAudit(auditEventSchema.parse(auditCandidate));
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
}
