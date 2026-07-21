import { describe, expect, it } from "vitest";
import {
  buildJourneyRepairDraft,
  buildJourneyRepairVerification,
  buildPromotedRepairReplayVersion,
} from "../../packages/core/src/journey-repair";
import {
  makeBoundedRepairCandidate,
  makeForgedScopeExpandedRepair,
  makePromotedRepairInput,
  makeRepairDraft,
  makeVerifiedRepair,
  repairFixtureIds,
} from "../helpers/journey-repair-fixtures";
import {
  makeReplayDraft,
  makeReplayVersion,
} from "../helpers/deterministic-replay-fixtures";

describe("model-assisted journey repair", () => {
  it("accepts only path and selector changes as a bounded model draft", () => {
    const repair = makeRepairDraft();

    expect(repair).toMatchObject({
      id: repairFixtureIds.repair,
      sourceReplayVersionId: makeReplayVersion().id,
      status: "BOUNDED_DRAFT",
      modelInvocationCount: 2,
      proposedBy: { kind: "MODEL", model: "gpt-5.6-sol" },
      violations: [],
    });
    expect(repair.changes).toEqual([
      {
        operationId: "open-student-workspace",
        field: "path",
        before: "/student",
        after: "/learner",
      },
      {
        operationId: "submit-student-response",
        field: "locator",
        before: "submit-assignment",
        after: "turn-in-response",
      },
    ]);
    expect(Object.isFrozen(repair)).toBe(true);
  });

  it("routes action, binding, operation, or checkpoint changes to human review", () => {
    const sourceReplay = makeReplayVersion();
    const widened = makeReplayDraft({
      bindings: [makeReplayDraft().bindings[0]!],
      operations: makeReplayDraft().operations.map((operation) =>
        operation.kind === "CLICK"
          ? { ...operation, authorizedAction: "MESSAGE" as const }
          : operation.kind === "CHECKPOINT"
            ? {
                ...operation,
                checkpointId: "different-checkpoint",
              }
            : operation,
      ),
    });
    const repair = buildJourneyRepairDraft({
      id: repairFixtureIds.repair,
      sourceReplay,
      candidate: widened,
      diagnosis: "The page suggested a broader path.",
      modelInvocationCount: 1,
      proposedBy: {
        kind: "MODEL",
        actorId: "run-04-repair-model",
        model: "gpt-5.6-sol",
      },
      createdAt: "2026-07-21T11:00:00.000Z",
    });

    expect(repair.status).toBe("HUMAN_REVIEW_REQUIRED");
    expect(repair.violations.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "BINDING_SCOPE_CHANGED",
        "ACTION_SCOPE_CHANGED",
        "CHECKPOINT_CONTRACT_CHANGED",
      ]),
    );
  });

  it("never promotes a plausible page when the original checkpoint is missing", () => {
    const repair = makeRepairDraft();
    const verification = buildJourneyRepairVerification({
      id: repairFixtureIds.verification,
      repair,
      sourceReplay: makeReplayVersion(),
      executionState: "COMPLETED",
      checkpoints: [],
      recorderVisibility: "VISIBLE",
      verifiedAt: "2026-07-21T11:05:00.000Z",
      verifiedBy: {
        kind: "AUTOMATION",
        actorId: "run-04-deterministic-verifier",
        component: "journey-repair-verifier",
      },
    });

    expect(verification).toMatchObject({
      status: "NOT_TESTED",
      reasonCode: "FROZEN_CHECKPOINT_NOT_VERIFIED",
      verifiedCheckpointIds: [],
    });
    expect(() =>
      buildPromotedRepairReplayVersion(
        makePromotedRepairInput(repair, verification),
      ),
    ).toThrow(/verified repair draft/i);
  });

  it("promotes an exactly verified draft only through a named human", () => {
    const repair = makeRepairDraft();
    const verification = makeVerifiedRepair(repair);
    const replay = buildPromotedRepairReplayVersion(
      makePromotedRepairInput(repair, verification),
    );

    expect(replay).toMatchObject({
      id: repairFixtureIds.promotedReplay,
      version: 2,
      sourceVersionId: makeReplayVersion().id,
      createdBy: { kind: "HUMAN" },
      operations: makeBoundedRepairCandidate().operations,
    });
    expect(() =>
      buildPromotedRepairReplayVersion({
        ...makePromotedRepairInput(repair, verification),
        createdBy: {
          kind: "MODEL",
          actorId: "run-04-repair-model",
          model: "gpt-5.6-sol",
        },
      }),
    ).toThrow();
  });

  it("rejects a forged hash-valid bounded envelope that changes frozen authority", () => {
    const repair = makeForgedScopeExpandedRepair();
    const verification = makeVerifiedRepair(repair);

    expect(() =>
      buildPromotedRepairReplayVersion(
        makePromotedRepairInput(repair, verification),
      ),
    ).toThrow(/frozen|verified repair draft/i);
  });
});
