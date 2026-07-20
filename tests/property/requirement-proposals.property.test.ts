import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  parseOpenAIRequirementProposalResponse,
  validateRequirementProposalAttempt,
  type RequirementProposalModelAttempt,
} from "../../packages/core/src/requirement-proposals";
import {
  makeCompletedAttempt,
  makeProposalAgreement,
  makeProposalCandidate,
} from "../helpers/requirement-proposal-fixtures";

const propertyParameters = { seed: 20260719, numRuns: 250 } as const;

describe("PROP-AGR-02 unsupported model output isolation", () => {
  it("never materializes refused, incomplete, invalid, unrelated, mismatched, or provider-failed attempts", () => {
    const failureOutcome = fc.constantFrom(
      "REFUSED",
      "INCOMPLETE",
      "INVALID_OUTPUT",
      "UNRELATED",
      "MODEL_MISMATCH",
      "PROVIDER_ERROR",
    ) as fc.Arbitrary<RequirementProposalModelAttempt["outcome"]>;

    fc.assert(
      fc.property(failureOutcome, fc.string(), (outcome, sourceText) => {
        const attempt: RequirementProposalModelAttempt = {
          ...makeCompletedAttempt(),
          outcome,
          candidates: [makeProposalCandidate({ sourceText })],
          retryable: outcome === "INCOMPLETE" || outcome === "PROVIDER_ERROR",
          safeMessage: "No usable proposal was returned.",
          failureCode: outcome,
        };
        const result = validateRequirementProposalAttempt(
          makeProposalAgreement(),
          attempt,
        );
        expect(result.proposals).toEqual([]);
        expect(result.status).not.toBe("SUCCEEDED");
      }),
      propertyParameters,
    );
  });

  it("never materializes a completed proposal whose exact quote is absent", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 120 }).filter(
          (value) => !makeProposalAgreement().normalizedText.includes(value),
        ),
        (sourceText) => {
          const result = validateRequirementProposalAttempt(
            makeProposalAgreement(),
            makeCompletedAttempt({
              candidates: [makeProposalCandidate({ sourceText })],
            }),
          );
          expect(result).toMatchObject({
            status: "CITATION_MISMATCH",
            proposals: [],
          });
        },
      ),
      propertyParameters,
    );
  });

  it("rejects any strict-output proposal with a required field removed", () => {
    const requiredFields = [
      "plainLanguage",
      "sourceText",
      "pageNumber",
      "section",
      "dataField",
      "action",
      "recipientRestriction",
      "purposeRestriction",
      "ambiguity",
      "ambiguityReason",
      "suggestedObservableTest",
    ] as const;

    fc.assert(
      fc.property(fc.constantFrom(...requiredFields), (removedField) => {
        const proposal = { ...makeProposalCandidate() } as Record<string, unknown>;
        delete proposal[removedField];
        const response = {
          id: "resp_fictional_invalid",
          status: "completed",
          model: "gpt-5.6-sol",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    documentRelevant: true,
                    unrelatedReason: null,
                    proposals: [proposal],
                  }),
                },
              ],
            },
          ],
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            total_tokens: 2,
          },
        };
        expect(
          parseOpenAIRequirementProposalResponse(response, {
            requestedModel: "gpt-5.6-sol",
            latencyMs: 1,
          }),
        ).toMatchObject({ outcome: "INVALID_OUTPUT", candidates: [] });
      }),
      propertyParameters,
    );
  });
});
