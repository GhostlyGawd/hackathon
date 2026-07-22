export type FindingReviewState =
  | "WITNESSED_CONFLICT"
  | "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS"
  | "NOT_REOBSERVED_IN_NAMED_TESTS"
  | "NOT_TESTED"
  | "NOT_VISIBLE"
  | "NEEDS_REVIEW";

export type FindingReviewAction =
  | "RESOLVE_EVIDENCE_GAP"
  | "RERUN_OR_RESOLVE_GAP"
  | "READ_ONLY_REVIEW"
  | "STATUS_DECISION"
  | "SCOPED_RESTORE_REVIEW"
  | "NO_STATUS_CHANGE";

export interface FindingReviewGate {
  readonly ready: boolean;
  readonly action: FindingReviewAction;
  readonly reason: string;
  readonly message: string;
}

export function deriveFindingReviewGate(input: {
  readonly findingState: FindingReviewState;
  readonly receiptStatus: "VALID" | "INVALID" | "MISSING";
  readonly hasNamedScope: boolean;
  readonly nextHumanDecision: string;
  readonly canRestoreApproval: boolean;
}): FindingReviewGate {
  if (!input.hasNamedScope) {
    return {
      ready: false,
      action: "RESOLVE_EVIDENCE_GAP",
      reason: "NAMED_TEST_SCOPE_REQUIRED",
      message:
        "Decision controls stay unavailable until the exact tested and untested scope is present.",
    };
  }
  if (input.receiptStatus !== "VALID") {
    return {
      ready: false,
      action: "RESOLVE_EVIDENCE_GAP",
      reason: "VALID_RECEIPT_REQUIRED",
      message:
        input.receiptStatus === "INVALID"
          ? "The receipt failed independent verification. Resolve the integrity problem before making a decision."
          : "A finalized evidence receipt is required before making a decision.",
    };
  }
  if (input.nextHumanDecision.trim().length === 0) {
    return {
      ready: false,
      action: "RESOLVE_EVIDENCE_GAP",
      reason: "NEXT_HUMAN_ACTION_REQUIRED",
      message:
        "The evidence must name what a person decides next before decision controls become available.",
    };
  }

  if (["NOT_TESTED", "NOT_VISIBLE", "NEEDS_REVIEW"].includes(input.findingState)) {
    return {
      ready: true,
      action: "RERUN_OR_RESOLVE_GAP",
      reason: "UNCERTAINTY_REQUIRES_MORE_EVIDENCE",
      message:
        "This is an evidence gap, not a pass. Resolve the visibility or test gap and run the named journey again.",
    };
  }
  if (!input.canRestoreApproval) {
    return {
      ready: true,
      action: "READ_ONLY_REVIEW",
      reason: "HUMAN_APPROVER_REQUIRED",
      message:
        "You can inspect and export this evidence. An authorized human approver must record any status decision.",
    };
  }
  if (input.findingState === "WITNESSED_CONFLICT") {
    return {
      ready: true,
      action: "STATUS_DECISION",
      reason: "WITNESSED_CONFLICT_REVIEWABLE",
      message:
        "Review the exact receipt, then keep the hold, reject the software, or retire it with a signed reason.",
    };
  }
  if (input.findingState === "NOT_REOBSERVED_IN_NAMED_TESTS") {
    return {
      ready: true,
      action: "SCOPED_RESTORE_REVIEW",
      reason: "NAMED_RERUN_REVIEWABLE",
      message:
        "This sampled rerun does not restore approval. An authorized person may separately sign a decision limited to the named tests.",
    };
  }
  return {
    ready: true,
    action: "NO_STATUS_CHANGE",
    reason: "CLEAN_NAMED_TEST_IS_BOUNDED",
    message:
      "No conflict was observed in these named tests. That result does not change approval or make a safety or compliance claim.",
  };
}
