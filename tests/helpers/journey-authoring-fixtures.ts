import type {
  JourneyAuthoringDraft,
  Persona,
  ProposedRequirementVersion,
  TestAuthorization,
  WorkspacePrincipal,
} from "../../packages/core/src/index";
import { buildRequirementReviewVersion } from "../../packages/core/src/index";
import { makeProposalCandidate } from "./requirement-proposal-fixtures";

export const journeyFixtureIds = Object.freeze({
  workspace: "11111111-1111-4111-8111-111111111111",
  software: "22222222-2222-4222-8222-222222222222",
  agreement: "33333333-3333-4333-8333-333333333333",
  authorization: "44444444-4444-4444-8444-444444444444",
  journey: "55555555-5555-4555-8555-555555555555",
  versionOne: "66666666-6666-4666-8666-666666666666",
  versionTwo: "67676767-6767-4767-8767-676767676767",
  persona: "77777777-7777-4777-8777-777777777777",
  proposedRequirement: "88888888-8888-4888-8888-888888888888",
  confirmedRequirement: "99999999-9999-4999-8999-999999999999",
});

export const journeyPrincipal: WorkspacePrincipal = Object.freeze({
  userId: "fictional-officer-a",
  displayName: "Morgan Vale (Fictional)",
  activeWorkspaceId: journeyFixtureIds.workspace,
});

export function makeProposedRequirement(): ProposedRequirementVersion {
  return {
    id: journeyFixtureIds.proposedRequirement,
    workspaceId: journeyFixtureIds.workspace,
    agreementVersionId: journeyFixtureIds.agreement,
    requirementKey: "student-email-recipient",
    version: 1,
    modelRunId: "10101010-1010-4010-8010-101010101010",
    status: "PROPOSED",
    executable: false,
    plainLanguage: makeProposalCandidate().plainLanguage,
    details: makeProposalCandidate({
      plainLanguage:
        "Do not send the synthetic student email to fixture analytics.",
      dataField: "Synthetic student email",
      action: "Transmit",
      recipientRestriction: "Not fixture analytics",
      suggestedObservableTest:
        "Submit the unique fictional response and inspect the recipient request.",
    }),
    citation: {
      page: 2,
      startOffset: 31,
      endOffset: 93,
      quotedTextSha256:
        "bafd7017bdc7c5f679e224d65db753879ba4c92f400e71c1bbe77ba416f45926",
    },
    proposedBy: {
      kind: "AUTOMATION",
      actorId: "fixture-requirement-proposer",
      component: "deterministic-requirement-fixture",
    },
    createdAt: "2026-07-21T10:00:00.000Z",
  };
}

export function makeConfirmedRequirement() {
  const source = makeProposedRequirement();
  return buildRequirementReviewVersion({
    id: journeyFixtureIds.confirmedRequirement,
    source,
    decision: "CONFIRM",
    executable: true,
    rationale: "I checked this bounded rule against the exact fictional DPA.",
    reviewedBy: { kind: "HUMAN", actorId: journeyPrincipal.userId },
    reviewedAt: "2026-07-21T10:01:00.000Z",
  });
}

export function makeActiveAuthorization(
  overrides: Partial<TestAuthorization> = {},
): TestAuthorization {
  return {
    id: journeyFixtureIds.authorization,
    workspaceId: journeyFixtureIds.workspace,
    softwareId: journeyFixtureIds.software,
    version: 1,
    status: "ACTIVE",
    validFrom: "2026-07-21T09:00:00.000Z",
    reviewAt: "2026-07-25T09:00:00.000Z",
    expiresAt: "2026-08-01T09:00:00.000Z",
    authorityBasis: "Fictional district-controlled tenant",
    allowedBaseUrl: "https://classroom.pactwire.invalid",
    allowedDomains: ["classroom.pactwire.invalid"],
    allowedActions: ["NAVIGATE", "SUBMIT"],
    prohibitedActions: ["MESSAGE", "PURCHASE", "DELETE", "ADMINISTER"],
    redirectPolicy: "ALLOW_LISTED_ONLY",
    popupPolicy: "BLOCK_ALL",
    attestation: {
      authorityConfirmed: true,
      syntheticAccountsOnlyConfirmed: true,
      statement: "Only the fictional controlled tenant may be tested.",
    },
    attestedBy: { kind: "HUMAN", actorId: journeyPrincipal.userId },
    attestedAt: "2026-07-21T09:00:00.000Z",
    ...overrides,
  };
}

export function makeStudentPersona(
  overrides: Partial<Persona> = {},
): Persona {
  return {
    id: journeyFixtureIds.persona,
    workspaceId: journeyFixtureIds.workspace,
    role: "STUDENT",
    fictional: true,
    displayName: "Nova Reed (Fictional)",
    email: "nova.reed@student.pactwire.invalid",
    fields: {
      submissionPhrase: "Fictional response about Saturn",
    },
    fictionalConfirmation: {
      statementVersion: "fictional-only-v1",
      confirmedAt: "2026-07-21T09:30:00.000Z",
      confirmedBy: { kind: "HUMAN", actorId: journeyPrincipal.userId },
    },
    scanResult: {
      scannerVersion: "likely-real-v1",
      outcome: "CLEAR",
      findings: [],
    },
    createdAt: "2026-07-21T09:30:00.000Z",
    createdBy: { kind: "HUMAN", actorId: journeyPrincipal.userId },
    ...overrides,
  };
}

export function makeJourneyDraft(
  overrides: Partial<JourneyAuthoringDraft> = {},
): JourneyAuthoringDraft {
  return {
    name: "Submit a fictional classroom response",
    role: "STUDENT",
    goal: "Submit the unique fictional response to the seeded assignment.",
    startState: "Signed in to the fictional student workspace.",
    requirementVersionIds: [journeyFixtureIds.confirmedRequirement],
    authorizationId: journeyFixtureIds.authorization,
    personaId: journeyFixtureIds.persona,
    testFields: [
      {
        fieldId: "student-email",
        sourceField: "email",
        requirementVersionId: journeyFixtureIds.confirmedRequirement,
      },
      {
        fieldId: "student-response",
        sourceField: "submissionPhrase",
        requirementVersionId: journeyFixtureIds.confirmedRequirement,
      },
    ],
    allowedActions: ["NAVIGATE", "SUBMIT"],
    prohibitedActions: ["MESSAGE", "PURCHASE", "DELETE", "ADMINISTER"],
    checkpoints: [
      {
        checkpointId: "submission-request",
        required: true,
        description: "Observe the fictional submission request.",
        observationSource: "NETWORK",
        requiredVisibility: true,
        requirementVersionIds: [journeyFixtureIds.confirmedRequirement],
        testFieldIds: ["student-email", "student-response"],
      },
    ],
    steps: [
      {
        stepId: "open-assignment",
        instruction: "Open the seeded fictional assignment.",
        action: "NAVIGATE",
      },
      {
        stepId: "submit-response",
        instruction: "Submit the unique fictional response.",
        action: "SUBMIT",
      },
    ],
    ...overrides,
  };
}
