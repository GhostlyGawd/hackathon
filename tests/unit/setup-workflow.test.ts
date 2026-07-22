import { describe, expect, it } from "vitest";
import { deriveSetupWorkflow } from "../../packages/core/src/setup-workflow";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const softwareId = "22222222-2222-4222-8222-222222222222";
const agreementVersionId = "33333333-3333-4333-8333-333333333333";

function software() {
  return {
    id: softwareId,
    workspaceId,
    name: "Northstar Classroom (Fictional)",
    approvalState: "APPROVED" as const,
    approvalOrigin: {
      state: "APPROVED" as const,
      setBy: {
        kind: "IMPORTED_SYSTEM" as const,
        actorId: "fictional-district-registry",
        displayName: "Fictional Cedar Ridge App Registry",
      },
      reason: "Imported existing district approval record.",
      sourceReference: "AP-2042",
      recordedAt: "2026-07-19T20:45:00.000Z",
    },
  };
}

function incompleteInput() {
  return {
    software: software(),
    authorizations: [],
    agreements: [],
    currentRequirements: [],
    personas: [],
    currentJourneys: [],
  };
}

describe("setup workflow", () => {
  it("makes all six prerequisites visible and blocks later work at the first missing prerequisite", () => {
    const workflow = deriveSetupWorkflow(incompleteInput());

    expect(workflow.steps.map((step) => step.id)).toEqual([
      "software",
      "authorization",
      "agreement",
      "requirements",
      "test-data",
      "journey",
    ]);
    expect(workflow.steps.map((step) => step.status)).toEqual([
      "COMPLETE",
      "ACTION_REQUIRED",
      "BLOCKED",
      "BLOCKED",
      "BLOCKED",
      "BLOCKED",
    ]);
    expect(workflow.currentStepId).toBe("authorization");
    expect(workflow.runReady).toBe(false);
    expect(workflow.steps[2]?.blocker?.toLocaleLowerCase()).toContain(
      "authorization",
    );
  });

  it("derives the displayed district status and source from the stored approval origin", () => {
    const workflow = deriveSetupWorkflow(incompleteInput());

    expect(workflow.statusProvenance).toEqual({
      state: "APPROVED",
      label: "Approved",
      sourceLabel: "Imported from Fictional Cedar Ridge App Registry",
      sourceReference: "AP-2042",
      reason: "Imported existing district approval record.",
      recordedAt: "2026-07-19T20:45:00.000Z",
      isPactwireConclusion: false,
    });
  });

  it("becomes run-ready only when a runnable current journey closes the real prerequisite chain", () => {
    const workflow = deriveSetupWorkflow({
      software: software(),
      authorizations: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          effectiveStatus: "ACTIVE",
          reviewAt: "2026-07-20T20:00:00.000Z",
          expiresAt: "2026-07-21T20:00:00.000Z",
        },
      ],
      agreements: [{ id: agreementVersionId, version: 1 }],
      currentRequirements: [
        {
          agreementVersionId,
          status: "CONFIRMED",
          executable: true,
        },
      ],
      personas: [{ role: "TEACHER", fieldCount: 2 }],
      currentJourneys: [
        {
          agreementVersionId,
          readinessStatus: "RUNNABLE",
          requiredCheckpointCount: 2,
          requiredVisibleCheckpointCount: 2,
        },
      ],
    });

    expect(workflow.runReady).toBe(true);
    expect(workflow.currentStepId).toBeNull();
    expect(workflow.steps.every((step) => step.status === "COMPLETE")).toBe(
      true,
    );
    expect(workflow.nextAction).toEqual({
      code: "READY_FOR_NAMED_RUN",
      label: "Queue a named fictional-data test",
    });
  });

  it("explains an expired authorization instead of presenting a misleading complete state", () => {
    const workflow = deriveSetupWorkflow({
      ...incompleteInput(),
      authorizations: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          effectiveStatus: "EXPIRED",
          reviewAt: "2026-07-19T18:30:00.000Z",
          expiresAt: "2026-07-19T19:00:00.000Z",
        },
      ],
    });

    expect(workflow.steps[1]).toMatchObject({
      id: "authorization",
      status: "ACTION_REQUIRED",
      blocker: "The latest authorization is expired. Record current authority before continuing.",
    });
    expect(workflow.runReady).toBe(false);
  });
});
