import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  auditEventSchema,
  humanActorSchema,
  userRoleSchema,
  workspaceRoleSchema,
  workspaceSchema,
  type AuditEvent,
  type HumanActor,
  type UserRole,
  type Workspace,
  type WorkspaceRole,
} from "./domain.js";
import type { MigrationDatabase } from "./migrations.js";

export type { WorkspaceRole } from "./domain.js";

const uuid = z.string().uuid();
const nonEmpty = z.string().trim().min(1);

export const workspacePermissionSchema = z.enum([
  "WORKSPACE_READ",
  "WORKSPACE_EXPORT",
  "SOFTWARE_READ",
  "SOFTWARE_CREATE",
  "AGREEMENT_READ",
  "AGREEMENT_UPLOAD",
  "AUTHORIZATION_MANAGE",
  "SECRET_MANAGE",
  "SECRET_USE",
  "PERSONA_READ",
  "PERSONA_MANAGE",
  "CANARY_READ",
  "CANARY_GENERATE",
  "ROLE_ASSIGN",
  "AUDIT_READ",
  "REQUIREMENT_CONFIRM",
  "RUN_EXECUTE",
  "EVIDENCE_REVIEW",
  "APPROVAL_RESTORE",
  "DESTINATION_CONFIRM",
]);
export type WorkspacePermission = z.infer<typeof workspacePermissionSchema>;

export const workspacePrincipalSchema = z
  .object({
    userId: nonEmpty,
    displayName: nonEmpty,
    activeWorkspaceId: uuid.optional(),
  })
  .strict();
export type WorkspacePrincipal = z.infer<typeof workspacePrincipalSchema>;

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
    for (const nested of Object.values(candidate)) {
      freeze(nested);
    }
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
}

export const workspacePermissionMatrix: Readonly<
  Record<WorkspaceRole, readonly WorkspacePermission[]>
> = immutableClone({
  PRIVACY_OFFICER: [
    "WORKSPACE_READ",
    "WORKSPACE_EXPORT",
    "SOFTWARE_READ",
    "SOFTWARE_CREATE",
    "AGREEMENT_READ",
    "AGREEMENT_UPLOAD",
    "AUTHORIZATION_MANAGE",
    "SECRET_MANAGE",
    "SECRET_USE",
    "PERSONA_READ",
    "PERSONA_MANAGE",
    "CANARY_READ",
    "CANARY_GENERATE",
    "ROLE_ASSIGN",
    "AUDIT_READ",
    "REQUIREMENT_CONFIRM",
    "RUN_EXECUTE",
    "EVIDENCE_REVIEW",
    "APPROVAL_RESTORE",
    "DESTINATION_CONFIRM",
  ],
  TEST_OPERATOR: [
    "WORKSPACE_READ",
    "SOFTWARE_READ",
    "AGREEMENT_READ",
    "SECRET_USE",
    "PERSONA_READ",
    "PERSONA_MANAGE",
    "CANARY_READ",
    "CANARY_GENERATE",
    "RUN_EXECUTE",
  ],
  REVIEWER: [
    "WORKSPACE_READ",
    "WORKSPACE_EXPORT",
    "SOFTWARE_READ",
    "AGREEMENT_READ",
    "PERSONA_READ",
    "CANARY_READ",
    "AUDIT_READ",
    "EVIDENCE_REVIEW",
  ],
  APPLICATION_APPROVER: [
    "WORKSPACE_READ",
    "SOFTWARE_READ",
    "AGREEMENT_READ",
    "PERSONA_READ",
    "CANARY_READ",
    "SOFTWARE_CREATE",
    "AUDIT_READ",
    "APPROVAL_RESTORE",
  ],
  SECURITY_REVIEWER: [
    "WORKSPACE_READ",
    "WORKSPACE_EXPORT",
    "SOFTWARE_READ",
    "AGREEMENT_READ",
    "PERSONA_READ",
    "CANARY_READ",
    "AUDIT_READ",
    "EVIDENCE_REVIEW",
    "DESTINATION_CONFIRM",
  ],
});

