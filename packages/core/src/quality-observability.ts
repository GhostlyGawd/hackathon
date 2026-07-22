import { createHash } from "node:crypto";

import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const nonNegativeInteger = z.number().int().nonnegative();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);

export const ANALYTICS_EVENT_NAMES = [
  "SOFTWARE_RECORD_CREATED",
  "AUTHORIZATION_CREATED",
  "AUTHORIZATION_EXPIRED",
  "AUTHORIZATION_REVOKED",
  "AGREEMENT_UPLOADED",
  "REQUIREMENT_PROPOSED",
  "REQUIREMENT_CONFIRMED",
  "REQUIREMENT_REJECTED",
  "REQUIREMENT_MARKED_AMBIGUOUS",
  "JOURNEY_CREATED",
  "JOURNEY_REPLAYED",
  "JOURNEY_REPAIRED",
  "JOURNEY_ABANDONED",
  "RUN_QUEUED",
  "RUN_TERMINAL",
  "CHECKPOINT_VISIBLE",
  "CHECKPOINT_INVISIBLE",
  "CHECKPOINT_TESTED",
  "CHECKPOINT_UNTESTED",
  "FINDING_CREATED",
  "FINDING_SUPERSEDED",
  "RECEIPT_VIEWED",
  "RECEIPT_VERIFIED",
  "RECEIPT_EXPORTED",
  "RECEIPT_ARTIFACT_CONTENT_DELETED",
  "APPROVAL_PLACED_ON_HOLD",
  "HUMAN_DECISION_RECORDED",
] as const;

export const OBSERVABILITY_LANES = [
  "MODEL",
  "HARNESS",
  "RECORDER",
  "RULE_EVALUATION",
  "HUMAN_DECISION",
] as const;

export const OBSERVABILITY_CODES = [
  "MODEL_ACTION",
  "MODEL_FAILURE",
  "HARNESS_ACTION",
  "BLOCKED_ACTION",
  "RECORDER_EVENT",
  "CAPTURE_GAP",
  "RULE_EVALUATED",
  "HUMAN_DECISION",
] as const;

export const GUARDRAIL_KINDS = [
  "AUTOMATED_APPROVAL_OR_RESTORE",
  "OUT_OF_SCOPE_ACTION",
  "REAL_STUDENT_DATA",
  "SECRET_EXPOSURE",
  "UNKNOWN_DESTINATION_ATTRIBUTION",
  "MISSING_FINDING_SCOPE",
  "DEFECTIVE_HOLD",
] as const;

export const PERFORMANCE_MEASUREMENT_NAMES = [
  "CONSOLE_INTERACTION",
  "RUN_PROGRESS",
  "EVIDENCE_SUMMARY",
] as const;

const artifactKind = z.enum([
  "SOFTWARE",
  "AUTHORIZATION",
  "AGREEMENT",
  "REQUIREMENT",
  "JOURNEY",
  "RUN",
  "CHECKPOINT",
  "FINDING",
  "RECEIPT",
  "APPROVAL",
]);

const rawIdentitySchema = z
  .object({
    kind: artifactKind,
    id: z.string().min(1).max(512),
  })
  .strict();

const pseudonymousIdentitySchema = z
  .object({
    kind: artifactKind,
    sha256,
  })
  .strict();

const rawActorSchema = z
  .object({
    kind: z.enum(["HUMAN", "AUTOMATION"]),
    id: z.string().min(1).max(512),
  })
  .strict();

const pseudonymousActorSchema = z
  .object({
    kind: z.enum(["HUMAN", "AUTOMATION"]),
    sha256,
  })
  .strict();

const safeDimensionsSchema = z
  .object({
    terminalState: z
      .enum(["COMPLETED", "PARTIAL", "FAILED", "CANCELED"])
      .optional(),
    checkpointState: z
      .enum(["VISIBLE", "NOT_VISIBLE", "TESTED", "NOT_TESTED"])
      .optional(),
    findingState: z
      .enum([
        "WITNESSED_CONFLICT",
        "NEEDS_REVIEW",
        "NOT_VISIBLE",
        "NOT_TESTED",
        "NOT_REOBSERVED_IN_NAMED_TESTS",
        "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS",
      ])
      .optional(),
    approvalState: z
      .enum(["UNKNOWN", "APPROVED", "HOLD", "REJECTED", "RETIRED"])
      .optional(),
    decisionKind: z.enum(["KEEP_HOLD", "RESTORE_APPROVAL", "REJECT", "RETIRE"]).optional(),
    modelOutcome: z.enum(["SUCCEEDED", "REFUSED", "INCOMPLETE", "FAILED"]).optional(),
    browserEngine: z.enum(["CHROMIUM", "FIREFOX", "WEBKIT"]).optional(),
    failureCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/u).optional(),
  })
  .strict();

