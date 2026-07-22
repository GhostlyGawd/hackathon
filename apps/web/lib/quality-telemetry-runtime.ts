import { randomUUID } from "node:crypto";

import {
  QualityTelemetryStore,
  buildQualityReport,
  createAnalyticsEvent,
  createGuardrailMetric,
  createObservabilityLog,
  createPerformanceMeasurement,
  type AnalyticsEvent,
  type ANALYTICS_EVENT_NAMES,
  type GUARDRAIL_KINDS,
  type OBSERVABILITY_CODES,
  type OBSERVABILITY_LANES,
  type PERFORMANCE_MEASUREMENT_NAMES,
  type QualityTelemetrySnapshot,
} from "@pactwire/core";

type AnalyticsName = (typeof ANALYTICS_EVENT_NAMES)[number];
type GuardrailKind = (typeof GUARDRAIL_KINDS)[number];
type ObservabilityCode = (typeof OBSERVABILITY_CODES)[number];
type ObservabilityLane = (typeof OBSERVABILITY_LANES)[number];
type PerformanceName = (typeof PERFORMANCE_MEASUREMENT_NAMES)[number];
type ArtifactKind = AnalyticsEvent["artifact"]["kind"];
type ActorKind = NonNullable<AnalyticsEvent["actor"]>["kind"];
type SafeDimensions = NonNullable<AnalyticsEvent["dimensions"]>;
type SafeMeasures = NonNullable<AnalyticsEvent["measures"]>;

interface RawArtifact {
  readonly kind: ArtifactKind;
  readonly id: string;
}

interface RawActor {
  readonly kind: ActorKind;
  readonly id: string;
}

interface RuntimeRecordBase {
  readonly workspaceId: string;
  readonly artifact?: RawArtifact;
  readonly actor?: RawActor;
  readonly correlationId?: string;
  readonly occurredAt?: string;
  readonly dimensions?: SafeDimensions;
  readonly measures?: SafeMeasures;
}

export interface RuntimeAnalyticsInput extends RuntimeRecordBase {
  readonly name: AnalyticsName;
  readonly artifact: RawArtifact;
}

export interface RuntimeLogInput extends RuntimeRecordBase {
  readonly lane: ObservabilityLane;
  readonly code: ObservabilityCode;
}

export interface QualityTelemetryRuntimeOptions {
  readonly idFactory?: () => string;
  readonly now?: () => string;
}

export class QualityTelemetryRuntime {
  readonly #store = new QualityTelemetryStore();
  readonly #semanticEventKeys = new Set<string>();
  readonly #idFactory: () => string;
  readonly #now: () => string;

  constructor(options: QualityTelemetryRuntimeOptions = {}) {
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  newCorrelationId(): string {
    return this.#idFactory();
  }

  recordEvent(input: RuntimeAnalyticsInput): void {
    this.#store.recordEvent(
      createAnalyticsEvent({
        eventId: this.#idFactory(),
        workspaceId: input.workspaceId,
        correlationId: input.correlationId ?? this.newCorrelationId(),
        occurredAt: input.occurredAt ?? this.#now(),
        name: input.name,
        artifact: input.artifact,
        ...(input.actor ? { actor: input.actor } : {}),
        ...(input.dimensions ? { dimensions: input.dimensions } : {}),
        ...(input.measures ? { measures: input.measures } : {}),
      }),
    );
  }

  recordEventOnce(key: string, input: RuntimeAnalyticsInput): boolean {
    if (this.#semanticEventKeys.has(key)) return false;
    this.recordEvent(input);
    this.#semanticEventKeys.add(key);
    return true;
  }

  recordLog(input: RuntimeLogInput): void {
    this.#store.recordLog(
      createObservabilityLog({
        logId: this.#idFactory(),
        workspaceId: input.workspaceId,
        correlationId: input.correlationId ?? this.newCorrelationId(),
        occurredAt: input.occurredAt ?? this.#now(),
        lane: input.lane,
        code: input.code,
        ...(input.artifact ? { artifact: input.artifact } : {}),
        ...(input.actor ? { actor: input.actor } : {}),
        ...(input.dimensions ? { dimensions: input.dimensions } : {}),
        ...(input.measures ? { measures: input.measures } : {}),
      }),
    );
  }

  recordPerformance(input: {
    readonly correlationId: string;
    readonly name: PerformanceName;
    readonly durationMs: number;
    readonly observedAt?: string;
  }): void {
    this.#store.recordPerformance(
      createPerformanceMeasurement({
        measurementId: this.#idFactory(),
        correlationId: input.correlationId,
        observedAt: input.observedAt ?? this.#now(),
        name: input.name,
        durationMs: input.durationMs,
      }),
    );
  }

  recordGuardrail(input: {
    readonly kind: GuardrailKind;
    readonly count: number;
    readonly observedAt?: string;
  }): void {
    this.#store.recordGuardrail(
      createGuardrailMetric({
        metricId: this.#idFactory(),
        observedAt: input.observedAt ?? this.#now(),
        kind: input.kind,
        count: input.count,
      }),
    );
  }

  snapshot(): QualityTelemetrySnapshot {
    return this.#store.snapshot();
  }

  report(workspaceId?: string) {
    const snapshot = this.snapshot();
    if (!workspaceId) return buildQualityReport(snapshot);
    return buildQualityReport({
      events: snapshot.events.filter((event) => event.workspaceId === workspaceId),
      logs: snapshot.logs.filter((log) => log.workspaceId === workspaceId),
      performance: [],
      guardrails: [],
    });
  }
}
