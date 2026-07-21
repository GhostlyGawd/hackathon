import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  WorkspaceAuthorizationRepository,
  WorkspaceAuthorizationService,
} from "./authorization.js";
import {
  approvalOriginSchema,
  approvalSetterSchema,
  approvalStateSchema,
  auditEventSchema,
  authorizedTenantUrlSchema,
  humanActorSchema,
  runStateSchema,
  softwareRecordSchema,
  type ApprovalOrigin,
  type AuditEvent,
  type SoftwareRecord,
} from "./domain.js";
import type { MigrationDatabase } from "./migrations.js";

export { approvalOriginSchema, softwareRecordSchema } from "./domain.js";

const uuid = z.string().uuid();
const nonEmpty = z.string().trim().min(1);
const timestamp = z.iso.datetime({ offset: true });

export interface ApprovalOriginDescription {
  readonly heading: string;
  readonly detail: string;
  readonly isPactwireConclusion: false;
}

export function describeApprovalOrigin(
  candidate: unknown,
): ApprovalOriginDescription {
  const origin = approvalOriginSchema.parse(candidate);
  const heading =
    origin.setBy.kind === "IMPORTED_SYSTEM"
      ? `Imported from ${origin.setBy.displayName}`
      : `Set by ${origin.setBy.displayName}`;
  const reference = origin.sourceReference
    ? `District record ${origin.sourceReference}`
    : "District record";
  return Object.freeze({
    heading,
    detail: `${reference} · recorded by ${origin.recordedBy.actorId}`,
    isPactwireConclusion: false,
  });
}

export const findingCountSummarySchema = z
  .object({
    witnessedConflicts: z.number().int().nonnegative(),
    needsReview: z.number().int().nonnegative(),
    notVisible: z.number().int().nonnegative(),
    notTested: z.number().int().nonnegative(),
  })
  .strict();

export const inventoryLatestRunSchema = z
  .object({
    state: runStateSchema,
    occurredAt: timestamp,
    namedTestCount: z.number().int().nonnegative(),
    boundedSummary: nonEmpty,
  })
  .strict();

export const nextSafeActionSchema = z
  .object({
    code: z.enum([
      "DEFINE_AUTHORIZATION",
      "UPLOAD_AGREEMENT",
      "CONFIRM_REQUIREMENTS",
      "CONFIGURE_TEST_DATA",
      "CONFIGURE_JOURNEYS",
      "RUN_NAMED_TESTS",
      "READY_FOR_NAMED_RUN",
      "REVIEW_FINDINGS",
    ]),
    label: nonEmpty,
  })
  .strict();

const softwareInventoryItemInputSchema = z
  .object({
    software: softwareRecordSchema,
    latestRun: inventoryLatestRunSchema.nullable(),
    findingCounts: findingCountSummarySchema,
    agreementVersion: z.number().int().positive().nullable(),
    authorizationReviewAt: timestamp.nullable(),
    nextSafeAction: nextSafeActionSchema,
  })
  .strict();

export const softwareInventoryItemSchema = softwareInventoryItemInputSchema.transform(
  (item) => ({
    ...item,
    approvalDescription: describeApprovalOrigin(item.software.approvalOrigin),
  }),
);
export type SoftwareInventoryItem = z.output<typeof softwareInventoryItemSchema>;

export interface SoftwareInventoryFilter {
  readonly approvalState?: z.infer<typeof approvalStateSchema>;
  readonly query?: string;
}

export interface SoftwareInventoryRepository {
  createSoftwareWithAudit(
    software: SoftwareRecord,
    auditEvent: AuditEvent,
  ): Promise<void>;
  readSoftware(
    workspaceId: string,
    softwareId: string,
  ): Promise<SoftwareRecord | undefined>;
  listSoftware(
    workspaceId: string,
    filter?: SoftwareInventoryFilter,
  ): Promise<readonly SoftwareRecord[]>;
}

interface SoftwareInventoryServiceOptions {
  readonly idFactory?: () => string;
  readonly now?: () => string;
}

