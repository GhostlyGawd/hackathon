import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  mechanismPublicCorpusSchema,
} from "../../packages/core/src/mechanism-validation";
import { generatePublicMechanismCorpus } from "../helpers/mechanism-corpus-public";

describe("VAL-01 evaluator blindness boundary", () => {
  it("keeps sealed-result code out of the evaluated-process import graph", async () => {
    const source = await readFile(
      "scripts/evaluate-mechanism-corpus.ts",
      "utf8",
    );

    expect(source).not.toMatch(
      /mechanism-corpus-oracle|expectedFindingState|ground.?truth|sealedPath/iu,
    );
    expect(source).toContain("mechanismPublicCorpusSchema");
    expect(source).toContain("evaluatePublicMechanismCorpus");
    expect(source.match(/readFile\(/gu)).toHaveLength(1);
  });

  it("rejects an oracle label added to any public case", () => {
    const corpus = structuredClone(generatePublicMechanismCorpus(20_260_722));
    const leaked = corpus.cases[0] as unknown as Record<string, unknown>;
    leaked["expectedFindingState"] = "WITNESSED_CONFLICT";

    expect(() => mechanismPublicCorpusSchema.parse(corpus)).toThrow();
  });
});
