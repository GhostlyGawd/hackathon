import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  auditEventSchema,
  authorizationActionSchema,
  authorizationSchema,
  humanActorSchema,
  type AuditEvent,
  type AuthorizationAction,
  type SoftwareRecord,
} from "./domain.js";
import {
  WorkspaceUnavailableError,
  workspacePrincipalSchema,
  type WorkspaceAuthorizationRepository,
  type WorkspaceAuthorizationService,
  type WorkspacePrincipal,
} from "./authorization.js";
import type { SoftwareInventoryRepository } from "./inventory.js";
import type { MigrationDatabase } from "./migrations.js";

export { authorizationActionSchema } from "./domain.js";
export type { AuthorizationAction } from "./domain.js";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const nonEmpty = z.string().trim().min(1);
const exactDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u,
    "Authorization domains must be exact hostnames without wildcards",
  );

export const authorizationAttemptSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("RUN_QUEUE") }).strict(),
  z
    .object({
      kind: z.enum(["NAVIGATION", "REDIRECT", "POPUP"]),
      targetUrl: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("ACTION"),
      action: authorizationActionSchema,
      targetUrl: z.string().trim().min(1).optional(),
    })
    .strict(),
]);
export type AuthorizationAttempt = z.infer<typeof authorizationAttemptSchema>;

export const authorizationPolicyReasonSchema = z.enum([
  "POLICY_ALLOWED",
  "AUTHORIZATION_NOT_YET_VALID",
  "AUTHORIZATION_REVIEW_DUE",
  "AUTHORIZATION_EXPIRED",
  "AUTHORIZATION_REVOKED",
  "INVALID_TARGET",
  "TARGET_NOT_HTTPS",
  "DOMAIN_NOT_ALLOWED",
  "BASE_PATH_NOT_ALLOWED",
  "ACTION_NOT_ALLOWED",
  "ACTION_PROHIBITED",
  "POPUP_BLOCKED",
]);
export type AuthorizationPolicyReason = z.infer<
  typeof authorizationPolicyReasonSchema
>;

export const authorizationPolicyDecisionSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    softwareId: uuid,
    authorizationId: uuid,
    outcome: z.enum(["ALLOW", "DENY"]),
    allowed: z.boolean(),
    reason: authorizationPolicyReasonSchema,
    message: nonEmpty,
    attemptKind: z.enum([
      "RUN_QUEUE",
      "NAVIGATION",
      "REDIRECT",
      "POPUP",
      "ACTION",
    ]),
    targetDomain: exactDomainSchema.optional(),
    action: authorizationActionSchema.optional(),
    actor: z.union([
      humanActorSchema,
      z
        .object({
          kind: z.literal("AUTOMATION"),
          actorId: nonEmpty,
          component: nonEmpty,
        })
        .strict(),
    ]),
    recordedAt: timestamp,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.allowed !== (value.outcome === "ALLOW")) {
      context.addIssue({
        code: "custom",
        message: "Policy outcome and allowed flag must agree",
      });
    }
    if (value.allowed !== (value.reason === "POLICY_ALLOWED")) {
      context.addIssue({
        code: "custom",
        message: "Only POLICY_ALLOWED can produce an allowed decision",
      });
    }
  });
export type AuthorizationPolicyDecision = z.infer<
  typeof authorizationPolicyDecisionSchema
>;

export type TestAuthorization = z.infer<typeof authorizationSchema>;
export type EffectiveAuthorizationStatus =
  | "ACTIVE"
  | "NOT_YET_VALID"
  | "REVIEW_DUE"
  | "EXPIRED"
  | "REVOKED";

export interface AuthorizationView extends TestAuthorization {
  readonly effectiveStatus: EffectiveAuthorizationStatus;
}

