import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  canSaveJourneyReview,
  canSubmitRequirementDecision,
  type JourneyReviewGate,
  type RequirementDecisionGate,
} from "../../apps/web/lib/review-experience";

const propertyOptions = { seed: 20_260_721, numRuns: 500 } as const;
const text = fc.string({ maxLength: 80 });

const requirementGate = fc.record<RequirementDecisionGate>({
  canReview: fc.boolean(),
  citationViewed: fc.boolean(),
  dataField: text,
  action: text,
  recipientRestriction: text,
  suggestedObservableTest: text,
  rationale: text,
});

const journeyGate = fc.record<JourneyReviewGate>({
  canManage: fc.boolean(),
  hasSoftware: fc.boolean(),
  hasAgreement: fc.boolean(),
  hasConfirmedRequirement: fc.boolean(),
  hasActiveAuthorization: fc.boolean(),
  hasPersona: fc.boolean(),
  allowedActionCount: fc.integer({ min: 0, max: 8 }),
  fictionalSourceCount: fc.integer({ min: 0, max: 8 }),
  requiredCheckpointCount: fc.integer({ min: 0, max: 8 }),
  requiredVisibility: fc.boolean(),
  name: text,
  goal: text,
  startState: text,
});

describe("UX-02 review gate properties", () => {
  it("PROP-17: an enabled decision always has authority, inspected source, and complete human input", () => {
    fc.assert(
      fc.property(requirementGate, (gate) => {
        if (!canSubmitRequirementDecision(gate)) return;

        expect(gate.canReview).toBe(true);
        expect(gate.citationViewed).toBe(true);
        expect(gate.dataField.trim()).not.toBe("");
        expect(gate.action.trim()).not.toBe("");
        expect(gate.recipientRestriction.trim()).not.toBe("");
        expect(gate.suggestedObservableTest.trim()).not.toBe("");
        expect(gate.rationale.trim()).not.toBe("");
      }),
      propertyOptions,
    );
  });

  it("PROP-25: an enabled journey save always has every runnable prerequisite and visible checkpoint", () => {
    fc.assert(
      fc.property(journeyGate, (gate) => {
        if (!canSaveJourneyReview(gate)) return;

        expect(gate.canManage).toBe(true);
        expect(gate.hasSoftware).toBe(true);
        expect(gate.hasAgreement).toBe(true);
        expect(gate.hasConfirmedRequirement).toBe(true);
        expect(gate.hasActiveAuthorization).toBe(true);
        expect(gate.hasPersona).toBe(true);
        expect(gate.allowedActionCount).toBeGreaterThan(0);
        expect(gate.fictionalSourceCount).toBeGreaterThan(0);
        expect(gate.requiredCheckpointCount).toBeGreaterThan(0);
        expect(gate.requiredVisibility).toBe(true);
        expect(gate.name.trim()).not.toBe("");
        expect(gate.goal.trim()).not.toBe("");
        expect(gate.startState.trim()).not.toBe("");
      }),
      propertyOptions,
    );
  });
});
