import { describe, expect, it } from "vitest";

import {
  QUALITY_PROFILE,
  QualityTelemetryStore,
  buildQualityReport,
  createAnalyticsEvent,
  createGuardrailMetric,
  createObservabilityLog,
  createPerformanceMeasurement,
  evaluateTargetCompatibility,
} from "../../packages/core/src/quality-observability.js";

const ids = Object.freeze({
  workspace: "11111111-1111-4111-8111-111111111111",
  correlation: "22222222-2222-4222-8222-222222222222",
  event: "33333333-3333-4333-8333-333333333333",
  log: "44444444-4444-4444-8444-444444444444",
  measurement: "55555555-5555-4555-8555-555555555555",
  guardrail: "66666666-6666-4666-8666-666666666666",
});

describe("quality observability", () => {
  it("emits only pseudonymous, allowlisted analytics and lane-owned logs", () => {
    const event = createAnalyticsEvent({
      eventId: ids.event,
      workspaceId: ids.workspace,
      correlationId: ids.correlation,
      occurredAt: "2026-07-22T01:00:00.000Z",
      name: "RUN_TERMINAL",
      artifact: { kind: "RUN", id: "fictional-run-visible-only" },
      actor: { kind: "AUTOMATION", id: "fictional-runner-a" },
      dimensions: { terminalState: "PARTIAL" },
      measures: { durationMs: 410, retryCount: 1, captureGapCount: 1 },
    });
    const log = createObservabilityLog({
      logId: ids.log,
      workspaceId: ids.workspace,
      correlationId: ids.correlation,
      occurredAt: "2026-07-22T01:00:00.100Z",
      lane: "RECORDER",
      code: "CAPTURE_GAP",
      artifact: { kind: "CHECKPOINT", id: "fictional-checkpoint-completion" },
      dimensions: { checkpointState: "NOT_VISIBLE" },
      measures: { captureGapCount: 1 },
    });

    const serialized = JSON.stringify({ event, log });
    expect(serialized).not.toContain("fictional-run-visible-only");
    expect(serialized).not.toContain("fictional-runner-a");
    expect(serialized).not.toContain("fictional-checkpoint-completion");
    expect(event.artifact.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(event.actor?.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(log.lane).toBe("RECORDER");
    expect(log.code).toBe("CAPTURE_GAP");
  });

  it("preserves the shrunk punctuation regression without confusing JSON syntax for leaked identity", () => {
    const event = createAnalyticsEvent({
      eventId: ids.event,
      workspaceId: ids.workspace,
      correlationId: ids.correlation,
      occurredAt: "2026-07-22T01:00:00.000Z",
      name: "HUMAN_DECISION_RECORDED",
      artifact: { kind: "APPROVAL", id: " " },
      actor: { kind: "HUMAN", id: "," },
      dimensions: { decisionKind: "KEEP_HOLD" },
    });

    expect(event.artifact).not.toHaveProperty("id");
    expect(event.actor).not.toHaveProperty("id");
    expect(event.artifact.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(event.actor?.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("computes nearest-rank p95 budgets and every required quality measure", () => {
    const store = new QualityTelemetryStore();
    for (let index = 0; index < 20; index += 1) {
      const suffix = index.toString(16).padStart(12, "0");
      store.recordPerformance(
        createPerformanceMeasurement({
          measurementId: `77777777-7777-4777-8777-${suffix}`,
          correlationId: ids.correlation,
          observedAt: "2026-07-22T01:00:01.000Z",
          name: "CONSOLE_INTERACTION",
          durationMs: index === 19 ? 900 : index === 18 ? 490 : 100 + index,
        }),
      );
    }
    store.recordEvent(
      createAnalyticsEvent({
        eventId: ids.event,
        workspaceId: ids.workspace,
        correlationId: ids.correlation,
        occurredAt: "2026-07-22T01:00:00.000Z",
        name: "RUN_TERMINAL",
        artifact: { kind: "RUN", id: "fictional-run-1" },
        dimensions: { terminalState: "PARTIAL", modelOutcome: "SUCCEEDED" },
        measures: {
          estimatedCostMicroUsd: 25,
          retryCount: 2,
          blockedActionCount: 3,
          captureGapCount: 1,
          modelFailureCount: 0,
        },
      }),
    );
    store.recordGuardrail(
      createGuardrailMetric({
        metricId: ids.guardrail,
        observedAt: "2026-07-22T01:00:02.000Z",
        kind: "OUT_OF_SCOPE_ACTION",
        count: 0,
      }),
    );

    const report = buildQualityReport(store.snapshot());
    expect(report.performance.consoleInteraction).toMatchObject({
      budgetMs: 500,
      passed: true,
      p95Ms: 490,
      sampleCount: 20,
    });
    expect(report.observability).toMatchObject({
      blockedActionCount: 3,
      captureGapCount: 1,
      estimatedCostMicroUsd: 25,
      modelFailureCount: 0,
      retryCount: 2,
    });
    expect(report.guardrails.OUT_OF_SCOPE_ACTION).toEqual({ count: 0, passed: true });
  });

  it("declares only the packaged Chromium profile supported and blocks silent degradation", () => {
    expect(
      evaluateTargetCompatibility({
        targetKind: "BROWSER",
        browserEngine: "CHROMIUM",
        browserVersion: QUALITY_PROFILE.compatibility.packagedChromiumVersion,
        requiredFeatures: ["DOM", "FETCH", "FORMS", "NETWORK_OBSERVATION"],
      }),
    ).toMatchObject({ status: "SUPPORTED", reasons: [] });

    expect(
      evaluateTargetCompatibility({
        targetKind: "BROWSER",
        browserEngine: "FIREFOX",
        browserVersion: "128",
        requiredFeatures: ["DOM"],
      }),
    ).toMatchObject({
      status: "BLOCKED",
      reasons: ["Only the packaged Chromium runner is supported in P0."],
    });
    expect(
      evaluateTargetCompatibility({
        targetKind: "NATIVE_APPLICATION",
        requiredFeatures: [],
      }),
    ).toMatchObject({ status: "BLOCKED" });
  });
});
