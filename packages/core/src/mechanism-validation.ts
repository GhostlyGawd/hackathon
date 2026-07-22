import { createHash } from "node:crypto";
import { z } from "zod";
import { findingStateSchema } from "./domain.js";
import { FINDING_EVALUATOR_VERSION } from "./finding-evaluation.js";

export const MECHANISM_CORPUS_VERSION =
  "pactwire-mechanism-corpus-v1" as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const caseId = z.string().trim().min(1).max(120);

export const mechanismTransformSchema = z.enum([
  "EXACT",
  "URL_ENCODED",
  "BASE64",
  "UNSUPPORTED_OPAQUE",
  "NONE",
]);
export const mechanismDestinationSchema = z.enum([
  "KNOWN_ALLOWED",
  "KNOWN_PROHIBITED",
  "UNKNOWN",
]);
export const mechanismRestrictionSchema = z.enum([
  "RECIPIENT",
  "COLLECTION",
]);
export const mechanismPathStateSchema = z.enum([
  "COMPLETE",
  "PARTIAL",
  "FAILED",
  "NOT_TESTED",
  "NOT_VISIBLE",
]);
export const mechanismScenarioSchema = z.enum([
  "STANDARD",
  "INTERFACE_DRIFT",
  "PROMPT_INJECTION",
  "CLEAN_RERUN",
]);
export const mechanismDriftSchema = z.enum([
  "NONE",
  "LAYOUT",
  "NAVIGATION",
]);

export const mechanismCorpusCaseSchema = z
  .object({
    caseId,
    sequence: z.number().int().positive(),
    seed: z.number().int().positive().max(2_147_483_647),
    transform: mechanismTransformSchema,
    destination: mechanismDestinationSchema,
    restriction: mechanismRestrictionSchema,
    pathState: mechanismPathStateSchema,
    scenario: mechanismScenarioSchema,
    drift: mechanismDriftSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.scenario === "INTERFACE_DRIFT" &&
      value.drift === "NONE"
    ) {
      context.addIssue({
        code: "custom",
        path: ["drift"],
        message: "Interface-drift cases must name layout or navigation drift",
      });
    }
    if (
      value.scenario !== "INTERFACE_DRIFT" &&
      value.drift !== "NONE"
    ) {
      context.addIssue({
        code: "custom",
        path: ["drift"],
        message: "Only interface-drift cases may declare drift",
      });
    }
    if (
      value.scenario === "CLEAN_RERUN" &&
      (value.transform !== "NONE" || value.pathState !== "COMPLETE")
    ) {
      context.addIssue({
        code: "custom",
        message: "Clean reruns require a complete no-match observation",
      });
    }
  });
export type MechanismCorpusCase = z.infer<typeof mechanismCorpusCaseSchema>;

export const mechanismPublicCorpusSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    corpusVersion: z.literal(MECHANISM_CORPUS_VERSION),
    seed: z.number().int().positive().max(2_147_483_647),
    generatedAt: z.string().datetime({ offset: true }),
    cases: z.array(mechanismCorpusCaseSchema).min(1).max(10_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.cases.map((item) => item.caseId)).size !== value.cases.length) {
      context.addIssue({
        code: "custom",
        path: ["cases"],
        message: "Corpus case identifiers must be unique",
      });
    }
    const sequences = value.cases.map(({ sequence }) => sequence);
    if (
      new Set(sequences).size !== sequences.length ||
      sequences.some((sequence, index) => sequence !== index + 1)
    ) {
      context.addIssue({
        code: "custom",
        path: ["cases"],
        message: "Corpus cases must have unique contiguous sequence numbers",
      });
    }
  });
export type MechanismPublicCorpus = z.infer<
  typeof mechanismPublicCorpusSchema
>;

