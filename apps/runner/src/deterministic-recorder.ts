import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  canaryMatchCandidateSchema,
  canaryMatcherReportSchema,
  canarySchema,
  matchCanaryObservation,
  observationSchema,
  redactSecretText,
  SECRET_SCREENSHOT_MASK_SELECTORS,
  secretValueSchema,
  type CanaryMatchCandidate,
  type CanaryMatcherReport,
} from "@pactwire/core";
import type { CDPSession, Page } from "playwright-core";
import { z } from "zod";

export const BROWSER_CDP_RECORDER_VERSION = "pactwire-browser-cdp-recorder-v1";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const shortText = z.string().trim().min(1).max(240);
const httpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const exactHost = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .refine((value) => value === value.toLowerCase(), {
    message: "Recorder hosts must be lowercase exact hostnames",
  })
  .refine((value) => {
    try {
      return new URL(`https://${value}`).hostname === value;
    } catch {
      return false;
    }
  }, "Recorder hosts must be exact hostnames");
const exactPath = z
  .string()
  .min(1)
  .max(2_048)
  .refine(
    (value) =>
      value.startsWith("/") &&
      !/[\\?#]/u.test(value) &&
      new URL(value, "https://recorder.pactwire.invalid").pathname === value,
    "Recorder paths must be exact pathnames",
  );
const sensitiveFieldSegment = /^(?:authorization|cookie|password|passcode|token|secret|credential|session(?:id)?)$/iu;
const requestFieldPath = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/u)
  .refine(
    (value) => !value.split(".").some((segment) => sensitiveFieldSegment.test(segment)),
    "Credential-shaped request fields cannot be persisted as authorized evidence",
  );

export const authorizedRequestRuleSchema = z
  .object({
    host: exactHost,
    method: httpMethodSchema,
    path: exactPath,
    fields: z.array(requestFieldPath).max(64),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.fields).size !== value.fields.length) {
      context.addIssue({
        code: "custom",
        path: ["fields"],
        message: "Authorized request fields must be unique",
      });
    }
  });
export type AuthorizedRequestRule = z.infer<typeof authorizedRequestRuleSchema>;

export const requiredNetworkCheckpointSchema = z
  .object({
    id: shortText,
    required: z.boolean(),
    host: exactHost,
    method: httpMethodSchema,
    path: exactPath,
    requiredRequestFields: z.array(requestFieldPath).max(64),
    requireResponseMetadata: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.requiredRequestFields).size !==
      value.requiredRequestFields.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["requiredRequestFields"],
        message: "Required request fields must be unique",
      });
    }
  });
export type RequiredNetworkCheckpoint = z.infer<
  typeof requiredNetworkCheckpointSchema
>;

export const deterministicRecorderConfigSchema = z
  .object({
    workspaceId: uuid,
    runId: uuid,
    recorderVersion: z.literal(BROWSER_CDP_RECORDER_VERSION).default(
      BROWSER_CDP_RECORDER_VERSION,
    ),
    captureMode: z.literal("BROWSER_CDP"),
    authorizedRequestRules: z.array(authorizedRequestRuleSchema).max(128),
    requiredCheckpoints: z.array(requiredNetworkCheckpointSchema).min(1).max(128),
    secrets: z.array(secretValueSchema).max(64),
    canaries: z.array(canarySchema).max(10_000).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const ruleKeys = value.authorizedRequestRules.map(
      (rule) => `${rule.method} ${rule.host}${rule.path}`,
    );
    const checkpointIds = value.requiredCheckpoints.map(({ id }) => id);
    if (new Set(ruleKeys).size !== ruleKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["authorizedRequestRules"],
        message: "Authorized request rules must be unique",
      });
    }
    if (new Set(checkpointIds).size !== checkpointIds.length) {
      context.addIssue({
        code: "custom",
        path: ["requiredCheckpoints"],
        message: "Required checkpoint identifiers must be unique",
      });
    }
    if (!value.requiredCheckpoints.some(({ required }) => required)) {
      context.addIssue({
        code: "custom",
        path: ["requiredCheckpoints"],
        message: "A recorder configuration needs at least one required checkpoint",
      });
    }
    if (new Set(value.secrets).size !== value.secrets.length) {
      context.addIssue({
        code: "custom",
        path: ["secrets"],
        message: "Recorder secrets must be unique",
      });
    }
    if (
      value.canaries.some(
        (canary) =>
          canary.workspaceId !== value.workspaceId || canary.runId !== value.runId,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["canaries"],
        message: "Recorder canaries must belong to its workspace and run",
      });
    }
    for (const checkpoint of value.requiredCheckpoints) {
      const rule = value.authorizedRequestRules.find(
        (candidate) =>
          candidate.host === checkpoint.host &&
          candidate.method === checkpoint.method &&
          candidate.path === checkpoint.path,
      );
      if (
        checkpoint.requiredRequestFields.length > 0 &&
        (!rule ||
          checkpoint.requiredRequestFields.some(
            (field) => !rule.fields.includes(field),
          ))
      ) {
        context.addIssue({
          code: "custom",
          path: ["requiredCheckpoints"],
          message:
            "Every required request field needs an exact authorized capture rule",
        });
      }
    }
  });
export type DeterministicRecorderConfig = z.infer<
  typeof deterministicRecorderConfigSchema
>;

const recorderSourceSchema = z.enum([
  "BROWSER",
  "NETWORK",
  "STORAGE",
  "RECORDER",
]);
const recorderCandidateSchema = z
  .object({
    logicalClock: z.number().int().nonnegative(),
    stableKey: z.string().min(1).max(512),
    source: recorderSourceSchema,
    observedAt: timestamp,
    facts: z.record(z.string(), z.unknown()),
  })
  .strict();