const safeMeasuresSchema = z
  .object({
    durationMs: nonNegativeInteger.optional(),
    latencyMs: nonNegativeInteger.optional(),
    retryCount: nonNegativeInteger.optional(),
    blockedActionCount: nonNegativeInteger.optional(),
    captureGapCount: nonNegativeInteger.optional(),
    modelFailureCount: nonNegativeInteger.optional(),
    estimatedCostMicroUsd: nonNegativeInteger.optional(),
  })
  .strict();

const analyticsEventInputSchema = z
  .object({
    eventId: uuid,
    workspaceId: uuid,
    correlationId: uuid,
    occurredAt: timestamp,
    name: z.enum(ANALYTICS_EVENT_NAMES),
    artifact: rawIdentitySchema,
    actor: rawActorSchema.optional(),
    dimensions: safeDimensionsSchema.optional(),
    measures: safeMeasuresSchema.optional(),
  })
  .strict();

const analyticsEventSchema = z
  .object({
    version: z.literal("pactwire-analytics-v1"),
    eventId: uuid,
    workspaceId: uuid,
    correlationId: uuid,
    occurredAt: timestamp,
    name: z.enum(ANALYTICS_EVENT_NAMES),
    artifact: pseudonymousIdentitySchema,
    actor: pseudonymousActorSchema.optional(),
    dimensions: safeDimensionsSchema.optional(),
    measures: safeMeasuresSchema.optional(),
  })
  .strict();

const observabilityLogInputSchema = z
  .object({
    logId: uuid,
    workspaceId: uuid,
    correlationId: uuid,
    occurredAt: timestamp,
    lane: z.enum(OBSERVABILITY_LANES),
    code: z.enum(OBSERVABILITY_CODES),
    artifact: rawIdentitySchema.optional(),
    actor: rawActorSchema.optional(),
    dimensions: safeDimensionsSchema.optional(),
    measures: safeMeasuresSchema.optional(),
  })
  .strict();

const observabilityLogSchema = z
  .object({
    version: z.literal("pactwire-observability-v1"),
    logId: uuid,
    workspaceId: uuid,
    correlationId: uuid,
    occurredAt: timestamp,
    lane: z.enum(OBSERVABILITY_LANES),
    code: z.enum(OBSERVABILITY_CODES),
    artifact: pseudonymousIdentitySchema.optional(),
    actor: pseudonymousActorSchema.optional(),
    dimensions: safeDimensionsSchema.optional(),
    measures: safeMeasuresSchema.optional(),
  })
  .strict();

const performanceMeasurementSchema = z
  .object({
    version: z.literal("pactwire-performance-v1"),
    measurementId: uuid,
    correlationId: uuid,
    observedAt: timestamp,
    name: z.enum(PERFORMANCE_MEASUREMENT_NAMES),
    durationMs: nonNegativeInteger,
  })
  .strict();

const performanceMeasurementInputSchema = performanceMeasurementSchema.omit({
  version: true,
});

const guardrailMetricSchema = z
  .object({
    version: z.literal("pactwire-guardrail-v1"),
    metricId: uuid,
    observedAt: timestamp,
    kind: z.enum(GUARDRAIL_KINDS),
    count: nonNegativeInteger,
  })
  .strict();

const guardrailMetricInputSchema = guardrailMetricSchema.omit({ version: true });

export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type ObservabilityLog = z.infer<typeof observabilityLogSchema>;
export type PerformanceMeasurement = z.infer<typeof performanceMeasurementSchema>;
export type GuardrailMetric = z.infer<typeof guardrailMetricSchema>;

