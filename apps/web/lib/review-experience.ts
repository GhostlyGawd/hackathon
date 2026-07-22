export interface RequirementDecisionGate {
  readonly canReview: boolean;
  readonly citationViewed: boolean;
  readonly dataField: string;
  readonly action: string;
  readonly recipientRestriction: string;
  readonly suggestedObservableTest: string;
  readonly rationale: string;
}

export interface JourneyReviewGate {
  readonly canManage: boolean;
  readonly hasSoftware: boolean;
  readonly hasAgreement: boolean;
  readonly hasConfirmedRequirement: boolean;
  readonly hasActiveAuthorization: boolean;
  readonly hasPersona: boolean;
  readonly allowedActionCount: number;
  readonly fictionalSourceCount: number;
  readonly requiredCheckpointCount: number;
  readonly requiredVisibility: boolean;
  readonly name: string;
  readonly goal: string;
  readonly startState: string;
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

export function canSubmitRequirementDecision(
  gate: RequirementDecisionGate,
): boolean {
  return (
    gate.canReview &&
    gate.citationViewed &&
    hasText(gate.dataField) &&
    hasText(gate.action) &&
    hasText(gate.recipientRestriction) &&
    hasText(gate.suggestedObservableTest) &&
    hasText(gate.rationale)
  );
}

export function canSaveJourneyReview(gate: JourneyReviewGate): boolean {
  return (
    gate.canManage &&
    gate.hasSoftware &&
    gate.hasAgreement &&
    gate.hasConfirmedRequirement &&
    gate.hasActiveAuthorization &&
    gate.hasPersona &&
    gate.allowedActionCount > 0 &&
    gate.fictionalSourceCount > 0 &&
    gate.requiredCheckpointCount > 0 &&
    gate.requiredVisibility &&
    hasText(gate.name) &&
    hasText(gate.goal) &&
    hasText(gate.startState)
  );
}