interface PolicyEvaluation {
  readonly allowed: boolean;
  readonly outcome: "ALLOW" | "DENY";
  readonly reason: AuthorizationPolicyReason;
  readonly message: string;
  readonly attemptKind: AuthorizationAttempt["kind"];
  readonly targetDomain?: string;
  readonly action?: AuthorizationAction;
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

export function effectiveAuthorizationStatus(
  authorizationCandidate: unknown,
  nowCandidate: string,
): EffectiveAuthorizationStatus {
  const authorization = authorizationSchema.parse(authorizationCandidate);
  const now = Date.parse(timestamp.parse(nowCandidate));
  if (authorization.status === "REVOKED") return "REVOKED";
  if (
    authorization.status === "EXPIRED" ||
    now >= Date.parse(authorization.expiresAt)
  ) {
    return "EXPIRED";
  }
  if (now < Date.parse(authorization.validFrom)) return "NOT_YET_VALID";
  if (now >= Date.parse(authorization.reviewAt)) return "REVIEW_DUE";
  return "ACTIVE";
}

function denied(
  reason: Exclude<AuthorizationPolicyReason, "POLICY_ALLOWED">,
  message: string,
  attempt: AuthorizationAttempt,
  details: { readonly targetDomain?: string; readonly action?: AuthorizationAction } = {},
): PolicyEvaluation {
  return immutableClone({
    allowed: false,
    outcome: "DENY",
    reason,
    message,
    attemptKind: attempt.kind,
    ...details,
  });
}

function allowed(
  attempt: AuthorizationAttempt,
  details: { readonly targetDomain?: string; readonly action?: AuthorizationAction } = {},
): PolicyEvaluation {
  return immutableClone({
    allowed: true,
    outcome: "ALLOW",
    reason: "POLICY_ALLOWED",
    message: "The attempt is inside this authorization.",
    attemptKind: attempt.kind,
    ...details,
  });
}

function inactiveDecision(
  status: Exclude<EffectiveAuthorizationStatus, "ACTIVE">,
  attempt: AuthorizationAttempt,
): PolicyEvaluation {
  if (status === "REVOKED") {
    return denied(
      "AUTHORIZATION_REVOKED",
      "Authorization revoked. Create a new authorization before queuing a run.",
      attempt,
    );
  }
  if (status === "EXPIRED") {
    return denied(
      "AUTHORIZATION_EXPIRED",
      "Authorization expired. Create a new authorization before queuing a run.",
      attempt,
    );
  }
  if (status === "REVIEW_DUE") {
    return denied(
      "AUTHORIZATION_REVIEW_DUE",
      "Authorization review is due. Review the scope before queuing a run.",
      attempt,
    );
  }
  return denied(
    "AUTHORIZATION_NOT_YET_VALID",
    "Authorization is not active yet.",
    attempt,
  );
}

function actionDecision(
  authorization: TestAuthorization,
  action: AuthorizationAction,
  attempt: AuthorizationAttempt,
  targetDomain?: string,
): PolicyEvaluation {
  const details = { action, ...(targetDomain ? { targetDomain } : {}) };
  if (authorization.prohibitedActions.includes(action)) {
    return denied(
      "ACTION_PROHIBITED",
      `${action} is prohibited by this authorization.`,
      attempt,
      details,
    );
  }
  if (!authorization.allowedActions.includes(action)) {
    return denied(
      "ACTION_NOT_ALLOWED",
      `${action} is not allowed by this authorization.`,
      attempt,
      details,
    );
  }
  return allowed(attempt, details);
}

function safeTarget(targetUrl: string):
  | { readonly ok: true; readonly url: URL; readonly domain: string }
  | { readonly ok: false; readonly reason: "INVALID_TARGET" | "TARGET_NOT_HTTPS" } {
  try {
    const url = new URL(targetUrl);
    if (url.username || url.password) return { ok: false, reason: "INVALID_TARGET" };
    if (url.protocol !== "https:") {
      return { ok: false, reason: "TARGET_NOT_HTTPS" };
    }
    return { ok: true, url, domain: url.hostname.toLowerCase() };
  } catch {
    return { ok: false, reason: "INVALID_TARGET" };
  }
}

function withinBasePath(base: URL, target: URL): boolean {
  if (base.origin !== target.origin) return false;
  const basePath = base.pathname.replace(/\/$/u, "") || "/";
  if (basePath === "/") return true;
  return target.pathname === basePath || target.pathname.startsWith(`${basePath}/`);
}

export function evaluateAuthorizationPolicy(
  authorizationCandidate: unknown,
  attemptCandidate: unknown,
  nowCandidate: string,
): PolicyEvaluation {
  const authorization = authorizationSchema.parse(authorizationCandidate);
  const attempt = authorizationAttemptSchema.parse(attemptCandidate);
  const status = effectiveAuthorizationStatus(authorization, nowCandidate);
  if (status !== "ACTIVE") return inactiveDecision(status, attempt);
  if (attempt.kind === "RUN_QUEUE") return allowed(attempt);

  if (attempt.kind === "ACTION" && !attempt.targetUrl) {
    return actionDecision(authorization, attempt.action, attempt);
  }

  const targetUrl = attempt.targetUrl;
  if (!targetUrl) {
    return denied("INVALID_TARGET", "The target URL is invalid.", attempt);
  }
  const target = safeTarget(targetUrl);
  if (!target.ok) {
    return target.reason === "TARGET_NOT_HTTPS"
      ? denied(
          "TARGET_NOT_HTTPS",
          "Navigation blocked because the target does not use HTTPS.",
          attempt,
        )
      : denied("INVALID_TARGET", "The target URL is invalid.", attempt);
  }
  if (!authorization.allowedDomains.includes(target.domain)) {
    return denied(
      "DOMAIN_NOT_ALLOWED",
      attempt.kind === "REDIRECT"
        ? "Redirect blocked because its destination is outside this authorization."
        : attempt.kind === "POPUP"
          ? "Popup blocked because its destination is outside this authorization."
          : "Navigation blocked because its destination is outside this authorization.",
      attempt,
      { targetDomain: target.domain },
    );
  }
  const base = new URL(authorization.allowedBaseUrl);
  if (
    target.domain === base.hostname.toLowerCase() &&
    !withinBasePath(base, target.url)
  ) {
    return denied(
      "BASE_PATH_NOT_ALLOWED",
      "Navigation blocked because the path is outside the authorized tenant base URL.",
      attempt,
      { targetDomain: target.domain },
    );
  }
  if (attempt.kind === "POPUP" && authorization.popupPolicy === "BLOCK_ALL") {
    return denied(
      "POPUP_BLOCKED",
      "Popups are blocked by this authorization.",
      attempt,
      { targetDomain: target.domain },
    );
  }
  if (attempt.kind === "ACTION") {
    return actionDecision(
      authorization,
      attempt.action,
      attempt,
      target.domain,
    );
  }
  return actionDecision(authorization, "NAVIGATE", attempt, target.domain);
}

const createAuthorizationInputSchema = z
  .object({
    principal: workspacePrincipalSchema,
    workspaceId: uuid,
    softwareId: uuid,
    authorityBasis: nonEmpty,
    validFrom: timestamp,
    reviewAt: timestamp,
    expiresAt: timestamp,
    allowedBaseUrl: z.url(),
    allowedSupportingDomains: z.array(exactDomainSchema),
    allowedActions: z.array(authorizationActionSchema).min(1),
    prohibitedActions: z.array(authorizationActionSchema).min(1),
    redirectPolicy: z.literal("ALLOW_LISTED_ONLY"),
    popupPolicy: z.enum(["BLOCK_ALL", "ALLOW_LISTED_ONLY"]),
    attestation: z
      .object({
        authorityConfirmed: z.literal(true),
        syntheticAccountsOnlyConfirmed: z.literal(true),
        statement: nonEmpty,
      })
      .strict(),
  })
  .strict();

const authorizationRequestSchema = z
  .object({
    principal: workspacePrincipalSchema,
    workspaceId: uuid,
    softwareId: uuid,
    authorizationId: uuid,
  })
  .strict();

const evaluateAttemptInputSchema = authorizationRequestSchema
  .extend({ attempt: authorizationAttemptSchema })
  .strict();

const revokeAuthorizationInputSchema = authorizationRequestSchema
  .extend({ reason: nonEmpty })
  .strict();

const listAuthorizationInputSchema = z
  .object({
    principal: workspacePrincipalSchema,
    workspaceId: uuid,
    softwareId: uuid,
  })
  .strict();

export interface TestAuthorizationRepository {
  createAuthorizationWithAudit(
    authorization: TestAuthorization,
    audit: AuditEvent,
  ): Promise<void>;
  readAuthorization(
    workspaceId: string,
    softwareId: string,
    authorizationId: string,
  ): Promise<TestAuthorization | undefined>;
  listAuthorizations(
    workspaceId: string,
    softwareId: string,
  ): Promise<readonly TestAuthorization[]>;
  recordDecisionWithAudit(
    decision: AuthorizationPolicyDecision,
    audit: AuditEvent,
  ): Promise<void>;
  listDecisions(
    workspaceId: string,
    authorizationId: string,
  ): Promise<readonly AuthorizationPolicyDecision[]>;
  revokeAuthorizationWithAudit(
    workspaceId: string,
    softwareId: string,
    authorizationId: string,
    audit: AuditEvent,
  ): Promise<TestAuthorization | undefined>;
}

interface TestAuthorizationServiceOptions {
  readonly idFactory?: () => string;
  readonly now?: () => string;
}

export class PolicyDeniedError extends Error {
  readonly code = "POLICY_DENIED";
  readonly status = 409;
  readonly publicMessage: string;
  readonly reason: AuthorizationPolicyReason;
  readonly auditRecorded = true;
  readonly decision: AuthorizationPolicyDecision;

