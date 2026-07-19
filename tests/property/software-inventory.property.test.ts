import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  InMemorySoftwareInventoryRepository,
  approvalOriginSchema,
  describeApprovalOrigin,
  softwareRecordSchema,
} from "../../packages/core/src/inventory";

const seed = 20260719;
const workspaceId = "11111111-1111-4111-8111-111111111111";
const softwareId = "22222222-2222-4222-8222-222222222222";
const originId = "33333333-3333-4333-8333-333333333333";
const recordedAt = "2026-07-19T20:45:00.000Z";

function recordFor(
  state: "UNKNOWN" | "APPROVED" | "HOLD" | "REJECTED" | "RETIRED",
  kind: "HUMAN" | "IMPORTED_SYSTEM",
  name = "Northstar Classroom (Fictional)",
) {
  const setBy =
    kind === "HUMAN"
      ? {
          kind,
          actorId: "fictional-approver",
          displayName: "Dana Lopez (Fictional)",
        }
      : {
          kind,
          actorId: "fictional-district-registry",
          displayName: "Fictional Cedar Ridge App Registry",
          source: "district inventory export",
        };
  return {
    id: softwareId,
    workspaceId,
    name,
    vendorName: "Northstar Learning Labs (Fictional)",
    authorizedTenantUrl: "https://cedar.northstar.invalid",
    districtOwner: "Curriculum and Instruction",
    knownVersion: "2026.7-fixture",
    approvalState: state,
    approvalOrigin: {
      id: originId,
      workspaceId,
      softwareId,
      state,
      setBy,
      reason: "Recorded from the fictional district inventory.",
      sourceReference: "AP-2042",
      recordedBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
      recordedAt,
    },
    createdAt: recordedAt,
    createdBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
  } as const;
}

const humanOnlyState = fc.constantFrom("HOLD" as const, "RETIRED" as const);
const importableState = fc.constantFrom(
  "UNKNOWN" as const,
  "APPROVED" as const,
  "REJECTED" as const,
);

describe("software inventory properties", () => {
  it("PROP-01/02: no automated or model actor can originate any imported district state", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "UNKNOWN" as const,
          "APPROVED" as const,
          "HOLD" as const,
          "REJECTED" as const,
          "RETIRED" as const,
        ),
        fc.constantFrom("AUTOMATION" as const, "MODEL" as const),
        (state, kind) => {
          const candidate = {
            ...recordFor(state, "HUMAN").approvalOrigin,
            setBy:
              kind === "AUTOMATION"
                ? { kind, actorId: "pactwire", component: "inventory" }
                : { kind, actorId: "proposal", model: "gpt-5.6" },
          };
          expect(approvalOriginSchema.safeParse(candidate).success).toBe(false);
        },
      ),
      { seed, numRuns: 250 },
    );
  });

  it("PROP-01: every accepted status names a human or imported district system", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          humanOnlyState.map((state) => ({ state, kind: "HUMAN" as const })),
          importableState.chain((state) =>
            fc.constantFrom(
              { state, kind: "HUMAN" as const },
              { state, kind: "IMPORTED_SYSTEM" as const },
            ),
          ),
        ),
        ({ state, kind }) => {
          const record = softwareRecordSchema.parse(recordFor(state, kind));
          const description = describeApprovalOrigin(record.approvalOrigin);
          expect(["HUMAN", "IMPORTED_SYSTEM"]).toContain(
            record.approvalOrigin.setBy.kind,
          );
          expect(description.isPactwireConclusion).toBe(false);
          expect(description.heading).toMatch(/^(Set by|Imported from) /);
        },
      ),
      { seed, numRuns: 250 },
    );
  });

  it("PROP-11: stored origin provenance is append-only and immune to caller mutation", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[A-Za-z][A-Za-z0-9 -]{0,40}$/),
        async (name) => {
          const repository = new InMemorySoftwareInventoryRepository();
          const original = softwareRecordSchema.parse(
            recordFor("APPROVED", "IMPORTED_SYSTEM", name),
          );
          const audit = {
            eventId: "44444444-4444-4444-8444-444444444444",
            eventType: "AUDIT_RECORDED",
            workspaceId,
            subjectType: "software",
            subjectId: softwareId,
            action: "software.created",
            actor: { kind: "HUMAN", actorId: "fictional-officer-a" },
            occurredAt: recordedAt,
            details: { approvalState: "APPROVED" },
          } as const;

          await repository.createSoftwareWithAudit(original, audit);
          const first = await repository.readSoftware(workspaceId, softwareId);
          expect(first).toBeDefined();
          expect(Object.isFrozen(first)).toBe(true);
          expect(
            Reflect.set(
              first?.approvalOrigin.setBy ?? {},
              "actorId",
              "pactwire",
            ),
          ).toBe(false);
          await expect(
            repository.createSoftwareWithAudit(
              { ...original, name: `${name} changed` },
              audit,
            ),
          ).rejects.toThrow();
          const second = await repository.readSoftware(workspaceId, softwareId);
          expect(second).toEqual(original);
        },
      ),
      { seed, numRuns: 250 },
    );
  });
});
