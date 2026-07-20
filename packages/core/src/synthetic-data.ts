import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  auditEventSchema,
  canarySchema,
  humanActorSchema,
  personaSchema,
  type AuditEvent,
  type Canary,
  type HumanActor,
  type Persona,
} from "./domain.js";
import {
  workspacePrincipalSchema,
  type WorkspaceAuthorizationService,
  type WorkspacePrincipal,
} from "./authorization.js";
import type { MigrationDatabase } from "./migrations.js";

export const LIKELY_REAL_DATA_SCANNER_VERSION = "likely-real-v1" as const;
export const FICTIONAL_CONFIRMATION_STATEMENT_VERSION =
  "fictional-only-v1" as const;

const uuid = z.string().uuid();
const fieldKey = z.string().trim().regex(/^[a-z][A-Za-z0-9]{0,63}$/u);
const fieldValue = z.string().trim().min(1).max(240);
const token = z.string().regex(/^[a-f0-9]{32}$/u);

export const syntheticPersonaDraftSchema = z
  .object({
    role: z.enum(["TEACHER", "STUDENT"]),
    displayName: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(200),
    fields: z
      .record(fieldKey, fieldValue)
      .refine((value) => Object.keys(value).length <= 12, {
        message: "Synthetic personas support at most twelve custom fields",
      }),
  })
  .strict();
export type SyntheticPersonaDraft = z.infer<typeof syntheticPersonaDraftSchema>;

export const personaScanFindingSchema = z
  .object({
    code: z.enum([
      "NOT_MARKED_FICTIONAL",
      "ROUTABLE_EMAIL_DOMAIN",
      "POSSIBLE_STUDENT_IDENTIFIER",
      "POSSIBLE_PHONE_NUMBER",
      "POSSIBLE_GOVERNMENT_IDENTIFIER",
    ]),
    field: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();
export type PersonaScanFinding = z.infer<typeof personaScanFindingSchema>;

export const personaScanResultSchema = z
  .object({
    scannerVersion: z.literal(LIKELY_REAL_DATA_SCANNER_VERSION),
    outcome: z.enum(["CLEAR", "BLOCKED"]),
    findings: z.array(personaScanFindingSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.outcome === "CLEAR" && value.findings.length > 0) ||
      (value.outcome === "BLOCKED" && value.findings.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["outcome"],
        message: "Scan outcome must agree with its findings",
      });
    }
  });
export type PersonaScanResult = z.infer<typeof personaScanResultSchema>;

export function isReservedNonDeliverableEmail(value: string): boolean {
  const at = value.lastIndexOf("@");
  if (at <= 0) return false;
  const domain = value.slice(at + 1).toLowerCase();
  return domain === "invalid" || domain.endsWith(".invalid");
}

function addFinding(
  findings: PersonaScanFinding[],
  candidate: PersonaScanFinding,
): void {
  if (
    findings.some(
      (finding) =>
        finding.code === candidate.code && finding.field === candidate.field,
    )
  ) {
    return;
  }
  findings.push(personaScanFindingSchema.parse(candidate));
}

export function scanSyntheticPersona(candidate: unknown): PersonaScanResult {
  const draft = syntheticPersonaDraftSchema.parse(candidate);
  const findings: PersonaScanFinding[] = [];
  if (!/fictional/iu.test(draft.displayName)) {
    addFinding(findings, {
      code: "NOT_MARKED_FICTIONAL",
      field: "displayName",
      message: "Mark the display name as fictional before saving.",
    });
  }
  if (!isReservedNonDeliverableEmail(draft.email)) {
    addFinding(findings, {
      code: "ROUTABLE_EMAIL_DOMAIN",
      field: "email",
      message: "Use a reserved .invalid email address.",
    });
  }

  for (const [name, value] of Object.entries(draft.fields)) {
    const path = `fields.${name}`;
    const emailLike = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu)?.[0];
    if (emailLike && !isReservedNonDeliverableEmail(emailLike)) {
      addFinding(findings, {
        code: "ROUTABLE_EMAIL_DOMAIN",
        field: path,
        message: "Use a reserved .invalid address in fictional fields.",
      });
    }
    if (
      /(?:student|learner|sis|district|local).*(?:id|identifier)|^(?:id|identifier)$/iu.test(
        name,
      ) && /^\d{6,16}$/u.test(value)
    ) {
      addFinding(findings, {
        code: "POSSIBLE_STUDENT_IDENTIFIER",
        field: path,
        message: "Replace the numeric identifier with an obvious fictional token.",
      });
    }
    if (/\b\d{3}-\d{2}-\d{4}\b/u.test(value)) {
      addFinding(findings, {
        code: "POSSIBLE_GOVERNMENT_IDENTIFIER",
        field: path,
        message: "Government-identifier patterns are not allowed.",
      });
    }
    if (
      /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/u.test(
        value,
      )
    ) {
      addFinding(findings, {
        code: "POSSIBLE_PHONE_NUMBER",
        field: path,
        message: "Phone-number patterns are not allowed.",
      });
    }
  }

  return personaScanResultSchema.parse({
    scannerVersion: LIKELY_REAL_DATA_SCANNER_VERSION,
    outcome: findings.length === 0 ? "CLEAR" : "BLOCKED",
    findings,
  });
}

