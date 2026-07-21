import { describe, expect, it } from "vitest";
import {
  FINDING_STATE_COPY,
  evaluateBoundedFinding,
} from "../../packages/core/src/finding-evaluation";
import {
  findingFixtureIds,
  makeFindingEvaluationInput,
} from "../helpers/finding-evaluation-fixtures";

describe("DET-03 bounded finding decision table", () => {
  it.each([
    {
      name: "allowed observed flow",
      input: makeFindingEvaluationInput(),
      state: "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS",
      reason: "NO_CONFLICT_IN_COMPLETE_NAMED_SCOPE",
    },
    {
      name: "prohibited observed flow",
      input: makeFindingEvaluationInput({ destinationStatus: "PROHIBITED" }),
      state: "WITNESSED_CONFLICT",
      reason: "CONFIRMED_PROHIBITED_FLOW_WITNESSED",
    },
    {
      name: "repaired rerun",
      input: makeFindingEvaluationInput({
        matcherStatus: "NO_MATCH",
        priorFindingId: findingFixtureIds.priorFinding,
      }),
      state: "NOT_REOBSERVED_IN_NAMED_TESTS",
      reason: "PRIOR_CONFLICT_NOT_REOBSERVED_IN_COMPLETE_SCOPE",
    },
    {
      name: "unexercised required path",
      input: makeFindingEvaluationInput({
        coverage: [
          { checkpointId: "student-submit-request", status: "VERIFIED" },
          {
            checkpointId: "submission-complete",
            status: "NOT_TESTED",
            reason: "The worker stopped before the visible completion state.",
          },
        ],
      }),
      state: "NOT_TESTED",
      reason: "REQUIRED_PATH_NOT_EXERCISED",
    },
    {
      name: "invisible required path",
      input: makeFindingEvaluationInput({
        coverage: [
          { checkpointId: "student-submit-request", status: "VERIFIED" },
          {
            checkpointId: "submission-complete",
            status: "NOT_VISIBLE",
            reason: "The recorder lost the required completion signal.",
          },
        ],
      }),
      state: "NOT_VISIBLE",
      reason: "REQUIRED_EVIDENCE_NOT_VISIBLE",
    },
    {
      name: "unsupported transform and unknown destination",
      input: makeFindingEvaluationInput({
        matcherStatus: "UNSUPPORTED_TRANSFORM",
        destinationStatus: "UNKNOWN",
      }),
      state: "NEEDS_REVIEW",
      reason: "TRANSFORM_NOT_ENUMERATED",
    },
  ] as const)("selects one bounded state for $name", ({ input, state, reason }) => {
    const result = evaluateBoundedFinding(input);

    expect(result.finding.state).toBe(state);
    expect(result.reasonCodes).toContain(reason);
    expect(result.scope).toMatchObject({
      softwareId: input.runManifest.softwareId,
      softwareVersion: "fictional-classroom-v1",
      agreementVersionId: input.requirement.agreementVersionId,
      requirementVersionId: input.requirement.id,
      role: "STUDENT",
      journeyName: "Student submits fictional assignment",
      fields: ["email"],
    });
    expect(result.scope.limitations.length).toBeGreaterThan(0);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("never promotes unknown destination ownership to a recipient conflict", () => {
    const result = evaluateBoundedFinding(
      makeFindingEvaluationInput({ destinationStatus: "UNKNOWN" }),
    );

    expect(result.finding.state).toBe("NEEDS_REVIEW");
    expect(result.reasonCodes).toContain("DESTINATION_OWNERSHIP_UNKNOWN");
    expect(result.finding.state).not.toBe("WITNESSED_CONFLICT");
  });

  it("routes every uncertainty class in the decision table to review", () => {
    const base = makeFindingEvaluationInput();
    const proposed = {
      id: base.requirement.id,
      workspaceId: base.requirement.workspaceId,
      agreementVersionId: base.requirement.agreementVersionId,
      requirementKey: base.requirement.requirementKey,
      version: 1,
      modelRunId: "20202020-2020-4020-8020-202020202020",
      status: "PROPOSED" as const,
      executable: false as const,
      plainLanguage: base.requirement.plainLanguage,
      details: base.requirement.details,
      citation: base.requirement.citation,
      proposedBy: {
        kind: "MODEL" as const,
        actorId: "fictional-requirement-proposer",
        model: "gpt-5.6-sol",
      },
      createdAt: base.requirement.createdAt,
    };
    const cases = [
      {
        input: { ...base, requirement: proposed },
        reason: "RULE_NOT_HUMAN_CONFIRMED",
      },
      {
        input: makeFindingEvaluationInput({ matcherStatus: "COLLISION" }),
        reason: "MULTIPLE_CANARY_MATCHES",
      },
      {
        input: makeFindingEvaluationInput({
          scopeOverrides: {
            checkpointPaths: [
              {
                checkpointId: "student-submit-request",
                path: "Student submits the fictional response",
              },
            ],
          },
        }),
        reason: "EVIDENCE_LINEAGE_INCOMPLETE",
      },
      {
        input: {
          ...base,
          requirement: {
            ...base.requirement,
            details: {
              ...base.requirement.details,
              purposeRestriction: "Instructional delivery only",
            },
            predicate: {
              ...base.requirement.predicate,
              purposeRestriction: "Instructional delivery only",
            },
          },
        },
        reason: "PURPOSE_REQUIRES_HUMAN_REVIEW",
      },
    ] as const;

    for (const { input, reason } of cases) {
      const result = evaluateBoundedFinding(input);
      expect(result.finding.state).toBe("NEEDS_REVIEW");
      expect(result.reasonCodes).toContain(reason);
    }
  });

  it("keeps a witnessed conflict bounded when an unrelated required path is untested", () => {
    const result = evaluateBoundedFinding(
      makeFindingEvaluationInput({
        destinationStatus: "PROHIBITED",
        coverage: [
          { checkpointId: "student-submit-request", status: "VERIFIED" },
          {
            checkpointId: "submission-complete",
            status: "NOT_TESTED",
            reason: "The confirmation view was not exercised.",
          },
        ],
      }),
    );

    expect(result.finding.state).toBe("WITNESSED_CONFLICT");
    expect(result.scope.visiblePaths).toEqual([
      "Student submits the fictional response",
    ]);
    expect(result.scope.untestedPaths).toEqual([
      "Student sees the fictional submission complete",
    ]);
    expect(result.scope.limitations.join(" ")).toMatch(/not exercised|named/iu);
  });

  it("uses direct bounded labels and never labels a finding pass, safe, compliant, or approved", () => {
    const rendered = Object.values(FINDING_STATE_COPY)
      .flatMap(({ label, meaning }) => [label, meaning])
      .join(" ");

    expect(rendered).not.toMatch(/\b(pass|safe|compliant|approved)\b/iu);
    expect(FINDING_STATE_COPY.WITNESSED_CONFLICT.label).toBe(
      "Recorded conflict in this named test",
    );
    expect(
      FINDING_STATE_COPY.NO_CONFLICT_OBSERVED_IN_NAMED_TESTS.meaning,
    ).toContain("Other behavior was not assessed");
  });

  it("preserves whitespace-only shrunk inputs as rejected example regressions", () => {
    expect(() =>
      evaluateBoundedFinding({
        ...makeFindingEvaluationInput(),
        modelNarrative: {
          model: "fixture-model",
          text: " ",
          confidence: 0,
        },
      }),
    ).toThrow();
    expect(() =>
      makeFindingEvaluationInput({
        coverage: [
          { checkpointId: "student-submit-request", status: "VERIFIED" },
          {
            checkpointId: "submission-complete",
            status: "NOT_TESTED",
            reason: " ",
          },
        ],
      }),
    ).toThrow();
  });
});
