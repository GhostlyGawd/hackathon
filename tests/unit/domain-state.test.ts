import { describe, expect, it } from "vitest";
import {
  applyApprovalEvent,
  approvalEventSchema,
  findingSchema,
  runEventSchema,
  runSchema,
} from "../../packages/core/src/domain";

describe("core authority and evidence states", () => {
  it("rejects automation attempting to restore APPROVED", () => {
    expect(() =>
      applyApprovalEvent(
        {
          workspaceId: "11111111-1111-4111-8111-111111111111",
          softwareId: "22222222-2222-4222-8222-222222222222",
          state: "HOLD",
          events: [],
        },
        {
          eventId: "33333333-3333-4333-8333-333333333333",
          workspaceId: "11111111-1111-4111-8111-111111111111",
          softwareId: "22222222-2222-4222-8222-222222222222",
          from: "HOLD",
          to: "APPROVED",
          reason: "HUMAN_DECISION",
          actor: {
            kind: "AUTOMATION",
            actorId: "approval-service",
            component: "approval-reducer",
          },
          occurredAt: "2026-07-19T18:30:00.000Z",
        },
      ),
    ).toThrow();
  });

  it("rejects a human approval event whose reason contradicts its target", () => {
    const result = approvalEventSchema.safeParse({
      eventId: "39393939-3939-4939-8939-393939393939",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      softwareId: "22222222-2222-4222-8222-222222222222",
      from: "HOLD",
      to: "APPROVED",
      reason: "HUMAN_HOLD",
      humanDecisionId: "40404040-4040-4040-8040-404040404040",
      actor: {
        kind: "HUMAN",
        actorId: "fictional-privacy-officer",
      },
      occurredAt: "2026-07-19T18:30:00.000Z",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a clean finding when a required checkpoint is invisible", () => {
    const result = findingSchema.safeParse({
      id: "44444444-4444-4444-8444-444444444444",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      runId: "55555555-5555-4555-8555-555555555555",
      requirementVersionId: "66666666-6666-4666-8666-666666666666",
      state: "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS",
      checkpoints: [
        {
          checkpointId: "network-submit",
          required: true,
          exercised: true,
          visible: false,
        },
      ],
      observationIds: [],
      limitations: ["Only the named fictional submission was exercised."],
      createdAt: "2026-07-19T18:30:00.000Z",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a terminal run with neither a manifest nor an integrity failure", () => {
    const result = runSchema.safeParse({
      id: "55555555-5555-4555-8555-555555555555",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      softwareId: "22222222-2222-4222-8222-222222222222",
      state: "FAILED",
      snapshot: {
        agreementVersionId: "77777777-7777-4777-8777-777777777777",
        journeyVersionId: "88888888-8888-4888-8888-888888888888",
        authorizationId: "99999999-9999-4999-8999-999999999999",
        runnerConfigVersion: "runner-v1",
        snapshotHash: "a".repeat(64),
      },
      events: [],
      queuedAt: "2026-07-19T18:30:00.000Z",
      terminalAt: "2026-07-19T18:31:00.000Z"
    });

    expect(result.success).toBe(false);
  });

  it("rejects a run event whose type does not match its state path", () => {
    const result = runEventSchema.safeParse({
      eventId: "abababab-abab-4bab-8bab-abababababab",
      eventType: "RUN_STARTED",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      runId: "55555555-5555-4555-8555-555555555555",
      from: "RUNNING",
      to: "FAILED",
      actor: {
        kind: "AUTOMATION",
        actorId: "pactwire-runner",
        component: "run-orchestrator",
      },
      occurredAt: "2026-07-19T18:31:00.000Z",
    });

    expect(result.success).toBe(false);
  });
});