const approvalInputSchema = z
  .object({
    state: approvalStateSchema,
    setBy: approvalSetterSchema,
    reason: nonEmpty,
    sourceReference: nonEmpty.optional(),
  })
  .strict();

const createSoftwareInputSchema = z
  .object({
    principal: z.object({
      userId: nonEmpty,
      displayName: nonEmpty,
      activeWorkspaceId: uuid.optional(),
    }).strict(),
    workspaceId: uuid,
    name: nonEmpty,
    vendorName: nonEmpty,
    authorizedTenantUrl: authorizedTenantUrlSchema,
    districtOwner: nonEmpty,
    knownVersion: nonEmpty.optional(),
    approval: approvalInputSchema,
  })
  .strict();

const listSoftwareInputSchema = z
  .object({
    principal: z.object({
      userId: nonEmpty,
      displayName: nonEmpty,
      activeWorkspaceId: uuid.optional(),
    }).strict(),
    workspaceId: uuid,
    approvalState: approvalStateSchema.optional(),
    query: z.string().trim().max(100).optional(),
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

function emptyInventoryItem(software: SoftwareRecord): SoftwareInventoryItem {
  return softwareInventoryItemSchema.parse({
    software,
    latestRun: null,
    findingCounts: {
      witnessedConflicts: 0,
      needsReview: 0,
      notVisible: 0,
      notTested: 0,
    },
    agreementVersion: null,
    authorizationReviewAt: null,
    nextSafeAction: {
      code: "DEFINE_AUTHORIZATION",
      label: "Define test authorization and scope",
    },
  });
}

export class SoftwareInventoryService {
  readonly #repository: SoftwareInventoryRepository;
  readonly #authorization: Pick<WorkspaceAuthorizationService, "checkPermission">;
  readonly #idFactory: () => string;
  readonly #now: () => string;

  constructor(
    repository: SoftwareInventoryRepository,
    authorization: Pick<WorkspaceAuthorizationService, "checkPermission">,
    options: SoftwareInventoryServiceOptions = {},
  ) {
    this.#repository = repository;
    this.#authorization = authorization;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async createSoftware(candidate: unknown): Promise<SoftwareInventoryItem> {
    const input = createSoftwareInputSchema.parse(candidate);
    await this.#authorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "SOFTWARE_CREATE",
    });
    const occurredAt = this.#now();
    const softwareId = this.#idFactory();
    const actor = humanActorSchema.parse({
      kind: "HUMAN",
      actorId: input.principal.userId,
    });
    const approvalOrigin = approvalOriginSchema.parse({
      id: this.#idFactory(),
      workspaceId: input.workspaceId,
      softwareId,
      state: input.approval.state,
      setBy: input.approval.setBy,
      reason: input.approval.reason,
      ...(input.approval.sourceReference
        ? { sourceReference: input.approval.sourceReference }
        : {}),
      recordedBy: actor,
      recordedAt: occurredAt,
    });
    const software = softwareRecordSchema.parse({
      id: softwareId,
      workspaceId: input.workspaceId,
      name: input.name,
      vendorName: input.vendorName,
      authorizedTenantUrl: input.authorizedTenantUrl,
      districtOwner: input.districtOwner,
      ...(input.knownVersion ? { knownVersion: input.knownVersion } : {}),
      approvalState: input.approval.state,
      approvalOrigin,
      createdAt: occurredAt,
      createdBy: actor,
    });
    const audit = auditEventSchema.parse({
      eventId: this.#idFactory(),
      eventType: "AUDIT_RECORDED",
      workspaceId: input.workspaceId,
      subjectType: "software",
      subjectId: software.id,
      action: "software.created",
      actor,
      occurredAt,
      details: {
        approvalState: software.approvalState,
        approvalSourceKind: software.approvalOrigin.setBy.kind,
      },
    });
    await this.#repository.createSoftwareWithAudit(software, audit);
    return immutableClone(emptyInventoryItem(software));
  }

  async listSoftware(candidate: unknown): Promise<readonly SoftwareInventoryItem[]> {
    const input = listSoftwareInputSchema.parse(candidate);
    await this.#authorization.checkPermission({
      principal: input.principal,
      workspaceId: input.workspaceId,
      permission: "SOFTWARE_READ",
    });
    const software = await this.#repository.listSoftware(input.workspaceId, {
      ...(input.approvalState ? { approvalState: input.approvalState } : {}),
      ...(input.query ? { query: input.query } : {}),
    });
    return immutableClone(software.map(emptyInventoryItem));
  }
}

