import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  canaryMatchSchema,
  canarySchema,
  observationSchema,
  type Canary,
} from "./domain.js";

export const CANARY_MATCHER_VERSION = "pactwire-canary-matcher-v1" as const;

const uuid = z.string().uuid();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const transformSchema = z.enum(["EXACT", "URL_ENCODED", "BASE64"]);
const candidateLocationSchema = z.enum(["BODY", "HEADER", "QUERY", "STORAGE"]);
const sensitiveSegment = /^(?:authorization|cookie|password|passcode|token|secret|credential|session(?:id)?)$/iu;
const candidatePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .regex(/^[A-Za-z0-9_$.[\]-]+$/u)
  .refine(
    (value) =>
      !value
        .split(/[.[\]-]+/u)
        .filter(Boolean)
        .some((segment) => sensitiveSegment.test(segment)),
    "Credential-shaped fields cannot enter canary matching",
  );

export const canaryMatchCandidateSchema = z
  .object({
    location: candidateLocationSchema,
    path: candidatePathSchema,
    value: z.string().max(1_048_576),
    requestedTransform: z.string().trim().min(1).max(80).default("AUTO"),
  })
  .strict();
export type CanaryMatchCandidate = z.infer<typeof canaryMatchCandidateSchema>;

const commonOutcomeShape = {
  workspaceId: uuid,
  runId: uuid,
  observationId: uuid,
  observationSource: z.enum(["BROWSER", "NETWORK", "STORAGE", "RECORDER"]),
  candidateLocation: candidateLocationSchema,
  candidatePath: candidatePathSchema,
  candidateValueSha256: sha256Schema,
} as const;

export const matchedCanaryOutcomeSchema = z
  .object({
    ...commonOutcomeShape,
    status: z.literal("MATCHED"),
    canaryId: uuid,
    canarySourceField: z.string().trim().min(1),
    transform: transformSchema,
    match: canaryMatchSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.match.workspaceId !== value.workspaceId ||
      value.match.runId !== value.runId ||
      value.match.observationId !== value.observationId ||
      value.match.canaryId !== value.canaryId ||
      value.match.transform !== value.transform ||
      value.match.matchedValueHash !== value.candidateValueSha256
    ) {
      context.addIssue({
        code: "custom",
        path: ["match"],
        message: "A canary match must preserve its complete deterministic lineage",
      });
    }
  });

export const noCanaryMatchOutcomeSchema = z
  .object({
    ...commonOutcomeShape,
    status: z.literal("NO_MATCH"),
    reasonCode: z.literal("NO_ENUMERATED_MATCH"),
  })
  .strict();

export const unsupportedCanaryTransformOutcomeSchema = z
  .object({
    ...commonOutcomeShape,
    status: z.literal("UNSUPPORTED_TRANSFORM"),
    requestedTransform: z.string().trim().min(1).max(80),
    reasonCode: z.literal("TRANSFORM_NOT_ENUMERATED"),
  })
  .strict();

export const canaryCollisionOutcomeSchema = z
  .object({
    ...commonOutcomeShape,
    status: z.literal("COLLISION"),
    canaryIds: z.array(uuid).min(2),
    transforms: z.array(transformSchema).min(1),
    reasonCode: z.literal("MULTIPLE_CANARY_MATCHES"),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.canaryIds).size !== value.canaryIds.length ||
      [...value.canaryIds].sort().some((id, index) => id !== value.canaryIds[index])
    ) {
      context.addIssue({
        code: "custom",
        path: ["canaryIds"],
        message: "Collision identifiers must be unique and sorted",
      });
    }
  });

export const canaryMatchOutcomeSchema = z.discriminatedUnion("status", [
  matchedCanaryOutcomeSchema,
  noCanaryMatchOutcomeSchema,
  unsupportedCanaryTransformOutcomeSchema,
  canaryCollisionOutcomeSchema,
]);
export type CanaryMatchOutcome = z.infer<typeof canaryMatchOutcomeSchema>;

export const canaryMatcherReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    matcherVersion: z.literal(CANARY_MATCHER_VERSION),
    workspaceId: uuid,
    runId: uuid,
    observationId: uuid,
    observationSource: z.enum(["BROWSER", "NETWORK", "STORAGE", "RECORDER"]),
    outcomes: z.array(canaryMatchOutcomeSchema),
    counts: z
      .object({
        matched: z.number().int().nonnegative(),
        noMatch: z.number().int().nonnegative(),
        unsupported: z.number().int().nonnegative(),
        collisions: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const expected = {
      matched: value.outcomes.filter(({ status }) => status === "MATCHED").length,
      noMatch: value.outcomes.filter(({ status }) => status === "NO_MATCH").length,
      unsupported: value.outcomes.filter(
        ({ status }) => status === "UNSUPPORTED_TRANSFORM",
      ).length,
      collisions: value.outcomes.filter(({ status }) => status === "COLLISION")
        .length,
    };
    if (JSON.stringify(value.counts) !== JSON.stringify(expected)) {
      context.addIssue({
        code: "custom",
        path: ["counts"],
        message: "Matcher counts must be derived from its outcomes",
      });
    }
    if (
      value.outcomes.some(
        (outcome) =>
          outcome.workspaceId !== value.workspaceId ||
          outcome.runId !== value.runId ||
          outcome.observationId !== value.observationId ||
          outcome.observationSource !== value.observationSource,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["outcomes"],
        message: "Every matcher outcome must retain its report provenance",
      });
    }
  });
export type CanaryMatcherReport = z.infer<typeof canaryMatcherReportSchema>;

