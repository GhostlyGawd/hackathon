import { describe, expect, it } from "vitest";
import {
  EvidenceReceiptContentDeletedError,
  EvidenceReceiptDeletionDeniedError,
  EvidenceReceiptService,
  InMemoryEvidenceObjectStore,
  InMemoryEvidenceReceiptRepository,
} from "../../packages/core/src/evidence-receipt";
import { makeEvidenceReceiptBundle } from "../helpers/evidence-receipt-fixtures";

describe("SEC-01 evidence retention and secure deletion", () => {
  it("stores immutable receipt metadata without duplicating retained artifact bytes", async () => {
    const repository = new InMemoryEvidenceReceiptRepository();
    const objectStore = new InMemoryEvidenceObjectStore();
    const service = new EvidenceReceiptService(repository, objectStore);
    const bundle = makeEvidenceReceiptBundle();

    await service.append(bundle);

    const stored = await repository.get(
      bundle.receipt.workspaceId,
      bundle.receipt.id,
    );
    expect(JSON.stringify(stored)).not.toContain("contentBase64");
    await expect(
      service.get(bundle.receipt.workspaceId, bundle.receipt.id),
    ).resolves.toEqual(bundle);
  });

  it("requires explicit human confirmation, securely deletes bytes, and preserves a tombstone", async () => {
    const repository = new InMemoryEvidenceReceiptRepository();
    const objectStore = new InMemoryEvidenceObjectStore();
    const service = new EvidenceReceiptService(repository, objectStore, {
      idFactory: () => "91919191-9191-4191-8191-919191919191",
    });
    const bundle = makeEvidenceReceiptBundle();
    await service.append(bundle);

    await expect(
      service.deleteRetainedContent({
        workspaceId: bundle.receipt.workspaceId,
        receiptId: bundle.receipt.id,
        confirmation: "DELETE THE WRONG RECEIPT",
        reason: "Fictional district retention request",
        requestedAt: "2026-08-22T04:00:00.000Z",
        requestedBy: { kind: "HUMAN", actorId: "fictional-privacy-officer" },
      }),
    ).rejects.toBeInstanceOf(EvidenceReceiptDeletionDeniedError);

    const deletion = await service.deleteRetainedContent({
      workspaceId: bundle.receipt.workspaceId,
      receiptId: bundle.receipt.id,
      confirmation: `DELETE ${bundle.receipt.id}`,
      reason: "Fictional district retention request",
      requestedAt: "2026-08-22T04:00:00.000Z",
      requestedBy: { kind: "HUMAN", actorId: "fictional-privacy-officer" },
    });

    expect(deletion).toMatchObject({
      status: "COMPLETED",
      workspaceId: bundle.receipt.workspaceId,
      receiptId: bundle.receipt.id,
      reason: "Fictional district retention request",
    });
    await expect(
      service.get(bundle.receipt.workspaceId, bundle.receipt.id),
    ).rejects.toBeInstanceOf(EvidenceReceiptContentDeletedError);
    for (const artifact of bundle.artifacts) {
      await expect(objectStore.get(artifact.sha256)).resolves.toBeUndefined();
    }
    const events = await repository.listDeletionEvents(
      bundle.receipt.workspaceId,
      bundle.receipt.id,
    );
    expect(events.map(({ status }) => status)).toEqual(["REQUESTED", "COMPLETED"]);

    await expect(
      service.deleteRetainedContent({
        workspaceId: bundle.receipt.workspaceId,
        receiptId: bundle.receipt.id,
        confirmation: `DELETE ${bundle.receipt.id}`,
        reason: "Fictional district retention request",
        requestedAt: "2026-08-22T04:00:00.000Z",
        requestedBy: { kind: "HUMAN", actorId: "fictional-privacy-officer" },
      }),
    ).resolves.toEqual(deletion);
  });

  it("uses the product default until a human configures a bounded policy and can purge expired content", async () => {
    const repository = new InMemoryEvidenceReceiptRepository();
    const objectStore = new InMemoryEvidenceObjectStore();
    const service = new EvidenceReceiptService(repository, objectStore);
    const bundle = makeEvidenceReceiptBundle();
    await service.append(bundle);

    await expect(
      service.getRetentionPolicy(bundle.receipt.workspaceId),
    ).resolves.toMatchObject({
      retentionDays: 30,
      basis: "PACTWIRE_PRODUCT_DEFAULT",
      updatedBy: { kind: "AUTOMATION" },
    });
    await expect(
      service.setRetentionPolicy({
        workspaceId: bundle.receipt.workspaceId,
        retentionDays: 45,
        updatedAt: "2026-07-22T04:00:00.000Z",
        updatedBy: { kind: "HUMAN", actorId: "fictional-privacy-officer" },
      }),
    ).resolves.toMatchObject({
      retentionDays: 45,
      basis: "HUMAN_CONFIGURED",
    });

    expect(
      await service.purgeExpiredContent({
        workspaceId: bundle.receipt.workspaceId,
        asOf: "2026-09-06T04:00:00.000Z",
        requestedBy: {
          kind: "AUTOMATION",
          actorId: "pactwire-retention-worker",
        },
      }),
    ).toHaveLength(1);
    await expect(
      service.get(bundle.receipt.workspaceId, bundle.receipt.id),
    ).rejects.toBeInstanceOf(EvidenceReceiptContentDeletedError);
  });
});
