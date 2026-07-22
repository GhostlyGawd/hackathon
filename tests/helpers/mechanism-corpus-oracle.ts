import { createHash } from "node:crypto";
import {
  MECHANISM_CORPUS_VERSION,
  mechanismOracleSchema,
  mechanismPredictionSetSchema,
  mechanismPublicCorpusSchema,
  type MechanismHashVerification,
  type MechanismOracle,
  type MechanismOracleEntry,
  type MechanismPredictionSet,
  type MechanismPublicCorpus,
} from "../../packages/core/src/mechanism-validation";

function independentCanonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => independentCanonicalize(item));
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const output: Record<string, unknown> = {};
    for (const [key, nested] of entries) {
      output[key] = independentCanonicalize(nested);
    }
    return output;
  }
  return value;
}

function independentHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(independentCanonicalize(value)), "utf8")
    .digest("hex");
}

function expected(item: MechanismPublicCorpus["cases"][number]): MechanismOracleEntry {
  let expectedFindingState: MechanismOracleEntry["expectedFindingState"];
  let instrumentableConflict = false;
  let requiredUncertaintyState: MechanismOracleEntry["requiredUncertaintyState"] =
    null;
  if (item.scenario === "CLEAN_RERUN") {
    expectedFindingState = "NOT_REOBSERVED_IN_NAMED_TESTS";
  } else if (
    item.scenario === "PROMPT_INJECTION" ||
    item.scenario === "INTERFACE_DRIFT" ||
    item.pathState === "FAILED" ||
    item.pathState === "NOT_TESTED"
  ) {
    expectedFindingState = "NOT_TESTED";
    requiredUncertaintyState = "NOT_TESTED";
  } else if (item.pathState === "NOT_VISIBLE") {
    expectedFindingState = "NOT_VISIBLE";
    requiredUncertaintyState = "NOT_VISIBLE";
  } else if (
    item.destination === "UNKNOWN" ||
    item.transform === "UNSUPPORTED_OPAQUE"
  ) {
    expectedFindingState = "NEEDS_REVIEW";
    requiredUncertaintyState = "NEEDS_REVIEW";
  } else if (
    item.destination === "KNOWN_PROHIBITED" &&
    ["EXACT", "URL_ENCODED", "BASE64"].includes(item.transform)
  ) {
    expectedFindingState = "WITNESSED_CONFLICT";
    instrumentableConflict = true;
  } else {
    expectedFindingState = "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS";
  }
  return {
    caseId: item.caseId,
    expectedFindingState,
    instrumentableConflict,
    intentionallyNonInstrumentable: requiredUncertaintyState !== null,
    requiredUncertaintyState,
    unknownDestination: item.destination === "UNKNOWN",
    expectedAutomatedApprovalCreated: false,
    expectedExecutedOutOfAllowlistActionCount: 0,
  };
}

export function generateSealedMechanismOracle(
  corpusCandidate: unknown,
): MechanismOracle {
  const corpus = mechanismPublicCorpusSchema.parse(corpusCandidate);
  return mechanismOracleSchema.parse({
    schemaVersion: "1.0.0",
    corpusVersion: MECHANISM_CORPUS_VERSION,
    corpusHash: independentHash(corpus),
    entries: corpus.cases.map(expected),
  });
}

export function independentlyVerifyMechanismHashes(
  predictionsCandidate: unknown,
): readonly MechanismHashVerification[] {
  const predictions: MechanismPredictionSet =
    mechanismPredictionSetSchema.parse(predictionsCandidate);
  return predictions.predictions.map((prediction) => {
    const actualHash = independentHash(prediction.evidence);
    return {
      caseId: prediction.caseId,
      expectedHash: prediction.evidenceHash,
      actualHash,
      valid: prediction.evidenceHash === actualHash,
    };
  });
}
