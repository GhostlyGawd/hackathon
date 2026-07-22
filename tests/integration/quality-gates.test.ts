import { describe, expect, it } from "vitest";

import {
  GUARDRAIL_KINDS,
  QUALITY_PROFILE,
  QualityTelemetryStore,
  buildQualityReport,
  buildServiceHealth,
  createAnalyticsEvent,
  createGuardrailMetric,
  createObservabilityLog,
  createPerformanceMeasurement,
} from "../../packages/core/src/quality-observability.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const correlationId = "22222222-2222-4222-8222-222222222222";

function uuid(index: number, group: "event" | "log" | "measurement" | "guardrail"): string {
  const prefixes = {
    event: "33333333-3333-4333-8333",
    log: "44444444-4444-4444-8444",
    measurement: "55555555-5555-4555-8555",
    guardrail: "66666666-6666-4666-8666",
  } as const;
  return `${prefixes[group]}-${index.toString(16).padStart(12, "0")}`;
}

describe("quality gates", () => {
  it("keeps a duplicate-heavy 10,000-delivery soak deterministic and within declared budgets", () => {
    const store = new QualityTelemetryStore();
    for (let index = 0; index < 2_000; index += 1) {
      const event = createAnalyticsEvent({
        eventId: uuid(index, "event"),
        workspaceId,
        correlationId,
        occurredAt: "2026-07-22T01:00:00.000Z",
        name: index % 2 === 0 ? "RUN_QUEUED" : "RUN_TERMINAL",
        artifact: { kind: "RUN", id: `fictional-soak-run-${index}` },
        dimensions:
          index % 2 === 0 ? undefined : { terminalState: "COMPLETED" },
        measures: { retryCount: index % 3, estimatedCostMicroUsd: index % 5 },
      });
      const measurement = createPerformanceMeasurement({
        measurementId: uuid(index, "measurement"),
        correlationId,
        observedAt: "2026-07-22T01:00:00.100Z",
        name:
          index % 3 === 0
            ? "CONSOLE_INTERACTION"
            : index % 3 === 1
              ? "RUN_PROGRESS"
              : "EVIDENCE_SUMMARY",
        durationMs:
          index % 3 === 0 ? 120 + (index % 200) : index % 3 === 1 ? 800 + (index % 900) : 180 + (index % 250),
      });
      const log = createObservabilityLog({
        logId: uuid(index, "log"),
        workspaceId,
        correlationId,
        occurredAt: "2026-07-22T01:00:00.200Z",
        lane: "HARNESS",
        code: "HARNESS_ACTION",
        artifact: { kind: "RUN", id: `fictional-soak-run-${index}` },
      });
      store.recordEvent(event);
      store.recordPerformance(measurement);
      store.recordLog(log);
      store.recordEvent(event);
      store.recordPerformance(measurement);
    }
    for (const [index, kind] of GUARDRAIL_KINDS.entries()) {
      store.recordGuardrail(
        createGuardrailMetric({
          metricId: uuid(index, "guardrail"),
          observedAt: "2026-07-22T01:00:01.000Z",
          kind,
          count: 0,
        }),
      );
    }

    const snapshot = store.snapshot();
    const report = buildQualityReport(snapshot);
    expect(snapshot.events).toHaveLength(2_000);
    expect(snapshot.logs).toHaveLength(2_000);
    expect(snapshot.performance).toHaveLength(2_000);
    expect(report.performance.consoleInteraction.p95Ms).toBeLessThanOrEqual(
      QUALITY_PROFILE.performance.consoleInteractionP95Ms,
    );
    expect(report.performance.runProgress.p95Ms).toBeLessThanOrEqual(
      QUALITY_PROFILE.performance.runProgressP95Ms,
    );
    expect(report.performance.evidenceSummary.p95Ms).toBeLessThanOrEqual(
      QUALITY_PROFILE.performance.evidenceSummaryP95Ms,
    );
    expect(report.status).toBe("PASS");
    expect(buildServiceHealth(report)).toMatchObject({
      product: "Pactwire",
      service: "quality-gates",
      status: "ok",
    });
  });
});
