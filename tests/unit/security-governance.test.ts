import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVIDENCE_RETENTION_DAYS,
  SECURITY_THREAT_CATALOG,
  buildSecurityThreatReport,
  evaluateEvidenceReleasePolicy,
  evidenceRetentionPolicySchema,
} from "../../packages/core/src/security-governance";

describe("SEC-01 deterministic security governance", () => {
  it("defines one bounded control entry for every PRD section 16 threat", () => {
    expect(SECURITY_THREAT_CATALOG).toHaveLength(11);
    expect(SECURITY_THREAT_CATALOG.map(({ id }) => id)).toEqual([
      "REAL_DATA_ENTRY",
      "PROMPT_INJECTION",
      "CREDENTIAL_LEAKAGE",
      "OUT_OF_SCOPE_EGRESS",
      "HARMFUL_AUTHORIZED_ACTION",
      "CROSS_WORKSPACE_LEAKAGE",
      "EVIDENCE_TAMPERING",
      "FALSE_DESTINATION_ATTRIBUTION",
      "INCOMPLETE_CAPTURE_ASSURANCE",
      "UNAUTHORIZED_PUBLICATION",
      "EXCESSIVE_EVIDENCE_RETENTION",
    ]);
    expect(new Set(SECURITY_THREAT_CATALOG.map(({ id }) => id)).size).toBe(11);
    expect(
      SECURITY_THREAT_CATALOG.every(
        ({ control, residualRisk }) => control.length > 0 && residualRisk.length > 0,
      ),
    ).toBe(true);
  });

  it("fails closed unless every catalog threat has exactly one passing result", () => {
    const passingResults = SECURITY_THREAT_CATALOG.map(({ id }) => ({
      threatId: id,
      status: "PASS" as const,
      evidence: [`tests/security/${id.toLowerCase()}`],
    }));

    expect(
      buildSecurityThreatReport({
        generatedAt: "2026-07-22T04:00:00.000Z",
        results: passingResults,
      }).status,
    ).toBe("PASS");
    expect(() =>
      buildSecurityThreatReport({
        generatedAt: "2026-07-22T04:00:00.000Z",
        results: passingResults.slice(1),
      }),
    ).toThrow(/exactly one result/iu);
    expect(
      buildSecurityThreatReport({
        generatedAt: "2026-07-22T04:00:00.000Z",
        results: passingResults.map((result, index) =>
          index === 0 ? { ...result, status: "FAIL" as const } : result,
        ),
      }).status,
    ).toBe("FAIL");
  });

  it("allows only sanitized private review by an authorized human", () => {
    expect(
      evaluateEvidenceReleasePolicy({
        actorKind: "HUMAN",
        delivery: "PRIVATE_REVIEW",
        sanitized: true,
        permissions: ["WORKSPACE_EXPORT", "EVIDENCE_REVIEW"],
      }),
    ).toEqual({ decision: "ALLOW", reason: "PRIVATE_REVIEW_AUTHORIZED" });
    expect(
      evaluateEvidenceReleasePolicy({
        actorKind: "HUMAN",
        delivery: "EXTERNAL_PUBLIC",
        sanitized: true,
        permissions: ["WORKSPACE_EXPORT", "EVIDENCE_REVIEW"],
      }),
    ).toEqual({ decision: "DENY", reason: "PUBLICATION_NOT_SUPPORTED" });
    expect(
      evaluateEvidenceReleasePolicy({
        actorKind: "MODEL",
        delivery: "PRIVATE_REVIEW",
        sanitized: true,
        permissions: ["WORKSPACE_EXPORT", "EVIDENCE_REVIEW"],
      }),
    ).toEqual({ decision: "DENY", reason: "HUMAN_REQUIRED" });
    expect(
      evaluateEvidenceReleasePolicy({
        actorKind: "HUMAN",
        delivery: "PRIVATE_REVIEW",
        sanitized: false,
        permissions: ["WORKSPACE_EXPORT", "EVIDENCE_REVIEW"],
      }),
    ).toEqual({ decision: "DENY", reason: "UNSANITIZED_EVIDENCE" });
  });

  it("uses a bounded 30-day product default without presenting it as a legal rule", () => {
    expect(DEFAULT_EVIDENCE_RETENTION_DAYS).toBe(30);
    expect(
      evidenceRetentionPolicySchema.parse({
        workspaceId: "11111111-1111-4111-8111-111111111111",
        retentionDays: DEFAULT_EVIDENCE_RETENTION_DAYS,
        basis: "PACTWIRE_PRODUCT_DEFAULT",
        updatedAt: "2026-07-22T04:00:00.000Z",
        updatedBy: {
          kind: "AUTOMATION",
          actorId: "pactwire-product-default",
        },
      }).retentionDays,
    ).toBe(30);
    expect(() =>
      evidenceRetentionPolicySchema.parse({
        workspaceId: "11111111-1111-4111-8111-111111111111",
        retentionDays: 0,
        basis: "PACTWIRE_PRODUCT_DEFAULT",
        updatedAt: "2026-07-22T04:00:00.000Z",
        updatedBy: {
          kind: "AUTOMATION",
          actorId: "pactwire-product-default",
        },
      }),
    ).toThrow();
  });
});
