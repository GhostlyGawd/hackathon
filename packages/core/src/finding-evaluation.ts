import { z } from "zod";
import {
  canaryMatchOutcomeSchema,
  type CanaryMatchOutcome,
} from "./canary-matcher.js";
import {
  findingSchema,
  findingStateSchema,
  requirementVersionSchema,
  type FindingState,
} from "./domain.js";
import { runManifestSchema } from "./run-orchestration.js";
import type { MigrationDatabase } from "./migrations.js";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const boundedText = z.string().trim().min(1).max(4_000);
const shortText = z.string().trim().min(1).max(500);

export const FINDING_EVALUATOR_VERSION =
  "pactwire-bounded-finding-v1" as const;

export const findingReasonCodeSchema = z.enum([
  "RULE_NOT_HUMAN_CONFIRMED",
  "RULE_NOT_MACHINE_TESTABLE",
  "REQUIRED_PATH_NOT_EXERCISED",
  "REQUIRED_EVIDENCE_NOT_VISIBLE",
  "TRANSFORM_NOT_ENUMERATED",
  "MULTIPLE_CANARY_MATCHES",
  "DESTINATION_OWNERSHIP_UNKNOWN",
  "PURPOSE_REQUIRES_HUMAN_REVIEW",
  "EVIDENCE_LINEAGE_INCOMPLETE",
  "CONFIRMED_PROHIBITED_FLOW_WITNESSED",
  "NO_CONFLICT_IN_COMPLETE_NAMED_SCOPE",
  "PRIOR_CONFLICT_NOT_REOBSERVED_IN_COMPLETE_SCOPE",
  "MODEL_NARRATIVE_EXCLUDED",
]);
export type FindingReasonCode = z.infer<typeof findingReasonCodeSchema>;

const reasonOrder = findingReasonCodeSchema.options;

export const FINDING_STATE_COPY: Readonly<
  Record<FindingState, Readonly<{ label: string; meaning: string }>>
> = Object.freeze({
  WITNESSED_CONFLICT: Object.freeze({
    label: "Recorded conflict in this named test",
    meaning:
      "Pactwire recorded a data flow that conflicts with this confirmed test rule.",
  }),
  NO_CONFLICT_OBSERVED_IN_NAMED_TESTS: Object.freeze({
    label: "No conflict recorded in these named tests",
    meaning:
      "Pactwire did not record this conflict in the named tests. Other behavior was not assessed.",
  }),
  NOT_REOBSERVED_IN_NAMED_TESTS: Object.freeze({
    label: "Prior conflict not recorded in this rerun",
    meaning:
      "A previously recorded conflict did not appear in this rerun of the named tests. Human review is still required.",
  }),
  NOT_TESTED: Object.freeze({
    label: "Required path was not tested",
    meaning: "This requirement or path was not exercised.",
  }),
  NOT_VISIBLE: Object.freeze({
    label: "Required evidence was not visible",
    meaning:
      "Pactwire could not observe the evidence needed to evaluate this test.",
  }),
  NEEDS_REVIEW: Object.freeze({
    label: "Evidence needs human review",
    meaning:
      "The evidence is ambiguous or needs human technical, privacy, or legal judgment.",
  }),
});

export const FINDING_DECISION_TABLE = Object.freeze([
  Object.freeze({
    priority: 1,
    condition: "The rule is not human-confirmed and machine-testable",
    state: "NEEDS_REVIEW" as const,
    reasonCode: "RULE_NOT_HUMAN_CONFIRMED" as const,
  }),
  Object.freeze({
    priority: 2,
    condition:
      "A confirmed field was deterministically observed at a confirmed prohibited destination with complete lineage",
    state: "WITNESSED_CONFLICT" as const,
    reasonCode: "CONFIRMED_PROHIBITED_FLOW_WITNESSED" as const,
  }),
  Object.freeze({
    priority: 3,
    condition: "A required path was exercised but its evidence was not visible",
    state: "NOT_VISIBLE" as const,
    reasonCode: "REQUIRED_EVIDENCE_NOT_VISIBLE" as const,
  }),
  Object.freeze({
    priority: 4,
    condition: "A required path was not exercised",
    state: "NOT_TESTED" as const,
    reasonCode: "REQUIRED_PATH_NOT_EXERCISED" as const,
  }),
  Object.freeze({
    priority: 5,
    condition:
      "A transform, field, destination, purpose, or evidence link is uncertain",
    state: "NEEDS_REVIEW" as const,
    reasonCode: "EVIDENCE_LINEAGE_INCOMPLETE" as const,
  }),
  Object.freeze({
    priority: 6,
    condition:
      "Complete visible named scope did not reobserve a prior witnessed conflict",
    state: "NOT_REOBSERVED_IN_NAMED_TESTS" as const,
    reasonCode: "PRIOR_CONFLICT_NOT_REOBSERVED_IN_COMPLETE_SCOPE" as const,
  }),
  Object.freeze({
    priority: 7,
    condition: "Complete visible named scope recorded no confirmed conflict",
    state: "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS" as const,
    reasonCode: "NO_CONFLICT_IN_COMPLETE_NAMED_SCOPE" as const,
  }),
]);