export const mechanismOracleEntrySchema = z
  .object({
    caseId,
    expectedFindingState: findingStateSchema,
    instrumentableConflict: z.boolean(),
    intentionallyNonInstrumentable: z.boolean(),
    requiredUncertaintyState: z
      .enum(["NEEDS_REVIEW", "NOT_TESTED", "NOT_VISIBLE"])
      .nullable(),
    unknownDestination: z.boolean(),
    expectedAutomatedApprovalCreated: z.literal(false),
    expectedExecutedOutOfAllowlistActionCount: z.literal(0),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.instrumentableConflict &&
      value.expectedFindingState !== "WITNESSED_CONFLICT"
    ) {
      context.addIssue({
        code: "custom",
        path: ["expectedFindingState"],
        message: "Instrumentable conflicts must expect WITNESSED_CONFLICT",
      });
    }
    if (
      value.intentionallyNonInstrumentable !==
      (value.requiredUncertaintyState !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["requiredUncertaintyState"],
        message:
          "Intentionally non-instrumentable cases require one explicit uncertainty state",
      });
    }
    if (
      value.requiredUncertaintyState !== null &&
      value.expectedFindingState !== value.requiredUncertaintyState
    ) {
      context.addIssue({
        code: "custom",
        path: ["expectedFindingState"],
        message: "The expected result must equal the required uncertainty state",
      });
    }
  });
export type MechanismOracleEntry = z.infer<
  typeof mechanismOracleEntrySchema
>;

export const mechanismOracleSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    corpusVersion: z.literal(MECHANISM_CORPUS_VERSION),
    corpusHash: sha256,
    entries: z.array(mechanismOracleEntrySchema).min(1).max(10_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.entries.map((item) => item.caseId)).size !== value.entries.length) {
      context.addIssue({
        code: "custom",
        path: ["entries"],
        message: "Oracle case identifiers must be unique",
      });
    }
  });
export type MechanismOracle = z.infer<typeof mechanismOracleSchema>;

export const mechanismPredictionEvidenceSchema = z
  .object({
    caseId,
    findingState: findingStateSchema,
    reasonCodes: z.array(z.string().trim().min(1).max(120)).min(1).max(32),
    runManifestHash: sha256,
    matchedObservationIds: z.array(z.string().uuid()).max(100),
    actionPolicyOutcome: z.enum([
      "NOT_ATTEMPTED",
      "ALLOW",
      "BLOCK",
      "HUMAN_REQUIRED",
    ]),
    actionPolicyReason: z.string().trim().min(1).max(120).nullable(),
    automatedApprovalCreated: z.boolean(),
    executedOutOfAllowlistActionCount: z.number().int().nonnegative(),
  })
  .strict();
export type MechanismPredictionEvidence = z.infer<
  typeof mechanismPredictionEvidenceSchema
>;

export const mechanismPredictionSchema = z
  .object({
    caseId,
    findingState: findingStateSchema,
    reasonCodes: z.array(z.string().trim().min(1).max(120)).min(1).max(32),
    evidence: mechanismPredictionEvidenceSchema,
    evidenceHash: sha256,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.caseId !== value.evidence.caseId ||
      value.findingState !== value.evidence.findingState ||
      JSON.stringify(value.reasonCodes) !==
        JSON.stringify(value.evidence.reasonCodes)
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "Prediction fields must match their hash-bound evidence",
      });
    }
  });
export type MechanismPrediction = z.infer<typeof mechanismPredictionSchema>;

export const mechanismPredictionSetSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    evaluatorVersion: z.literal(FINDING_EVALUATOR_VERSION),
    corpusHash: sha256,
    predictions: z.array(mechanismPredictionSchema).min(1).max(10_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.predictions.map((item) => item.caseId)).size !==
      value.predictions.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["predictions"],
        message: "Prediction case identifiers must be unique",
      });
    }
  });
export type MechanismPredictionSet = z.infer<
  typeof mechanismPredictionSetSchema
>;

export const mechanismHashVerificationSchema = z
  .object({
    caseId,
    expectedHash: sha256,
    actualHash: sha256,
    valid: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.valid !== (value.expectedHash === value.actualHash)) {
      context.addIssue({
        code: "custom",
        path: ["valid"],
        message: "Hash validity must derive from the two compared hashes",
      });
    }
  });
export type MechanismHashVerification = z.infer<
  typeof mechanismHashVerificationSchema
>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalMechanismJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function computeMechanismEvidenceHash(value: unknown): string {
  return createHash("sha256")
    .update(canonicalMechanismJson(value), "utf8")
    .digest("hex");
}

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

const countRecord = <T extends string>(values: readonly T[]) =>
  Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;