const codeOwners = Object.freeze({
  MODEL_ACTION: "MODEL",
  MODEL_FAILURE: "MODEL",
  HARNESS_ACTION: "HARNESS",
  BLOCKED_ACTION: "HARNESS",
  RECORDER_EVENT: "RECORDER",
  CAPTURE_GAP: "RECORDER",
  RULE_EVALUATED: "RULE_EVALUATION",
  HUMAN_DECISION: "HUMAN_DECISION",
} satisfies Readonly<Record<(typeof OBSERVABILITY_CODES)[number], (typeof OBSERVABILITY_LANES)[number]>>);

function hashIdentity(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function pseudonymousIdentity(input: z.infer<typeof rawIdentitySchema>) {
  return Object.freeze({ kind: input.kind, sha256: hashIdentity(input.id) });
}

function pseudonymousActor(input: z.infer<typeof rawActorSchema>) {
  return Object.freeze({ kind: input.kind, sha256: hashIdentity(input.id) });
}

export function createAnalyticsEvent(candidate: unknown): AnalyticsEvent {
  const input = analyticsEventInputSchema.parse(candidate);
  return Object.freeze(
    analyticsEventSchema.parse({
      version: "pactwire-analytics-v1",
      eventId: input.eventId,
      workspaceId: input.workspaceId,
      correlationId: input.correlationId,
      occurredAt: input.occurredAt,
      name: input.name,
      artifact: pseudonymousIdentity(input.artifact),
      ...(input.actor ? { actor: pseudonymousActor(input.actor) } : {}),
      ...(input.dimensions ? { dimensions: Object.freeze(input.dimensions) } : {}),
      ...(input.measures ? { measures: Object.freeze(input.measures) } : {}),
    }),
  );
}

export function createObservabilityLog(candidate: unknown): ObservabilityLog {
  const input = observabilityLogInputSchema.parse(candidate);
  if (codeOwners[input.code] !== input.lane) {
    throw new TypeError(
      `${input.code} belongs to the ${codeOwners[input.code]} responsibility lane`,
    );
  }
  return Object.freeze(
    observabilityLogSchema.parse({
      version: "pactwire-observability-v1",
      logId: input.logId,
      workspaceId: input.workspaceId,
      correlationId: input.correlationId,
      occurredAt: input.occurredAt,
      lane: input.lane,
      code: input.code,
      ...(input.artifact ? { artifact: pseudonymousIdentity(input.artifact) } : {}),
      ...(input.actor ? { actor: pseudonymousActor(input.actor) } : {}),
      ...(input.dimensions ? { dimensions: Object.freeze(input.dimensions) } : {}),
      ...(input.measures ? { measures: Object.freeze(input.measures) } : {}),
    }),
  );
}

export function createPerformanceMeasurement(candidate: unknown): PerformanceMeasurement {
  const input = performanceMeasurementInputSchema.parse(candidate);
  return Object.freeze(
    performanceMeasurementSchema.parse({
      version: "pactwire-performance-v1",
      ...input,
    }),
  );
}

export function createGuardrailMetric(candidate: unknown): GuardrailMetric {
  const input = guardrailMetricInputSchema.parse(candidate);
  return Object.freeze(
    guardrailMetricSchema.parse({
      version: "pactwire-guardrail-v1",
      ...input,
    }),
  );
}

export interface QualityTelemetrySnapshot {
  readonly events: readonly AnalyticsEvent[];
  readonly logs: readonly ObservabilityLog[];
  readonly performance: readonly PerformanceMeasurement[];
  readonly guardrails: readonly GuardrailMetric[];
}

function sameRecord(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function recordOnce<T>(records: Map<string, T>, id: string, record: T): boolean {
  const existing = records.get(id);
  if (existing) {
    if (!sameRecord(existing, record)) {
      throw new TypeError(`Telemetry identifier ${id} was reused with different bytes`);
    }
    return false;
  }
  records.set(id, record);
  return true;
}

function sortedValues<T>(records: ReadonlyMap<string, T>): readonly T[] {
  return Object.freeze(
    [...records.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, value]) => value),
  );
}

export class QualityTelemetryStore {
  readonly #events = new Map<string, AnalyticsEvent>();
  readonly #logs = new Map<string, ObservabilityLog>();
  readonly #performance = new Map<string, PerformanceMeasurement>();
  readonly #guardrails = new Map<string, GuardrailMetric>();