function personaDraftFrom(input: SyntheticPersonaDraft): SyntheticPersonaDraft {
  return {
    role: input.role,
    displayName: input.displayName,
    email: input.email,
    fields: input.fields,
  };
}

export function generateCanaryValue(
  sourceField: string,
  tokenCandidate: string,
): string {
  const parsedToken = token.parse(tokenCandidate);
  return sourceField === "email"
    ? `pw-${parsedToken}@canary.pactwire.invalid`
    : `PACTWIRE-FICTIONAL-${parsedToken.toUpperCase()}`;
}

export class LikelyRealDataError extends Error {
  readonly code = "LIKELY_REAL_DATA";
  readonly status = 422;
  readonly publicMessage =
    "Likely real student data was blocked. Replace it with obviously fictional values.";
  readonly auditRecorded = true;
  readonly findings: readonly PersonaScanFinding[];

  constructor(findings: readonly PersonaScanFinding[]) {
    super("Likely real student data was blocked before persistence");
    this.name = "LikelyRealDataError";
    this.findings = immutableClone(findings);
  }
}

export class PersonaUnavailableError extends Error {
  readonly code = "PERSONA_UNAVAILABLE";
  readonly status = 404;
  readonly publicMessage = "Fictional persona not found or not available.";

  constructor() {
    super("The requested persona is unavailable in this workspace");
    this.name = "PersonaUnavailableError";
  }
}

export class CanarySourceUnavailableError extends Error {
  readonly code = "CANARY_SOURCE_UNAVAILABLE";
  readonly status = 422;
  readonly publicMessage =
    "A selected field is not configured on its fictional persona.";

  constructor() {
    super("A selected canary source field is unavailable");
    this.name = "CanarySourceUnavailableError";
  }
}

export class CanaryGenerationExhaustedError extends Error {
  readonly code = "CANARY_GENERATION_EXHAUSTED";
  readonly status = 409;
  readonly publicMessage = "Pactwire could not allocate a unique canary value.";

  constructor() {
    super("Unique canary generation exhausted its bounded retries");
    this.name = "CanaryGenerationExhaustedError";
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

function canonicalTimestamp(value: string): string {
  return new Date(value).toISOString();
}

function humanActor(principal: WorkspacePrincipal): HumanActor {
  return humanActorSchema.parse({ kind: "HUMAN", actorId: principal.userId });
}

export interface SyntheticDataRepository {
  createPersonaWithAudit(persona: Persona, audit: AuditEvent): Promise<void>;
  readPersona(workspaceId: string, personaId: string): Promise<Persona | undefined>;
  listPersonas(workspaceId: string): Promise<readonly Persona[]>;
  appendAuditEvent(audit: AuditEvent): Promise<void>;
  canaryValueExists(value: string): Promise<boolean>;
  createCanariesWithAudit(
    canaries: readonly Canary[],
    audit: AuditEvent,
  ): Promise<void>;
  listRunCanaries(workspaceId: string, runId: string): Promise<readonly Canary[]>;
}

export class InMemorySyntheticDataRepository
  implements SyntheticDataRepository
{
  readonly #workspaceRepository: {
    readWorkspace(workspaceId: string): Promise<unknown>;
    appendAuditEvent(audit: AuditEvent): Promise<void>;
  };
  readonly #personas: Persona[] = [];
  readonly #canaries: Canary[] = [];

  constructor(workspaceRepository: {
    readWorkspace(workspaceId: string): Promise<unknown>;
    appendAuditEvent(audit: AuditEvent): Promise<void>;
  }) {
    this.#workspaceRepository = workspaceRepository;
  }

  async createPersonaWithAudit(
    personaCandidate: Persona,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const persona = personaSchema.parse(personaCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    if (!(await this.#workspaceRepository.readWorkspace(persona.workspaceId))) {
      throw new Error("Persona workspace does not exist");
    }
    if (
      audit.workspaceId !== persona.workspaceId ||
      this.#personas.some(
        (existing) =>
          existing.workspaceId === persona.workspaceId &&
          (existing.id === persona.id || existing.email === persona.email),
      )
    ) {
      throw new Error("Persona is invalid or already exists");
    }
    this.#personas.push(immutableClone(persona));
    await this.#workspaceRepository.appendAuditEvent(audit);
  }

  readPersona(
    workspaceIdCandidate: string,
    personaIdCandidate: string,
  ): Promise<Persona | undefined> {
    const workspaceId = uuid.parse(workspaceIdCandidate);
    const personaId = uuid.parse(personaIdCandidate);
    const found = this.#personas.find(
      (persona) => persona.workspaceId === workspaceId && persona.id === personaId,
    );
    return Promise.resolve(found ? immutableClone(found) : undefined);
  }

  listPersonas(workspaceIdCandidate: string): Promise<readonly Persona[]> {
    const workspaceId = uuid.parse(workspaceIdCandidate);
    return Promise.resolve(
      immutableClone(
        this.#personas.filter((persona) => persona.workspaceId === workspaceId),
      ),
    );
  }

  appendAuditEvent(auditCandidate: AuditEvent): Promise<void> {
    return this.#workspaceRepository.appendAuditEvent(
      auditEventSchema.parse(auditCandidate),
    );
  }

