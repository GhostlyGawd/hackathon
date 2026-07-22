import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  evaluateEvidenceReleasePolicy,
  evidenceRetentionPolicySchema,
} from "../../packages/core/src/security-governance";

const propertyOptions = { seed: 20_260_722, numRuns: 500 } as const;

describe("SEC-01 security governance properties", () => {
  it("SEC-01: every external-public evidence release is denied", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("HUMAN", "AUTOMATION", "MODEL"),
        fc.boolean(),
        fc.array(fc.string(), { maxLength: 10 }),
        (actorKind, sanitized, permissions) => {
          expect(
            evaluateEvidenceReleasePolicy({
              actorKind,
              delivery: "EXTERNAL_PUBLIC",
              sanitized,
              permissions,
            }),
          ).toEqual({ decision: "DENY", reason: "PUBLICATION_NOT_SUPPORTED" });
        },
      ),
      propertyOptions,
    );
  });

  it("SEC-01: accepted retention periods are always bounded to 1 through 365 days", () => {
    fc.assert(
      fc.property(fc.integer(), (retentionDays) => {
        const result = evidenceRetentionPolicySchema.safeParse({
          workspaceId: "11111111-1111-4111-8111-111111111111",
          retentionDays,
          basis: "HUMAN_CONFIGURED",
          updatedAt: "2026-07-22T04:00:00.000Z",
          updatedBy: { kind: "HUMAN", actorId: "fictional-privacy-officer" },
        });
        expect(result.success).toBe(retentionDays >= 1 && retentionDays <= 365);
      }),
      propertyOptions,
    );
  });
});