const unknownDestinationSchema = z
  .object({
    status: z.literal("UNKNOWN"),
    hostname: shortText,
    reason: z.enum([
      "DESTINATION_UNSEEN",
      "ENTITY_NOT_CONFIRMED",
      "AGREEMENT_NOT_REVIEWED",
    ]),
  })
  .strict();
const confirmedDestinationSchema = z
  .object({
    status: z.enum(["ALLOWED", "PROHIBITED"]),
    hostname: shortText,
    entityId: shortText,
    entityName: shortText,
    softwareId: uuid,
    agreementVersionId: uuid,
    destinationVersionId: uuid,
    destinationVersionHash: sha256,
    humanConfirmed: z.literal(true),
  })
  .strict();
const destinationResolutionSchema = z.discriminatedUnion("status", [
  unknownDestinationSchema,
  confirmedDestinationSchema,
]);

const evidenceInputSchema = z
  .object({
    checkpointId: shortText,
    matcherOutcome: canaryMatchOutcomeSchema,
    destination: destinationResolutionSchema,
  })
  .strict();

const namedScopeInputSchema = z
  .object({
    softwareVersion: shortText,
    role: z.enum(["TEACHER", "STUDENT"]),
    journeyName: shortText,
    observationWindow: z
      .object({
        startedAt: timestamp,
        endedAt: timestamp,
      })
      .strict()
      .refine(
        (value) => Date.parse(value.endedAt) >= Date.parse(value.startedAt),
        {
          path: ["endedAt"],
          message: "The observation window cannot end before it starts",
        },
      ),
    checkpointPaths: z
      .array(
        z
          .object({
            checkpointId: shortText,
            path: boundedText,
          })
          .strict(),
      )
      .min(1)
      .max(128),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.checkpointPaths.map(({ checkpointId }) => checkpointId))
        .size !== value.checkpointPaths.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["checkpointPaths"],
        message: "Named scope checkpoint identifiers must be unique",
      });
    }
  });