  canaryValueExists(value: string): Promise<boolean> {
    return Promise.resolve(
      this.#canaries.some((canary) => canary.value === fieldValue.parse(value)),
    );
  }

  async createCanariesWithAudit(
    canaryCandidates: readonly Canary[],
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const canaries = canaryCandidates.map((canary) => canarySchema.parse(canary));
    const audit = auditEventSchema.parse(auditCandidate);
    if (canaries.length === 0) throw new Error("Canary batch cannot be empty");
    const [first] = canaries;
    if (
      !first ||
      audit.workspaceId !== first.workspaceId ||
      canaries.some(
        (canary) =>
          canary.workspaceId !== first.workspaceId || canary.runId !== first.runId,
      )
    ) {
      throw new Error("Canary batch must share one run and workspace");
    }
    for (const canary of canaries) {
      if (!(await this.readPersona(canary.workspaceId, canary.personaId))) {
        throw new Error("Canary source persona does not exist");
      }
      if (
        this.#canaries.some(
          (existing) =>
            existing.id === canary.id ||
            existing.value === canary.value ||
            (existing.workspaceId === canary.workspaceId &&
              existing.runId === canary.runId &&
              existing.personaId === canary.personaId &&
              existing.sourceField === canary.sourceField),
        )
      ) {
        throw new Error("Canary value or source mapping already exists");
      }
    }
    if (new Set(canaries.map((canary) => canary.value)).size !== canaries.length) {
      throw new Error("Canary batch values must be unique");
    }
    this.#canaries.push(...canaries.map((canary) => immutableClone(canary)));
    await this.#workspaceRepository.appendAuditEvent(audit);
  }

  listRunCanaries(
    workspaceIdCandidate: string,
    runIdCandidate: string,
  ): Promise<readonly Canary[]> {
    const workspaceId = uuid.parse(workspaceIdCandidate);
    const runId = uuid.parse(runIdCandidate);
    return Promise.resolve(
      immutableClone(
        this.#canaries.filter(
          (canary) =>
            canary.workspaceId === workspaceId && canary.runId === runId,
        ),
      ),
    );
  }
}

interface PersonaRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly role: "TEACHER" | "STUDENT";
  readonly fictional: boolean;
  readonly display_name: string;
  readonly email: string;
  readonly fields: unknown;
  readonly fictional_confirmation: unknown;
  readonly scan_result: unknown;
  readonly created_at: string | Date;
  readonly created_by: unknown;
}

interface CanaryRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly run_id: string;
  readonly persona_id: string;
  readonly source_field: string;
  readonly value: string;
  readonly generated_at: string | Date;
}

function jsonValue<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function personaFromRow(row: PersonaRow): Persona {
  return personaSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    role: row.role,
    fictional: row.fictional,
    displayName: row.display_name,
    email: row.email,
    fields: jsonValue(row.fields),
    fictionalConfirmation: jsonValue(row.fictional_confirmation),
    scanResult: jsonValue(row.scan_result),
    createdAt: canonicalTimestamp(String(row.created_at)),
    createdBy: jsonValue(row.created_by),
  });
}