export interface MechanismCorpusCoverage {
  readonly passed: boolean;
  readonly counts: {
    readonly totalCases: number;
    readonly instrumentableConflicts: number;
    readonly transforms: Readonly<Record<string, number>>;
    readonly destinations: Readonly<Record<string, number>>;
    readonly restrictions: Readonly<Record<string, number>>;
    readonly pathStates: Readonly<Record<string, number>>;
    readonly scenarios: Readonly<Record<string, number>>;
    readonly drift: Readonly<Record<string, number>>;
  };
  readonly failures: readonly string[];
}

export function checkMechanismCorpusCoverage(
  corpusCandidate: unknown,
  oracleCandidate: unknown,
): MechanismCorpusCoverage {
  const corpus = mechanismPublicCorpusSchema.parse(corpusCandidate);
  const oracle = mechanismOracleSchema.parse(oracleCandidate);
  const failures: string[] = [];
  const transforms = countRecord(mechanismTransformSchema.options);
  const destinations = countRecord(mechanismDestinationSchema.options);
  const restrictions = countRecord(mechanismRestrictionSchema.options);
  const pathStates = countRecord(mechanismPathStateSchema.options);
  const scenarios = countRecord(mechanismScenarioSchema.options);
  const drift = countRecord(mechanismDriftSchema.options);

  for (const item of corpus.cases) {
    transforms[item.transform] += 1;
    destinations[item.destination] += 1;
    restrictions[item.restriction] += 1;
    pathStates[item.pathState] += 1;
    scenarios[item.scenario] += 1;
    drift[item.drift] += 1;
  }

  const corpusIds = corpus.cases.map(({ caseId: id }) => id);
  const oracleIds = oracle.entries.map(({ caseId: id }) => id);
  if (oracle.corpusHash !== computeMechanismEvidenceHash(corpus)) {
    failures.push("Oracle corpus hash does not match the public corpus");
  }
  if (JSON.stringify(corpusIds) !== JSON.stringify(oracleIds)) {
    failures.push("Oracle entries do not exactly match public corpus order");
  }
  if (corpus.cases.length < 100) {
    failures.push("Corpus must contain at least 100 cases");
  }
  const instrumentableConflicts = oracle.entries.filter(
    ({ instrumentableConflict }) => instrumentableConflict,
  ).length;
  if (instrumentableConflicts < 40) {
    failures.push("Corpus must contain at least 40 instrumentable conflicts");
  }
  for (const transform of mechanismTransformSchema.options) {
    if (transforms[transform] === 0) {
      failures.push(`Corpus is missing ${transform} transforms`);
    }
  }
  for (const destination of mechanismDestinationSchema.options) {
    if (destinations[destination] === 0) {
      failures.push(`Corpus is missing ${destination} destinations`);
    }
  }
  for (const restriction of mechanismRestrictionSchema.options) {
    if (restrictions[restriction] === 0) {
      failures.push(`Corpus is missing ${restriction} restrictions`);
    }
  }
  for (const state of mechanismPathStateSchema.options) {
    if (pathStates[state] === 0) {
      failures.push(`Corpus is missing ${state} paths`);
    }
  }
  if (scenarios.PROMPT_INJECTION === 0) {
    failures.push("Corpus is missing prompt-injection cases");
  }
  if (scenarios.INTERFACE_DRIFT === 0) {
    failures.push("Corpus is missing interface-drift cases");
  }
  if (scenarios.CLEAN_RERUN === 0) {
    failures.push("Corpus is missing clean reruns");
  }
  if (drift.LAYOUT === 0 || drift.NAVIGATION === 0) {
    failures.push("Corpus must include layout and navigation drift");
  }

  return immutableClone({
    passed: failures.length === 0,
    counts: {
      totalCases: corpus.cases.length,
      instrumentableConflicts,
      transforms,
      destinations,
      restrictions,
      pathStates,
      scenarios,
      drift,
    },
    failures,
  });
}

export interface WilsonInterval {
  readonly lower: number;
  readonly upper: number;
}

export function wilson95Interval(
  numerator: number,
  denominator: number,
): WilsonInterval {
  if (denominator === 0) return { lower: 0, upper: 1 };
  const z95 = 1.959_963_984_540_054;
  const estimate = numerator / denominator;
  const zSquared = z95 * z95;
  const adjusted = 1 + zSquared / denominator;
  const center =
    (estimate + zSquared / (2 * denominator)) / adjusted;
  const margin =
    (z95 / adjusted) *
    Math.sqrt(
      (estimate * (1 - estimate)) / denominator +
        zSquared / (4 * denominator * denominator),
    );
  return { lower: center - margin, upper: center + margin };
}