export type RecorderCandidate = z.infer<typeof recorderCandidateSchema>;

function deepFreeze<T>(candidate: T): T {
  if (typeof candidate !== "object" || candidate === null || Object.isFrozen(candidate)) {
    return candidate;
  }
  for (const nested of Object.values(candidate)) deepFreeze(nested);
  return Object.freeze(candidate);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function deterministicUuid(input: string): string {
  const bytes = Buffer.from(sha256(input).slice(0, 32), "hex");
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const sourcePriority: Readonly<Record<z.infer<typeof recorderSourceSchema>, number>> =
  Object.freeze({ BROWSER: 0, NETWORK: 1, STORAGE: 2, RECORDER: 3 });

export function canonicalizeRecorderCandidates(candidate: unknown) {
  const input = z
    .object({
      workspaceId: uuid,
      runId: uuid,
      recorderVersion: z.literal(BROWSER_CDP_RECORDER_VERSION),
      candidates: z.array(recorderCandidateSchema),
    })
    .strict()
    .parse(candidate);
  const ordered = [...input.candidates].sort(
    (left, right) =>
      left.logicalClock - right.logicalClock ||
      sourcePriority[left.source] - sourcePriority[right.source] ||
      left.stableKey.localeCompare(right.stableKey) ||
      canonicalJson(left.facts).localeCompare(canonicalJson(right.facts)),
  );
  return deepFreeze(
    ordered.map((item, sequence) => {
      const facts = canonicalize(item.facts) as Record<string, unknown>;
      const payloadHash = sha256(canonicalJson({ source: item.source, facts }));
      return observationSchema.parse({
        id: deterministicUuid(
          `${input.workspaceId}:${input.runId}:${input.recorderVersion}:${sequence}:${item.source}:${payloadHash}`,
        ),
        workspaceId: input.workspaceId,
        runId: input.runId,
        source: item.source,
        recorderVersion: input.recorderVersion,
        sequence,
        observedAt: item.observedAt,
        payloadHash,
        facts,
      });
    }),
  );
}

export const recorderCaptureGapReasonSchema = z.enum([
  "INSTRUMENTATION_UNAVAILABLE",
  "CAPTURE_STREAM_INTERRUPTED",
  "REQUEST_FIELDS_UNINSPECTABLE",
  "REQUIRED_REQUEST_FIELD_MISSING",
  "NETWORK_LIFECYCLE_FAILED",
  "NETWORK_LIFECYCLE_INCOMPLETE",
  "SERVICE_WORKER_INTERFERENCE",
  "PAGE_CRASHED",
  "SCREENSHOT_CAPTURE_FAILED",
  "STORAGE_CAPTURE_FAILED",
]);
export type RecorderCaptureGapReason = z.infer<
  typeof recorderCaptureGapReasonSchema
>;

const visibilitySignalSchema = z
  .object({
    checkpointId: shortText,
    observationId: uuid,
    requestFieldsVisible: z.boolean(),
    responseMetadataVisible: z.boolean(),
  })
  .strict();
const visibilityGapSchema = z
  .object({
    checkpointIds: z.array(shortText),
    reason: recorderCaptureGapReasonSchema,
  })
  .strict();
export const recorderVisibilitySchema = z
  .object({
    state: z.enum(["VISIBLE", "NOT_VISIBLE", "NOT_TESTED"]),
    allRequiredVisible: z.boolean(),
    checkpoints: z.array(
      z
        .object({
          checkpointId: shortText,
          required: z.boolean(),
          exercised: z.boolean(),
          visible: z.boolean(),
          observationIds: z.array(uuid),
          gapReasons: z.array(recorderCaptureGapReasonSchema),
        })
        .strict(),
    ),
  })
  .strict();
export type RecorderVisibility = z.infer<typeof recorderVisibilitySchema>;

export function evaluateRequiredVisibility(candidate: unknown): RecorderVisibility {
  const input = z
    .object({
      checkpoints: z.array(requiredNetworkCheckpointSchema).min(1),
      signals: z.array(visibilitySignalSchema),
      gaps: z.array(visibilityGapSchema),
    })
    .strict()
    .parse(candidate);
  const checkpoints = input.checkpoints.map((checkpoint) => {
    const signals = input.signals.filter(
      ({ checkpointId }) => checkpointId === checkpoint.id,
    );
    const gapReasons = [
      ...new Set(
        input.gaps
          .filter(({ checkpointIds }) => checkpointIds.includes(checkpoint.id))
          .map(({ reason }) => reason),
      ),
    ].sort();
    const exercised = signals.length > 0;
    const signalVisible = signals.some(
      (signal) =>
        signal.requestFieldsVisible &&
        (!checkpoint.requireResponseMetadata || signal.responseMetadataVisible),
    );
    return {
      checkpointId: checkpoint.id,
      required: checkpoint.required,
      exercised,
      visible: exercised && signalVisible && gapReasons.length === 0,
      observationIds: [...new Set(signals.map(({ observationId }) => observationId))],
      gapReasons,
    };
  });
  const required = checkpoints.filter(({ required }) => required);
  const anyRequiredGap = required.some(({ gapReasons }) => gapReasons.length > 0);
  const allRequiredVisible = required.every(
    ({ exercised, visible }) => exercised && visible,
  );
  const state = anyRequiredGap
    ? "NOT_VISIBLE"
    : allRequiredVisible
      ? "VISIBLE"
      : "NOT_TESTED";
  return deepFreeze(
    recorderVisibilitySchema.parse({ state, allRequiredVisible, checkpoints }),
  );
}

export const authorizedRequestFieldSummarySchema = z
  .object({
    name: requestFieldPath,
    present: z.boolean(),
    valueSha256: sha256Schema.optional(),
    valueType: z
      .enum(["string", "number", "boolean", "null", "array", "object"])
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.present !== Boolean(value.valueSha256 && value.valueType)) {
      context.addIssue({
        code: "custom",
        message: "Present authorized fields require only a type and SHA-256 digest",
      });
    }
  });
export type AuthorizedRequestFieldSummary = z.infer<
  typeof authorizedRequestFieldSummarySchema
>;
export const authorizedRequestFieldsResultSchema = z
  .object({
    status: z.enum(["CAPTURED", "MISSING_FIELDS", "UNINSPECTABLE"]),
    fields: z.array(authorizedRequestFieldSummarySchema),
  })
  .strict();
export type AuthorizedRequestFieldsResult = z.infer<
  typeof authorizedRequestFieldsResultSchema
>;

function recordValue(candidate: unknown): Record<string, unknown> | undefined {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : undefined;
}

function nestedField(record: Record<string, unknown>, fieldPath: string): {
  readonly present: boolean;
  readonly value?: unknown;
} {
  let current: unknown = record;
  for (const segment of fieldPath.split(".")) {
    const object = recordValue(current);
    if (!object || !Object.hasOwn(object, segment)) return { present: false };
    current = object[segment];
  }
  return { present: true, value: current };
}

function valueType(value: unknown): AuthorizedRequestFieldSummary["valueType"] {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (["string", "number", "boolean"].includes(typeof value)) {
    return typeof value as "string" | "number" | "boolean";
  }
  return "object";
}

interface AuthorizedRequestFieldInspection {
  readonly summary: AuthorizedRequestFieldsResult;
  readonly transientCanaryCandidates: readonly CanaryMatchCandidate[];
}

function inspectAuthorizedRequestFields(
  candidate: unknown,
): AuthorizedRequestFieldInspection {
  const input = z
    .object({
      postData: z.string(),
      fieldNames: z.array(requestFieldPath),
      secrets: z.array(secretValueSchema),
    })
    .strict()
    .parse(candidate);
  let body: Record<string, unknown> | undefined;
  try {
    body = recordValue(JSON.parse(input.postData) as unknown);
  } catch {
    body = undefined;
  }
  if (!body) {
    return deepFreeze({
      summary: authorizedRequestFieldsResultSchema.parse({
        status: "UNINSPECTABLE",
        fields: [],
      }),
      transientCanaryCandidates: [],
    });
  }
  const transientCanaryCandidates: CanaryMatchCandidate[] = [];
  const fields = input.fieldNames.map((name) => {
    const nested = nestedField(body, name);
    if (!nested.present) return { name, present: false };
    if (typeof nested.value === "string") {
      transientCanaryCandidates.push(
        canaryMatchCandidateSchema.parse({
          location: "BODY",
          path: name,
          value: nested.value,
        }),
      );
    }
    return {
      name,
      present: true,
      valueSha256: sha256(canonicalJson(nested.value)),
      valueType: valueType(nested.value),
    };
  });
  void input.secrets;
  return deepFreeze({
    summary: authorizedRequestFieldsResultSchema.parse({
      status: fields.every(({ present }) => present)
        ? "CAPTURED"
        : "MISSING_FIELDS",
      fields,
    }),
    transientCanaryCandidates,
  });
}

export function summarizeAuthorizedRequestFields(
  candidate: unknown,
): AuthorizedRequestFieldsResult {
  return inspectAuthorizedRequestFields(candidate).summary;
}

const initiatorSchema = z
  .object({
    type: z.string().min(1),
    url: z.string().min(1).optional(),
  })
  .strict();
const responseMetadataSchema = z
  .object({
    status: z.number().int().min(100).max(599),
    mimeType: z.string(),
    protocol: z.string(),
    fromDiskCache: z.boolean(),
    fromServiceWorker: z.boolean(),
    encodedDataLength: z.number().nonnegative().optional(),
  })
  .strict();
export const networkObservationFactsSchema = z
  .object({
    kind: z.literal("NETWORK_REQUEST"),
    requestOrdinal: z.number().int().positive(),
    checkpointIds: z.array(shortText),
    request: z
      .object({
        method: z.string().min(1),
        url: z.string().min(1),
        urlSha256: sha256Schema,
        host: z.string(),
        path: z.string(),
        resourceType: z.string().min(1),
        initiator: initiatorSchema,
        authorizedFieldCapture: authorizedRequestFieldsResultSchema.shape.status,
        authorizedFields: z.array(authorizedRequestFieldSummarySchema),
      })
      .strict(),
    response: responseMetadataSchema.nullable(),
    loadingState: z.enum(["COMPLETED", "FAILED", "INCOMPLETE"]),
  })
  .strict();
export type NetworkObservationFacts = z.infer<
  typeof networkObservationFactsSchema
>;

const actionRecordSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    actionId: shortText,
    actor: z.enum(["DETERMINISTIC", "MODEL", "HUMAN"]),
    kind: z.enum(["NAVIGATE", "CLICK", "FILL", "CHECKPOINT", "HANDOFF"]),
    summary: z.string().min(1).max(500),
    pageUrl: z.string().min(1),
    occurredAt: timestamp,
  })
  .strict();
const screenshotRecordSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    checkpointId: shortText,
    artifactName: z.string().regex(/^screenshot-[0-9]{4}-[a-z0-9-]+\.png$/u),
    sha256: sha256Schema,
    pageUrl: z.string().min(1),
    capturedAt: timestamp,
    viewport: z
      .object({ width: z.number().int().positive(), height: z.number().int().positive() })
      .strict(),
  })
  .strict();

export const deterministicRecorderReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    recorderVersion: z.literal(BROWSER_CDP_RECORDER_VERSION),
    captureMode: z.literal("BROWSER_CDP"),
    workspaceId: uuid,
    runId: uuid,
    startedAt: timestamp,
    stoppedAt: timestamp,
    actions: z.array(actionRecordSchema),
    screenshots: z.array(screenshotRecordSchema),
    observations: z.array(observationSchema),
    canaryMatcherReports: z.array(canaryMatcherReportSchema),
    visibility: recorderVisibilitySchema,
    limitations: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.stoppedAt) < Date.parse(value.startedAt)) {
      context.addIssue({
        code: "custom",
        path: ["stoppedAt"],
        message: "Recorder stop time cannot precede start time",
      });
    }
    if (
      value.observations.some(
        (observation, index) =>
          observation.sequence !== index ||
          observation.workspaceId !== value.workspaceId ||
          observation.runId !== value.runId ||
          observation.recorderVersion !== value.recorderVersion,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["observations"],
        message: "Recorder observations require contiguous matching provenance",
      });
    }
    if (
      value.observations.some(
        (observation) =>
          observation.payloadHash !==
          sha256(
            canonicalJson({
              source: observation.source,
              facts: observation.facts,
            }),
          ),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["observations"],
        message: "Recorder observation facts must match their canonical hash",
      });
    }
    if (
      value.actions.some(({ sequence }, index) => sequence !== index) ||
      new Set(value.actions.map(({ actionId }) => actionId)).size !==
        value.actions.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["actions"],
        message: "Recorder actions need contiguous sequence and unique identifiers",
      });
    }
    if (
      value.screenshots.some(({ sequence }, index) => sequence !== index) ||
      new Set(value.screenshots.map(({ artifactName }) => artifactName)).size !==
        value.screenshots.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["screenshots"],
        message: "Recorder screenshots need contiguous sequence and unique artifacts",
      });
    }
    const observationIds = new Set(value.observations.map(({ id }) => id));
    if (
      value.visibility.checkpoints.some(({ observationIds: referenced }) =>
        referenced.some((id) => !observationIds.has(id)),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["visibility"],
        message: "Recorder visibility can reference only included observations",
      });
    }
    if (
      value.canaryMatcherReports.some(
        (report) =>
          report.workspaceId !== value.workspaceId ||
          report.runId !== value.runId ||
          report.observationSource !== "NETWORK" ||
          !observationIds.has(report.observationId),
      ) ||
      new Set(value.canaryMatcherReports.map(({ observationId }) => observationId))
        .size !== value.canaryMatcherReports.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["canaryMatcherReports"],
        message:
          "Matcher reports must reference unique network observations from this recorder run",
      });
    }
  });
