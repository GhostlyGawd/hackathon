import { PDFDocument, StandardFonts } from "pdf-lib";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AgreementCorruptError,
  AgreementHashMismatchError,
  AgreementIntegrityError,
  AgreementIntakeService,
  FileSystemAgreementObjectStore,
  InMemoryAgreementObjectStore,
  PostgresAgreementIntakeRepository,
  hashAgreementBytes,
  type AgreementObjectStore,
} from "../../packages/core/src/agreement-intake";
import {
  PermissionDeniedError,
  PostgresWorkspaceAuthorizationRepository,
  WorkspaceAuthorizationService,
  WorkspaceUnavailableError,
} from "../../packages/core/src/authorization";
import {
  PostgresSoftwareInventoryRepository,
  SoftwareInventoryService,
} from "../../packages/core/src/inventory";
import { applyCoreMigrations } from "../../packages/core/src/migrations";
import {
  createDatabaseTestService,
  type DatabaseTestService,
} from "../../packages/testkit/src/index";

const databases: DatabaseTestService[] = [];
const objectStoreRoots: string[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
  await Promise.all(
    objectStoreRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

function ids(): () => string {
  let value = 1_500;
  return () => {
    value += 1;
    return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
  };
}

async function fixture() {
  const database = await createDatabaseTestService();
  databases.push(database);
  await applyCoreMigrations(database.database);
  const idFactory = ids();
  const authorizationRepository = new PostgresWorkspaceAuthorizationRepository(
    database.database,
  );
  const authorization = new WorkspaceAuthorizationService(
    authorizationRepository,
    { idFactory, now: () => "2026-07-20T02:00:00.000Z" },
  );
  const inventoryRepository = new PostgresSoftwareInventoryRepository(
    database.database,
  );
  const inventory = new SoftwareInventoryService(
    inventoryRepository,
    authorization,
    { idFactory, now: () => "2026-07-20T02:01:00.000Z" },
  );
  const creator = {
    userId: "fictional-privacy-officer",
    displayName: "Morgan Vale (Fictional)",
  };
  const workspace = await authorization.createWorkspace({
    principal: creator,
    name: "Fictional Cedar Ridge School District",
  });
  const principal = {
    ...creator,
    activeWorkspaceId: workspace.workspace.id,
  };
  const software = await inventory.createSoftware({
    principal,
    workspaceId: workspace.workspace.id,
    name: "Northstar Classroom (Fictional)",
    vendorName: "Northstar Learning Labs (Fictional)",
    authorizedTenantUrl: "https://cedar.northstar.invalid/classroom",
    districtOwner: "Curriculum and Instruction",
    approval: {
      state: "APPROVED",
      setBy: {
        kind: "IMPORTED_SYSTEM",
        actorId: "fictional-district-registry",
        displayName: "Fictional Cedar Ridge App Registry",
        source: "district inventory export",
      },
      reason: "Imported existing district approval record.",
      sourceReference: "AP-2042",
    },
  });
  const objectStore = new InMemoryAgreementObjectStore();
  const repository = new PostgresAgreementIntakeRepository(database.database);
  const service = new AgreementIntakeService(
    repository,
    objectStore,
    authorization,
    inventoryRepository,
    { idFactory, now: () => "2026-07-20T02:02:00.000Z" },
  );
  return {
    authorization,
    database,
    inventoryRepository,
    objectStore,
    principal,
    repository,
    service,
    softwareId: software.software.id,
    workspaceId: workspace.workspace.id,
  };
}

function uploadInput(context: Awaited<ReturnType<typeof fixture>>, bytes: Uint8Array) {
  return {
    principal: context.principal,
    workspaceId: context.workspaceId,
    softwareId: context.softwareId,
    fileName: "Northstar-DPA-fictional.txt",
    mimeType: "text/plain" as const,
    bytes,
    effectiveFrom: "2026-07-01",
    effectiveUntil: "2027-06-30",
  };
}

describe("immutable agreement intake", () => {
  it("persists content-addressed files and rejects at-rest corruption", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pactwire-agreement-store-"));
    objectStoreRoots.push(root);
    const store = new FileSystemAgreementObjectStore(root);
    const bytes = new TextEncoder().encode("Fictional agreement source.");
    const hash = hashAgreementBytes(bytes);
    const key = `agreements/sha256/${hash}.txt`;

    await expect(store.put(key, bytes)).resolves.toBeUndefined();
    await expect(store.get(key)).resolves.toEqual(bytes);
    await writeFile(path.join(root, "agreements", "sha256", `${hash}.txt`), "tampered");
    await expect(store.get(key)).rejects.toBeInstanceOf(AgreementIntegrityError);
  });

  it("stores exact bytes, reuses exact duplicates, versions byte changes, and preserves old versions", async () => {
    const context = await fixture();
    const versionOneBytes = new TextEncoder().encode(
      "Permitted use: rostering.\fRecipients: district-authorized subprocessors only.",
    );
    const versionTwoBytes = new TextEncoder().encode(
      "Permitted use: rostering.\fRecipients: district-authorized subprocessors only!",
    );

    const first = await context.service.uploadAgreement(
      uploadInput(context, versionOneBytes),
    );
    const duplicate = await context.service.uploadAgreement(
      uploadInput(context, versionOneBytes),
    );
    const second = await context.service.uploadAgreement(
      uploadInput(context, versionTwoBytes),
    );

    expect(first).toMatchObject({ duplicate: false, agreement: { version: 1 } });
    expect(duplicate).toMatchObject({
      duplicate: true,
      agreement: { id: first.agreement.id, version: 1 },
    });
    expect(second).toMatchObject({ duplicate: false, agreement: { version: 2 } });
    expect(second.agreement.sourceSha256).not.toBe(first.agreement.sourceSha256);
    expect(first.agreement).toMatchObject({
      sourceSha256: hashAgreementBytes(versionOneBytes),
      sourceByteLength: versionOneBytes.length,
      sourceFileName: "Northstar-DPA-fictional.txt",
      effectiveFrom: "2026-07-01",
      effectiveUntil: "2027-06-30",
      pageMap: [
        { pageNumber: 1, text: "Permitted use: rostering." },
        {
          pageNumber: 2,
          text: "Recipients: district-authorized subprocessors only.",
        },
      ],
      createdBy: { kind: "HUMAN", actorId: context.principal.userId },
    });
    const originalOne = await context.service.readOriginal({
      principal: context.principal,
      workspaceId: context.workspaceId,
      softwareId: context.softwareId,
      agreementVersionId: first.agreement.id,
    });
    expect(originalOne.bytes).toEqual(versionOneBytes);
    expect(originalOne.agreement.normalizedText.slice(
      originalOne.agreement.pageMap[1]!.startOffset,
      originalOne.agreement.pageMap[1]!.endOffset,
    )).toBe(originalOne.agreement.pageMap[1]!.text);
    await expect(context.service.listAgreements({
      principal: context.principal,
      workspaceId: context.workspaceId,
      softwareId: context.softwareId,
    }))
      .resolves.toMatchObject([{ version: 2 }, { version: 1 }]);
    await expect(
      context.database.database.query(
        "UPDATE agreement_versions SET source_file_name = 'changed.txt' WHERE workspace_id = $1 AND id = $2",
        [context.workspaceId, first.agreement.id],
      ),
    ).rejects.toThrow("immutable");
    await expect(
      context.database.database.query(
        "DELETE FROM agreement_versions WHERE workspace_id = $1 AND id = $2",
        [context.workspaceId, first.agreement.id],
      ),
    ).rejects.toThrow("immutable");
    const audits = await context.database.database.query<{
      readonly action: string;
      readonly details: unknown;
    }>(
      "SELECT action, details FROM audit_events WHERE workspace_id = $1 AND subject_type = 'agreement_version' ORDER BY occurred_at, id",
      [context.workspaceId],
    );
    expect(audits.rows.map((row) => row.action)).toEqual([
      "agreement.version_created",
      "agreement.duplicate_reused",
      "agreement.version_created",
    ]);
    expect(JSON.stringify(audits.rows)).not.toContain("Permitted use");
  });

  it("extracts independently verifiable page text from a real two-page PDF", async () => {
    const context = await fixture();
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    document.addPage().drawText("Purpose: classroom instruction only.", { font });
    document.addPage().drawText("Retention: delete after 30 days.", { font });
    const bytes = await document.save({ useObjectStreams: false });

    const result = await context.service.uploadAgreement({
      ...uploadInput(context, bytes),
      fileName: "Northstar-DPA-fictional.pdf",
      mimeType: "application/pdf",
    });

    expect(result.agreement.pageMap).toHaveLength(2);
    expect(result.agreement.pageMap[0]?.text).toContain(
      "Purpose: classroom instruction only.",
    );
    expect(result.agreement.pageMap[1]?.text).toContain(
      "Retention: delete after 30 days.",
    );
    await expect(context.service.readOriginal({
      principal: context.principal,
      workspaceId: context.workspaceId,
      softwareId: context.softwareId,
      agreementVersionId: result.agreement.id,
    })).resolves.toMatchObject({ bytes });
  });

  it("creates nothing for invalid input and detects corruption during every source read", async () => {
    const context = await fixture();
    const validBytes = new TextEncoder().encode("Fictional agreement source.");
    await expect(
      context.service.uploadAgreement({
        ...uploadInput(context, validBytes),
        expectedSha256: "a".repeat(64),
      }),
    ).rejects.toBeInstanceOf(AgreementHashMismatchError);
    await expect(
      context.service.uploadAgreement({
        ...uploadInput(context, new Uint8Array([0, 1, 2])),
        fileName: "broken.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toBeInstanceOf(AgreementCorruptError);
    await expect(context.service.listAgreements({
      principal: context.principal,
      workspaceId: context.workspaceId,
      softwareId: context.softwareId,
    }))
      .resolves.toEqual([]);

    const objects = new Map<string, Uint8Array>();
    const corruptibleStore: AgreementObjectStore = {
      put(key, value) {
        objects.set(key, value.slice());
        return Promise.resolve();
      },
      get(key) {
        return Promise.resolve(objects.get(key)?.slice());
      },
    };
    const service = new AgreementIntakeService(
      context.repository,
      corruptibleStore,
      context.authorization,
      context.inventoryRepository,
      { idFactory: ids(), now: () => "2026-07-20T02:03:00.000Z" },
    );
    const stored = await service.uploadAgreement(uploadInput(context, validBytes));
    objects.set(stored.agreement.sourceObjectKey, new TextEncoder().encode("tampered"));
    await expect(service.readOriginal({
      principal: context.principal,
      workspaceId: context.workspaceId,
      softwareId: context.softwareId,
      agreementVersionId: stored.agreement.id,
    })).rejects.toBeInstanceOf(AgreementIntegrityError);
  });

  it("permits reviewer reads, denies reviewer uploads, and hides other workspaces", async () => {
    const context = await fixture();
    const bytes = new TextEncoder().encode("Fictional agreement source.");
    await context.service.uploadAgreement(uploadInput(context, bytes));
    const reviewer = {
      userId: "fictional-reviewer",
      displayName: "Riley Chen (Fictional)",
      activeWorkspaceId: context.workspaceId,
    };
    await context.authorization.assignRole({
      principal: context.principal,
      workspaceId: context.workspaceId,
      targetUserId: reviewer.userId,
      role: "REVIEWER",
    });

    await expect(context.service.listAgreements({
      principal: reviewer,
      workspaceId: context.workspaceId,
      softwareId: context.softwareId,
    })).resolves.toHaveLength(1);
    await expect(context.service.uploadAgreement({
      ...uploadInput(context, bytes),
      principal: reviewer,
    })).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(context.service.listAgreements({
      principal: reviewer,
      workspaceId: "99999999-9999-4999-8999-999999999999",
      softwareId: context.softwareId,
    })).rejects.toBeInstanceOf(WorkspaceUnavailableError);
  });
});
