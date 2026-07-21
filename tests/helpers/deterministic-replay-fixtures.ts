import {
  buildJourneyVersion,
  type DeterministicReplayDraft,
  type JourneyVersion,
} from "../../packages/core/src/index";
import {
  buildDeterministicReplayVersion,
  type DeterministicReplayVersion,
} from "../../packages/core/src/deterministic-replay";
import {
  journeyFixtureIds,
  journeyPrincipal,
  makeJourneyDraft,
} from "./journey-authoring-fixtures";

export const replayFixtureIds = Object.freeze({
  replay: "12121212-1212-4212-8212-121212121212",
  versionOne: "13131313-1313-4313-8313-131313131313",
  versionTwo: "14141414-1414-4414-8414-141414141414",
});

export function makeReplayJourney(): JourneyVersion {
  return buildJourneyVersion({
    id: journeyFixtureIds.versionOne,
    workspaceId: journeyFixtureIds.workspace,
    softwareId: journeyFixtureIds.software,
    agreementVersionId: journeyFixtureIds.agreement,
    journeyId: journeyFixtureIds.journey,
    version: 1,
    sourceVersionId: null,
    draft: makeJourneyDraft(),
    createdAt: "2026-07-21T10:05:00.000Z",
    createdBy: { kind: "HUMAN", actorId: journeyPrincipal.userId },
  });
}

export function makeReplayDraft(
  overrides: Partial<DeterministicReplayDraft> = {},
): DeterministicReplayDraft {
  return {
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
    ...overrides,
  };
}

export function makeReplayVersion(
  overrides: Readonly<Record<string, unknown>> = {},
): DeterministicReplayVersion {
  const journey = makeReplayJourney();
  return buildDeterministicReplayVersion({
    id: replayFixtureIds.versionOne,
    replayId: replayFixtureIds.replay,
    version: 1,
    sourceVersionId: null,
    journey,
    runnerConfigVersion: "deterministic-replay-v1",
    draft: makeReplayDraft(),
    createdAt: "2026-07-21T10:10:00.000Z",
    createdBy: { kind: "HUMAN", actorId: journeyPrincipal.userId },
    ...overrides,
  });
}