export function roleCan(
  roleCandidate: unknown,
  permissionCandidate: unknown,
): boolean {
  const role = workspaceRoleSchema.parse(roleCandidate);
  const permission = workspacePermissionSchema.parse(permissionCandidate);
  return workspacePermissionMatrix[role].includes(permission);
}

export class AuthenticationRequiredError extends Error {
  readonly code = "AUTHENTICATION_REQUIRED";
  readonly status = 401;
  readonly publicMessage = "Sign in to continue.";

  constructor() {
    super("An authenticated principal with an active workspace is required");
    this.name = "AuthenticationRequiredError";
  }
}

export class WorkspaceUnavailableError extends Error {
  readonly code = "WORKSPACE_UNAVAILABLE";
  readonly status = 404;
  readonly publicMessage = "Workspace not found or not available.";

  constructor() {
    super("The requested workspace is outside the principal's active boundary");
    this.name = "WorkspaceUnavailableError";
  }
}

export class PermissionDeniedError extends Error {
  readonly code = "PERMISSION_DENIED";
  readonly status = 403;
  readonly publicMessage = "You do not have permission to perform this action.";

  constructor(permission: WorkspacePermission) {
    super(`The principal lacks ${permission}`);
    this.name = "PermissionDeniedError";
  }
}

export type WorkspaceAuthorizationError =
  | AuthenticationRequiredError
  | WorkspaceUnavailableError
  | PermissionDeniedError;

export interface WorkspaceExport {
  readonly workspace: Workspace;
  readonly roleAssignments: readonly UserRole[];
  readonly auditEvents: readonly AuditEvent[];
}

export interface WorkspaceAuthorizationRepository {
  createWorkspaceWithAudit(
    workspace: Workspace,
    ownerAssignment: UserRole,
    auditEvents: readonly AuditEvent[],
  ): Promise<void>;
  readWorkspace(workspaceId: string): Promise<Workspace | undefined>;
  listRoleAssignments(
    workspaceId: string,
    userId?: string,
  ): Promise<readonly UserRole[]>;
  assignRoleWithAudit(
    assignment: UserRole,
    auditEvent: AuditEvent,
  ): Promise<void>;
  appendAuditEvent(auditEvent: AuditEvent): Promise<void>;
  listAuditEvents(workspaceId: string): Promise<readonly AuditEvent[]>;
  exportWorkspace(workspaceId: string): Promise<WorkspaceExport | undefined>;
}

interface ServiceOptions {
  readonly idFactory?: () => string;
  readonly now?: () => string;
}

const createWorkspaceInputSchema = z
  .object({
    principal: workspacePrincipalSchema,
    name: nonEmpty,
  })
  .strict();

const workspaceRequestSchema = z
  .object({
    principal: workspacePrincipalSchema,
    workspaceId: uuid,
  })
  .strict();

const assignRoleInputSchema = workspaceRequestSchema
  .extend({
    targetUserId: nonEmpty,
    role: workspaceRoleSchema,
  })
  .strict();

function humanActor(principal: WorkspacePrincipal): HumanActor {
  return humanActorSchema.parse({
    kind: "HUMAN",
    actorId: principal.userId,
  });
}

export class WorkspaceAuthorizationService {
  readonly #repository: WorkspaceAuthorizationRepository;
  readonly #idFactory: () => string;
  readonly #now: () => string;

