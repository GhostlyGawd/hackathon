import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildJourneyRepairDraft,
  buildJourneyRepairVerification,
  buildPromotedRepairReplayVersion,
} from "../../packages/core/src/journey-repair";
import {
  makePromotedRepairInput,
  repairFixtureIds,
} from "../helpers/journey-repair-fixtures";
import {
  makeReplayDraft,
  makeReplayVersion,
} from "../helpers/deterministic-replay-fixtures";

const propertySeed = 20260721;
const propertyRuns = 250;

describe("journey repair properties", () => {
  it("PROP-05: generated scope changes never become bounded repair drafts", () => {
    const sourceReplay = makeReplayVersion();
    fc.assert(
      fc.property(
        fc.constantFrom(
          "ACTION",
          "BINDING",
          "CHECKPOINT",
          "OPERATION_ORDER",
          "ASSERTION",
        ),
        (mutation) => {
          const base = makeReplayDraft();
          const operations = [...base.operations];
          let bindings = [...base.bindings];
          if (mutation === "ACTION") {
            operations.splice(
              3,
              1,
              { ...operations[3]!, authorizedAction: "MESSAGE" } as never,
            );
          } else if (mutation === "BINDING") {
            bindings = bindings.slice(0, 1);
          } else if (mutation === "CHECKPOINT") {
            operations.splice(
              4,
              1,
              { ...operations[4]!, checkpointId: "changed-checkpoint" } as never,
            );
          } else if (mutation === "OPERATION_ORDER") {
            [operations[0], operations[1]] = [operations[1]!, operations[0]!];
          } else {
            operations.splice(
              4,
              1,
              {
                ...operations[4]!,
                assertion: {
                  kind: "RESPONSE",
                  method: "POST",
                  path: "/api/other",
                  status: 200,
                },
              } as never,
            );
          }
          const repair = buildJourneyRepairDraft({
            id: repairFixtureIds.repair,
            sourceReplay,
            candidate: { bindings, operations },
            diagnosis: "Generated out-of-scope mutation.",
            modelInvocationCount: 1,
            proposedBy: {
              kind: "MODEL",
              actorId: "run-04-property-model",
              model: "gpt-5.6-sol",
            },
            createdAt: "2026-07-21T11:00:00.000Z",
          });

          expect(repair.status).toBe("HUMAN_REVIEW_REQUIRED");
          expect(repair.violations.length).toBeGreaterThan(0);
        },
      ),
      { seed: propertySeed, numRuns: propertyRuns },
    );
  });

  it("PROP-05: no candidate becomes active without every frozen checkpoint", () => {
    const sourceReplay = makeReplayVersion();
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (checkpointVerified, visible) => {
        const candidate = makeReplayDraft({
          operations: makeReplayDraft().operations.map((operation) =>
            operation.kind === "NAVIGATE"
              ? { ...operation, path: "/learner" }
              : operation,
          ),
        });
        const repair = buildJourneyRepairDraft({
          id: repairFixtureIds.repair,
          sourceReplay,
          candidate,
          diagnosis: "Generated bounded path repair.",
          modelInvocationCount: 1,
          proposedBy: {
            kind: "MODEL",
            actorId: "run-04-property-model",
            model: "gpt-5.6-sol",
          },
          createdAt: "2026-07-21T11:00:00.000Z",
        });
        const verification = buildJourneyRepairVerification({
          id: repairFixtureIds.verification,
          repair,
          sourceReplay,
          executionState: "COMPLETED",
          checkpoints: checkpointVerified
            ? [{ checkpointId: "submission-request", status: "VERIFIED" }]
            : [],
          recorderVisibility: visible ? "VISIBLE" : "NOT_VISIBLE",
          verifiedAt: "2026-07-21T11:05:00.000Z",
          verifiedBy: {
            kind: "AUTOMATION",
            actorId: "run-04-property-verifier",
            component: "journey-repair-verifier",
          },
        });

        if (checkpointVerified && visible) {
          expect(() =>
            buildPromotedRepairReplayVersion(
              makePromotedRepairInput(repair, verification),
            ),
          ).not.toThrow();
        } else {
          expect(() =>
            buildPromotedRepairReplayVersion(
              makePromotedRepairInput(repair, verification),
            ),
          ).toThrow();
        }
      }),
      { seed: propertySeed, numRuns: propertyRuns },
    );
  });
});
