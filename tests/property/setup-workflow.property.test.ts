import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { deriveSetupWorkflow } from "../../packages/core/src/setup-workflow";

const seed = 20260720;
const workspaceId = "11111111-1111-4111-8111-111111111111";
const softwareId = "22222222-2222-4222-8222-222222222222";

const states = [
  "UNKNOWN",
  "APPROVED",
  "HOLD",
  "REJECTED",
  "RETIRED",
] as const;

describe("setup workflow properties", () => {
  it("UX-01 provenance: arbitrary model prose cannot change the displayed stored district status", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...states),
        fc.string({ maxLength: 500 }),
        fc.boolean(),
        (state, modelSummary, imported) => {
          const setBy = imported
            ? {
                kind: "IMPORTED_SYSTEM" as const,
                actorId: "fictional-registry",
                displayName: "Fictional District Registry",
              }
            : {
                kind: "HUMAN" as const,
                actorId: "fictional-officer",
                displayName: "Morgan Vale (Fictional)",
              };
          const facts = {
            software: {
              id: softwareId,
              workspaceId,
              name: "Northstar Classroom (Fictional)",
              approvalState: state,
              approvalOrigin: {
                state,
                setBy,
                reason: "Stored district record.",
                recordedAt: "2026-07-20T12:00:00.000Z",
              },
            },
            authorizations: [],
            agreements: [],
            currentRequirements: [],
            personas: [],
            currentJourneys: [],
          } as const;
          const workflow = deriveSetupWorkflow({
            ...facts,
            untrustedModelSummary: modelSummary,
          });
          const withoutModelProse = deriveSetupWorkflow(facts);

          expect(workflow.statusProvenance.state).toBe(state);
          expect(workflow.statusProvenance.sourceLabel).toContain(
            setBy.displayName,
          );
          expect(workflow).toEqual(withoutModelProse);
          expect(workflow.statusProvenance.isPactwireConclusion).toBe(false);
        },
      ),
      { seed, numRuns: 500 },
    );
  });

  it("preserves the shrunk whitespace-summary regression", () => {
    const facts = {
      software: {
        id: softwareId,
        workspaceId,
        name: "Northstar Classroom (Fictional)",
        approvalState: "UNKNOWN" as const,
        approvalOrigin: {
          state: "UNKNOWN" as const,
          setBy: {
            kind: "HUMAN" as const,
            actorId: "fictional-officer",
            displayName: "Morgan Vale (Fictional)",
          },
          reason: "Stored district record.",
          recordedAt: "2026-07-20T12:00:00.000Z",
        },
      },
      authorizations: [],
      agreements: [],
      currentRequirements: [],
      personas: [],
      currentJourneys: [],
    };

    expect(
      deriveSetupWorkflow({ ...facts, untrustedModelSummary: " " }),
    ).toEqual(deriveSetupWorkflow(facts));
  });

  it("UX-01 readiness: no combination of incomplete prerequisites can report run-ready", () => {
    fc.assert(
      fc.property(
        fc.record({
          authorization: fc.boolean(),
          agreement: fc.boolean(),
          requirement: fc.boolean(),
          testData: fc.boolean(),
          journey: fc.boolean(),
        }),
        (present) => {
          const agreementVersionId =
            "33333333-3333-4333-8333-333333333333";
          const workflow = deriveSetupWorkflow({
            software: {
              id: softwareId,
              workspaceId,
              name: "Northstar Classroom (Fictional)",
              approvalState: "APPROVED",
              approvalOrigin: {
                state: "APPROVED",
                setBy: {
                  kind: "HUMAN",
                  actorId: "fictional-officer",
                  displayName: "Morgan Vale (Fictional)",
                },
                reason: "Stored district record.",
                recordedAt: "2026-07-20T12:00:00.000Z",
              },
            },
            authorizations: present.authorization
              ? [
                  {
                    id: "44444444-4444-4444-8444-444444444444",
                    effectiveStatus: "ACTIVE",
                    reviewAt: "2026-07-20T20:00:00.000Z",
                    expiresAt: "2026-07-21T20:00:00.000Z",
                  },
                ]
              : [],
            agreements: present.agreement
              ? [{ id: agreementVersionId, version: 1 }]
              : [],
            currentRequirements: present.requirement
              ? [
                  {
                    agreementVersionId,
                    status: "CONFIRMED",
                    executable: true,
                  },
                ]
              : [],
            personas: present.testData
              ? [{ role: "TEACHER", fieldCount: 1 }]
              : [],
            currentJourneys: present.journey
              ? [
                  {
                    agreementVersionId,
                    readinessStatus: "RUNNABLE",
                    requiredCheckpointCount: 1,
                    requiredVisibleCheckpointCount: 1,
                  },
                ]
              : [],
          });

          expect(workflow.runReady).toBe(
            Object.values(present).every(Boolean),
          );
          if (!workflow.runReady) {
            expect(workflow.currentStepId).not.toBeNull();
            expect(
              workflow.steps.some((step) => step.status === "ACTION_REQUIRED"),
            ).toBe(true);
          }
        },
      ),
      { seed, numRuns: 500 },
    );
  });
});