export class InMemorySoftwareInventoryRepository
  implements SoftwareInventoryRepository
{
  readonly #records = new Map<string, SoftwareRecord>();
  readonly #auditSink:
    | Pick<WorkspaceAuthorizationRepository, "appendAuditEvent">
    | undefined;

  constructor(
    auditSink?: Pick<WorkspaceAuthorizationRepository, "appendAuditEvent">,
  ) {
    this.#auditSink = auditSink;
  }

  async createSoftwareWithAudit(
    softwareCandidate: SoftwareRecord,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const software = softwareRecordSchema.parse(softwareCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    const key = `${software.workspaceId}:${software.id}`;
    if (this.#records.has(key)) {
      throw new Error("Software already exists in this workspace");
    }
    if (
      audit.workspaceId !== software.workspaceId ||
      audit.subjectId !== software.id ||
      audit.subjectType !== "software"
    ) {
      throw new Error("Software and audit records must share one subject");
    }
    if (this.#auditSink) await this.#auditSink.appendAuditEvent(audit);
    this.#records.set(key, immutableClone(software));
  }

  readSoftware(
    workspaceId: string,
    softwareId: string,
  ): Promise<SoftwareRecord | undefined> {
    const record = this.#records.get(`${uuid.parse(workspaceId)}:${uuid.parse(softwareId)}`);
    return Promise.resolve(record ? immutableClone(record) : undefined);
  }

  listSoftware(
    workspaceId: string,
    filter: SoftwareInventoryFilter = {},
  ): Promise<readonly SoftwareRecord[]> {
    const scope = uuid.parse(workspaceId);
    const query = filter.query?.trim().toLocaleLowerCase();
    const records = [...this.#records.values()]
      .filter((record) => record.workspaceId === scope)
      .filter(
        (record) =>
          !filter.approvalState || record.approvalState === filter.approvalState,
      )
      .filter((record) => {
        if (!query) return true;
        return [
          record.name,
          record.vendorName,
          record.authorizedTenantUrl,
          record.districtOwner,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query);
      })
      .sort((left, right) =>
        left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      );
    return Promise.resolve(immutableClone(records));
  }
}

function toTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function jsonObject<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

interface SoftwareInventoryRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
  readonly vendor_name: string;
  readonly approval_state: z.infer<typeof approvalStateSchema>;
  readonly created_at: string | Date;
  readonly authorized_tenant_url: string;
  readonly district_owner: string;
  readonly known_version: string | null;
  readonly created_by: unknown;
  readonly origin_id: string;
  readonly origin_state: z.infer<typeof approvalStateSchema>;
  readonly set_by: unknown;
  readonly reason: string;
  readonly source_reference: string | null;
  readonly recorded_by: unknown;
  readonly recorded_at: string | Date;
}

function softwareFromRow(row: SoftwareInventoryRow): SoftwareRecord {
  return softwareRecordSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    vendorName: row.vendor_name,
    authorizedTenantUrl: row.authorized_tenant_url,
    districtOwner: row.district_owner,
    ...(row.known_version ? { knownVersion: row.known_version } : {}),
    approvalState: row.approval_state,
    approvalOrigin: {
      id: row.origin_id,
      workspaceId: row.workspace_id,
      softwareId: row.id,
      state: row.origin_state,
      setBy: jsonObject(row.set_by),
      reason: row.reason,
      ...(row.source_reference
        ? { sourceReference: row.source_reference }
        : {}),
      recordedBy: jsonObject(row.recorded_by),
      recordedAt: toTimestamp(row.recorded_at),
    },
    createdAt: toTimestamp(row.created_at),
    createdBy: jsonObject(row.created_by),
  });
}

