import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluateBoundedFinding } from "../../packages/core/src/finding-evaluation";
import { makeFindingEvaluationInput } from "../helpers/finding-evaluation-fixtures";

const propertyOptions = { seed: 20_260_721, numRuns: 500 } as const;
const gapKind = fc.constantFrom("NOT_TESTED" as const, "NOT_VISIBLE" as const);
const boundedWords = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ._-]{0,119}$/u);
const narrative = fc.record({
  model: fc.constantFrom("gpt-5.6-sol", "fixture-model", "untrusted-summary"),
  text: boundedWords,
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
});

describe("DET-03 bounded finding properties", () => {
  it("PROP-04: UNKNOWN destination ownership never produces a recipient conflict", () => {
    fc.assert(
      fc.property(narrative, (modelNarrative) => {
        const result = evaluateBoundedFinding(
          makeFindingEvaluationInput({
            destinationStatus: "UNKNOWN",
            modelNarrative,
          }),
        );

        expect(result.finding.state).not.toBe("WITNESSED_CONFLICT");
      }),
      propertyOptions,
    );
  });

  it("PROP-05: missing required coverage never produces a clean or not-reobserved result", () => {
    fc.assert(
      fc.property(gapKind, boundedWords, (status, reason) => {
        const result = evaluateBoundedFinding(
          makeFindingEvaluationInput({
            matcherStatus: "NO_MATCH",
            priorFindingId: "15151515-1515-4515-8515-151515151515",
            coverage: [
              { checkpointId: "student-submit-request", status: "VERIFIED" },
              { checkpointId: "submission-complete", status, reason },
            ],
          }),
        );

        expect([
          "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS",
          "NOT_REOBSERVED_IN_NAMED_TESTS",
        ]).not.toContain(result.finding.state);
      }),
      propertyOptions,
    );
  });

  it("PROP-07: model prose and confidence cannot change deterministic state or reasons", () => {
    fc.assert(
      fc.property(narrative, narrative, (leftNarrative, rightNarrative) => {
        const left = evaluateBoundedFinding(
          makeFindingEvaluationInput({
            destinationStatus: "PROHIBITED",
            modelNarrative: leftNarrative,
          }),
        );
        const right = evaluateBoundedFinding(
          makeFindingEvaluationInput({
            destinationStatus: "PROHIBITED",
            modelNarrative: rightNarrative,
          }),
        );

        expect(left.finding.state).toBe(right.finding.state);
        expect(left.reasonCodes).toEqual(right.reasonCodes);
        expect(left.deterministicBasis).toEqual(right.deterministicBasis);
      }),
      propertyOptions,
    );
  });

  it("PROP-21: a positive conflict remains limited to its observed path when unrelated coverage is partial", () => {
    fc.assert(
      fc.property(gapKind, boundedWords, (status, reason) => {
        const result = evaluateBoundedFinding(
          makeFindingEvaluationInput({
            destinationStatus: "PROHIBITED",
            coverage: [
              { checkpointId: "student-submit-request", status: "VERIFIED" },
              { checkpointId: "submission-complete", status, reason },
            ],
          }),
        );

        expect(result.finding.state).toBe("WITNESSED_CONFLICT");
        expect(result.scope.visiblePaths).toEqual([
          "Student submits the fictional response",
        ]);
        expect(result.scope.visiblePaths).not.toContain(
          "Student sees the fictional submission complete",
        );
      }),
      propertyOptions,
    );
  });
});
