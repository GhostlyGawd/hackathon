import { describe, expect, it } from "vitest";
import {
  approvalOriginSchema,
  describeApprovalOrigin,
  softwareInventoryItemSchema,
  softwareRecordSchema,
} from "../../packages/core/src/inventory";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const softwareId = "22222222-2222-4222-8222-222222222222";
const originId = "33333333-3333-4333-8333-333333333333";
const recordedAt = "2026-07-19T20:45:00.000Z";

const importedOrigin = {
  id: originId,
  workspaceId,
  softwareId,
  state: "APPROVED",
  setBy: {
    kind: "IMPORTED_SYSTEM",
    actorId: "fictional-district-registry",
    displayName: "Fictional Cedar Ridge App Registry",
    source: "district inventory export",
  },
  reason: "Imported existing district approval record.",
  sourceReference: "AP-2042",
  recordedBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
  recordedAt,
} as const;

const importedRecord = {
  id: softwareId,
  workspaceId,
  name: "Northstar Classroom (Fictional)",
  vendorName: "Northstar Learning Labs (Fictional)",
  authorizedTenantUrl: "https://cedar.northstar.invalid",
  districtOwner: "Curriculum and Instruction",
  knownVersion: "2026.7-fixture",
  approvalState: "APPROVED",
  approvalOrigin: importedOrigin,
  createdAt: recordedAt,
  createdBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
} as const;

describe("software inventory contracts", () => {
  it("preserves the district source behind an imported APPROVED record", () => {
    const parsed = softwareRecordSchema.parse(importedRecord);
    const description = describeApprovalOrigin(parsed.approvalOrigin);

    expect(parsed.approvalOrigin.setBy).toMatchObject({
      kind: "IMPORTED_SYSTEM",
      actorId: "fictional-district-registry",
      displayName: "Fictional Cedar Ridge App Registry",
    });
    expect(description).toEqual({
      heading: "Imported from Fictional Cedar Ridge App Registry",
      detail: "District record AP-2042 · recorded by fictional-officer-a",
      isPactwireConclusion: false,
    });
  });

  it("rejects automation, model output, and state/source contradictions", () => {
    const automated = {
      ...importedOrigin,
      setBy: {
        kind: "AUTOMATION",
        actorId: "pactwire",
        component: "inventory-import",
      },
    };
    const model = {
      ...importedOrigin,
      setBy: {
        kind: "MODEL",
        actorId: "proposal-1",
        model: "gpt-5.6",
      },
    };
    const contradictory = {
      ...importedRecord,
      approvalState: "HOLD",
    };

    expect(approvalOriginSchema.safeParse(automated).success).toBe(false);
    expect(approvalOriginSchema.safeParse(model).success).toBe(false);
    expect(softwareRecordSchema.safeParse(contradictory).success).toBe(false);
  });

  it("requires an HTTPS tenant without credentials and a named district owner", () => {
    expect(
      softwareRecordSchema.safeParse({
        ...importedRecord,
        authorizedTenantUrl: "http://cedar.northstar.invalid",
      }).success,
    ).toBe(false);
    expect(
      softwareRecordSchema.safeParse({
        ...importedRecord,
        authorizedTenantUrl:
          "https://fictional-user:fictional-password@cedar.northstar.invalid",
      }).success,
    ).toBe(false);
    expect(
      softwareRecordSchema.safeParse({
        ...importedRecord,
        districtOwner: "   ",
      }).success,
    ).toBe(false);
  });

  it("uses bounded language when no named test has run", () => {
    const item = softwareInventoryItemSchema.parse({
      software: importedRecord,
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

    expect(item.latestRun).toBeNull();
    expect(item.nextSafeAction.label).toBe(
      "Define test authorization and scope",
    );
  });
});
