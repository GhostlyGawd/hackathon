import type {
  DeterministicReplayDraft,
  JourneyRepairDraft,
  JourneyRepairVerification,
} from "../../packages/core/src/index";
import {
  buildJourneyRepairDraft,
  buildJourneyRepairVerification,
  computeJourneyRepairHash,
  journeyRepairDraftSchema,
} from "../../packages/core/src/journey-repair";
import {
  makeReplayDraft,
  makeReplayJourney,
  makeReplayVersion,
} from "./deterministic-replay-fixtures";
import { journeyPrincipal } from "./journey-authoring-fixtures";

export const repairFixtureIds = Object.freeze({
  repair: "23232323-2323-4323-8323-232323232323",
  verification: "24242424-2424-4424-8424-242424242424",
  promotedReplay: "25252525-2525-4525-8525-252525252525",
  promotion: "29292929-2929-4929-8929-292929292929",
});

export function makeBoundedRepairCandidate(): DeterministicReplayDraft {
  return makeReplayDraft({
    operations: makeReplayDraft().operations.map((operation) => {
      if (operation.kind === "NAVIGATE") {
        return { ...operation, path: "/learner" };
      }
      if (
        operation.kind === "CLICK" &&
        operation.operationId === "submit-student-response"
      ) {
        return {
          ...operation,
          locator: { kind: "TEST_ID" as const, value: "turn-in-response" },
        };
      }
      return operation;
    }),
  });
}

export function makeRepairDraft(
  overrides: Readonly<Record<string, unknown>> = {},
): JourneyRepairDraft {
  const sourceReplay = makeReplayVersion();
  const candidate = makeBoundedRepairCandidate();
  return buildJourneyRepairDraft({
    id: repairFixtureIds.repair,
    sourceReplay,
    candidate,
    diagnosis:
      "The reviewed student route and submit control moved inside the same authorized origin.",
    modelInvocationCount: 2,
    proposedBy: {
      kind: "MODEL",
      actorId: "run-04-repair-model",
      model: "gpt-5.6-sol",
    },
    createdAt: "2026-07-21T11:00:00.000Z",
    ...overrides,
  });
}

export function makeForgedScopeExpandedRepair(): JourneyRepairDraft {
  const legitimate = makeRepairDraft();
  const { repairHash: _repairHash, ...base } = structuredClone(legitimate);
  const candidate = makeReplayDraft({
    operations: legitimate.candidate!.operations.map((operation) =>
      operation.kind === "CHECKPOINT"
        ? {
            ...operation,
            assertion: { ...operation.assertion, path: "/api/other-submissions" },
          }
        : operation,
    ),
  });
  const forgedBase = { ...base, candidate };
  return journeyRepairDraftSchema.parse({
    ...forgedBase,
    repairHash: computeJourneyRepairHash(forgedBase),
  });
}

export function makeVerifiedRepair(
  repair = makeRepairDraft(),
  overrides: Readonly<Record<string, unknown>> = {},
): JourneyRepairVerification {
  return buildJourneyRepairVerification({
    id: repairFixtureIds.verification,
    repair,
    sourceReplay: makeReplayVersion(),
    executionState: "COMPLETED",
    checkpoints: [
      {
        checkpointId: "submission-request",
        status: "VERIFIED",
      },
    ],
    recorderVisibility: "VISIBLE",
    verifiedAt: "2026-07-21T11:05:00.000Z",
    verifiedBy: {
      kind: "AUTOMATION",
      actorId: "run-04-deterministic-verifier",
      component: "journey-repair-verifier",
    },
    ...overrides,
  });
}

export function makePromotedRepairInput(
  repair = makeRepairDraft(),
  verification = makeVerifiedRepair(repair),
) {
  return {
    id: repairFixtureIds.promotedReplay,
    repair,
    verification,
    sourceReplay: makeReplayVersion(),
    journey: makeReplayJourney(),
    createdAt: "2026-07-21T11:10:00.000Z",
    createdBy: { kind: "HUMAN" as const, actorId: journeyPrincipal.userId },
  };
}