  constructor(decisionCandidate: AuthorizationPolicyDecision) {
    const decision = authorizationPolicyDecisionSchema.parse(decisionCandidate);
    super(decision.message);
    this.name = "PolicyDeniedError";
    this.publicMessage = decision.message;
    this.reason = decision.reason;
    this.decision = immutableClone(decision);
  }
}

function humanActor(principal: WorkspacePrincipal) {
  return humanActorSchema.parse({ kind: "HUMAN", actorId: principal.userId });
}

export class TestAuthorizationService {
  readonly #repository: TestAuthorizationRepository;
  readonly #workspaceAuthorization: Pick<
    WorkspaceAuthorizationService,
    "checkPermission"
  >;
  readonly #software: Pick<SoftwareInventoryRepository, "readSoftware">;
  readonly #idFactory: () => string;
  readonly #now: () => string;

  constructor(
    repository: TestAuthorizationRepository,
    workspaceAuthorization: Pick<WorkspaceAuthorizationService, "checkPermission">,
    software: Pick<SoftwareInventoryRepository, "readSoftware">,
    options: TestAuthorizationServiceOptions = {},
  ) {
    this.#repository = repository;
    this.#workspaceAuthorization = workspaceAuthorization;
    this.#software = software;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async createAuthorization(candidate: unknown): Promise<TestAuthorization> {
    const input = createAuthorizationInputSchema.parse(candidate);
    await this.#workspaceAuthorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "AUTHORIZATION_MANAGE",
    });
    const software = await this.#requireSoftware(
      input.workspaceId,
      input.softwareId,
    );
    const existing = await this.#repository.listAuthorizations(
      input.workspaceId,
      input.softwareId,
    );
    const base = new URL(input.allowedBaseUrl);
    const inventoryBase = new URL(software.authorizedTenantUrl);
    if (!withinBasePath(inventoryBase, base)) {
      throw new TypeError(
        "The authorization base URL must stay inside the recorded software tenant",
      );
    }
    const allowedDomains = [
      base.hostname.toLowerCase(),
      ...input.allowedSupportingDomains,
    ].filter((domain, index, values) => values.indexOf(domain) === index);
    const occurredAt = this.#now();
    const status =
      Date.parse(input.expiresAt) <= Date.parse(occurredAt)
        ? "EXPIRED"
        : "ACTIVE";
    const authorization = authorizationSchema.parse({
      id: this.#idFactory(),
      workspaceId: input.workspaceId,
      softwareId: input.softwareId,
      version: (existing.at(-1)?.version ?? 0) + 1,
      status,
      validFrom: input.validFrom,
      reviewAt: input.reviewAt,
      expiresAt: input.expiresAt,
      authorityBasis: input.authorityBasis,
      allowedBaseUrl: input.allowedBaseUrl,
      allowedDomains,
      allowedActions: input.allowedActions,
      prohibitedActions: input.prohibitedActions,
      redirectPolicy: input.redirectPolicy,
      popupPolicy: input.popupPolicy,
      attestation: input.attestation,
      attestedBy: humanActor(input.principal),
      attestedAt: occurredAt,
    });
    const audit = auditEventSchema.parse({
      eventId: this.#idFactory(),
      eventType: "AUDIT_RECORDED",
      workspaceId: input.workspaceId,
      subjectType: "test_authorization",
      subjectId: authorization.id,
      action: "test_authorization.created",
      actor: authorization.attestedBy,
      occurredAt,
      details: {
        version: authorization.version,
        status: authorization.status,
        domainCount: authorization.allowedDomains.length,
        allowedActionCount: authorization.allowedActions.length,
        prohibitedActionCount: authorization.prohibitedActions.length,
      },
    });
    await this.#repository.createAuthorizationWithAudit(authorization, audit);
    return immutableClone(authorization);
  }

  async listAuthorizations(candidate: unknown): Promise<readonly AuthorizationView[]> {
    const input = listAuthorizationInputSchema.parse(candidate);
    await this.#workspaceAuthorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "SOFTWARE_READ",
    });
    await this.#requireSoftware(input.workspaceId, input.softwareId);
    const now = this.#now();
    const authorizations = await this.#repository.listAuthorizations(
      input.workspaceId,
      input.softwareId,
    );
    return immutableClone(
      authorizations.map((authorization) => ({
        ...authorization,
        effectiveStatus: effectiveAuthorizationStatus(authorization, now),
      })),
    );
  }

  async evaluateAttempt(candidate: unknown): Promise<AuthorizationPolicyDecision> {
    const input = evaluateAttemptInputSchema.parse(candidate);
    await this.#workspaceAuthorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "RUN_EXECUTE",
    });
    const authorization = await this.#readAuthorization(input);
    const recordedAt = this.#now();
    const evaluation = evaluateAuthorizationPolicy(
      authorization,
      input.attempt,
      recordedAt,
    );
    const decision = authorizationPolicyDecisionSchema.parse({
      id: this.#idFactory(),
      workspaceId: input.workspaceId,
      softwareId: input.softwareId,
      authorizationId: input.authorizationId,
      ...evaluation,
      actor: humanActor(input.principal),
      recordedAt,
    });
    const audit = auditEventSchema.parse({
      eventId: this.#idFactory(),
      eventType: "AUDIT_RECORDED",
      workspaceId: input.workspaceId,
      subjectType: "test_authorization",
      subjectId: input.authorizationId,
      action: decision.allowed
        ? "test_authorization.policy_allowed"
        : "test_authorization.policy_denied",
      actor: decision.actor,
      occurredAt: recordedAt,
      details: {
        outcome: decision.outcome,
        reason: decision.reason,
        attemptKind: decision.attemptKind,
        ...(decision.targetDomain
          ? { targetDomain: decision.targetDomain }
          : {}),
        ...(decision.action ? { action: decision.action } : {}),
      },
    });
    await this.#repository.recordDecisionWithAudit(decision, audit);
    return immutableClone(decision);
  }

  async assertRunMayQueue(candidate: unknown): Promise<AuthorizationPolicyDecision> {
    const input = authorizationRequestSchema.parse(candidate);
    const decision = await this.evaluateAttempt({
      ...input,
      attempt: { kind: "RUN_QUEUE" },
    });
    if (!decision.allowed) throw new PolicyDeniedError(decision);
    return decision;
  }

  async revokeAuthorization(candidate: unknown): Promise<TestAuthorization> {
    const input = revokeAuthorizationInputSchema.parse(candidate);
    await this.#workspaceAuthorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "AUTHORIZATION_MANAGE",
    });
    const current = await this.#readAuthorization(input);
    if (current.status === "REVOKED") return immutableClone(current);
    const occurredAt = this.#now();
    const audit = auditEventSchema.parse({
      eventId: this.#idFactory(),
      eventType: "AUDIT_RECORDED",
      workspaceId: input.workspaceId,
      subjectType: "test_authorization",
      subjectId: input.authorizationId,
      action: "test_authorization.revoked",
      actor: humanActor(input.principal),
      occurredAt,
      details: { reason: input.reason },
    });
    const revoked = await this.#repository.revokeAuthorizationWithAudit(
      input.workspaceId,
      input.softwareId,
      input.authorizationId,
      audit,
    );
    if (!revoked) throw new WorkspaceUnavailableError();
    return immutableClone(revoked);
  }

  async listDecisions(candidate: unknown): Promise<readonly AuthorizationPolicyDecision[]> {
    const input = authorizationRequestSchema.parse(candidate);
    await this.#workspaceAuthorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "SOFTWARE_READ",
    });
    await this.#readAuthorization(input);
    return immutableClone(
      await this.#repository.listDecisions(
        input.workspaceId,
        input.authorizationId,
      ),
    );
  }

  async #requireSoftware(
    workspaceId: string,
    softwareId: string,
  ): Promise<SoftwareRecord> {
    const software = await this.#software.readSoftware(workspaceId, softwareId);
    if (!software) throw new WorkspaceUnavailableError();
    return software;
  }

  async #readAuthorization(input: {
    readonly workspaceId: string;
    readonly softwareId: string;
    readonly authorizationId: string;
  }): Promise<TestAuthorization> {
    await this.#requireSoftware(input.workspaceId, input.softwareId);
    const authorization = await this.#repository.readAuthorization(
      input.workspaceId,
      input.softwareId,
      input.authorizationId,
    );
    if (!authorization) throw new WorkspaceUnavailableError();
    return authorization;
  }
}

