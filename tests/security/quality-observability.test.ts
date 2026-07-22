import { describe, expect, it } from "vitest";

import {
  createAnalyticsEvent,
  createObservabilityLog,
} from "../../packages/core/src/quality-observability.js";

const base = Object.freeze({
  workspaceId: "11111111-1111-4111-8111-111111111111",
  correlationId: "22222222-2222-4222-8222-222222222222",
  occurredAt: "2026-07-22T01:00:00.000Z",
});

describe("quality telemetry security", () => {
  it("rejects raw request bodies, student-like fields, secrets, and free-form errors", () => {
    expect(() =>
      createAnalyticsEvent({
        ...base,
        eventId: "33333333-3333-4333-8333-333333333333",
        name: "RUN_TERMINAL",
        artifact: { kind: "RUN", id: "fictional-run" },
        dimensions: { terminalState: "COMPLETED" },
        requestBody: { studentEmail: "student@pactwire.invalid" },
      }),
    ).toThrow();

    expect(() =>
      createObservabilityLog({
        ...base,
        logId: "44444444-4444-4444-8444-444444444444",
        lane: "MODEL",
        code: "MODEL_FAILURE",
        artifact: { kind: "RUN", id: "fictional-run" },
        password: "never-log-this",
        error: "provider leaked student@pactwire.invalid",
      }),
    ).toThrow();
  });

  it("rejects a responsibility-lane mismatch instead of relabeling the event", () => {
    expect(() =>
      createObservabilityLog({
        ...base,
        logId: "44444444-4444-4444-8444-444444444444",
        lane: "MODEL",
        code: "HUMAN_DECISION",
        artifact: { kind: "APPROVAL", id: "fictional-approval" },
      }),
    ).toThrow(/responsibility lane/iu);
  });
});
