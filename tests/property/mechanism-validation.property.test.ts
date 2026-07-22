import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeMechanismEvidenceHash } from "../../packages/core/src/mechanism-validation";
import { generatePublicMechanismCorpus } from "../helpers/mechanism-corpus-public";

const propertyOptions = { seed: 20_260_722, numRuns: 100 } as const;

describe("VAL-01 blinded corpus properties", () => {
  it("reproduces the complete public corpus for every generated seed", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2_147_483_647 }), (seed) => {
        const first = generatePublicMechanismCorpus(seed);
        const second = generatePublicMechanismCorpus(seed);

        expect(first).toEqual(second);
        expect(computeMechanismEvidenceHash(first)).toBe(
          computeMechanismEvidenceHash(second),
        );
      }),
      propertyOptions,
    );
  });

  it("never exposes oracle labels or expected results in the evaluated corpus", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2_147_483_647 }), (seed) => {
        const serialized = JSON.stringify(generatePublicMechanismCorpus(seed));

        expect(serialized).not.toMatch(
          /expectedFindingState|instrumentableConflict|requiredUncertaintyState|groundTruth|oracle/iu,
        );
      }),
      propertyOptions,
    );
  });
});