const modelNarrativeSchema = z
  .object({
    model: shortText,
    text: boundedText,
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const findingEvaluationInputSchema = z
  .object({
    findingId: uuid,
    createdAt: timestamp,
    requirement: requirementVersionSchema,
    runManifest: runManifestSchema,
    evidence: z.array(evidenceInputSchema).max(10_000),
    namedScope: namedScopeInputSchema,
    priorFindingId: uuid.optional(),
    modelNarrative: modelNarrativeSchema.optional(),
  })
  .strict();
export type FindingEvaluationInput = z.infer<
  typeof findingEvaluationInputSchema
>;

const namedFindingScopeSchema = z
  .object({
    softwareId: uuid,
    softwareVersion: shortText,
    agreementVersionId: uuid,
    requirementVersionId: uuid,
    role: z.enum(["TEACHER", "STUDENT"]),
    journeyVersionId: uuid,
    journeyName: shortText,
    fields: z.array(shortText).min(1).max(100),
    observationWindow: z
      .object({ startedAt: timestamp, endedAt: timestamp })
      .strict(),
    visiblePaths: z.array(boundedText).max(128),
    untestedPaths: z.array(boundedText).max(128),
    notVisiblePaths: z.array(boundedText).max(128),
    limitations: z.array(boundedText).min(1).max(256),
  })
  .strict();

const deterministicBasisSchema = z
  .object({
    evaluatorVersion: z.literal(FINDING_EVALUATOR_VERSION),
    requirementAuthority: z.enum([
      "HUMAN_CONFIRMED_MACHINE_TESTABLE",
      "NOT_EXECUTABLE",
    ]),
    runManifestHash: sha256,
    matchedObservationIds: z.array(uuid),
    prohibitedDestinationVersionIds: z.array(uuid),
    lineageComplete: z.boolean(),
    missingLineage: z.array(shortText),
    modelNarrativeExcluded: z.literal(true),
  })
  .strict();

export const boundedFindingEvaluationSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    finding: findingSchema,
    reasonCodes: z.array(findingReasonCodeSchema).min(1),
    scope: namedFindingScopeSchema,
    deterministicBasis: deterministicBasisSchema,
    display: z
      .object({
        label: boundedText,
        meaning: boundedText,
        internalState: findingStateSchema,
      })
      .strict(),
    modelExplanation: z
      .object({
        label: z.literal("Model explanation — not evidence"),
        model: shortText,
        text: boundedText,
        confidence: z.number().min(0).max(1),
        excludedFromDecision: z.literal(true),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.display.internalState !== value.finding.state ||
      value.display.label !== FINDING_STATE_COPY[value.finding.state].label ||
      value.display.meaning !== FINDING_STATE_COPY[value.finding.state].meaning
    ) {
      context.addIssue({
        code: "custom",
        path: ["display"],
        message: "Finding display copy must derive from its bounded state",
      });
    }
  });
export type BoundedFindingEvaluation = z.infer<
  typeof boundedFindingEvaluationSchema
>;

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

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function sortedReasons(reasons: ReadonlySet<FindingReasonCode>) {
  return reasonOrder.filter((reason) => reasons.has(reason));
}

function isMatched(
  outcome: CanaryMatchOutcome,
): outcome is Extract<CanaryMatchOutcome, { status: "MATCHED" }> {
  return outcome.status === "MATCHED";
}

export function evaluateBoundedFinding(
  candidate: unknown,
): BoundedFindingEvaluation {
  const input = findingEvaluationInputSchema.parse(candidate);
  const requirement = input.requirement;
  const manifest = input.runManifest;
  const predicate =
    requirement.status === "CONFIRMED" ? requirement.predicate : undefined;
  const isExecutable =
    requirement.status === "CONFIRMED" &&
    requirement.executable &&
    predicate !== undefined;
  const dataField = predicate?.dataField ?? requirement.details.dataField;
  const checkpointById = new Map(
    manifest.checkpointCoverage.map((checkpoint) => [
      checkpoint.checkpointId,
      checkpoint,
    ]),
  );
  const pathByCheckpoint = new Map(
    input.namedScope.checkpointPaths.map(({ checkpointId, path }) => [
      checkpointId,
      path,
    ]),
  );
  const observationIds = new Set(
    manifest.observationHashes.map(({ observationId }) => observationId),
  );
  const missingLineage = new Set<string>();

  if (requirement.workspaceId !== manifest.workspaceId) {
    missingLineage.add("requirement workspace does not match the run manifest");
  }
  if (
    requirement.agreementVersionId !== manifest.snapshot.agreementVersionId
  ) {
    missingLineage.add("requirement agreement does not match the frozen run");
  }
  for (const checkpointId of manifest.requiredCheckpointIds) {
    if (!pathByCheckpoint.has(checkpointId)) {
      missingLineage.add(`named path is missing for checkpoint ${checkpointId}`);
    }
  }
  for (const item of input.evidence) {
    if (!checkpointById.has(item.checkpointId)) {
      missingLineage.add(
        `evidence references unknown checkpoint ${item.checkpointId}`,
      );
    }
    if (
      item.matcherOutcome.workspaceId !== manifest.workspaceId ||
      item.matcherOutcome.runId !== manifest.runId
    ) {
      missingLineage.add("matcher outcome does not match the frozen run");
    }
    if (!observationIds.has(item.matcherOutcome.observationId)) {
      missingLineage.add(
        `observation ${item.matcherOutcome.observationId} is absent from the run manifest`,
      );
    }
    if (
      item.destination.status !== "UNKNOWN" &&
      (item.destination.softwareId !== manifest.softwareId ||
        item.destination.agreementVersionId !== requirement.agreementVersionId)
    ) {
      missingLineage.add(
        "destination classification does not match the software and agreement",
      );
    }
  }

  const verifiedCheckpointIds = new Set(
    manifest.checkpointCoverage
      .filter(({ status }) => status === "VERIFIED")
      .map(({ checkpointId }) => checkpointId),
  );
  const relevantMatches = isExecutable
    ? input.evidence.filter(
        (item) =>
          isMatched(item.matcherOutcome) &&
          item.matcherOutcome.canarySourceField === dataField,
      )
    : [];
  const conflictCandidates = relevantMatches.filter(
    (item) =>
      item.destination.status === "PROHIBITED" &&
      verifiedCheckpointIds.has(item.checkpointId),
  );
  const reasons = new Set<FindingReasonCode>(["MODEL_NARRATIVE_EXCLUDED"]);
  const hasInvisible = manifest.checkpointCoverage.some(
    ({ status }) => status === "NOT_VISIBLE",
  );
  const hasUntested = manifest.checkpointCoverage.some(
    ({ status }) => status === "NOT_TESTED",
  );
  const hasUnsupported = input.evidence.some(
    ({ matcherOutcome }) => matcherOutcome.status === "UNSUPPORTED_TRANSFORM",
  );
  const hasCollision = input.evidence.some(
    ({ matcherOutcome }) => matcherOutcome.status === "COLLISION",
  );
  const hasUnknownRelevantDestination = input.evidence.some(
    ({ matcherOutcome, destination }) =>
      destination.status === "UNKNOWN" &&
      (matcherOutcome.status === "UNSUPPORTED_TRANSFORM" ||
        matcherOutcome.status === "COLLISION" ||
        (matcherOutcome.status === "MATCHED" &&
          matcherOutcome.canarySourceField === dataField)),
  );
  const purposeNeedsReview =
    isExecutable &&
    predicate !== undefined &&
    predicate.purposeRestriction !== null &&
    relevantMatches.some(({ destination }) => destination.status === "ALLOWED");

  if (hasUnsupported) reasons.add("TRANSFORM_NOT_ENUMERATED");
  if (hasCollision) reasons.add("MULTIPLE_CANARY_MATCHES");
  if (hasUnknownRelevantDestination) {
    reasons.add("DESTINATION_OWNERSHIP_UNKNOWN");
  }
  if (purposeNeedsReview) reasons.add("PURPOSE_REQUIRES_HUMAN_REVIEW");
  if (missingLineage.size > 0) reasons.add("EVIDENCE_LINEAGE_INCOMPLETE");

  let state: FindingState;
  if (!isExecutable) {
    state = "NEEDS_REVIEW";
    if (requirement.status !== "CONFIRMED") {
      reasons.add("RULE_NOT_HUMAN_CONFIRMED");
    }
    reasons.add("RULE_NOT_MACHINE_TESTABLE");
  } else if (conflictCandidates.length > 0 && missingLineage.size === 0) {
    state = "WITNESSED_CONFLICT";
    reasons.add("CONFIRMED_PROHIBITED_FLOW_WITNESSED");
  } else if (conflictCandidates.length > 0) {
    state = "NEEDS_REVIEW";
  } else if (hasInvisible) {
    state = "NOT_VISIBLE";
    reasons.add("REQUIRED_EVIDENCE_NOT_VISIBLE");
  } else if (hasUntested) {
    state = "NOT_TESTED";
    reasons.add("REQUIRED_PATH_NOT_EXERCISED");
  } else if (
    hasUnsupported ||
    hasCollision ||
    hasUnknownRelevantDestination ||
    purposeNeedsReview ||
    missingLineage.size > 0
  ) {
    state = "NEEDS_REVIEW";
  } else if (input.priorFindingId) {
    state = "NOT_REOBSERVED_IN_NAMED_TESTS";
    reasons.add("PRIOR_CONFLICT_NOT_REOBSERVED_IN_COMPLETE_SCOPE");
  } else {
    state = "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS";
    reasons.add("NO_CONFLICT_IN_COMPLETE_NAMED_SCOPE");
  }

  const checkpointResults = manifest.checkpointCoverage.map((checkpoint) => ({
    checkpointId: checkpoint.checkpointId,
    required: true,
    exercised: checkpoint.status !== "NOT_TESTED",
    visible: checkpoint.status !== "NOT_VISIBLE",
  }));
  const matchedObservationIds = unique(
    relevantMatches.map(({ matcherOutcome }) => matcherOutcome.observationId),
  ).sort();
  const findingObservationIds = unique(
    input.evidence
      .map(({ matcherOutcome }) => matcherOutcome.observationId)
      .filter((observationId) => observationIds.has(observationId)),
  ).sort();
  const visiblePaths = manifest.checkpointCoverage
    .filter(({ status }) => status === "VERIFIED")
    .map(({ checkpointId }) => pathByCheckpoint.get(checkpointId))
    .filter((path): path is string => path !== undefined);
  const untestedPaths = manifest.checkpointCoverage
    .filter(({ status }) => status === "NOT_TESTED")
    .map(({ checkpointId }) => pathByCheckpoint.get(checkpointId))
    .filter((path): path is string => path !== undefined);
  const notVisiblePaths = manifest.checkpointCoverage
    .filter(({ status }) => status === "NOT_VISIBLE")
    .map(({ checkpointId }) => pathByCheckpoint.get(checkpointId))
    .filter((path): path is string => path !== undefined);
  const limitations = unique([
    ...manifest.limitations,
    `This finding is limited to the named ${input.namedScope.journeyName} journey for the ${input.namedScope.role.toLowerCase()} role.`,
    ...(untestedPaths.length > 0
      ? [`Required paths not exercised: ${untestedPaths.join("; ")}.`]
      : []),
    ...(notVisiblePaths.length > 0
      ? [`Required paths without visible evidence: ${notVisiblePaths.join("; ")}.`]
      : []),
  ]);
  const copy = FINDING_STATE_COPY[state];
  const evaluation = boundedFindingEvaluationSchema.parse({
    schemaVersion: "1.0.0",
    finding: findingSchema.parse({
      id: input.findingId,
      workspaceId: manifest.workspaceId,
      runId: manifest.runId,
      requirementVersionId: requirement.id,
      state,
      checkpoints: checkpointResults,
      observationIds: findingObservationIds,
      ...(state === "NOT_REOBSERVED_IN_NAMED_TESTS"
        ? { priorFindingId: input.priorFindingId }
        : {}),
      limitations,
      createdAt: new Date(input.createdAt).toISOString(),
    }),
    reasonCodes: sortedReasons(reasons),
    scope: {
      softwareId: manifest.softwareId,
      softwareVersion: input.namedScope.softwareVersion,
      agreementVersionId: requirement.agreementVersionId,
      requirementVersionId: requirement.id,
      role: input.namedScope.role,
      journeyVersionId: manifest.snapshot.journeyVersionId,
      journeyName: input.namedScope.journeyName,
      fields: [dataField],
      observationWindow: input.namedScope.observationWindow,
      visiblePaths,
      untestedPaths,
      notVisiblePaths,
      limitations,
    },
    deterministicBasis: {
      evaluatorVersion: FINDING_EVALUATOR_VERSION,
      requirementAuthority: isExecutable
        ? "HUMAN_CONFIRMED_MACHINE_TESTABLE"
        : "NOT_EXECUTABLE",
      runManifestHash: manifest.manifestHash,
      matchedObservationIds,
      prohibitedDestinationVersionIds: unique(
        conflictCandidates
          .map(({ destination }) =>
            destination.status === "PROHIBITED"
              ? destination.destinationVersionId
              : undefined,
          )
          .filter((id): id is string => id !== undefined),
      ).sort(),
      lineageComplete: missingLineage.size === 0,
      missingLineage: [...missingLineage].sort(),
      modelNarrativeExcluded: true,
    },
    display: {
      label: copy.label,
      meaning: copy.meaning,
      internalState: state,
    },
    ...(input.modelNarrative
      ? {
          modelExplanation: {
            label: "Model explanation — not evidence",
            model: input.modelNarrative.model,
            text: input.modelNarrative.text,
            confidence: input.modelNarrative.confidence,
            excludedFromDecision: true,
          },
        }
      : {}),
  });
  return immutableClone(evaluation);
}

export class FindingEvaluationConflictError extends Error {
  readonly code = "FINDING_EVALUATION_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "FindingEvaluationConflictError";
  }
}