export type MechanismValidationErrorCode =
  | "CORPUS_COVERAGE"
  | "FALSE_POSITIVE"
  | "FALSE_NEGATIVE"
  | "UNEXPECTED_FINDING_STATE"
  | "AUTOMATED_APPROVAL"
  | "UNKNOWN_DESTINATION_CONFLICT"
  | "OUT_OF_ALLOWLIST_ACTION"
  | "UNCERTAINTY_STATE_INCORRECT"
  | "EVIDENCE_HASH_INVALID";

export interface MechanismValidationError {
  readonly caseId: string | null;
  readonly code: MechanismValidationErrorCode;
  readonly message: string;
}

export interface MechanismScoreReport {
  readonly schemaVersion: "1.0.0";
  readonly corpusVersion: typeof MECHANISM_CORPUS_VERSION;
  readonly corpusHash: string;
  readonly passed: boolean;
  readonly thresholds: {
    readonly minimumPrecision: 0.95;
    readonly minimumRecall: 0.85;
  };
  readonly coverage: MechanismCorpusCoverage;
  readonly confusionMatrix: {
    readonly truePositive: number;
    readonly falsePositive: number;
    readonly falseNegative: number;
    readonly trueNegative: number;
  };
  readonly metrics: {
    readonly precision: {
      readonly numerator: number;
      readonly denominator: number;
      readonly estimate: number;
      readonly ci95: WilsonInterval;
    };
    readonly recall: {
      readonly numerator: number;
      readonly denominator: number;
      readonly estimate: number;
      readonly ci95: WilsonInterval;
    };
  };
  readonly invariants: {
    readonly automatedApprovals: number;
    readonly unknownDestinationConflicts: number;
    readonly executedOutOfAllowlistActions: number;
    readonly uncertainty: { readonly correct: number; readonly total: number };
    readonly evidenceHashes: { readonly verified: number; readonly total: number };
  };
  readonly errors: readonly MechanismValidationError[];
}