  constructor(
    repository: WorkspaceAuthorizationRepository,
    options: ServiceOptions = {},
  ) {
    this.#repository = repository;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async createWorkspace(candidate: unknown): Promise<{
    readonly workspace: Workspace;
    readonly ownerAssignment: UserRole;
  }> {
    const input = createWorkspaceInputSchema.parse(candidate);
    const actor = humanActor(input.principal);
    const occurredAt = this.#now();
    const workspace = workspaceSchema.parse({
      id: this.#idFactory(),
      name: input.name,
      createdAt: occurredAt,
      createdBy: actor,
    });
    const ownerAssignment = userRoleSchema.parse({
      id: this.#idFactory(),
      workspaceId: workspace.id,
      userId: input.principal.userId,
      role: "PRIVACY_OFFICER",
      assignedAt: occurredAt,
      assignedBy: actor,
    });
    const auditEvents = [
      auditEventSchema.parse({
        eventId: this.#idFactory(),
        eventType: "AUDIT_RECORDED",
        workspaceId: workspace.id,
        subjectType: "workspace",
        subjectId: workspace.id,
        action: "workspace.created",
        actor,
        occurredAt,
        details: { name: workspace.name },
      }),
      auditEventSchema.parse({
        eventId: this.#idFactory(),
        eventType: "AUDIT_RECORDED",
        workspaceId: workspace.id,
        subjectType: "workspace_role",
        subjectId: ownerAssignment.id,
        action: "workspace.role_assigned",
        actor,
        occurredAt,
        details: {
          targetUserId: ownerAssignment.userId,
          role: ownerAssignment.role,
        },
      }),
    ];

    await this.#repository.createWorkspaceWithAudit(
      workspace,
      ownerAssignment,
      auditEvents,
    );
    return immutableClone({ workspace, ownerAssignment });
  }

  async getWorkspace(candidate: unknown): Promise<Workspace> {
    const input = workspaceRequestSchema.parse(candidate);
    await this.#authorize(input.principal, input.workspaceId, "WORKSPACE_READ");
    const workspace = await this.#repository.readWorkspace(input.workspaceId);
    if (!workspace) {
      await this.#recordDecision(
        input.principal,
        input.workspaceId,
        "WORKSPACE_READ",
        "DENY",
        "WORKSPACE_UNAVAILABLE",
      );
      throw new WorkspaceUnavailableError();
    }
    return immutableClone(workspace);
  }

  async assignRole(candidate: unknown): Promise<UserRole> {
    const input = assignRoleInputSchema.parse(candidate);
    await this.#authorize(input.principal, input.workspaceId, "ROLE_ASSIGN");
    const actor = humanActor(input.principal);
    const occurredAt = this.#now();
    const assignment = userRoleSchema.parse({
      id: this.#idFactory(),
      workspaceId: input.workspaceId,
      userId: input.targetUserId,
      role: input.role,
      assignedAt: occurredAt,
      assignedBy: actor,
    });
    const auditEvent = auditEventSchema.parse({
      eventId: this.#idFactory(),
      eventType: "AUDIT_RECORDED",
      workspaceId: input.workspaceId,
      subjectType: "workspace_role",
      subjectId: assignment.id,
      action: "workspace.role_assigned",
      actor,
      occurredAt,
      details: {
        targetUserId: input.targetUserId,
        role: input.role,
      },
    });
    await this.#repository.assignRoleWithAudit(assignment, auditEvent);
    return immutableClone(assignment);
  }

  async listAuditEvents(candidate: unknown): Promise<readonly AuditEvent[]> {
    const input = workspaceRequestSchema.parse(candidate);
    await this.#authorize(input.principal, input.workspaceId, "AUDIT_READ");
    return immutableClone(
      await this.#repository.listAuditEvents(input.workspaceId),
    );
  }

  async exportWorkspace(candidate: unknown): Promise<WorkspaceExport> {
    const input = workspaceRequestSchema.parse(candidate);
    await this.#authorize(
      input.principal,
      input.workspaceId,
      "WORKSPACE_EXPORT",
    );
    const exported = await this.#repository.exportWorkspace(input.workspaceId);
    if (!exported) {
      await this.#recordDecision(
        input.principal,
        input.workspaceId,
        "WORKSPACE_EXPORT",
        "DENY",
        "WORKSPACE_UNAVAILABLE",
      );
      throw new WorkspaceUnavailableError();
    }
    return immutableClone(exported);
  }

  async checkPermission(candidate: unknown): Promise<readonly UserRole[]> {
    const input = workspaceRequestSchema
      .extend({ permission: workspacePermissionSchema })
      .strict()
      .parse(candidate);
    return this.#authorize(
      input.principal,
      input.workspaceId,
      input.permission,
    );
  }

  async #authorize(
    principalCandidate: unknown,
    requestedWorkspaceId: string,
    permission: WorkspacePermission,
  ): Promise<readonly UserRole[]> {
    const principal = workspacePrincipalSchema.parse(principalCandidate);
    if (!principal.activeWorkspaceId) {
      throw new AuthenticationRequiredError();
    }
    const assignments = await this.#repository.listRoleAssignments(
      principal.activeWorkspaceId,
      principal.userId,
    );
    if (assignments.length === 0) {
      throw new AuthenticationRequiredError();
    }
    if (principal.activeWorkspaceId !== requestedWorkspaceId) {
      await this.#recordDecision(
        principal,
        requestedWorkspaceId,
        permission,
        "DENY",
        "WORKSPACE_UNAVAILABLE",
      );
      throw new WorkspaceUnavailableError();
    }
    if (!assignments.some((assignment) => roleCan(assignment.role, permission))) {
      await this.#recordDecision(
        principal,
        requestedWorkspaceId,
        permission,
        "DENY",
        "ROLE_MISSING",
      );
      throw new PermissionDeniedError(permission);
    }
    await this.#recordDecision(
      principal,
      requestedWorkspaceId,
      permission,
      "ALLOW",
      "ROLE_GRANTED",
    );
    return immutableClone(assignments);
  }

  async #recordDecision(
    principal: WorkspacePrincipal,
    requestedWorkspaceId: string,
    permission: WorkspacePermission,
    outcome: "ALLOW" | "DENY",
    reason: "ROLE_GRANTED" | "ROLE_MISSING" | "WORKSPACE_UNAVAILABLE",
  ): Promise<void> {
    if (!principal.activeWorkspaceId) {
      return;
    }
    const event = auditEventSchema.parse({
      eventId: this.#idFactory(),
      eventType: "AUDIT_RECORDED",
      workspaceId: principal.activeWorkspaceId,
      subjectType: "workspace_access",
      subjectId: requestedWorkspaceId,
      action:
        outcome === "ALLOW"
          ? "workspace.access_allowed"
          : "workspace.access_denied",
      actor: humanActor(principal),
      occurredAt: this.#now(),
      details: { permission, outcome, reason },
    });
    await this.#repository.appendAuditEvent(event);
  }
}

