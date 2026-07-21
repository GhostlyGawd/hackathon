import { describe, expect, it, vi } from "vitest";
import {
  deriveJourneyRepairCandidate,
  type JourneyRepairDiscoveryObservation,
} from "../../apps/runner/src/journey-repair";
import { executeJourneyRepairCandidate } from "../../apps/runner/src/deterministic-replay";
import { makeReplayVersion } from "../helpers/deterministic-replay-fixtures";
import {
  makeBoundedRepairCandidate,
  makeForgedScopeExpandedRepair,
} from "../helpers/journey-repair-fixtures";

const boundedObservations: readonly JourneyRepairDiscoveryObservation[] = [
  {
    sequence: 1,
    actionType: "click",
    controlId: "moved-student-link",
    authorizationAction: "NAVIGATE",
    origin: "http://classroom.pactwire.test",
    hrefPath: "/learner",
    beforePath: "/student",
    afterPath: "/learner",
  },
  {
    sequence: 2,
    actionType: "click",
    controlId: "turn-in-response",
    authorizationAction: "SUBMIT",
    origin: "http://classroom.pactwire.test",
    hrefPath: null,
    beforePath: "/learner",
    afterPath: "/learner",
  },
];

describe("journey repair adapter contract", () => {
  it("derives only the moved path and reviewed selector from executed controls", () => {
    expect(
      deriveJourneyRepairCandidate(makeReplayVersion(), boundedObservations),
    ).toEqual(makeBoundedRepairCandidate());
  });

  it("returns unresolved when discovery is ambiguous or lacks a reviewed target", () => {
    expect(
      deriveJourneyRepairCandidate(makeReplayVersion(), [
        ...boundedObservations,
        {
          ...boundedObservations[1]!,
          sequence: 3,
          controlId: "different-submit-control",
        },
      ]),
    ).toBeNull();
    expect(
      deriveJourneyRepairCandidate(makeReplayVersion(), [
        { ...boundedObservations[0]!, authorizationAction: null, controlId: null },
      ]),
    ).toBeNull();
  });

  it("rejects a forged bounded envelope before any browser operation executes", async () => {
    const sourceReplay = makeReplayVersion();
    const execute = vi.fn().mockResolvedValue({ status: "COMPLETED" });

    await expect(
      executeJourneyRepairCandidate({
        repair: makeForgedScopeExpandedRepair(),
        sourceReplay,
        snapshot: sourceReplay.snapshot,
        baseUrl: "https://classroom.pactwire.test",
        bindingValues: {
          "student-email-value": "ava.student@example.test",
          "student-response-value": "A fictional response.",
        },
        adapter: { execute },
      }),
    ).rejects.toThrow(/frozen source replay/i);
    expect(execute).not.toHaveBeenCalled();
  });
});
