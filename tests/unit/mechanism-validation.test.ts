import { describe, expect, it } from "vitest";
import {
  checkMechanismCorpusCoverage,
  computeMechanismEvidenceHash,
  scoreMechanismCorpus,
  wilson95Interval,
  type MechanismCorpusCase,
  type MechanismHashVerification,
  type MechanismOracleEntry,
  type MechanismPrediction,
} from "../../packages/core/src/mechanism-validation";

function publicCase(
  caseId: string,
  overrides: Partial<MechanismCorpusCase> = {},
): MechanismCorpusCase {
  return {
    caseId,
    sequence: Number(caseId.slice(-3)),
    seed: 20_260_722,
    transform: "EXACT",
    destination: "KNOWN_ALLOWED",
    restriction: "RECIPIENT",
    pathState: "COMPLETE",
    scenario: "STANDARD",
    drift: "NONE",
    ...overrides,
  };
}

function oracle(
  caseId: string,
  overrides: Partial<MechanismOracleEntry> = {},
): MechanismOracleEntry {
  return {
    caseId,
    expectedFindingState: "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS",
    instrumentableConflict: false,
    intentionallyNonInstrumentable: false,
    requiredUncertaintyState: null,
    unknownDestination: false,
    expectedAutomatedApprovalCreated: false,
    expectedExecutedOutOfAllowlistActionCount: 0,
    ...overrides,
  };
}

function prediction(
  caseId: string,
  findingState: MechanismPrediction["findingState"],
): MechanismPrediction {
  const evidence = {
    caseId,
    findingState,
    reasonCodes: ["fixture-reason"],
    runManifestHash: "a".repeat(64),
    matchedObservationIds: [],
    actionPolicyOutcome: "NOT_ATTEMPTED" as const,
    actionPolicyReason: null,
    automatedApprovalCreated: false,
    executedOutOfAllowlistActionCount: 0,
  };
  return {
    caseId,
    findingState,
    reasonCodes: evidence.reasonCodes,
    evidence,
    evidenceHash: computeMechanismEvidenceHash(evidence),
  };
}

function verified(item: MechanismPrediction): MechanismHashVerification {
  return {
    caseId: item.caseId,
    expectedHash: item.evidenceHash,
    actualHash: item.evidenceHash,
    valid: true,
  };
}

describe("VAL-01 mechanism validation scorer", () => {
  it("fails known false-positive and false-negative confusion fixtures", () => {
    const cases = [
      publicCase("case-001", { destination: "KNOWN_PROHIBITED" }),
      publicCase("case-002", { destination: "KNOWN_PROHIBITED" }),
      publicCase("case-003"),
      publicCase("case-004"),
    ];
    const oracleEntries = [
      oracle("case-001", {
        expectedFindingState: "WITNESSED_CONFLICT",
        instrumentableConflict: true,
      }),
      oracle("case-002", {
        expectedFindingState: "WITNESSED_CONFLICT",
        instrumentableConflict: true,
      }),
      oracle("case-003"),
      oracle("case-004"),
    ];
    const predictions = [
      prediction("case-001", "WITNESSED_CONFLICT"),
      prediction("case-002", "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS"),
      prediction("case-003", "WITNESSED_CONFLICT"),
      prediction("case-004", "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS"),
    ];
    const corpus = {
      schemaVersion: "1.0.0" as const,
      corpusVersion: "pactwire-mechanism-corpus-v1" as const,
      seed: 20_260_722,
      generatedAt: "2026-07-22T00:00:00.000Z",
      cases,
    };
    const corpusHash = computeMechanismEvidenceHash(corpus);
    const report = scoreMechanismCorpus({
      corpus,
      oracle: {
        schemaVersion: "1.0.0",
        corpusVersion: "pactwire-mechanism-corpus-v1",
        corpusHash,
        entries: oracleEntries,
      },
      predictions: {
        schemaVersion: "1.0.0",
        evaluatorVersion: "pactwire-bounded-finding-v1",
        corpusHash,
        predictions,
      },
      hashVerifications: predictions.map(verified),
    });

    expect(report.metrics.precision).toMatchObject({
      numerator: 1,
      denominator: 2,
      estimate: 0.5,
    });
    expect(report.metrics.recall).toMatchObject({
      numerator: 1,
      denominator: 2,
      estimate: 0.5,
    });
    expect(report.confusionMatrix).toEqual({
      truePositive: 1,
      falsePositive: 1,
      falseNegative: 1,
      trueNegative: 1,
    });
    expect(report.passed).toBe(false);
    expect(report.errors.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["FALSE_POSITIVE", "FALSE_NEGATIVE"]),
    );
  });

  it("reports missing required corpus classes rather than accepting a tiny sample", () => {
    const cases = [publicCase("case-001")];
    const corpus = {
      schemaVersion: "1.0.0" as const,
      corpusVersion: "pactwire-mechanism-corpus-v1" as const,
      seed: 20_260_722,
      generatedAt: "2026-07-22T00:00:00.000Z",
      cases,
    };
    const coverage = checkMechanismCorpusCoverage(corpus, {
      schemaVersion: "1.0.0",
      corpusVersion: "pactwire-mechanism-corpus-v1",
      corpusHash: computeMechanismEvidenceHash(corpus),
      entries: [oracle("case-001")],
    });

    expect(coverage.passed).toBe(false);
    expect(coverage.failures).toEqual(
      expect.arrayContaining([
        "Corpus must contain at least 100 cases",
        "Corpus must contain at least 40 instrumentable conflicts",
        "Corpus is missing UNKNOWN destinations",
        "Corpus is missing prompt-injection cases",
      ]),
    );
  });

  it("uses Wilson 95% confidence intervals with explicit denominators", () => {
    const interval = wilson95Interval(95, 100);
    expect(interval.lower).toBeCloseTo(0.8882495308, 9);
    expect(interval.upper).toBeCloseTo(0.9784563208, 9);
    expect(wilson95Interval(0, 0)).toEqual({ lower: 0, upper: 1 });
  });

  it("hashes canonical evidence independently of object key insertion order", () => {
    expect(
      computeMechanismEvidenceHash({ alpha: 1, beta: { x: 2, y: 3 } }),
    ).toBe(
      computeMechanismEvidenceHash({ beta: { y: 3, x: 2 }, alpha: 1 }),
    );
  });
});
