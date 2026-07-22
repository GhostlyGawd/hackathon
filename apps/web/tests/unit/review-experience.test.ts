import { describe, expect, it } from "vitest";
import {
  canSaveJourneyReview,
  canSubmitRequirementDecision,
} from "../../lib/review-experience";

const completeRequirementReview = {
  canReview: true,
  citationViewed: true,
  dataField: "student email",
  action: "Transmit",
  recipientRestriction: "district-authorized subprocessors only",
  suggestedObservableTest: "Observe the outbound assignment request.",
  rationale: "I checked the exact cited page against this test rule.",
} as const;

const completeJourneyReview = {
  canManage: true,
  hasSoftware: true,
  hasAgreement: true,
  hasConfirmedRequirement: true,
  hasActiveAuthorization: true,
  hasPersona: true,
  allowedActionCount: 2,
  fictionalSourceCount: 2,
  requiredCheckpointCount: 1,
  requiredVisibility: true,
  name: "Publish a fictional assignment",
  goal: "Publish an assignment using fictional class data.",
  startState: "Signed in to the fictional teacher workspace.",
} as const;

describe("UX-02 review action gates", () => {
  it("keeps every requirement decision disabled until the cited source page was opened", () => {
    expect(
      canSubmitRequirementDecision({
        ...completeRequirementReview,
        citationViewed: false,
      }),
    ).toBe(false);
    expect(canSubmitRequirementDecision(completeRequirementReview)).toBe(true);
  });

  it("does not present requirement decisions to a role without review authority", () => {
    expect(
      canSubmitRequirementDecision({
        ...completeRequirementReview,
        canReview: false,
      }),
    ).toBe(false);
  });

  it("keeps save disabled when a journey has no required visible checkpoint", () => {
    expect(
      canSaveJourneyReview({
        ...completeJourneyReview,
        requiredCheckpointCount: 0,
      }),
    ).toBe(false);
    expect(
      canSaveJourneyReview({
        ...completeJourneyReview,
        requiredVisibility: false,
      }),
    ).toBe(false);
    expect(canSaveJourneyReview(completeJourneyReview)).toBe(true);
  });

  it("does not present journey saving to a role without journey authority", () => {
    expect(
      canSaveJourneyReview({
        ...completeJourneyReview,
        canManage: false,
      }),
    ).toBe(false);
  });
});
