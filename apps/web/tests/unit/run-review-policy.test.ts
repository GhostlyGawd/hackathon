import { describe, expect, it } from "vitest";
import { deriveFindingReviewGate } from "../../lib/run-review-policy";

describe("UX-03 finding review policy", () => {
  it("blocks a witnessed-conflict decision until exact scope, valid receipt, and next human action exist", () => {
    expect(
      deriveFindingReviewGate({
        findingState: "WITNESSED_CONFLICT",
        receiptStatus: "MISSING",
        hasNamedScope: true,
        nextHumanDecision: "Keep the approval on hold or record a human decision.",
        canRestoreApproval: true,
      }),
    ).toMatchObject({
      ready: false,
      action: "RESOLVE_EVIDENCE_GAP",
      reason: "VALID_RECEIPT_REQUIRED",
    });

    expect(
      deriveFindingReviewGate({
        findingState: "WITNESSED_CONFLICT",
        receiptStatus: "VALID",
        hasNamedScope: true,
        nextHumanDecision: "Keep the approval on hold or record a human decision.",
        canRestoreApproval: true,
      }),
    ).toMatchObject({
      ready: true,
      action: "STATUS_DECISION",
      reason: "WITNESSED_CONFLICT_REVIEWABLE",
    });
  });

  it("never presents approval restoration as the meaning of a clean sampled run", () => {
    const gate = deriveFindingReviewGate({
      findingState: "NOT_REOBSERVED_IN_NAMED_TESTS",
      receiptStatus: "VALID",
      hasNamedScope: true,
      nextHumanDecision: "A person may review the named rerun.",
      canRestoreApproval: true,
    });

    expect(gate).toMatchObject({
      ready: true,
      action: "SCOPED_RESTORE_REVIEW",
    });
    expect(gate.message).toContain("does not restore approval");
  });
});
