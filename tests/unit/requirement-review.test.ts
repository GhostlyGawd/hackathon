import { describe, expect, it } from "vitest";
import {
  buildRequirementReviewVersion,
  type ProposedRequirementVersion,
} from "../../packages/core/src/index";
import { makeProposalCandidate } from "../helpers/requirement-proposal-fixtures";

const proposal: ProposedRequirementVersion = {
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

const reviewer = {
  kind: "HUMAN" as const,
  actorId: "fictional-officer-a",
};

describe("human requirement review", () => {
  it("creates an executable confirmed version without mutating the proposal", () => {
    const before = structuredClone(proposal);

    const confirmed = buildRequirementReviewVersion({
      id: "55555555-5555-4555-8555-555555555555",
      source: proposal,
      decision: "CONFIRM",
      executable: true,
      edits: {
        action: "Transmit",
        suggestedObservableTest:
          "Submit the fictional email and record every destination receiving it.",
      },
      rationale:
        "I reviewed the cited source and confirmed this bounded test rule.",
      reviewedBy: reviewer,
      reviewedAt: "2026-07-20T20:01:00.000Z",
    });

    expect(proposal).toEqual(before);
    expect(confirmed).toMatchObject({
      id: "55555555-5555-4555-8555-555555555555",
      sourceVersionId: proposal.id,
      requirementKey: proposal.requirementKey,
      version: 2,
      status: "CONFIRMED",
      executable: true,
      plainLanguage: proposal.plainLanguage,
      details: { action: "Transmit", ambiguity: "CLEAR" },
      citation: proposal.citation,
      predicate: {
        kind: "OBSERVABLE_DATA_FLOW",
        action: "Transmit",
      },
      confirmedBy: reviewer,
      reviewRationale:
        "I reviewed the cited source and confirmed this bounded test rule.",
    });
    expect(confirmed.changes).toEqual(
      expect.arrayContaining([
        {
          field: "details.action",
          oldValue: JSON.stringify(proposal.details.action),
          newValue: JSON.stringify("Transmit"),
        },
        {
          field: "status",
          oldValue: JSON.stringify("PROPOSED"),
          newValue: JSON.stringify("CONFIRMED"),
        },
      ]),
    );
  });

  it("keeps ambiguous and rejected decisions visibly non-executable", () => {
    const ambiguous = buildRequirementReviewVersion({
      id: "66666666-6666-4666-8666-666666666666",
      source: proposal,
      decision: "AMBIGUOUS",
      rationale: "The recipient restriction needs qualified human judgment.",
      reviewedBy: reviewer,
      reviewedAt: "2026-07-20T20:02:00.000Z",
    });
    const rejected = buildRequirementReviewVersion({
      id: "77777777-7777-4777-8777-777777777777",
      source: proposal,
      decision: "REJECT",
      rationale: "This proposal does not describe the cited source accurately.",
      reviewedBy: reviewer,
      reviewedAt: "2026-07-20T20:03:00.000Z",
    });

    expect(ambiguous).toMatchObject({
      status: "AMBIGUOUS",
      executable: false,
      details: {
        ambiguity: "AMBIGUOUS",
        ambiguityReason:
          "The recipient restriction needs qualified human judgment.",
      },
    });
    expect(rejected).toMatchObject({
      status: "REJECTED",
      executable: false,
    });
    expect("predicate" in ambiguous).toBe(false);
    expect("predicate" in rejected).toBe(false);
  });

  it("records the canonical stored value for the shrunk leading-space counterexample", () => {
    const confirmed = buildRequirementReviewVersion({
      id: "78787878-7878-4878-8878-787878787878",
      source: proposal,
      decision: "CONFIRM",
      executable: true,
      edits: { plainLanguage: " !" },
      rationale: "Fictional privacy officer reviewed the exact source.",
      reviewedBy: reviewer,
      reviewedAt: "2026-07-20T20:03:30.000Z",
    });

    expect(confirmed.details.plainLanguage).toBe("!");
    expect(confirmed.changes).toContainEqual({
      field: "details.plainLanguage",
      oldValue: JSON.stringify(proposal.details.plainLanguage),
      newValue: JSON.stringify("!"),
    });
  });

  it("rejects model actors and executable confirmation of ambiguous details", () => {
    expect(() =>
      buildRequirementReviewVersion({
        id: "88888888-8888-4888-8888-888888888888",
        source: proposal,
        decision: "CONFIRM",
        executable: true,
        edits: {
          ambiguity: "AMBIGUOUS",
          ambiguityReason: "The agreement is unclear.",
        },
        rationale: "Invalid confirmation attempt.",
        reviewedBy: {
          kind: "MODEL",
          actorId: "gpt-5.6-sol",
          model: "gpt-5.6-sol",
        },
        reviewedAt: "2026-07-20T20:04:00.000Z",
      }),
    ).toThrow();
    expect(() =>
      buildRequirementReviewVersion({
        id: "99999999-9999-4999-8999-999999999999",
        source: proposal,
        decision: "CONFIRM",
        executable: true,
        edits: {
          ambiguity: "AMBIGUOUS",
          ambiguityReason: "The agreement is unclear.",
        },
        rationale: "Invalid confirmation attempt.",
        reviewedBy: reviewer,
        reviewedAt: "2026-07-20T20:04:00.000Z",
      }),
    ).toThrow("Ambiguous details cannot become an executable rule");
  });
});