const matcherInputSchema = z
  .object({
    observation: observationSchema,
    canaries: z.array(canarySchema).max(10_000),
    candidates: z.array(canaryMatchCandidateSchema).max(10_000),
  })
  .strict();

function immutableClone<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Object.isFrozen(candidate)
    ) {
      return;
    }
    for (const nested of Object.values(candidate)) freeze(nested);
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deterministicUuid(value: string): string {
  const bytes = createHash("sha256").update(value, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function transformedValue(canary: Canary, transform: z.infer<typeof transformSchema>): string {
  switch (transform) {
    case "EXACT":
      return canary.value;
    case "URL_ENCODED":
      return encodeURIComponent(canary.value);
    case "BASE64":
      return Buffer.from(canary.value, "utf8").toString("base64");
  }
}

const transformPriority = ["EXACT", "URL_ENCODED", "BASE64"] as const;

function commonOutcome(
  observation: z.infer<typeof observationSchema>,
  candidate: CanaryMatchCandidate,
) {
  return {
    workspaceId: observation.workspaceId,
    runId: observation.runId,
    observationId: observation.id,
    observationSource: observation.source,
    candidateLocation: candidate.location,
    candidatePath: candidate.path,
    // Recorder field digests use canonical JSON so this value can be joined to
    // the minimized authorized-field summary without retaining the raw string.
    candidateValueSha256: sha256(JSON.stringify(candidate.value)),
  } as const;
}

function matchCandidate(
  observation: z.infer<typeof observationSchema>,
  canaries: readonly Canary[],
  candidate: CanaryMatchCandidate,
): CanaryMatchOutcome {
  const common = commonOutcome(observation, candidate);
  const requested = candidate.requestedTransform;
  let transforms: readonly z.infer<typeof transformSchema>[];
  if (requested === "AUTO") {
    transforms = transformPriority;
  } else {
    const supported = transformSchema.safeParse(requested);
    if (!supported.success) {
      return unsupportedCanaryTransformOutcomeSchema.parse({
        ...common,
        status: "UNSUPPORTED_TRANSFORM",
        requestedTransform: requested,
        reasonCode: "TRANSFORM_NOT_ENUMERATED",
      });
    }
    transforms = [supported.data];
  }
  const byCanary = new Map<
    string,
    { readonly canary: Canary; readonly transform: z.infer<typeof transformSchema> }
  >();
  for (const canary of canaries) {
    for (const transform of transforms) {
      if (
        transformedValue(canary, transform) === candidate.value &&
        !byCanary.has(canary.id)
      ) {
        byCanary.set(canary.id, { canary, transform });
      }
    }
  }
  const matches = [...byCanary.values()].sort((left, right) =>
    left.canary.id.localeCompare(right.canary.id),
  );
  if (matches.length === 0) {
    return noCanaryMatchOutcomeSchema.parse({
      ...common,
      status: "NO_MATCH",
      reasonCode: "NO_ENUMERATED_MATCH",
    });
  }
  if (matches.length > 1) {
    return canaryCollisionOutcomeSchema.parse({
      ...common,
      status: "COLLISION",
      canaryIds: matches.map(({ canary }) => canary.id),
      transforms: [
        ...new Set(matches.map(({ transform }) => transform)),
      ].sort((left, right) =>
        transformPriority.indexOf(left) - transformPriority.indexOf(right),
      ),
      reasonCode: "MULTIPLE_CANARY_MATCHES",
    });
  }
  const { canary, transform } = matches[0]!;
  const matchedValueHash = common.candidateValueSha256;
  const id = deterministicUuid(
    [
      CANARY_MATCHER_VERSION,
      observation.workspaceId,
      observation.runId,
      observation.id,
      canary.id,
      transform,
      candidate.location,
      candidate.path,
      matchedValueHash,
    ].join(":"),
  );
  return matchedCanaryOutcomeSchema.parse({
    ...common,
    status: "MATCHED",
    canaryId: canary.id,
    canarySourceField: canary.sourceField,
    transform,
    match: {
      id,
      workspaceId: observation.workspaceId,
      runId: observation.runId,
      canaryId: canary.id,
      observationId: observation.id,
      transform,
      matchedValueHash,
      createdAt: observation.observedAt,
    },
  });
}

export function matchCanaryObservation(candidate: unknown): CanaryMatcherReport {
  const input = matcherInputSchema.parse(candidate);
  if (
    input.canaries.some(
      (canary) =>
        canary.workspaceId !== input.observation.workspaceId ||
        canary.runId !== input.observation.runId,
    )
  ) {
    throw new TypeError("Canaries and observations must share the same workspace and run");
  }
  const outcomes = input.candidates.map((field) =>
    matchCandidate(input.observation, input.canaries, field),
  );
  return immutableClone(
    canaryMatcherReportSchema.parse({
      schemaVersion: "1.0.0",
      matcherVersion: CANARY_MATCHER_VERSION,
      workspaceId: input.observation.workspaceId,
      runId: input.observation.runId,
      observationId: input.observation.id,
      observationSource: input.observation.source,
      outcomes,
      counts: {
        matched: outcomes.filter(({ status }) => status === "MATCHED").length,
        noMatch: outcomes.filter(({ status }) => status === "NO_MATCH").length,
        unsupported: outcomes.filter(
          ({ status }) => status === "UNSUPPORTED_TRANSFORM",
        ).length,
        collisions: outcomes.filter(({ status }) => status === "COLLISION").length,
      },
    }),
  );
}
