import {
  buildDeterministicReplayVersion,
  buildJourneyVersion,
} from "../../packages/core/dist/index.js";

export const run04Ids = Object.freeze({
  workspace: "11111111-1111-4111-8111-111111111111",
  software: "22222222-2222-4222-8222-222222222222",
  agreement: "33333333-3333-4333-8333-333333333333",
  authorization: "44444444-4444-4444-8444-444444444444",
  journey: "55555555-5555-4555-8555-555555555555",
  journeyVersion: "66666666-6666-4666-8666-666666666666",
  persona: "77777777-7777-4777-8777-777777777777",
  requirement: "99999999-9999-4999-8999-999999999999",
  replay: "12121212-1212-4212-8212-121212121212",
  replayVersion: "13131313-1313-4313-8313-131313131313",
  repair: "23232323-2323-4323-8323-232323232323",
  verification: "24242424-2424-4424-8424-242424242424",
  promotedReplay: "25252525-2525-4525-8525-252525252525",
  promotion: "29292929-2929-4929-8929-292929292929",
});

export function run04StudentJourney() {
  return buildJourneyVersion({
    id: run04Ids.journeyVersion,
    workspaceId: run04Ids.workspace,
    softwareId: run04Ids.software,
    agreementVersionId: run04Ids.agreement,
    journeyId: run04Ids.journey,
    version: 1,
    sourceVersionId: null,
    draft: {
      name: "Submit a fictional classroom response",
      role: "STUDENT",
      goal: "Submit the unique fictional response to the seeded assignment.",
      startState: "Signed in to the fictional student workspace.",
      requirementVersionIds: [run04Ids.requirement],
      authorizationId: run04Ids.authorization,
      personaId: run04Ids.persona,
      testFields: [
        {
          fieldId: "student-email",
          sourceField: "email",
          requirementVersionId: run04Ids.requirement,
        },
        {
          fieldId: "student-response",
          sourceField: "submissionPhrase",
          requirementVersionId: run04Ids.requirement,
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
          requirementVersionIds: [run04Ids.requirement],
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
    },
    createdAt: "2026-07-21T10:05:00.000Z",
    createdBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
  });
}

export function run04SourceReplay() {
  return buildDeterministicReplayVersion({
    id: run04Ids.replayVersion,
    replayId: run04Ids.replay,
    version: 1,
    sourceVersionId: null,
    journey: run04StudentJourney(),
    runnerConfigVersion: "deterministic-replay-v1",
    draft: {
      bindings: [
        {
          bindingId: "student-email-value",
          journeyFieldId: "student-email",
        },
        {
          bindingId: "student-response-value",
          journeyFieldId: "student-response",
        },
      ],
      operations: [
        {
          operationId: "open-student-workspace",
          kind: "NAVIGATE",
          authorizedAction: "NAVIGATE",
          path: "/student",
          expectedStatus: 200,
        },
        {
          operationId: "check-student-email",
          kind: "ASSERT_VALUE",
          locator: { kind: "TEST_ID", value: "student-email" },
          bindingId: "student-email-value",
        },
        {
          operationId: "enter-student-response",
          kind: "FILL",
          authorizedAction: "SUBMIT",
          locator: { kind: "TEST_ID", value: "student-response" },
          bindingId: "student-response-value",
        },
        {
          operationId: "submit-student-response",
          kind: "CLICK",
          authorizedAction: "SUBMIT",
          locator: { kind: "TEST_ID", value: "submit-assignment" },
        },
        {
          operationId: "observe-submission-request",
          kind: "CHECKPOINT",
          checkpointId: "submission-request",
          assertion: {
            kind: "RESPONSE",
            method: "POST",
            path: "/api/submissions",
            status: 200,
          },
        },
        {
          operationId: "confirm-visible-completion",
          kind: "ASSERT_TEXT",
          locator: { kind: "TEST_ID", value: "student-result" },
          text: "Fictional submission completed",
        },
      ],
    },
    createdAt: "2026-07-21T10:10:00.000Z",
    createdBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
  });
}
