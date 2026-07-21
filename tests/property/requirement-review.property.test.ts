import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildRequirementReviewVersion,
  type ProposedRequirementVersion,
  type RequirementProposalDetails,
} from "../../packages/core/src/index";
import { makeProposalCandidate } from "../helpers/requirement-proposal-fixtures";

const propertyOptions = { seed: 20_260_720, numRuns: 250 } as const;

function proposal(): ProposedRequirementVersion {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    agreementVersionId: "33333333-3333-4333-8333-333333333333",
    requirementKey: "recipient-rule",
    version: 1,
    modelRunId: "44444444-4444-4444-8444-444444444444",
    status: "PROPOSED",
    executable: false,
    plainLanguage: makeProposalCandidate().plainLanguage,
    details: makeProposalCandidate(),
    citation: {
      page: 1,
      startOffset: 31,
      endOffset: 66,
      quotedTextSha256:
        "bafd7017bdc7c5f679e224d65db753879ba4c92f400e71c1bbe77ba416f45926",
    },
    proposedBy: {
      kind: "AUTOMATION",
      actorId: "fixture-requirement-proposer",
      component: "deterministic-requirement-fixture",
    },
    createdAt: "2026-07-20T20:00:00.000Z",
  };
}

const editableField = fc.constantFrom<keyof RequirementProposalDetails>(
  "plainLanguage",
  "dataField",
  "action",
  "recipientRestriction",
  "suggestedObservableTest",
);

describe("requirement review properties", () => {
  it("PROP-10: every edit creates a linked version and preserves the source bytes", () => {
    fc.assert(
      fc.property(
        editableField,
        fc.string({ minLength: 1, maxLength: 80 }).filter((value) => value.trim().length > 0),
        (field, value) => {
          const source = proposal();
          const before = JSON.stringify(source);
          const reviewed = buildRequirementReviewVersion({
            id: "55555555-5555-4555-8555-555555555555",
            source,
            decision: "CONFIRM",
            executable: true,
            edits: { [field]: value },
            rationale: "Fictional privacy officer reviewed the exact source.",
            reviewedBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
            reviewedAt: "2026-07-20T20:01:00.000Z",
          });

          expect(JSON.stringify(source)).toBe(before);
          expect(reviewed.sourceVersionId).toBe(source.id);
          expect(reviewed.version).toBe(source.version + 1);
          expect(reviewed.changes).toContainEqual({
            field: `details.${field}`,
            oldValue: JSON.stringify(source.details[field]),
            newValue: JSON.stringify(reviewed.details[field]),
          });
        },
      ),
      propertyOptions,
    );
  });

  it("PROP-17: a non-confirm decision can never materialize an executable rule", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("REJECT" as const, "AMBIGUOUS" as const),
        fc.string({ minLength: 1, maxLength: 80 }).filter((value) => value.trim().length > 0),
        (decision, rationale) => {
          const reviewed = buildRequirementReviewVersion({
            id: "66666666-6666-4666-8666-666666666666",
            source: proposal(),
            decision,
            rationale,
            reviewedBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
            reviewedAt: "2026-07-20T20:02:00.000Z",
          });

          expect(reviewed.executable).toBe(false);
          expect(reviewed.status).not.toBe("CONFIRMED");
          expect("predicate" in reviewed).toBe(false);
        },
      ),
      propertyOptions,
    );
  });
});
