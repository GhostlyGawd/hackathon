import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  QualityTelemetryStore,
  createAnalyticsEvent,
  createPerformanceMeasurement,
} from "../../packages/core/src/quality-observability.js";
import { QualityTelemetryRuntime } from "../../apps/web/lib/quality-telemetry-runtime.js";

const propertyParameters = { numRuns: 500, seed: 20260722 } as const;
const workspaceId = "11111111-1111-4111-8111-111111111111";
const correlationId = "22222222-2222-4222-8222-222222222222";

function uuidFrom(index: number, prefix: string): string {
  return `${prefix}-${index.toString(16).padStart(12, "0")}`;
}

describe("quality observability properties", () => {
  it("PROP-12: raw artifact, actor, secret, and student-like values never survive serialization", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        (artifactUuid, actorUuid) => {
          const artifactId = `raw-artifact:${artifactUuid}`;
          const actorId = `raw-actor:${actorUuid}`;
          const event = createAnalyticsEvent({
            eventId: "33333333-3333-4333-8333-333333333333",
            workspaceId,
            correlationId,
            occurredAt: "2026-07-22T01:00:00.000Z",
            name: "HUMAN_DECISION_RECORDED",
            artifact: { kind: "APPROVAL", id: artifactId },
            actor: { kind: "HUMAN", id: actorId },
            dimensions: { decisionKind: "KEEP_HOLD" },
          });
          const serialized = JSON.stringify(event);
          expect(serialized).not.toContain(artifactId);
          expect(serialized).not.toContain(actorId);
          expect(event.artifact.sha256).toMatch(/^[a-f0-9]{64}$/u);
          expect(event.actor?.sha256).toMatch(/^[a-f0-9]{64}$/u);
        },
      ),
      propertyParameters,
    );
  });

  it("PROP-22: duplicate telemetry delivery and arbitrary safe ordering remain idempotent", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 9999 }), {
          minLength: 1,
          maxLength: 80,
        }),
        fc.array(fc.integer({ min: 0, max: 79 }), { maxLength: 160 }),
        (uniqueIndexes, replayIndexes) => {
          const measurements = uniqueIndexes.map((index) =>
            createPerformanceMeasurement({
              measurementId: uuidFrom(index, "77777777-7777-4777-8777"),
              correlationId,
              observedAt: "2026-07-22T01:00:01.000Z",
              name: "RUN_PROGRESS",
              durationMs: index % 2000,
            }),
          );
          const store = new QualityTelemetryStore();
          for (const measurement of measurements) store.recordPerformance(measurement);
          for (const replayIndex of replayIndexes) {
            const measurement = measurements[replayIndex % measurements.length];
            if (measurement) store.recordPerformance(measurement);
          }

          expect(store.snapshot().performance).toHaveLength(measurements.length);
          expect(store.snapshot().performance.map(({ measurementId }) => measurementId)).toEqual(
            [...measurements]
              .sort((left, right) => left.measurementId.localeCompare(right.measurementId))
              .map(({ measurementId }) => measurementId),
          );
        },
      ),
      propertyParameters,
    );
  });

  it("PROP-22: retried semantic events remain single analytics transitions", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 24 }), {
          minLength: 1,
          maxLength: 200,
        }),
        (eventIndexes) => {
          let identifier = 0;
          const runtime = new QualityTelemetryRuntime({
            idFactory: () =>
              uuidFrom(identifier++, "88888888-8888-4888-8888"),
            now: () => "2026-07-22T01:00:02.000Z",
          });
          for (const index of eventIndexes) {
            runtime.recordEventOnce(`terminal:${index}`, {
              workspaceId,
              name: "RUN_TERMINAL",
              artifact: { kind: "RUN", id: `fictional-retried-run-${index}` },
              dimensions: { terminalState: "COMPLETED" },
            });
          }
          expect(runtime.snapshot().events).toHaveLength(
            new Set(eventIndexes).size,
          );
        },
      ),
      propertyParameters,
    );
  });
});
