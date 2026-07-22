import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  QUALITY_PROFILE,
  QualityTelemetryStore,
  buildQualityReport,
  createGuardrailMetric,
  createPerformanceMeasurement,
} from "../../packages/core/src/quality-observability.js";
import {
  startQualityBrowserSession,
  type QualityBrowserSession,
} from "../helpers/quality-browser.js";

const correlationId = "22222222-2222-4222-8222-222222222222";
const workspaceId = "11111111-1111-4111-8111-111111111111";

function measurementId(index: number): string {
  return `91919191-9191-4191-8191-${index.toString(16).padStart(12, "0")}`;
}

describe("real quality browser performance", () => {
  let session: QualityBrowserSession;

  beforeAll(async () => {
    session = await startQualityBrowserSession("operator");
  }, 30_000);

  afterAll(async () => {
    await session.close();
  });

  it("keeps normal console reads, run progress, and evidence-summary readiness within declared p95 budgets", async () => {
    const store = new QualityTelemetryStore();
    const consoleDurations = await session.page.evaluate(
      async ({ targetWorkspaceId }) => {
        const paths = [
          "/api/demo/session",
          `/api/workspaces/${targetWorkspaceId}/runs`,
          `/api/workspaces/${targetWorkspaceId}/findings`,
        ];
        const durations = [];
        for (let index = 0; index < 60; index += 1) {
          const path = paths[index % paths.length];
          if (!path) throw new Error("Quality read path was not selected");
          const startedAt = performance.now();
          const response = await fetch(path);
          if (!response.ok) throw new Error(`Quality read failed with ${response.status}`);
          await response.arrayBuffer();
          durations.push(Math.ceil(performance.now() - startedAt));
        }
        return durations;
      },
      { targetWorkspaceId: workspaceId },
    );

    for (const [index, durationMs] of consoleDurations.entries()) {
      store.recordPerformance(
        createPerformanceMeasurement({
          measurementId: measurementId(index),
          correlationId,
          observedAt: "2026-07-22T02:00:00.000Z",
          name: "CONSOLE_INTERACTION",
          durationMs,
        }),
      );
    }

    const findingStates = ["NEEDS_REVIEW", "WITNESSED_CONFLICT"] as const;
    for (let index = 0; index < 20; index += 1) {
      const state = findingStates[index % findingStates.length] ?? "NEEDS_REVIEW";
      const startedAt = performance.now();
      await session.page.locator(`[data-finding-state="${state}"]`).click();
      await session.page
        .getByTestId("finding-detail")
        .locator(`code:text-is("${state}")`)
        .waitFor();
      store.recordPerformance(
        createPerformanceMeasurement({
          measurementId: measurementId(100 + index),
          correlationId,
          observedAt: "2026-07-22T02:00:01.000Z",
          name: "EVIDENCE_SUMMARY",
          durationMs: Math.ceil(performance.now() - startedAt),
        }),
      );
    }

    const stopButton = session.page.getByTestId("stop-active-run");
    await stopButton.waitFor();
    const progressStartedAt = performance.now();
    await stopButton.click();
    await session.page
      .getByTestId("run-stop-feedback")
      .getByText(/Run stopped/u)
      .waitFor();
    store.recordPerformance(
      createPerformanceMeasurement({
        measurementId: measurementId(200),
        correlationId,
        observedAt: "2026-07-22T02:00:02.000Z",
        name: "RUN_PROGRESS",
        durationMs: Math.ceil(performance.now() - progressStartedAt),
      }),
    );

    for (const [index, kind] of [
      "AUTOMATED_APPROVAL_OR_RESTORE",
      "OUT_OF_SCOPE_ACTION",
      "REAL_STUDENT_DATA",
      "SECRET_EXPOSURE",
      "UNKNOWN_DESTINATION_ATTRIBUTION",
      "MISSING_FINDING_SCOPE",
      "DEFECTIVE_HOLD",
    ].entries()) {
      store.recordGuardrail(
        createGuardrailMetric({
          metricId: `92929292-9292-4292-8292-${index.toString(16).padStart(12, "0")}`,
          observedAt: "2026-07-22T02:00:03.000Z",
          kind,
          count: 0,
        }),
      );
    }

    const report = buildQualityReport(store.snapshot());
    expect(report.performance.consoleInteraction).toMatchObject({
      budgetMs: QUALITY_PROFILE.performance.consoleInteractionP95Ms,
      passed: true,
      sampleCount: 60,
    });
    expect(report.performance.evidenceSummary).toMatchObject({
      budgetMs: QUALITY_PROFILE.performance.evidenceSummaryP95Ms,
      passed: true,
      sampleCount: 20,
    });
    expect(report.performance.runProgress).toMatchObject({
      budgetMs: QUALITY_PROFILE.performance.runProgressP95Ms,
      passed: true,
      sampleCount: 1,
    });
    expect(report.status).toBe("PASS");
  });
});