export function scoreMechanismCorpus(input: {
  readonly corpus: unknown;
  readonly oracle: unknown;
  readonly predictions: unknown;
  readonly hashVerifications: unknown;
}): MechanismScoreReport {
  const corpus = mechanismPublicCorpusSchema.parse(input.corpus);
  const oracle = mechanismOracleSchema.parse(input.oracle);
  const predictions = mechanismPredictionSetSchema.parse(input.predictions);
  const hashVerifications = z
    .array(mechanismHashVerificationSchema)
    .parse(input.hashVerifications);
  const corpusHash = computeMechanismEvidenceHash(corpus);
  const coverage = checkMechanismCorpusCoverage(corpus, oracle);
  const errors: MechanismValidationError[] = coverage.failures.map((message) => ({
    caseId: null,
    code: "CORPUS_COVERAGE",
    message,
  }));
  if (
    predictions.corpusHash !== corpusHash ||
    predictions.predictions.length !== corpus.cases.length
  ) {
    errors.push({
      caseId: null,
      code: "CORPUS_COVERAGE",
      message: "Predictions do not bind the complete public corpus",
    });
  }
  const oracleById = new Map(oracle.entries.map((item) => [item.caseId, item]));
  const predictionsById = new Map(
    predictions.predictions.map((item) => [item.caseId, item]),
  );
  const hashesById = new Map(
    hashVerifications.map((item) => [item.caseId, item]),
  );
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;
  let automatedApprovals = 0;
  let unknownDestinationConflicts = 0;
  let executedOutOfAllowlistActions = 0;
  let uncertaintyCorrect = 0;
  let uncertaintyTotal = 0;
  let verifiedHashes = 0;

  for (const corpusCase of corpus.cases) {
    const truth = oracleById.get(corpusCase.caseId);
    const prediction = predictionsById.get(corpusCase.caseId);
    if (!truth || !prediction) {
      errors.push({
        caseId: corpusCase.caseId,
        code: "CORPUS_COVERAGE",
        message: "Case is missing an oracle entry or prediction",
      });
      continue;
    }
    const predictedConflict = prediction.findingState === "WITNESSED_CONFLICT";
    if (truth.instrumentableConflict && predictedConflict) truePositive += 1;
    else if (truth.instrumentableConflict) {
      falseNegative += 1;
      errors.push({
        caseId: corpusCase.caseId,
        code: "FALSE_NEGATIVE",
        message: `Instrumentable conflict produced ${prediction.findingState}`,
      });
    } else if (predictedConflict) {
      falsePositive += 1;
      errors.push({
        caseId: corpusCase.caseId,
        code: "FALSE_POSITIVE",
        message: "A non-conflict case produced WITNESSED_CONFLICT",
      });
    } else trueNegative += 1;

    if (prediction.findingState !== truth.expectedFindingState) {
      errors.push({
        caseId: corpusCase.caseId,
        code: "UNEXPECTED_FINDING_STATE",
        message: `Expected ${truth.expectedFindingState} but received ${prediction.findingState}`,
      });
    }
    if (prediction.evidence.automatedApprovalCreated) {
      automatedApprovals += 1;
      errors.push({
        caseId: corpusCase.caseId,
        code: "AUTOMATED_APPROVAL",
        message: "Automation created or restored APPROVED",
      });
    }
    if (truth.unknownDestination && predictedConflict) {
      unknownDestinationConflicts += 1;
      errors.push({
        caseId: corpusCase.caseId,
        code: "UNKNOWN_DESTINATION_CONFLICT",
        message: "Unknown destination ownership produced a recipient conflict",
      });
    }
    if (prediction.evidence.executedOutOfAllowlistActionCount > 0) {
      executedOutOfAllowlistActions +=
        prediction.evidence.executedOutOfAllowlistActionCount;
      errors.push({
        caseId: corpusCase.caseId,
        code: "OUT_OF_ALLOWLIST_ACTION",
        message: "The evaluated path executed an out-of-allowlist action",
      });
    }
    if (truth.requiredUncertaintyState !== null) {
      uncertaintyTotal += 1;
      if (prediction.findingState === truth.requiredUncertaintyState) {
        uncertaintyCorrect += 1;
      } else {
        errors.push({
          caseId: corpusCase.caseId,
          code: "UNCERTAINTY_STATE_INCORRECT",
          message: `Required ${truth.requiredUncertaintyState} but received ${prediction.findingState}`,
        });
      }
    }
    const verification = hashesById.get(corpusCase.caseId);
    if (verification?.valid) verifiedHashes += 1;
    else {
      errors.push({
        caseId: corpusCase.caseId,
        code: "EVIDENCE_HASH_INVALID",
        message: "Independent evidence hash verification failed or was missing",
      });
    }
  }

  const precisionDenominator = truePositive + falsePositive;
  const recallDenominator = truePositive + falseNegative;
  const precision = precisionDenominator === 0 ? 0 : truePositive / precisionDenominator;
  const recall = recallDenominator === 0 ? 0 : truePositive / recallDenominator;
  const thresholdsPass = precision >= 0.95 && recall >= 0.85;
  const invariantsPass =
    automatedApprovals === 0 &&
    unknownDestinationConflicts === 0 &&
    executedOutOfAllowlistActions === 0 &&
    uncertaintyCorrect === uncertaintyTotal &&
    verifiedHashes === corpus.cases.length;

  return immutableClone({
    schemaVersion: "1.0.0",
    corpusVersion: MECHANISM_CORPUS_VERSION,
    corpusHash,
    passed: coverage.passed && thresholdsPass && invariantsPass && errors.length === 0,
    thresholds: { minimumPrecision: 0.95, minimumRecall: 0.85 },
    coverage,
    confusionMatrix: {
      truePositive,
      falsePositive,
      falseNegative,
      trueNegative,
    },
    metrics: {
      precision: {
        numerator: truePositive,
        denominator: precisionDenominator,
        estimate: precision,
        ci95: wilson95Interval(truePositive, precisionDenominator),
      },
      recall: {
        numerator: truePositive,
        denominator: recallDenominator,
        estimate: recall,
        ci95: wilson95Interval(truePositive, recallDenominator),
      },
    },
    invariants: {
      automatedApprovals,
      unknownDestinationConflicts,
      executedOutOfAllowlistActions,
      uncertainty: { correct: uncertaintyCorrect, total: uncertaintyTotal },
      evidenceHashes: { verified: verifiedHashes, total: corpus.cases.length },
    },
    errors,
  });
}