const softwareSelect = `
  SELECT
    software.id,
    software.workspace_id,
    software.name,
    software.vendor_name,
    software.approval_state,
    software.created_at,
    details.authorized_tenant_url,
    details.district_owner,
    details.known_version,
    details.created_by,
    origin.id AS origin_id,
    origin.state AS origin_state,
    origin.set_by,
    origin.reason,
    origin.source_reference,
    origin.recorded_by,
    origin.recorded_at
  FROM software_records AS software
  INNER JOIN software_inventory_details AS details
    ON details.workspace_id = software.workspace_id
    AND details.software_id = software.id
  INNER JOIN LATERAL (
    SELECT candidate.*
    FROM software_approval_origins AS candidate
    WHERE candidate.workspace_id = software.workspace_id
      AND candidate.software_id = software.id
    ORDER BY candidate.recorded_at DESC, candidate.id DESC
    LIMIT 1
  ) AS origin ON true
`;

export class PostgresSoftwareInventoryRepository
  implements SoftwareInventoryRepository
{
  readonly #database: MigrationDatabase;

  constructor(database: MigrationDatabase) {
    this.#database = database;
  }

  async createSoftwareWithAudit(
    softwareCandidate: SoftwareRecord,
    auditCandidate: AuditEvent,
  ): Promise<void> {
    const software = softwareRecordSchema.parse(softwareCandidate);
    const audit = auditEventSchema.parse(auditCandidate);
    if (
      audit.workspaceId !== software.workspaceId ||
      audit.subjectId !== software.id ||
      audit.subjectType !== "software"
    ) {
      throw new Error("Software and audit records must share one subject");
    }
    const origin: ApprovalOrigin = software.approvalOrigin;
    await this.#database.exec("BEGIN");
    try {
      await this.#database.query(
        "INSERT INTO software_records (workspace_id, id, name, vendor_name, approval_state, approval_owner, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          software.workspaceId,
          software.id,
          software.name,
          software.vendorName,
          software.approvalState,
          origin.setBy.kind,
          software.createdAt,
        ],
      );
      await this.#database.query(
        "INSERT INTO software_inventory_details (workspace_id, software_id, authorized_tenant_url, district_owner, known_version, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          software.workspaceId,
          software.id,
          software.authorizedTenantUrl,
          software.districtOwner,
          software.knownVersion ?? null,
          software.createdBy,
          software.createdAt,
        ],
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
    } catch (error) {
      await this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async readSoftware(
    workspaceId: string,
    softwareId: string,
  ): Promise<SoftwareRecord | undefined> {
    const result = await this.#database.query<SoftwareInventoryRow>(
      `${softwareSelect}
       WHERE software.workspace_id = $1 AND software.id = $2`,
      [uuid.parse(workspaceId), uuid.parse(softwareId)],
    );
    return result.rows[0] ? immutableClone(softwareFromRow(result.rows[0])) : undefined;
  }

  async listSoftware(
    workspaceId: string,
    filter: SoftwareInventoryFilter = {},
  ): Promise<readonly SoftwareRecord[]> {
    const parameters: unknown[] = [uuid.parse(workspaceId)];
    const conditions = ["software.workspace_id = $1"];
    if (filter.approvalState) {
      parameters.push(approvalStateSchema.parse(filter.approvalState));
      conditions.push(`software.approval_state = $${parameters.length}`);
    }
    const query = filter.query?.trim();
    if (query) {
      parameters.push(query);
      conditions.push(
        `strpos(lower(concat_ws(' ', software.name, software.vendor_name, details.authorized_tenant_url, details.district_owner)), lower($${parameters.length})) > 0`,
      );
    }
    const result = await this.#database.query<SoftwareInventoryRow>(
      `${softwareSelect}
       WHERE ${conditions.join(" AND ")}
       ORDER BY software.name, software.id`,
      parameters,
    );
    return immutableClone(result.rows.map(softwareFromRow));
  }
}