function canaryFromRow(row: CanaryRow): Canary {
  return canarySchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    runId: row.run_id,
    personaId: row.persona_id,
    sourceField: row.source_field,
    value: row.value,
    generatedAt: canonicalTimestamp(String(row.generated_at)),
  });
}

export class PostgresSyntheticDataRepository
  implements SyntheticDataRepository
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

  async createPersonaWithAudit(
    personaCandidate: Persona,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const persona = personaSchema.parse(personaCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    await this.#database.exec("BEGIN");
    try {
      await this.#database.query(
        "INSERT INTO personas (workspace_id, id, role, fictional, display_name, email, fields, fictional_confirmation, scan_result, created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        [
          persona.workspaceId,
          persona.id,
          persona.role,
          persona.fictional,
          persona.displayName,
          persona.email,
          persona.fields,
          persona.fictionalConfirmation,
          persona.scanResult,
          persona.createdAt,
          persona.createdBy,
        ],
      );
      await this.#insertAudit(audit);
      await this.#database.exec("COMMIT");
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async readPersona(
    workspaceIdCandidate: string,
    personaIdCandidate: string,
  ): Promise<Persona | undefined> {
    const result = await this.#database.query<PersonaRow>(
      "SELECT workspace_id, id, role, fictional, display_name, email, fields, fictional_confirmation, scan_result, created_at, created_by FROM personas WHERE workspace_id = $1 AND id = $2",
      [uuid.parse(workspaceIdCandidate), uuid.parse(personaIdCandidate)],
    );
    return result.rows[0] ? personaFromRow(result.rows[0]) : undefined;
  }

  async listPersonas(workspaceIdCandidate: string): Promise<readonly Persona[]> {
    const result = await this.#database.query<PersonaRow>(
      "SELECT workspace_id, id, role, fictional, display_name, email, fields, fictional_confirmation, scan_result, created_at, created_by FROM personas WHERE workspace_id = $1 ORDER BY created_at, id",
      [uuid.parse(workspaceIdCandidate)],
    );
    return immutableClone(result.rows.map(personaFromRow));
  }

  async appendAuditEvent(auditCandidate: AuditEvent): Promise<void> {
    await this.#insertAudit(auditEventSchema.parse(auditCandidate));
  }

  async canaryValueExists(value: string): Promise<boolean> {
    const result = await this.#database.query<{ readonly present: number }>(
      "SELECT 1 AS present FROM canaries WHERE value = $1 LIMIT 1",
      [fieldValue.parse(value)],
    );
    return result.rows.length > 0;
  }

  async createCanariesWithAudit(
    canaryCandidates: readonly Canary[],
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const canaries = canaryCandidates.map((canary) => canarySchema.parse(canary));
    const audit = auditEventSchema.parse(auditCandidate);
    if (canaries.length === 0) throw new Error("Canary batch cannot be empty");
    await this.#database.exec("BEGIN");
    try {
      for (const canary of canaries) {
        await this.#database.query(
          "INSERT INTO canaries (workspace_id, id, run_id, persona_id, source_field, value, generated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
          [
            canary.workspaceId,
            canary.id,
            canary.runId,
            canary.personaId,
            canary.sourceField,
            canary.value,
            canary.generatedAt,
          ],
        );
      }
      await this.#insertAudit(audit);
      await this.#database.exec("COMMIT");
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async listRunCanaries(
    workspaceIdCandidate: string,
    runIdCandidate: string,
  ): Promise<readonly Canary[]> {
    const result = await this.#database.query<CanaryRow>(
      "SELECT workspace_id, id, run_id, persona_id, source_field, value, generated_at FROM canaries WHERE workspace_id = $1 AND run_id = $2 ORDER BY generated_at, id",
      [uuid.parse(workspaceIdCandidate), uuid.parse(runIdCandidate)],
    );
    return immutableClone(result.rows.map(canaryFromRow));
  }
}

interface SyntheticDataServiceOptions {
  readonly idFactory?: () => string;
  readonly now?: () => string;
  readonly tokenFactory?: () => string;
}

const scopedRequestSchema = z
  .object({
    principal: workspacePrincipalSchema,
    workspaceId: uuid,
  })
  .strict();

const scanRequestSchema = scopedRequestSchema
  .extend(syntheticPersonaDraftSchema.shape)
  .strict();