export class InMemoryWorkspaceAuthorizationRepository
  implements WorkspaceAuthorizationRepository
{
  readonly #workspaces = new Map<string, Workspace>();
  readonly #assignments: UserRole[] = [];
  readonly #audits: AuditEvent[] = [];

  createWorkspaceWithAudit(
    workspaceCandidate: Workspace,
    ownerAssignmentCandidate: UserRole,
    auditEventCandidates: readonly AuditEvent[],
  ): Promise<void> {
    const workspace = workspaceSchema.parse(workspaceCandidate);
    const ownerAssignment = userRoleSchema.parse(ownerAssignmentCandidate);
    const audits = auditEventCandidates.map((event) => auditEventSchema.parse(event));
    if (this.#workspaces.has(workspace.id)) {
      throw new Error("Workspace already exists");
    }
    if (
      ownerAssignment.workspaceId !== workspace.id ||
      audits.some((event) => event.workspaceId !== workspace.id)
    ) {
      throw new Error("Workspace creation records must share one workspace");
    }
    this.#workspaces.set(workspace.id, immutableClone(workspace));
    this.#assignments.push(immutableClone(ownerAssignment));
    this.#audits.push(...audits.map((event) => immutableClone(event)));
    return Promise.resolve();
  }

  readWorkspace(workspaceId: string): Promise<Workspace | undefined> {
    const workspace = this.#workspaces.get(uuid.parse(workspaceId));
    return Promise.resolve(workspace ? immutableClone(workspace) : undefined);
  }

  listRoleAssignments(
    workspaceId: string,
    userId?: string,
  ): Promise<readonly UserRole[]> {
    const scope = uuid.parse(workspaceId);
    return Promise.resolve(
      immutableClone(
        this.#assignments.filter(
          (assignment) =>
            assignment.workspaceId === scope &&
            (userId === undefined || assignment.userId === userId),
        ),
      ),
    );
  }

  assignRoleWithAudit(
    assignmentCandidate: UserRole,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const assignment = userRoleSchema.parse(assignmentCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    if (!this.#workspaces.has(assignment.workspaceId)) {
      throw new Error("Workspace does not exist");
    }
    if (
      audit.workspaceId !== assignment.workspaceId ||
      this.#assignments.some(
        (existing) =>
          existing.workspaceId === assignment.workspaceId &&
          existing.userId === assignment.userId &&
          existing.role === assignment.role,
      )
    ) {
      throw new Error("Role assignment is invalid or already exists");
    }
    this.#assignments.push(immutableClone(assignment));
    this.#audits.push(immutableClone(audit));
    return Promise.resolve();
  }

  appendAuditEvent(candidate: AuditEvent): Promise<void> {
    const event = auditEventSchema.parse(candidate);
    if (!this.#workspaces.has(event.workspaceId)) {
      throw new Error("Audit workspace does not exist");
    }
    if (this.#audits.some((existing) => existing.eventId === event.eventId)) {
      throw new Error("Audit event already exists");
    }
    this.#audits.push(immutableClone(event));
    return Promise.resolve();
  }

  listAuditEvents(workspaceId: string): Promise<readonly AuditEvent[]> {
    const scope = uuid.parse(workspaceId);
    return Promise.resolve(
      immutableClone(
        this.#audits.filter((event) => event.workspaceId === scope),
      ),
    );
  }

  async exportWorkspace(
    workspaceId: string,
  ): Promise<WorkspaceExport | undefined> {
    const workspace = await this.readWorkspace(workspaceId);
    if (!workspace) {
      return undefined;
    }
    return immutableClone({
      workspace,
      roleAssignments: await this.listRoleAssignments(workspaceId),
      auditEvents: await this.listAuditEvents(workspaceId),
    });
  }
}

function toTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function jsonObject<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

interface WorkspaceRow {
  readonly id: string;
  readonly name: string;
  readonly created_at: string | Date;
  readonly created_by: unknown;
}

interface RoleRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly user_id: string;
  readonly role: WorkspaceRole;
  readonly assigned_at: string | Date;
  readonly assigned_by: unknown;
}

interface AuditRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly subject_type: string;
  readonly subject_id: string;
  readonly action: string;
  readonly actor: unknown;
  readonly occurred_at: string | Date;
  readonly details: unknown;
}

function workspaceFromRow(row: WorkspaceRow): Workspace {
  return workspaceSchema.parse({
    id: row.id,
    name: row.name,
    createdAt: toTimestamp(row.created_at),
    createdBy: jsonObject(row.created_by),
  });
}

function roleFromRow(row: RoleRow): UserRole {
  return userRoleSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    assignedAt: toTimestamp(row.assigned_at),
    assignedBy: jsonObject(row.assigned_by),
  });
}

function auditFromRow(row: AuditRow): AuditEvent {
  return auditEventSchema.parse({
    eventId: row.id,
    eventType: "AUDIT_RECORDED",
    workspaceId: row.workspace_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    action: row.action,
    actor: jsonObject(row.actor),
    occurredAt: toTimestamp(row.occurred_at),
    details: jsonObject(row.details),
  });
}