export type DeterministicRecorderReport = z.infer<
  typeof deterministicRecorderReportSchema
>;

interface CdpRequest {
  readonly url: string;
  readonly method: string;
  readonly postData?: string;
  readonly hasPostData?: boolean;
}
interface CdpInitiator {
  readonly type?: string;
  readonly url?: string;
  readonly stack?: { readonly callFrames?: readonly { readonly url?: string }[] };
}
interface CdpRequestWillBeSent {
  readonly requestId: string;
  readonly request: CdpRequest;
  readonly type?: string;
  readonly initiator?: CdpInitiator;
  readonly redirectResponse?: CdpResponse;
}
interface CdpResponse {
  readonly status: number;
  readonly mimeType?: string;
  readonly protocol?: string;
  readonly fromDiskCache?: boolean;
  readonly fromServiceWorker?: boolean;
}
interface CdpResponseReceived {
  readonly requestId: string;
  readonly response: CdpResponse;
}
interface CdpLoadingFinished {
  readonly requestId: string;
  readonly encodedDataLength?: number;
}
interface CdpLoadingFailed {
  readonly requestId: string;
}
interface PendingRequest {
  readonly requestId: string;
  readonly ordinal: number;
  readonly logicalClock: number;
  readonly observedAt: string;
  readonly checkpointIds: readonly string[];
  readonly request: NetworkObservationFacts["request"];
  response: NetworkObservationFacts["response"];
}

function timestampNow(now: () => string): string {
  return new Date(now()).toISOString();
}

export function sanitizeRecorderUrl(
  url: string,
  secretCandidates: readonly string[],
): string {
  const secrets = z.array(secretValueSchema).parse(secretCandidates);
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    const queryKeys = [...new Set([...parsed.searchParams.keys()])];
    for (const key of queryKeys) {
      if (sensitiveFieldSegment.test(key)) {
        parsed.searchParams.set(key, "[REDACTED_SECRET]");
      } else {
        parsed.searchParams.set(key, "[MINIMIZED]");
      }
    }
    if (parsed.hash) parsed.hash = "#[MINIMIZED]";
    return redactSecretText(parsed.toString(), secrets);
  } catch {
    return `invalid-url:${sha256(url)}`;
  }
}

function requestLocation(url: string): { readonly host: string; readonly path: string } {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname.toLowerCase(), path: parsed.pathname };
  } catch {
    return { host: "", path: "" };
  }
}

function artifactSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return slug || "checkpoint";
}