const createPersonaRequestSchema = scanRequestSchema
  .extend({ confirmedFictional: z.literal(true) })
  .strict();

const canarySelectionSchema = z
  .object({
    personaId: uuid,
    sourceFields: z.array(fieldKey).min(1).max(14),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.sourceFields).size !== value.sourceFields.length) {
      context.addIssue({
        code: "custom",
        path: ["sourceFields"],
        message: "Selected source fields must be unique",
      });
    }
  });

const generateCanariesRequestSchema = scopedRequestSchema
  .extend({
    runId: uuid,
    selections: z.array(canarySelectionSchema).min(1).max(24),
  })
  .strict()
  .superRefine((value, context) => {
    const personaIds = value.selections.map((selection) => selection.personaId);
    if (new Set(personaIds).size !== personaIds.length) {
      context.addIssue({
        code: "custom",
        path: ["selections"],
        message: "Each persona may appear in one selection only",
      });
    }
  });

const listRunCanariesRequestSchema = scopedRequestSchema
  .extend({ runId: uuid })
  .strict();

function scopeFromCandidate(candidate: unknown): z.infer<typeof scopedRequestSchema> {
  const record =
    typeof candidate === "object" && candidate !== null
      ? (candidate as Readonly<Record<string, unknown>>)
      : {};
  return scopedRequestSchema.parse({
    principal: record["principal"],
    workspaceId: record["workspaceId"],
  });
}

export class SyntheticDataService {
  readonly #repository: SyntheticDataRepository;
  readonly #authorization: Pick<WorkspaceAuthorizationService, "checkPermission">;
  readonly #idFactory: () => string;
  readonly #now: () => string;
  readonly #tokenFactory: () => string;

  constructor(
    repository: SyntheticDataRepository,
    authorization: Pick<WorkspaceAuthorizationService, "checkPermission">,
    options: SyntheticDataServiceOptions = {},
  ) {
    this.#repository = repository;
    this.#authorization = authorization;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#tokenFactory =
      options.tokenFactory ?? (() => randomBytes(16).toString("hex"));
  }

