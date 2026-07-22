import { describe, expect, it } from "vitest";
import {
  checkMechanismCorpusCoverage,
  scoreMechanismCorpus,
} from "../../packages/core/src/mechanism-validation";
import {
  evaluatePublicMechanismCorpus,
  generatePublicMechanismCorpus,
} from "../helpers/mechanism-corpus-public";
import {
  generateSealedMechanismOracle,
  independentlyVerifyMechanismHashes,
} from "../helpers/mechanism-corpus-oracle";

describe("VAL-01 full blinded mechanism corpus", () => {
  it("runs 120 reproducible cases through the actual deterministic boundaries and passes every Layer A threshold", () => {
    const corpus = generatePublicMechanismCorpus(20_260_722);
    const oracle = generateSealedMechanismOracle(corpus);
    const predictions = evaluatePublicMechanismCorpus(corpus);
    const hashVerifications = independentlyVerifyMechanismHashes(predictions);
    const coverage = checkMechanismCorpusCoverage(corpus, oracle);
    const report = scoreMechanismCorpus({
      corpus,
      oracle,
      predictions,
      hashVerifications,
    });

    expect(coverage).toMatchObject({
      passed: true,
      counts: {
        totalCases: 120,
        instrumentableConflicts: 48,
      },
    });
    expect(report).toMatchObject({
      passed: true,
      confusionMatrix: {
        truePositive: 48,
        falsePositive: 0,
        falseNegative: 0,
        trueNegative: 72,
      },
      metrics: {
        precision: { numerator: 48, denominator: 48, estimate: 1 },
        recall: { numerator: 48, denominator: 48, estimate: 1 },
      },
      invariants: {
        automatedApprovals: 0,
        unknownDestinationConflicts: 0,
        executedOutOfAllowlistActions: 0,
        uncertainty: { correct: 42, total: 42 },
        evidenceHashes: { verified: 120, total: 120 },
      },
    });
    expect(report.errors).toEqual([]);
  });

  it("fails a one-result mutation without changing the sealed oracle", () => {
    const corpus = generatePublicMechanismCorpus(20_260_722);
    const oracle = generateSealedMechanismOracle(corpus);
    const predictions = evaluatePublicMechanismCorpus(corpus);
    const firstConflict = predictions.predictions.findIndex(
      ({ findingState }) => findingState === "WITNESSED_CONFLICT",
    );
    const mutated = structuredClone(predictions);
    mutated.predictions[firstConflict]!.findingState =
      "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS";
    mutated.predictions[firstConflict]!.evidence.findingState =
      "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS";

    const report = scoreMechanismCorpus({
      corpus,
      oracle,
      predictions: mutated,
      hashVerifications: independentlyVerifyMechanismHashes(mutated),
    });

    expect(report.passed).toBe(false);
    expect(report.confusionMatrix.falseNegative).toBe(1);
    expect(report.errors.map(({ code }) => code)).toContain("FALSE_NEGATIVE");
    expect(report.errors.map(({ code }) => code)).toContain(
      "EVIDENCE_HASH_INVALID",
    );
  });
});