export class InMemoryTestAuthorizationRepository
  implements TestAuthorizationRepository
{
  readonly #authorizations = new Map<string, TestAuthorization>();
  readonly #decisions: AuthorizationPolicyDecision[] = [];
  readonly #auditSink:
    | Pick<WorkspaceAuthorizationRepository, "appendAuditEvent">
    | undefined;

  constructor(
    auditSink?: Pick<WorkspaceAuthorizationRepository, "appendAuditEvent">,
  ) {
    this.#auditSink = auditSink;
  }

  async createAuthorizationWithAudit(
    authorizationCandidate: TestAuthorization,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const authorization = authorizationSchema.parse(authorizationCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    const key = `${authorization.workspaceId}:${authorization.id}`;
    if (this.#authorizations.has(key)) throw new Error("Authorization already exists");
    if (
      audit.workspaceId !== authorization.workspaceId ||
      audit.subjectId !== authorization.id
    ) {
      throw new Error("Authorization and audit must share one subject");
    }
    if (this.#auditSink) await this.#auditSink.appendAuditEvent(audit);
    for (const [existingKey, existing] of this.#authorizations) {
      if (
        existing.workspaceId === authorization.workspaceId &&
        existing.softwareId === authorization.softwareId &&
        existing.status === "ACTIVE"
      ) {
        this.#authorizations.set(
          existingKey,
          immutableClone({ ...existing, status: "REVOKED" }),
        );
      }
    }
    this.#authorizations.set(key, immutableClone(authorization));
  }

  readAuthorization(
    workspaceId: string,
    softwareId: string,
    authorizationId: string,
  ): Promise<TestAuthorization | undefined> {
    const authorization = this.#authorizations.get(
      `${uuid.parse(workspaceId)}:${uuid.parse(authorizationId)}`,
    );
    return Promise.resolve(
      authorization?.softwareId === uuid.parse(softwareId)
        ? immutableClone(authorization)
        : undefined,
    );
  }

  listAuthorizations(
    workspaceId: string,
    softwareId: string,
  ): Promise<readonly TestAuthorization[]> {
    const workspace = uuid.parse(workspaceId);
    const software = uuid.parse(softwareId);
    return Promise.resolve(
      immutableClone(
        [...this.#authorizations.values()]
          .filter(
            (authorization) =>
              authorization.workspaceId === workspace &&
              authorization.softwareId === software,
          )
          .sort((left, right) => left.version - right.version),
      ),
    );
  }

  async recordDecisionWithAudit(
    decisionCandidate: AuthorizationPolicyDecision,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const decision = authorizationPolicyDecisionSchema.parse(decisionCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    if (
      audit.workspaceId !== decision.workspaceId ||
      audit.subjectId !== decision.authorizationId ||
      this.#decisions.some((existing) => existing.id === decision.id)
    ) {
      throw new Error("Policy decision or audit is invalid");
    }
    if (this.#auditSink) await this.#auditSink.appendAuditEvent(audit);
    this.#decisions.push(immutableClone(decision));
  }

  listDecisions(
    workspaceId: string,
    authorizationId: string,
  ): Promise<readonly AuthorizationPolicyDecision[]> {
    const workspace = uuid.parse(workspaceId);
    const authorization = uuid.parse(authorizationId);
    return Promise.resolve(
      immutableClone(
        this.#decisions.filter(
          (decision) =>
            decision.workspaceId === workspace &&
            decision.authorizationId === authorization,
        ),
      ),
    );
  }

  async revokeAuthorizationWithAudit(
    workspaceId: string,
    softwareId: string,
    authorizationId: string,
    auditCandidate: AuditEvent,
  ): Promise<TestAuthorization | undefined> {
    const current = await this.readAuthorization(
      workspaceId,
      softwareId,
      authorizationId,
    );
    if (!current) return undefined;
    const audit = auditEventSchema.parse(auditCandidate);
    if (this.#auditSink) await this.#auditSink.appendAuditEvent(audit);
    const revoked = authorizationSchema.parse({ ...current, status: "REVOKED" });
    this.#authorizations.set(
      `${current.workspaceId}:${current.id}`,
      immutableClone(revoked),
    );
    return immutableClone(revoked);
  }
}

function toTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function jsonObject<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

interface AuthorizationRow {
  readonly workspace_id: string;
  readonly id: string;
  readonly software_id: string;
  readonly version: number;
  readonly status: "ACTIVE" | "EXPIRED" | "REVOKED";
  readonly valid_from: string | Date;
  readonly expires_at: string | Date;
  readonly scope: unknown;
  readonly attested_by: unknown;
  readonly attested_at: string | Date;
}

interface StoredScope {
  readonly authorityBasis: string;
  readonly reviewAt: string;
  readonly allowedBaseUrl: string;
  readonly allowedDomains: readonly string[];
  readonly allowedActions: readonly AuthorizationAction[];
  readonly prohibitedActions: readonly AuthorizationAction[];
  readonly redirectPolicy: "ALLOW_LISTED_ONLY";
  readonly popupPolicy: "BLOCK_ALL" | "ALLOW_LISTED_ONLY";
  readonly attestation: TestAuthorization["attestation"];
}

function authorizationFromRow(row: AuthorizationRow): TestAuthorization {
  const scope = jsonObject<StoredScope>(row.scope);
  return authorizationSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    softwareId: row.software_id,
    version: row.version,
    status: row.status,
    validFrom: toTimestamp(row.valid_from),
    reviewAt: scope.reviewAt,
    expiresAt: toTimestamp(row.expires_at),
    authorityBasis: scope.authorityBasis,
    allowedBaseUrl: scope.allowedBaseUrl,
    allowedDomains: scope.allowedDomains,
    allowedActions: scope.allowedActions,
    prohibitedActions: scope.prohibitedActions,
    redirectPolicy: scope.redirectPolicy,
    popupPolicy: scope.popupPolicy,
    attestation: scope.attestation,
    attestedBy: jsonObject(row.attested_by),
    attestedAt: toTimestamp(row.attested_at),
  });
}

interface DecisionRow {
  readonly workspace_id: string;
  readonly id: string;
  readonly software_id: string;
  readonly authorization_id: string;
  readonly outcome: "ALLOW" | "DENY";
  readonly reason: AuthorizationPolicyReason;
  readonly message: string;
  readonly attempt_kind: AuthorizationAttempt["kind"];
  readonly target_domain: string | null;
  readonly action: AuthorizationAction | null;
  readonly actor: unknown;
  readonly recorded_at: string | Date;
}

function decisionFromRow(row: DecisionRow): AuthorizationPolicyDecision {
  return authorizationPolicyDecisionSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    softwareId: row.software_id,
    authorizationId: row.authorization_id,
    outcome: row.outcome,
    allowed: row.outcome === "ALLOW",
    reason: row.reason,
    message: row.message,
    attemptKind: row.attempt_kind,
    ...(row.target_domain ? { targetDomain: row.target_domain } : {}),
    ...(row.action ? { action: row.action } : {}),
    actor: jsonObject(row.actor),
    recordedAt: toTimestamp(row.recorded_at),
  });
}