  #audit(
    principal: WorkspacePrincipal,
    workspaceId: string,
    action: string,
    subjectType: string,
    subjectId: string,
    details: Readonly<Record<string, unknown>>,
  ): AuditEvent {
    return auditEventSchema.parse({
      eventId: this.#idFactory(),
      eventType: "AUDIT_RECORDED",
      workspaceId,
      subjectType,
      subjectId,
      action,
      actor: humanActor(principal),
      occurredAt: canonicalTimestamp(this.#now()),
      details,
    });
  }

  async scanPersona(candidate: unknown): Promise<PersonaScanResult> {
    const scope = scopeFromCandidate(candidate);
    await this.#authorization.checkPermission({
      principal: scope.principal,
      workspaceId: scope.workspaceId,
      permission: "PERSONA_MANAGE",
    });
    const input = scanRequestSchema.parse(candidate);
    const scan = scanSyntheticPersona(personaDraftFrom(input));
    if (scan.outcome === "BLOCKED") {
      await this.#repository.appendAuditEvent(
        this.#audit(
          input.principal,
          input.workspaceId,
          "persona.likely_real_data_blocked",
          "persona_scan",
          this.#idFactory(),
          {
            scannerVersion: scan.scannerVersion,
            findingCodes: scan.findings.map((finding) => finding.code),
            findingFields: scan.findings.map((finding) => finding.field),
          },
        ),
      );
    }
    return immutableClone(scan);
  }

  async createPersona(candidate: unknown): Promise<Persona> {
    const scope = scopeFromCandidate(candidate);
    await this.#authorization.checkPermission({
      principal: scope.principal,
      workspaceId: scope.workspaceId,
      permission: "PERSONA_MANAGE",
    });
    const input = createPersonaRequestSchema.parse(candidate);
    const scan = scanSyntheticPersona(personaDraftFrom(input));
    if (scan.outcome === "BLOCKED") {
      await this.#repository.appendAuditEvent(
        this.#audit(
          input.principal,
          input.workspaceId,
          "persona.likely_real_data_blocked",
          "persona_scan",
          this.#idFactory(),
          {
            scannerVersion: scan.scannerVersion,
            findingCodes: scan.findings.map((finding) => finding.code),
            findingFields: scan.findings.map((finding) => finding.field),
          },
        ),
      );
      throw new LikelyRealDataError(scan.findings);
    }
    const createdAt = canonicalTimestamp(this.#now());
    const persona = personaSchema.parse({
      id: this.#idFactory(),
      workspaceId: input.workspaceId,
      role: input.role,
      fictional: true,
      displayName: input.displayName,
      email: input.email,
      fields: input.fields,
      fictionalConfirmation: {
        statementVersion: FICTIONAL_CONFIRMATION_STATEMENT_VERSION,
        confirmedAt: createdAt,
        confirmedBy: humanActor(input.principal),
      },
      scanResult: scan,
      createdAt,
      createdBy: humanActor(input.principal),
    });
    await this.#repository.createPersonaWithAudit(
      persona,
      this.#audit(
        input.principal,
        input.workspaceId,
        "persona.created",
        "persona",
        persona.id,
        {
          role: persona.role,
          scannerVersion: scan.scannerVersion,
          confirmationStatementVersion:
            FICTIONAL_CONFIRMATION_STATEMENT_VERSION,
          fieldNames: ["displayName", "email", ...Object.keys(persona.fields)],
        },
      ),
    );
    return immutableClone(persona);
  }

  async listPersonas(candidate: unknown): Promise<readonly Persona[]> {
    const input = scopedRequestSchema.parse(candidate);
    await this.#authorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "PERSONA_READ",
    });
    return immutableClone(await this.#repository.listPersonas(input.workspaceId));
  }

  async #uniqueCanaryValue(
    sourceField: string,
    pendingValues: Set<string>,
  ): Promise<string> {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const value = generateCanaryValue(sourceField, this.#tokenFactory());
      if (
        !pendingValues.has(value) &&
        !(await this.#repository.canaryValueExists(value))
      ) {
        pendingValues.add(value);
        return value;
      }
    }
    throw new CanaryGenerationExhaustedError();
  }

  async generateRunCanaries(candidate: unknown): Promise<readonly Canary[]> {
    const scope = scopeFromCandidate(candidate);
    await this.#authorization.checkPermission({
      principal: scope.principal,
      workspaceId: scope.workspaceId,
      permission: "CANARY_GENERATE",
    });
    const input = generateCanariesRequestSchema.parse(candidate);
    const existing = await this.#repository.listRunCanaries(
      input.workspaceId,
      input.runId,
    );
    const bySource = new Map(
      existing.map((canary) => [
        `${canary.personaId}\u0000${canary.sourceField}`,
        canary,
      ]),
    );
    const pendingValues = new Set(existing.map((canary) => canary.value));
    const created: Canary[] = [];
    const requested: Canary[] = [];
    for (const selection of input.selections) {
      const persona = await this.#repository.readPersona(
        input.workspaceId,
        selection.personaId,
      );
      if (!persona) throw new PersonaUnavailableError();
      const availableFields = new Set([
        "displayName",
        "email",
        ...Object.keys(persona.fields),
      ]);
      for (const sourceField of selection.sourceFields) {
        if (!availableFields.has(sourceField)) {
          throw new CanarySourceUnavailableError();
        }
        const key = `${persona.id}\u0000${sourceField}`;
        const prior = bySource.get(key);
        if (prior) {
          requested.push(prior);
          continue;
        }
        const canary = canarySchema.parse({
          id: this.#idFactory(),
          workspaceId: input.workspaceId,
          runId: input.runId,
          personaId: persona.id,
          sourceField,
          value: await this.#uniqueCanaryValue(sourceField, pendingValues),
          generatedAt: canonicalTimestamp(this.#now()),
        });
        bySource.set(key, canary);
        created.push(canary);
        requested.push(canary);
      }
    }
    if (created.length > 0) {
      await this.#repository.createCanariesWithAudit(
        created,
        this.#audit(
          input.principal,
          input.workspaceId,
          "canaries.generated",
          "run",
          input.runId,
          {
            count: created.length,
            sources: created.map((canary) => ({
              personaId: canary.personaId,
              sourceField: canary.sourceField,
            })),
          },
        ),
      );
    }
    return immutableClone(requested);
  }

  async listRunCanaries(candidate: unknown): Promise<readonly Canary[]> {
    const scope = scopeFromCandidate(candidate);
    await this.#authorization.checkPermission({
      principal: scope.principal,
      workspaceId: scope.workspaceId,
      permission: "CANARY_READ",
    });
    const input = listRunCanariesRequestSchema.parse(candidate);
    return immutableClone(
      await this.#repository.listRunCanaries(input.workspaceId, input.runId),
    );
  }
}