  recordEvent(event: AnalyticsEvent): boolean {
    return recordOnce(this.#events, event.eventId, analyticsEventSchema.parse(event));
  }

  recordLog(log: ObservabilityLog): boolean {
    return recordOnce(this.#logs, log.logId, observabilityLogSchema.parse(log));
  }

  recordPerformance(measurement: PerformanceMeasurement): boolean {
    return recordOnce(
      this.#performance,
      measurement.measurementId,
      performanceMeasurementSchema.parse(measurement),
    );
  }

  recordGuardrail(metric: GuardrailMetric): boolean {
    return recordOnce(
      this.#guardrails,
      metric.metricId,
      guardrailMetricSchema.parse(metric),
    );
  }

  snapshot(): QualityTelemetrySnapshot {
    return Object.freeze({
      events: sortedValues(this.#events),
      logs: sortedValues(this.#logs),
      performance: sortedValues(this.#performance),
      guardrails: sortedValues(this.#guardrails),
    });
  }
}

export const QUALITY_PROFILE = Object.freeze({
  version: "pactwire-quality-profile-v1",
  accessibility: Object.freeze({
    standard: "WCAG 2.2 AA",
    automatedTags: Object.freeze([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
      "wcag22aa",
    ]),
  }),
  performance: Object.freeze({
    consoleInteractionP95Ms: 500,
    runProgressP95Ms: 2_000,
    evidenceSummaryP95Ms: 500,
  }),
  compatibility: Object.freeze({
    packagedBrowser: "Chromium",
    packagedChromiumVersion: "149.0.7827.55",
    packagedChromiumRevision: "1228",
    supportedFeatures: Object.freeze([
      "DOM",
      "FETCH",
      "FORMS",
      "NETWORK_OBSERVATION",
      "STORAGE_OBSERVATION",
    ]),
  }),
});

type PerformanceName = (typeof PERFORMANCE_MEASUREMENT_NAMES)[number];

function nearestRankP95(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null;
}

function performanceResult(
  snapshot: QualityTelemetrySnapshot,
  name: PerformanceName,
  budgetMs: number,
) {
  const values = snapshot.performance
    .filter((measurement) => measurement.name === name)
    .map((measurement) => measurement.durationMs);
  const p95Ms = nearestRankP95(values);
  return Object.freeze({
    sampleCount: values.length,
    p95Ms,
    budgetMs,
    passed: p95Ms !== null && p95Ms <= budgetMs,
  });
}

function sumMeasure(
  records: readonly (AnalyticsEvent | ObservabilityLog)[],
  key: keyof NonNullable<AnalyticsEvent["measures"]>,
): number {
  return records.reduce(
    (total, record) => total + (record.measures?.[key] ?? 0),
    0,
  );
}

export function buildQualityReport(snapshot: QualityTelemetrySnapshot) {
  const performance = Object.freeze({
    consoleInteraction: performanceResult(
      snapshot,
      "CONSOLE_INTERACTION",
      QUALITY_PROFILE.performance.consoleInteractionP95Ms,
    ),
    runProgress: performanceResult(
      snapshot,
      "RUN_PROGRESS",
      QUALITY_PROFILE.performance.runProgressP95Ms,
    ),
    evidenceSummary: performanceResult(
      snapshot,
      "EVIDENCE_SUMMARY",
      QUALITY_PROFILE.performance.evidenceSummaryP95Ms,
    ),
  });
  const guardrails = Object.fromEntries(
    GUARDRAIL_KINDS.map((kind) => {
      const metrics = snapshot.guardrails.filter((metric) => metric.kind === kind);
      const count = metrics
        .reduce((total, metric) => total + metric.count, 0);
      return [
        kind,
        Object.freeze({
          count,
          sampleCount: metrics.length,
          passed: metrics.length > 0 && count === 0,
        }),
      ];
    }),
  ) as Readonly<
    Record<
      (typeof GUARDRAIL_KINDS)[number],
      Readonly<{ count: number; sampleCount: number; passed: boolean }>
    >
  >;
  const lanes = Object.fromEntries(
    OBSERVABILITY_LANES.map((lane) => [
      lane,
      snapshot.logs.filter((log) => log.lane === lane).length,
    ]),
  ) as Readonly<Record<(typeof OBSERVABILITY_LANES)[number], number>>;
  const analyticsEvents = Object.fromEntries(
    ANALYTICS_EVENT_NAMES.map((name) => [
      name,
      snapshot.events.filter((event) => event.name === name).length,
    ]),
  ) as Readonly<Record<(typeof ANALYTICS_EVENT_NAMES)[number], number>>;
  const observableRecords = [...snapshot.events, ...snapshot.logs];
  const passed =
    Object.values(performance).every((result) => result.passed) &&
    Object.values(guardrails).every((result) => result.passed);

  return Object.freeze({
    version: "pactwire-quality-report-v1",
    profileVersion: QUALITY_PROFILE.version,
    status: passed ? ("PASS" as const) : ("FAIL" as const),
    counts: Object.freeze({
      analyticsEvents: snapshot.events.length,
      structuredLogs: snapshot.logs.length,
      performanceSamples: snapshot.performance.length,
      guardrailMetrics: snapshot.guardrails.length,
    }),
    analyticsEvents: Object.freeze(analyticsEvents),
    performance,
    guardrails: Object.freeze(guardrails),
    responsibilityLanes: Object.freeze(lanes),
    observability: Object.freeze({
      estimatedCostMicroUsd: sumMeasure(
        observableRecords,
        "estimatedCostMicroUsd",
      ),
      latencyMs: sumMeasure(observableRecords, "latencyMs"),
      retryCount: sumMeasure(observableRecords, "retryCount"),
      blockedActionCount: sumMeasure(observableRecords, "blockedActionCount"),
      captureGapCount: sumMeasure(observableRecords, "captureGapCount"),
      modelFailureCount: sumMeasure(observableRecords, "modelFailureCount"),
    }),
  });
}

export type QualityReport = ReturnType<typeof buildQualityReport>;

export function buildServiceHealth(report: QualityReport) {
  return Object.freeze({
    product: "Pactwire",
    service: "quality-gates",
    status: report.status === "PASS" ? ("ok" as const) : ("degraded" as const),
    profileVersion: report.profileVersion,
    checks: Object.freeze({
      performance: Object.values(report.performance).every((result) => result.passed),
      guardrails: Object.values(report.guardrails).every((result) => result.passed),
      telemetrySchema: true,
    }),
  });
}

const browserCompatibilityInputSchema = z
  .object({
    targetKind: z.literal("BROWSER"),
    browserEngine: z.enum(["CHROMIUM", "FIREFOX", "WEBKIT"]),
    browserVersion: z.string().min(1).max(64),
    requiredFeatures: z.array(z.string().min(1).max(64)).max(100),
  })
  .strict();

const nativeCompatibilityInputSchema = z
  .object({
    targetKind: z.literal("NATIVE_APPLICATION"),
    requiredFeatures: z.array(z.string().min(1).max(64)).max(100),
  })
  .strict();

const compatibilityInputSchema = z.discriminatedUnion("targetKind", [
  browserCompatibilityInputSchema,
  nativeCompatibilityInputSchema,
]);

export function evaluateTargetCompatibility(candidate: unknown) {
  const input = compatibilityInputSchema.parse(candidate);
  const reasons: string[] = [];
  if (input.targetKind === "NATIVE_APPLICATION") {
    reasons.push("Native applications are not supported in P0.");
  } else {
    if (input.browserEngine !== "CHROMIUM") {
      reasons.push("Only the packaged Chromium runner is supported in P0.");
    } else if (
      input.browserVersion !== QUALITY_PROFILE.compatibility.packagedChromiumVersion
    ) {
      reasons.push(
        `Chromium ${input.browserVersion} is not the packaged ${QUALITY_PROFILE.compatibility.packagedChromiumVersion} build.`,
      );
    }
    const unsupported = input.requiredFeatures.filter(
      (feature) => !QUALITY_PROFILE.compatibility.supportedFeatures.includes(feature),
    );
    if (unsupported.length > 0) {
      reasons.push(`Unsupported browser features: ${[...new Set(unsupported)].sort().join(", ")}.`);
    }
  }
  return Object.freeze({
    status: reasons.length === 0 ? ("SUPPORTED" as const) : ("BLOCKED" as const),
    reasons: Object.freeze(reasons),
    profileVersion: QUALITY_PROFILE.version,
  });
}