function responseMetadata(
  response: CdpResponse,
  encodedDataLength?: number,
): NonNullable<NetworkObservationFacts["response"]> {
  return responseMetadataSchema.parse({
    status: Math.trunc(response.status),
    mimeType: response.mimeType ?? "",
    protocol: response.protocol ?? "",
    fromDiskCache: response.fromDiskCache ?? false,
    fromServiceWorker: response.fromServiceWorker ?? false,
    ...(encodedDataLength === undefined ? {} : { encodedDataLength }),
  });
}

export interface DeterministicRecorderStartOptions {
  readonly page: Page;
  readonly artifactDirectory: string;
  readonly config: unknown;
  readonly now?: () => string;
}

export class RecorderUnavailableError extends Error {
  readonly code = "RECORDER_UNAVAILABLE";

  constructor(state: string) {
    super(`The deterministic recorder is not active (${state}).`);
    this.name = "RecorderUnavailableError";
  }
}

export class DeterministicBrowserRecorder {
  readonly #actions: z.infer<typeof actionRecordSchema>[] = [];
  readonly #artifactDirectory: string;
  readonly #candidates: RecorderCandidate[] = [];
  readonly #cdp: CDPSession;
  readonly #config: DeterministicRecorderConfig;
  readonly #gaps: z.infer<typeof visibilityGapSchema>[] = [];
  readonly #now: () => string;
  readonly #page: Page;
  readonly #pending = new Map<string, PendingRequest>();
  readonly #screenshots: z.infer<typeof screenshotRecordSchema>[] = [];
  readonly #transientCanaryCandidates = new Map<
    number,
    readonly CanaryMatchCandidate[]
  >();
  readonly #tasks = new Set<Promise<void>>();
  readonly #startedAt: string;
  readonly #storage = new Map<string, string>();
  #logicalClock = 0;
  #requestOrdinal = 0;
  #state: "ACTIVE" | "STOPPING" | "STOPPED" = "ACTIVE";
  #stopPromise: Promise<DeterministicRecorderReport> | undefined;

  private constructor(input: {
    readonly artifactDirectory: string;
    readonly cdp: CDPSession;
    readonly config: DeterministicRecorderConfig;
    readonly now: () => string;
    readonly page: Page;
  }) {
    this.#artifactDirectory = path.resolve(input.artifactDirectory);
    this.#cdp = input.cdp;
    this.#config = input.config;
    this.#now = input.now;
    this.#page = input.page;
    this.#startedAt = timestampNow(this.#now);
  }

