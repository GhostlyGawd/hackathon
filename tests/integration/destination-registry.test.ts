import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyCoreMigrations,
  DestinationEvidenceMismatchError,
  DestinationRegistryConflictError,
  DestinationRegistryService,
  InMemoryDestinationRegistryRepository,
  PostgresDestinationRegistryRepository,
  buildDestinationReviewVersion,
  computeDestinationVersionHash,
  type AgreementVersion,
} from "../../packages/core/src/index";
import {
  createDatabaseTestService,
  type DatabaseTestService,
} from "../../packages/testkit/src/index";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const softwareId = "22222222-2222-4222-8222-222222222222";
const agreementVersionId = "33333333-3333-4333-8333-333333333333";
const agreementText = [
  "Fictional Cedar Ridge destination schedule.",
  "classroom-service.pactwire.test is operated by Northstar Learning Systems (Fictional) and is an allowed instructional recipient.",
  "fixture-analytics.pactwire.test is operated by Signal Quarry Analytics (Fictional) and is a prohibited advertising recipient.",
].join("\n");
const agreementHash = createHash("sha256").update(agreementText).digest("hex");
const agreement: AgreementVersion = {
  id: agreementVersionId,
  workspaceId,
  softwareId,
  version: 1,
  sourceObjectKey: `agreements/sha256/${agreementHash}.txt`,
  sourceSha256: agreementHash,
  sourceMimeType: "text/plain",
  sourceFileName: "fictional-destination-schedule.txt",
  sourceByteLength: Buffer.byteLength(agreementText),
  normalizedText: agreementText,
  pageMap: [
    {
      pageNumber: 1,
      startOffset: 0,
      endOffset: agreementText.length,
      text: agreementText,
      textSha256: agreementHash,
    },
  ],
  createdAt: "2026-07-23T09:00:00.000Z",
  createdBy: { kind: "HUMAN", actorId: "fictional-officer" },
};
const principal = {
  userId: "fictional-officer",
  displayName: "Morgan Vale (Fictional)",
  activeWorkspaceId: workspaceId,
};
const databases: DatabaseTestService[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

function harness() {
  let sequence = 0;
  const auditEvents: unknown[] = [];
  const authorization = { checkPermission: vi.fn(() => Promise.resolve([])) };
  const agreements = { getAgreement: vi.fn(() => Promise.resolve(agreement)) };
  const repository = new InMemoryDestinationRegistryRepository({
    appendAuditEvent(event: unknown) {
      auditEvents.push(event);
      return Promise.resolve();
    },
  });
  const service = new DestinationRegistryService(repository, authorization, agreements, {
    idFactory: () =>
      `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    now: () => "2026-07-23T10:00:00.000Z",
  });
  return { auditEvents, authorization, agreements, repository, service };
}

const observation = {
  principal,
  workspaceId,
  hostname: "CLASSROOM-SERVICE.PACTWIRE.TEST.",
  observationSha256: createHash("sha256")
    .update("classroom destination observation")
    .digest("hex"),
  sourceTitle: "Captured request destination",
  sourceLocator: "run://fixture-run/observation/1",
};

const review = {
  principal,
  workspaceId,
  softwareId,
  agreementVersionId,
  entityId: "northstar-learning-fictional",
  entityName: "Northstar Learning Systems (Fictional)",
  classification: "ALLOWED" as const,
  mappingEvidence: {
    kind: "SIGNED_AGREEMENT" as const,
    title: "Fictional Cedar Ridge destination schedule",
    locator: "agreement://fictional-destination-schedule/page/1",
    sourceSha256: agreementHash,
    excerpt:
      "classroom-service.pactwire.test is operated by Northstar Learning Systems (Fictional)",
    pageNumber: 1,
  },
  agreementQuote:
    "classroom-service.pactwire.test is operated by Northstar Learning Systems (Fictional) and is an allowed instructional recipient.",
  agreementPageNumber: 1,
  rationale:
    "I verified the exact hostname, fictional entity, and recipient status in the stored signed agreement version.",
};

describe("destination registry service", () => {
  it("creates UNKNOWN on observation, then appends an authorized human review tied to exact evidence", async () => {
    const context = harness();
    const unknown = await context.service.observeDestination(observation);
    expect(unknown).toMatchObject({
      hostname: "classroom-service.pactwire.test",
      version: 1,
      ownership: { status: "UNKNOWN" },
      classifications: [],
    });

    const confirmed = await context.service.reviewDestination({
      ...review,
      recordId: unknown.recordId,
      sourceVersionId: unknown.id,
    });
    expect(context.authorization.checkPermission).toHaveBeenLastCalledWith({
      principal,
      workspaceId,
      permission: "DESTINATION_CONFIRM",
    });
    expect(context.agreements.getAgreement).toHaveBeenCalledWith({
      principal,
      workspaceId,
      softwareId,
      agreementVersionId,
    });
    expect(confirmed).toMatchObject({
      recordId: unknown.recordId,
      sourceVersionId: unknown.id,
      version: 2,
      ownership: {
        status: "CONFIRMED",
        entityId: review.entityId,
        entityName: review.entityName,
        confirmedBy: { kind: "HUMAN", actorId: principal.userId },
      },
      classifications: [
        {
          softwareId,
          agreementVersionId,
          status: "ALLOWED",
          reviewedBy: { kind: "HUMAN", actorId: principal.userId },
        },
      ],
    });
    await expect(
      context.service.resolveDestination({
        principal,
        workspaceId,
        hostname: observation.hostname,
        agreementVersionId,
      }),
    ).resolves.toMatchObject({
      status: "ALLOWED",
      entityId: review.entityId,
      agreementVersionId,
      humanConfirmed: true,
    });
    expect(context.auditEvents).toEqual([
      expect.objectContaining({ action: "destination.observed" }),
      expect.objectContaining({
        action: "destination.reviewed",
        actor: { kind: "HUMAN", actorId: principal.userId },
      }),
    ]);
  });

  it("rejects an agreement quote that is not present on the cited page", async () => {
    const context = harness();
    const unknown = await context.service.observeDestination(observation);
    await expect(
      context.service.reviewDestination({
        ...review,
        recordId: unknown.recordId,
        sourceVersionId: unknown.id,
        agreementQuote: "This invented quote is not in the signed source.",
      }),
    ).rejects.toBeInstanceOf(DestinationEvidenceMismatchError);
    await expect(
      context.service.resolveDestination({
        principal,
        workspaceId,
        hostname: observation.hostname,
        agreementVersionId,
      }),
    ).resolves.toMatchObject({ status: "UNKNOWN" });
  });

  it("serializes competing reviews so stale evidence cannot fork history", async () => {
    const context = harness();
    const unknown = await context.service.observeDestination(observation);
    const decisions = await Promise.allSettled([
      context.service.reviewDestination({
        ...review,
        recordId: unknown.recordId,
        sourceVersionId: unknown.id,
      }),
      context.service.reviewDestination({
        ...review,
        recordId: unknown.recordId,
        sourceVersionId: unknown.id,
        classification: "PROHIBITED",
      }),
    ]);
    expect(decisions.filter((decision) => decision.status === "fulfilled")).toHaveLength(1);
    const rejected = decisions.find((decision) => decision.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status !== "rejected") throw new Error("One review must lose");
    expect(rejected.reason).toBeInstanceOf(DestinationRegistryConflictError);
  });

  it("persists append-only PostgreSQL versions and immutable human lineage", async () => {
    const databaseService = await createDatabaseTestService();
    databases.push(databaseService);
    const database = databaseService.database;
    await applyCoreMigrations(database);
    await database.query(
      "INSERT INTO workspaces (id, name, created_at, created_by) VALUES ($1, 'Fictional District', now(), '{}')",
      [workspaceId],
    );
    await database.query(
      "INSERT INTO software_records (workspace_id, id, name, vendor_name, approval_state, approval_owner, created_at) VALUES ($1, $2, 'Fixture LMS', 'Fictional Vendor', 'UNKNOWN', 'NONE', now())",
      [workspaceId, softwareId],
    );
    await database.query(
      "INSERT INTO agreement_versions (workspace_id, id, software_id, version, source_object_key, source_sha256, source_mime_type, source_file_name, source_byte_length, normalized_text, page_map, created_at, created_by) VALUES ($1, $2, $3, 1, $4, $5, 'text/plain', 'fictional-destination-schedule.txt', $6, $7, $8, $9, $10)",
      [
        workspaceId,
        agreementVersionId,
        softwareId,
        agreement.sourceObjectKey,
        agreementHash,
        agreement.sourceByteLength,
        agreementText,
        agreement.pageMap,
        agreement.createdAt,
        agreement.createdBy,
      ],
    );
    const repository = new PostgresDestinationRegistryRepository(database);
    const context = harness();
    const unknown = await context.service.observeDestination(observation);
    await repository.appendVersion(unknown, {
      eventId: "77777777-7777-4777-8777-777777777777",
      eventType: "AUDIT_RECORDED",
      workspaceId,
      subjectType: "destination_version",
      subjectId: unknown.id,
      action: "destination.observed",
      actor: unknown.createdBy,
      occurredAt: unknown.createdAt,
      details: { hostname: unknown.hostname },
    });
    const confirmed = buildDestinationReviewVersion({
      id: "88888888-8888-4888-8888-888888888888",
      source: unknown,
      softwareId,
      agreementVersionId,
      entityId: review.entityId,
      entityName: review.entityName,
      classification: review.classification,
      mappingEvidence: {
        evidenceId: "99999999-9999-4999-8999-999999999999",
        ...review.mappingEvidence,
      },
      agreementEvidence: {
        evidenceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        title: agreement.sourceFileName,
        locator: `agreement://${agreementVersionId}/page/1`,
        sourceSha256: agreementHash,
        excerpt: review.agreementQuote,
        pageNumber: 1,
      },
      rationale: review.rationale,
      reviewedBy: { kind: "HUMAN", actorId: principal.userId },
      reviewedAt: "2026-07-23T10:01:00.000Z",
    });
    await repository.appendVersion(confirmed, {
      eventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      eventType: "AUDIT_RECORDED",
      workspaceId,
      subjectType: "destination_version",
      subjectId: confirmed.id,
      action: "destination.reviewed",
      actor: confirmed.createdBy,
      occurredAt: confirmed.createdAt,
      details: { sourceVersionId: unknown.id },
    });
    await expect(repository.listVersions(workspaceId, unknown.recordId)).resolves.toEqual([
      confirmed,
      unknown,
    ]);
    const forgedDraft = {
      ...confirmed,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      version: 3,
      sourceVersionId: confirmed.id,
      classifications: confirmed.classifications.map((classification) => ({
        ...classification,
        status: "PROHIBITED" as const,
      })),
      createdAt: "2026-07-23T10:02:00.000Z",
      createdBy: {
        kind: "AUTOMATION" as const,
        actorId: "forged-classifier",
        component: "untrusted-automation",
      },
    };
    const forged = {
      ...forgedDraft,
      versionHash: computeDestinationVersionHash(forgedDraft),
    };
    await expect(
      database.query(
        "INSERT INTO destination_record_versions (workspace_id, id, record_id, hostname, version, source_destination_version_id, ownership, classification, version_hash, payload, created_at, created_by) VALUES ($1, $2, $3, $4, 3, $5, 'CONFIRMED', 'PROHIBITED', $6, $7, $8, $9)",
        [
          workspaceId,
          forged.id,
          forged.recordId,
          forged.hostname,
          confirmed.id,
          forged.versionHash,
          forged,
          forged.createdAt,
          forged.createdBy,
        ],
      ),
    ).rejects.toThrow("Only a named human can change destination ownership or agreement status");
    await expect(
      database.query(
        "UPDATE destination_record_versions SET ownership = 'UNKNOWN' WHERE workspace_id = $1 AND id = $2",
        [workspaceId, confirmed.id],
      ),
    ).rejects.toThrow("immutable");
    await expect(
      database.query(
        "DELETE FROM destination_record_versions WHERE workspace_id = $1 AND id = $2",
        [workspaceId, confirmed.id],
      ),
    ).rejects.toThrow("immutable");
  });
});