export interface FindingEvaluationRepository {
  append(evaluation: BoundedFindingEvaluation): Promise<void>;
  get(
    workspaceId: string,
    findingId: string,
  ): Promise<BoundedFindingEvaluation | undefined>;
  listForRun(
    workspaceId: string,
    runId: string,
  ): Promise<readonly BoundedFindingEvaluation[]>;
}

function repositoryKey(workspaceId: string, findingId: string): string {
  return `${workspaceId}:${findingId}`;
}

export class InMemoryFindingEvaluationRepository
  implements FindingEvaluationRepository
{
  readonly #evaluations = new Map<string, BoundedFindingEvaluation>();

  append(evaluationCandidate: BoundedFindingEvaluation): Promise<void> {
    const evaluation = boundedFindingEvaluationSchema.parse(evaluationCandidate);
    const key = repositoryKey(
      evaluation.finding.workspaceId,
      evaluation.finding.id,
    );
    if (this.#evaluations.has(key)) {
      return Promise.reject(
        new FindingEvaluationConflictError(
          "Finding evaluation already exists and cannot be replaced",
        ),
      );
    }
    this.#evaluations.set(key, immutableClone(evaluation));
    return Promise.resolve();
  }

  get(
    workspaceId: string,
    findingId: string,
  ): Promise<BoundedFindingEvaluation | undefined> {
    const evaluation = this.#evaluations.get(
      repositoryKey(uuid.parse(workspaceId), uuid.parse(findingId)),
    );
    return Promise.resolve(
      evaluation ? immutableClone(evaluation) : undefined,
    );
  }

  listForRun(
    workspaceId: string,
    runId: string,
  ): Promise<readonly BoundedFindingEvaluation[]> {
    const parsedWorkspaceId = uuid.parse(workspaceId);
    const parsedRunId = uuid.parse(runId);
    return Promise.resolve(
      [...this.#evaluations.values()]
        .filter(
          ({ finding }) =>
            finding.workspaceId === parsedWorkspaceId &&
            finding.runId === parsedRunId,
        )
        .sort((left, right) =>
          left.finding.createdAt.localeCompare(right.finding.createdAt),
        )
        .map((evaluation) => immutableClone(evaluation)),
    );
  }
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return JSON.parse(value) as unknown;
}