  static async start(
    options: DeterministicRecorderStartOptions,
  ): Promise<DeterministicBrowserRecorder> {
    const config = deterministicRecorderConfigSchema.parse(options.config);
    const artifactDirectory = path.resolve(options.artifactDirectory);
    await mkdir(artifactDirectory, { recursive: true });
    const cdp = await options.page.context().newCDPSession(options.page);
    const recorder = new DeterministicBrowserRecorder({
      artifactDirectory,
      cdp,
      config,
      now: options.now ?? (() => new Date().toISOString()),
      page: options.page,
    });
    recorder.#attachListeners();
    await Promise.all([
      cdp.send("Network.enable"),
      cdp.send("Page.enable"),
      cdp.send("Page.setLifecycleEventsEnabled", { enabled: true }),
    ]);
    recorder.#stage("RECORDER", {
      kind: "RECORDER_STARTED",
      captureMode: config.captureMode,
      recorderVersion: config.recorderVersion,
    });
    return recorder;
  }

  #ensureActive(): void {
    if (this.#state !== "ACTIVE") throw new RecorderUnavailableError(this.#state);
  }

  #nextClock(): number {
    this.#logicalClock += 1;
    return this.#logicalClock;
  }

  #stage(
    source: RecorderCandidate["source"],
    facts: Record<string, unknown>,
    options: {
      readonly logicalClock?: number;
      readonly observedAt?: string;
      readonly stableKey?: string;
    } = {},
  ): void {
    if (this.#state === "STOPPED") return;
    const logicalClock = options.logicalClock ?? this.#nextClock();
    this.#candidates.push(
      recorderCandidateSchema.parse({
        logicalClock,
        stableKey:
          options.stableKey ??
          `${source.toLowerCase()}:${logicalClock.toString().padStart(12, "0")}`,
        source,
        observedAt: options.observedAt ?? timestampNow(this.#now),
        facts,
      }),
    );
  }

  #track(task: Promise<void>): void {
    this.#tasks.add(task);
    void task.finally(() => this.#tasks.delete(task));
  }

  #attachListeners(): void {
    this.#cdp.on("Network.requestWillBeSent", (event: CdpRequestWillBeSent) => {
      this.#track(
        this.#handleRequest(event).catch(() => {
          this.recordCaptureGap({
            source: "NETWORK",
            checkpointIds: this.#matchingCheckpointIds(event.request),
            reason: "CAPTURE_STREAM_INTERRUPTED",
            detail: "The recorder could not process a network request event.",
          });
        }),
      );
    });
    this.#cdp.on("Network.responseReceived", (event: CdpResponseReceived) => {
      this.#handleResponse(event);
    });
    this.#cdp.on("Network.loadingFinished", (event: CdpLoadingFinished) => {
      this.#finalizeRequest(event.requestId, "COMPLETED", event.encodedDataLength);
    });
    this.#cdp.on("Network.loadingFailed", (event: CdpLoadingFailed) => {
      const pending = this.#pending.get(event.requestId);
      const responseRequiredIds = pending
        ? this.#config.requiredCheckpoints
            .filter(
              ({ id, requireResponseMetadata }) =>
                requireResponseMetadata && pending.checkpointIds.includes(id),
            )
            .map(({ id }) => id)
        : [];
      if (
        pending &&
        responseRequiredIds.length > 0 &&
        pending.response === null
      ) {
        this.recordCaptureGap({
          source: "NETWORK",
          checkpointIds: responseRequiredIds,
          reason: "NETWORK_LIFECYCLE_FAILED",
          detail: "A required request did not complete its browser network lifecycle.",
        });
      }
      this.#finalizeRequest(event.requestId, "FAILED");
    });
    this.#cdp.on(
      "Page.frameNavigated",
      (event: { readonly frame?: { readonly id?: string; readonly parentId?: string; readonly url?: string } }) => {
        if (!event.frame?.url) return;
        this.#stage("BROWSER", {
          kind: "NAVIGATION",
          frame: event.frame.parentId ? "CHILD" : "MAIN",
        pageUrl: sanitizeRecorderUrl(event.frame.url, this.#config.secrets),
        });
      },
    );
    this.#page.on("crash", () => {
      if (this.#state !== "ACTIVE") return;
      this.recordCaptureGap({
        source: "BROWSER",
        checkpointIds: this.#config.requiredCheckpoints.map(({ id }) => id),
        reason: "PAGE_CRASHED",
        detail: "The page crashed before recorder finalization.",
      });
    });
  }

  #matchingCheckpointIds(request: CdpRequest): string[] {
    const location = requestLocation(request.url);
    return this.#config.requiredCheckpoints
      .filter(
        (checkpoint) =>
          checkpoint.host === location.host &&
          checkpoint.method === request.method.toUpperCase() &&
          checkpoint.path === location.path,
      )
      .map(({ id }) => id);
  }

  #authorizedRule(request: CdpRequest): AuthorizedRequestRule | undefined {
    const location = requestLocation(request.url);
    return this.#config.authorizedRequestRules.find(
      (rule) =>
        rule.host === location.host &&
        rule.method === request.method.toUpperCase() &&
        rule.path === location.path,
    );
  }

  async #handleRequest(event: CdpRequestWillBeSent): Promise<void> {
    if (this.#state === "STOPPED") return;
    if (event.redirectResponse && this.#pending.has(event.requestId)) {
      const redirected = this.#pending.get(event.requestId)!;
      redirected.response = responseMetadata(event.redirectResponse);
      this.#finalizeRequest(event.requestId, "COMPLETED");
    }
    const logicalClock = this.#nextClock();
    const observedAt = timestampNow(this.#now);
    const ordinal = ++this.#requestOrdinal;
    const location = requestLocation(event.request.url);
    const rule = this.#authorizedRule(event.request);
    let postData = event.request.postData;
    if (!postData && event.request.hasPostData && rule) {
      try {
        const result = (await this.#cdp.send("Network.getRequestPostData", {
          requestId: event.requestId,
        })) as { readonly postData?: string };
        postData = result.postData;
      } catch {
        postData = undefined;
      }
    }
    const inspection = rule
      ? postData === undefined
        ? {
            summary: authorizedRequestFieldsResultSchema.parse({
              status: "UNINSPECTABLE",
              fields: [],
            }),
            transientCanaryCandidates: [],
          }
        : inspectAuthorizedRequestFields({
            postData,
            fieldNames: rule.fields,
            secrets: this.#config.secrets,
          })
      : {
          summary: authorizedRequestFieldsResultSchema.parse({
            status: "CAPTURED",
            fields: [],
          }),
          transientCanaryCandidates: [],
        };
    const fields = inspection.summary;
    if (inspection.transientCanaryCandidates.length > 0) {
      this.#transientCanaryCandidates.set(
        ordinal,
        inspection.transientCanaryCandidates,
      );
    }
    const checkpointIds = this.#matchingCheckpointIds(event.request);
    const impactedFieldCheckpoints = this.#config.requiredCheckpoints
      .filter(({ id }) => checkpointIds.includes(id))
      .filter((checkpoint) => {
        if (checkpoint.requiredRequestFields.length === 0) return false;
        if (fields.status === "UNINSPECTABLE") return true;
        return checkpoint.requiredRequestFields.some(
          (field) =>
            !fields.fields.some(
              (summary) => summary.name === field && summary.present,
            ),
        );
      })
      .map(({ id }) => id);
    if (impactedFieldCheckpoints.length > 0) {
      this.recordCaptureGap({
        source: "NETWORK",
        checkpointIds: impactedFieldCheckpoints,
        reason:
          fields.status === "MISSING_FIELDS"
            ? "REQUIRED_REQUEST_FIELD_MISSING"
            : "REQUEST_FIELDS_UNINSPECTABLE",
        detail:
          fields.status === "MISSING_FIELDS"
            ? "At least one authorized required request field was absent."
            : "The required request fields could not be deterministically inspected.",
      });
    }
    const initiatorUrl =
      event.initiator?.url ?? event.initiator?.stack?.callFrames?.find(({ url }) => url)?.url;
    const sanitizedUrl = sanitizeRecorderUrl(
      event.request.url,
      this.#config.secrets,
    );
    this.#pending.set(event.requestId, {
      requestId: event.requestId,
      ordinal,
      logicalClock,
      observedAt,
      checkpointIds,
      request: {
        method: event.request.method.toUpperCase(),
        url: sanitizedUrl,
        urlSha256: sha256(sanitizedUrl),
        host: location.host,
        path: location.path,
        resourceType: event.type ?? "Other",
        initiator: {
          type: event.initiator?.type ?? "other",
          ...(initiatorUrl
            ? {
                url: sanitizeRecorderUrl(
                  initiatorUrl,
                  this.#config.secrets,
                ),
              }
            : {}),
        },
        authorizedFieldCapture: fields.status,
        authorizedFields: fields.fields,
      },
      response: null,
    });
  }

  #handleResponse(event: CdpResponseReceived): void {
    const pending = this.#pending.get(event.requestId);
    if (!pending) return;
    pending.response = responseMetadata(event.response);
    if (
      pending.checkpointIds.length > 0 &&
      pending.response.fromServiceWorker
    ) {
      this.recordCaptureGap({
        source: "NETWORK",
        checkpointIds: pending.checkpointIds,
        reason: "SERVICE_WORKER_INTERFERENCE",
        detail: "A service worker supplied a required response outside direct network capture.",
      });
    }
  }

  #finalizeRequest(
    requestId: string,
    loadingState: NetworkObservationFacts["loadingState"],
    encodedDataLength?: number,
  ): void {
    const pending = this.#pending.get(requestId);
    if (!pending) return;
    this.#pending.delete(requestId);
    if (pending.response && encodedDataLength !== undefined) {
      pending.response = {
        ...pending.response,
        encodedDataLength: Math.max(0, encodedDataLength),
      };
    }
    this.#stage(
      "NETWORK",
      networkObservationFactsSchema.parse({
        kind: "NETWORK_REQUEST",
        requestOrdinal: pending.ordinal,
        checkpointIds: pending.checkpointIds,
        request: pending.request,
        response: pending.response,
        loadingState,
      }),
      {
        logicalClock: pending.logicalClock,
        observedAt: pending.observedAt,
        stableKey: `network:${pending.ordinal.toString().padStart(8, "0")}`,
      },
    );
  }

  recordCaptureGap(candidate: unknown): void {
    if (this.#state === "STOPPED") return;
    const input = z
      .object({
        source: recorderSourceSchema,
        checkpointIds: z.array(shortText),
        reason: recorderCaptureGapReasonSchema,
        detail: z.string().min(1).max(500),
      })
      .strict()
      .parse(candidate);
    const known = new Set(this.#config.requiredCheckpoints.map(({ id }) => id));
    if (input.checkpointIds.some((id) => !known.has(id))) {
      throw new TypeError("A capture gap referenced an unknown checkpoint");
    }
    const gap = visibilityGapSchema.parse({
      checkpointIds: [...new Set(input.checkpointIds)],
      reason: input.reason,
    });
    this.#gaps.push(gap);
    this.#stage("RECORDER", {
      kind: "CAPTURE_GAP",
      source: input.source,
      checkpointIds: gap.checkpointIds,
      reason: gap.reason,
      detail: redactSecretText(input.detail, this.#config.secrets),
    });
  }

  recordAction(candidate: unknown): Promise<void> {
    this.#ensureActive();
    const input = actionRecordSchema
      .omit({ sequence: true, pageUrl: true, occurredAt: true })
      .parse(candidate);
    this.#actions.push(
      actionRecordSchema.parse({
        ...input,
        sequence: this.#actions.length,
        summary: redactSecretText(input.summary, this.#config.secrets),
        pageUrl: sanitizeRecorderUrl(this.#page.url(), this.#config.secrets),
        occurredAt: timestampNow(this.#now),
      }),
    );
    return Promise.resolve();
  }

  async captureStorageChanges(labelCandidate: unknown): Promise<void> {
    this.#ensureActive();
    const label = shortText.parse(labelCandidate);
    try {
      const cookies = await this.#page.context().cookies();
      const browserStorage = await this.#page.evaluate(() => ({
        origin: globalThis.location.origin,
        local: Object.entries(globalThis.localStorage),
        session: Object.entries(globalThis.sessionStorage),
      }));
      const current = new Map<string, string>();
      for (const cookie of cookies) {
        current.set(
          `COOKIE:${cookie.domain}:${cookie.path}:${cookie.name}`,
          sha256(canonicalJson(cookie.value)),
        );
      }
      for (const [name, value] of browserStorage.local) {
        current.set(`LOCAL:${browserStorage.origin}:${name}`, sha256(canonicalJson(value)));
      }
      for (const [name, value] of browserStorage.session) {
        current.set(
          `SESSION:${browserStorage.origin}:${name}`,
          sha256(canonicalJson(value)),
        );
      }
      const keys = [...new Set([...this.#storage.keys(), ...current.keys()])].sort();
      const changes = keys.flatMap((key) => {
        const before = this.#storage.get(key);
        const after = current.get(key);
        if (before === after) return [];
        return [
          {
            key,
            change:
              before === undefined ? "ADDED" : after === undefined ? "REMOVED" : "UPDATED",
            ...(before === undefined ? {} : { priorValueSha256: before }),
            ...(after === undefined ? {} : { valueSha256: after }),
          },
        ];
      });
      this.#storage.clear();
      for (const [key, value] of current) this.#storage.set(key, value);
      this.#stage("STORAGE", {
        kind: "STORAGE_CHANGES",
        label,
        pageUrl: sanitizeRecorderUrl(this.#page.url(), this.#config.secrets),
        changes,
      });
    } catch {
      this.recordCaptureGap({
        source: "STORAGE",
        checkpointIds: [],
        reason: "STORAGE_CAPTURE_FAILED",
        detail: "The recorder could not capture the requested browser-storage snapshot.",
      });
      throw new Error("Browser storage capture failed");
    }
  }

  async captureScreenshot(checkpointIdCandidate: unknown): Promise<void> {
    this.#ensureActive();
    const checkpointId = shortText.parse(checkpointIdCandidate);
    try {
      const sequence = this.#screenshots.length;
      const artifactName = `screenshot-${sequence.toString().padStart(4, "0")}-${artifactSlug(checkpointId)}.png`;
      const mask = SECRET_SCREENSHOT_MASK_SELECTORS.map((selector) =>
        this.#page.locator(selector),
      );
      const bytes = await this.#page.screenshot({
        animations: "disabled",
        caret: "hide",
        fullPage: true,
        mask,
        type: "png",
      });
      await writeFile(path.join(this.#artifactDirectory, artifactName), bytes);
      const viewport = this.#page.viewportSize() ?? { width: 1, height: 1 };
      const screenshot = screenshotRecordSchema.parse({
        sequence,
        checkpointId,
        artifactName,
        sha256: sha256(bytes),
        pageUrl: sanitizeRecorderUrl(this.#page.url(), this.#config.secrets),
        capturedAt: timestampNow(this.#now),
        viewport,
      });
      this.#screenshots.push(screenshot);
      this.#stage("BROWSER", {
        kind: "SCREENSHOT",
        checkpointId,
        artifactName,
        sha256: screenshot.sha256,
        pageUrl: screenshot.pageUrl,
        viewport,
      });
    } catch {
      this.recordCaptureGap({
        source: "BROWSER",
        checkpointIds: [],
        reason: "SCREENSHOT_CAPTURE_FAILED",
        detail: "The recorder could not capture the requested masked screenshot.",
      });
      throw new Error("Browser screenshot capture failed");
    }
  }

  stop(): Promise<DeterministicRecorderReport> {
    if (this.#stopPromise) return this.#stopPromise;
    this.#ensureActive();
    this.#state = "STOPPING";
    this.#stopPromise = this.#finish();
    return this.#stopPromise;
  }

  async #finish(): Promise<DeterministicRecorderReport> {
    await Promise.all([...this.#tasks]);
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    await Promise.all([...this.#tasks]);
    for (const pending of [...this.#pending.values()]) {
      const responseRequiredIds = this.#config.requiredCheckpoints
        .filter(
          ({ id, requireResponseMetadata }) =>
            requireResponseMetadata && pending.checkpointIds.includes(id),
        )
        .map(({ id }) => id);
      if (responseRequiredIds.length > 0 && pending.response === null) {
        this.recordCaptureGap({
          source: "NETWORK",
          checkpointIds: responseRequiredIds,
          reason: "NETWORK_LIFECYCLE_INCOMPLETE",
          detail: "Recorder finalization preceded a required request lifecycle completion.",
        });
      }
      this.#finalizeRequest(pending.requestId, "INCOMPLETE");
    }
    this.#stage("RECORDER", {
      kind: "RECORDER_STOPPED",
      recorderVersion: this.#config.recorderVersion,
    });
    await this.#cdp.detach().catch(() => undefined);
    const stoppedAt = timestampNow(this.#now);
    const observations = canonicalizeRecorderCandidates({
      workspaceId: this.#config.workspaceId,
      runId: this.#config.runId,
      recorderVersion: this.#config.recorderVersion,
      candidates: this.#candidates,
    });
    const canaryMatcherReports: CanaryMatcherReport[] = [];
    if (this.#config.canaries.length > 0) {
      for (const observation of observations) {
        const facts = networkObservationFactsSchema.safeParse(observation.facts);
        if (!facts.success) continue;
        const candidates = this.#transientCanaryCandidates.get(
          facts.data.requestOrdinal,
        );
        if (!candidates || candidates.length === 0) continue;
        canaryMatcherReports.push(
          matchCanaryObservation({
            observation,
            canaries: this.#config.canaries,
            candidates,
          }),
        );
      }
    }
    // Raw authorized values exist only for the in-memory comparison window.
    this.#transientCanaryCandidates.clear();
    const signals = observations.flatMap((observation) => {
      const result = networkObservationFactsSchema.safeParse(observation.facts);
      if (!result.success) return [];
      const facts = result.data;
      return facts.checkpointIds.map((checkpointId) => {
        const checkpoint = this.#config.requiredCheckpoints.find(
          ({ id }) => id === checkpointId,
        );
        if (!checkpoint) {
          throw new TypeError("A network observation referenced an unknown checkpoint");
        }
        return {
          checkpointId,
          observationId: observation.id,
          requestFieldsVisible: checkpoint.requiredRequestFields.every(
            (field) =>
              facts.request.authorizedFields.some(
                (summary) => summary.name === field && summary.present,
              ),
          ),
          responseMetadataVisible: facts.response !== null,
        };
      });
    });
    const visibility = evaluateRequiredVisibility({
      checkpoints: this.#config.requiredCheckpoints,
      signals,
      gaps: this.#gaps,
    });
    const report = deterministicRecorderReportSchema.parse({
      schemaVersion: "1.0.0",
      recorderVersion: this.#config.recorderVersion,
      captureMode: this.#config.captureMode,
      workspaceId: this.#config.workspaceId,
      runId: this.#config.runId,
      startedAt: this.#startedAt,
      stoppedAt,
      actions: this.#actions,
      screenshots: this.#screenshots,
      observations,
      canaryMatcherReports,
      visibility,
      limitations: [
        "BROWSER_CDP records browser-visible facts only; encrypted payload semantics and traffic outside the instrumented browser remain outside P0 visibility.",
        "FR-038 proxy capture is deferred and no proxy evidence is represented by this BROWSER_CDP report.",
      ],
    });
    this.#state = "STOPPED";
    return deepFreeze(report);
  }
}
