import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EvidenceReceiptConflictError,
  EvidenceReceiptService,
  FileSystemEvidenceObjectStore,
  InMemoryEvidenceReceiptRepository,
  serializeEvidenceReceiptBundle,
  verifyEvidenceReceiptBundle,
} from "../../packages/core/src/evidence-receipt";
import {
  makeEvidenceReceiptBundle,
  receiptFixtureIds,
} from "../helpers/evidence-receipt-fixtures";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("DET-04 receipt persistence and independent export", () => {
  it("stores immutable receipt metadata and content-addressed artifacts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pactwire-det04-"));
    temporaryDirectories.push(root);
    const repository = new InMemoryEvidenceReceiptRepository();
    const objectStore = new FileSystemEvidenceObjectStore(
      root,
      Buffer.alloc(32, 7),
    );
    const service = new EvidenceReceiptService(repository, objectStore);
    const bundle = makeEvidenceReceiptBundle();

    await service.append(bundle);

    await expect(
      service.get(bundle.receipt.workspaceId, bundle.receipt.id),
    ).resolves.toEqual(bundle);
    for (const artifact of bundle.artifacts) {
      const stored = await readFile(
        path.join(root, "sha256", artifact.sha256.slice(0, 2), artifact.sha256),
      );
      expect(stored.toString("base64")).not.toBe(artifact.contentBase64);
      expect(stored.includes(Buffer.from(artifact.contentBase64, "base64"))).toBe(
        false,
      );
      await expect(objectStore.get(artifact.sha256)).resolves.toEqual(
        new Uint8Array(Buffer.from(artifact.contentBase64, "base64")),
      );
    }
    await expect(service.append(bundle)).rejects.toBeInstanceOf(
      EvidenceReceiptConflictError,
    );
  });

  it("exports a standalone bundle that verifies without repository access", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pactwire-det04-"));
    temporaryDirectories.push(root);
    const service = new EvidenceReceiptService(
      new InMemoryEvidenceReceiptRepository(),
      new FileSystemEvidenceObjectStore(root, Buffer.alloc(32, 8)),
    );
    const bundle = makeEvidenceReceiptBundle();
    await service.append(bundle);

    const exported = await service.exportSanitizedBundle(
      bundle.receipt.workspaceId,
      bundle.receipt.id,
    );

    expect(exported).toBe(serializeEvidenceReceiptBundle(bundle));
    expect(verifyEvidenceReceiptBundle(JSON.parse(exported))).toMatchObject({
      receiptId: receiptFixtureIds.receipt,
      status: "VALID",
    });
  });

  it("appends a linked correction while preserving the first receipt byte-for-byte", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pactwire-det04-"));
    temporaryDirectories.push(root);
    const service = new EvidenceReceiptService(
      new InMemoryEvidenceReceiptRepository(),
      new FileSystemEvidenceObjectStore(root, Buffer.alloc(32, 9)),
    );
    const original = makeEvidenceReceiptBundle();
    const originalBytes = serializeEvidenceReceiptBundle(original);
    const correction = makeEvidenceReceiptBundle({ correction: true });

    await service.append(original);
    await service.append(correction);

    await expect(
      service.exportSanitizedBundle(original.receipt.workspaceId, original.receipt.id),
    ).resolves.toBe(originalBytes);
    await expect(
      service.listForFinding(original.receipt.workspaceId, original.receipt.findingId),
    ).resolves.toEqual([original, correction]);
  });
});
