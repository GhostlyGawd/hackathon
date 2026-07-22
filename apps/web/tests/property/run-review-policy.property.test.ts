import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  deriveFindingReviewGate,
  type FindingReviewState,
} from "../../lib/run-review-policy";

const propertyOptions = { seed: 20_260_722, numRuns: 500 } as const;
const states = fc.constantFrom<FindingReviewState>(
  "WITNESSED_CONFLICT",
  "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS",
  "NOT_REOBSERVED_IN_NAMED_TESTS",
  "NOT_TESTED",
  "NOT_VISIBLE",
  "NEEDS_REVIEW",
);
const receiptStatuses = fc.constantFrom(
  "VALID" as const,
  "INVALID" as const,
  "MISSING" as const,
);
const nextDecision = fc.option(
  fc.stringMatching(/^[A-Za-z][A-Za-z0-9 .,;'-]{0,119}$/u),
  { nil: "" },
);

describe("UX-03 finding review policy properties", () => {
  it("PROP-04/PROP-21: no decision is enabled without complete scope, valid evidence, and a named next action", () => {
    fc.assert(
      fc.property(
        states,
        receiptStatuses,
        fc.boolean(),
        nextDecision,
        fc.boolean(),
        (
          findingState,
          receiptStatus,
          hasNamedScope,
          nextHumanDecision,
          canRestoreApproval,
        ) => {
          const gate = deriveFindingReviewGate({
            findingState,
            receiptStatus,
            hasNamedScope,
            nextHumanDecision,
            canRestoreApproval,
          });

          if (
            receiptStatus !== "VALID" ||
            !hasNamedScope ||
            nextHumanDecision.trim().length === 0
          ) {
            expect(gate.ready).toBe(false);
            expect(gate.action).toBe("RESOLVE_EVIDENCE_GAP");
          }
        },
      ),
      propertyOptions,
    );
  });

  it("PROP-03/PROP-11: uncertainty and missing authority never expose a status-changing action", () => {
    fc.assert(
      fc.property(states, fc.boolean(), (findingState, canRestoreApproval) => {
        const gate = deriveFindingReviewGate({
          findingState,
          receiptStatus: "VALID",
          hasNamedScope: true,
          nextHumanDecision: "A person reviews the bounded evidence next.",
          canRestoreApproval,
        });

        if (["NOT_TESTED", "NOT_VISIBLE", "NEEDS_REVIEW"].includes(findingState)) {
          expect(gate.action).toBe("RERUN_OR_RESOLVE_GAP");
        }
        if (!canRestoreApproval) {
          expect([
            "STATUS_DECISION",
            "SCOPED_RESTORE_REVIEW",
          ]).not.toContain(gate.action);
        }
      }),
      propertyOptions,
    );
  });
});