export class PostgresWorkspaceAuthorizationRepository
  implements WorkspaceAuthorizationRepository
{
  readonly #database: MigrationDatabase;

  constructor(database: MigrationDatabase) {
    this.#database = database;
  }

  async createWorkspaceWithAudit(
    workspaceCandidate: Workspace,
    ownerAssignmentCandidate: UserRole,
    auditEventCandidates: readonly AuditEvent[],
  ): Promise<void> {
    const workspace = workspaceSchema.parse(workspaceCandidate);
    const owner = userRoleSchema.parse(ownerAssignmentCandidate);
    const audits = auditEventCandidates.map((event) => auditEventSchema.parse(event));
    await this.#database.exec("BEGIN");
    try {
      await this.#database.query(
        "INSERT INTO workspaces (id, name, created_at, created_by) VALUES ($1, $2, $3, $4)",
        [workspace.id, workspace.name, workspace.createdAt, workspace.createdBy],
      );
      await this.#insertRole(owner);
      for (const audit of audits) {
        await this.#insertAudit(audit);
      }
      await this.#database.exec("COMMIT");
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async readWorkspace(workspaceId: string): Promise<Workspace | undefined> {
    const result = await this.#database.query<WorkspaceRow>(
      "SELECT id, name, created_at, created_by FROM workspaces WHERE id = $1",
      [uuid.parse(workspaceId)],
    );
    const row = result.rows[0];
    return row ? workspaceFromRow(row) : undefined;
  }

  async listRoleAssignments(
    workspaceId: string,
    userId?: string,
  ): Promise<readonly UserRole[]> {
    const result = userId
      ? await this.#database.query<RoleRow>(
          "SELECT id, workspace_id, user_id, role, assigned_at, assigned_by FROM user_roles WHERE workspace_id = $1 AND user_id = $2 ORDER BY assigned_at, id",
          [uuid.parse(workspaceId), userId],
        )
      : await this.#database.query<RoleRow>(
          "SELECT id, workspace_id, user_id, role, assigned_at, assigned_by FROM user_roles WHERE workspace_id = $1 ORDER BY assigned_at, id",
          [uuid.parse(workspaceId)],
        );
    return immutableClone(result.rows.map(roleFromRow));
  }

  async assignRoleWithAudit(
    assignmentCandidate: UserRole,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const assignment = userRoleSchema.parse(assignmentCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    await this.#database.exec("BEGIN");
    try {
      await this.#insertRole(assignment);
      await this.#insertAudit(audit);
      await this.#database.exec("COMMIT");
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async appendAuditEvent(candidate: AuditEvent): Promise<void> {
    await this.#insertAudit(auditEventSchema.parse(candidate));
  }

  async listAuditEvents(workspaceId: string): Promise<readonly AuditEvent[]> {
    const result = await this.#database.query<AuditRow>(
      "SELECT id, workspace_id, subject_type, subject_id, action, actor, occurred_at, details FROM audit_events WHERE workspace_id = $1 ORDER BY occurred_at, id",
      [uuid.parse(workspaceId)],
    );
    return immutableClone(result.rows.map(auditFromRow));
  }

  async exportWorkspace(
    workspaceId: string,
  ): Promise<WorkspaceExport | undefined> {
    const workspace = await this.readWorkspace(workspaceId);
    if (!workspace) {
      return undefined;
    }
    return immutableClone({
      workspace,
      roleAssignments: await this.listRoleAssignments(workspaceId),
      auditEvents: await this.listAuditEvents(workspaceId),
    });
  }

  async #insertRole(assignment: UserRole): Promise<void> {
    await this.#database.query(
      "INSERT INTO user_roles (workspace_id, id, user_id, role, assigned_at, assigned_by) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        assignment.workspaceId,
        assignment.id,
        assignment.userId,
        assignment.role,
        assignment.assignedAt,
        assignment.assignedBy,
      ],
    );
  }

  async #insertAudit(event: AuditEvent): Promise<void> {
    await this.#database.query(
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
}