async function insertAudit(
  database: MigrationDatabase,
  event: AuditEvent,
): Promise<void> {
  await database.query(
    "INSERT INTO audit_events (workspace_id, id, subject_type, subject_id, action, actor_kind, actor, occurred_at, details) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [
      event.workspaceId,
      event.eventId,
      event.subjectType,
      event.subjectId,
      event.action,
      event.actor.kind,
      event.actor,
      event.occurredAt,
      event.details,
    ],
  );
}

function storedScope(authorization: TestAuthorization): StoredScope {
  return {
    authorityBasis: authorization.authorityBasis,
    reviewAt: authorization.reviewAt,
    allowedBaseUrl: authorization.allowedBaseUrl,
    allowedDomains: authorization.allowedDomains,
    allowedActions: authorization.allowedActions,
    prohibitedActions: authorization.prohibitedActions,
    redirectPolicy: authorization.redirectPolicy,
    popupPolicy: authorization.popupPolicy,
    attestation: authorization.attestation,
  };
}

export class PostgresTestAuthorizationRepository
  implements TestAuthorizationRepository
{
  readonly #database: MigrationDatabase;

  constructor(database: MigrationDatabase) {
    this.#database = database;
  }

  async createAuthorizationWithAudit(
    authorizationCandidate: TestAuthorization,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const authorization = authorizationSchema.parse(authorizationCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    await this.#database.exec("BEGIN");
    try {
      await this.#database.query(
        "UPDATE authorizations SET status = 'REVOKED' WHERE workspace_id = $1 AND software_id = $2 AND status = 'ACTIVE'",
        [authorization.workspaceId, authorization.softwareId],
      );
      await this.#database.query(
        "INSERT INTO authorizations (workspace_id, id, software_id, version, status, valid_from, expires_at, scope, attested_by, attested_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        [
          authorization.workspaceId,
          authorization.id,
          authorization.softwareId,
          authorization.version,
          authorization.status,
          authorization.validFrom,
          authorization.expiresAt,
          storedScope(authorization),
          authorization.attestedBy,
          authorization.attestedAt,
        ],
      );
      await insertAudit(this.#database, audit);
      await this.#database.exec("COMMIT");
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async readAuthorization(
    workspaceId: string,
    softwareId: string,
    authorizationId: string,
  ): Promise<TestAuthorization | undefined> {
    const result = await this.#database.query<AuthorizationRow>(
      "SELECT workspace_id, id, software_id, version, status, valid_from, expires_at, scope, attested_by, attested_at FROM authorizations WHERE workspace_id = $1 AND software_id = $2 AND id = $3",
      [uuid.parse(workspaceId), uuid.parse(softwareId), uuid.parse(authorizationId)],
    );
    return result.rows[0] ? authorizationFromRow(result.rows[0]) : undefined;
  }

  async listAuthorizations(
    workspaceId: string,
    softwareId: string,
  ): Promise<readonly TestAuthorization[]> {
    const result = await this.#database.query<AuthorizationRow>(
      "SELECT workspace_id, id, software_id, version, status, valid_from, expires_at, scope, attested_by, attested_at FROM authorizations WHERE workspace_id = $1 AND software_id = $2 ORDER BY version, id",
      [uuid.parse(workspaceId), uuid.parse(softwareId)],
    );
    return immutableClone(result.rows.map(authorizationFromRow));
  }

  async recordDecisionWithAudit(
    decisionCandidate: AuthorizationPolicyDecision,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const decision = authorizationPolicyDecisionSchema.parse(decisionCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    await this.#database.exec("BEGIN");
    try {
      await this.#database.query(
        "INSERT INTO authorization_policy_decisions (workspace_id, id, software_id, authorization_id, outcome, reason, message, attempt_kind, target_domain, action, actor_kind, actor, recorded_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
        [
          decision.workspaceId,
          decision.id,
          decision.softwareId,
          decision.authorizationId,
          decision.outcome,
          decision.reason,
          decision.message,
          decision.attemptKind,
          decision.targetDomain ?? null,
          decision.action ?? null,
          decision.actor.kind,
          decision.actor,
          decision.recordedAt,
        ],
      );
      await insertAudit(this.#database, audit);
      await this.#database.exec("COMMIT");
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async listDecisions(
    workspaceId: string,
    authorizationId: string,
  ): Promise<readonly AuthorizationPolicyDecision[]> {
    const result = await this.#database.query<DecisionRow>(
      "SELECT workspace_id, id, software_id, authorization_id, outcome, reason, message, attempt_kind, target_domain, action, actor, recorded_at FROM authorization_policy_decisions WHERE workspace_id = $1 AND authorization_id = $2 ORDER BY recorded_at, id",
      [uuid.parse(workspaceId), uuid.parse(authorizationId)],
    );
    return immutableClone(result.rows.map(decisionFromRow));
  }

  async revokeAuthorizationWithAudit(
    workspaceId: string,
    softwareId: string,
    authorizationId: string,
    auditCandidate: AuditEvent,
  ): Promise<TestAuthorization | undefined> {
    const audit = auditEventSchema.parse(auditCandidate);
    await this.#database.exec("BEGIN");
    try {
      const result = await this.#database.query<AuthorizationRow>(
        "UPDATE authorizations SET status = 'REVOKED' WHERE workspace_id = $1 AND software_id = $2 AND id = $3 RETURNING workspace_id, id, software_id, version, status, valid_from, expires_at, scope, attested_by, attested_at",
        [uuid.parse(workspaceId), uuid.parse(softwareId), uuid.parse(authorizationId)],
      );
      if (!result.rows[0]) {
        await this.#database.exec("ROLLBACK");
        return undefined;
      }
      await insertAudit(this.#database, audit);
      await this.#database.exec("COMMIT");
      return authorizationFromRow(result.rows[0]);
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }
}