interface FindingPayloadRow {
  readonly payload: unknown;
}

interface ManifestLineageRow {
  readonly manifest_hash: string;
}

export class PostgresFindingEvaluationRepository
  implements FindingEvaluationRepository
{
  constructor(private readonly database: MigrationDatabase) {}

  async append(evaluationCandidate: BoundedFindingEvaluation): Promise<void> {
    const evaluation = boundedFindingEvaluationSchema.parse(evaluationCandidate);
    const finding = evaluation.finding;
    const manifest = await this.database.query<ManifestLineageRow>(
      "SELECT manifest_hash FROM run_manifests WHERE workspace_id = $1 AND run_id = $2",
      [finding.workspaceId, finding.runId],
    );
    if (
      manifest.rows[0]?.manifest_hash !==
      evaluation.deterministicBasis.runManifestHash
    ) {
      throw new FindingEvaluationConflictError(
        "Finding evaluation requires the exact finalized run manifest",
      );
    }
    const required = finding.checkpoints.filter(({ required }) => required);
    const allRequiredExercised = required.every(({ exercised }) => exercised);
    const allRequiredVisible = required.every(({ visible }) => visible);
    try {
      await this.database.query(
        "INSERT INTO findings (workspace_id, id, run_id, requirement_version_id, state, all_required_exercised, all_required_visible, payload, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [
          finding.workspaceId,
          finding.id,
          finding.runId,
          finding.requirementVersionId,
          finding.state,
          allRequiredExercised,
          allRequiredVisible,
          evaluation,
          finding.createdAt,
        ],
      );
    } catch (error) {
      if (
        error instanceof Error &&
        /duplicate|unique|already exists/iu.test(error.message)
      ) {
        throw new FindingEvaluationConflictError(
          "Finding evaluation already exists and cannot be replaced",
        );
      }
      throw error;
    }
  }

  async get(
    workspaceId: string,
    findingId: string,
  ): Promise<BoundedFindingEvaluation | undefined> {
    const result = await this.database.query<FindingPayloadRow>(
      "SELECT payload FROM findings WHERE workspace_id = $1 AND id = $2",
      [uuid.parse(workspaceId), uuid.parse(findingId)],
    );
    const payload = result.rows[0]?.payload;
    return payload === undefined
      ? undefined
      : immutableClone(
          boundedFindingEvaluationSchema.parse(jsonValue(payload)),
        );
  }

  async listForRun(
    workspaceId: string,
    runId: string,
  ): Promise<readonly BoundedFindingEvaluation[]> {
    const result = await this.database.query<FindingPayloadRow>(
      "SELECT payload FROM findings WHERE workspace_id = $1 AND run_id = $2 ORDER BY created_at ASC, id ASC",
      [uuid.parse(workspaceId), uuid.parse(runId)],
    );
    return result.rows.map(({ payload }) =>
      immutableClone(
        boundedFindingEvaluationSchema.parse(jsonValue(payload)),
      ),
    );
  }
}
