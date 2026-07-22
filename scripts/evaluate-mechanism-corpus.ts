import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { mechanismPublicCorpusSchema } from "../packages/core/src/mechanism-validation.js";
import { evaluatePublicMechanismCorpus } from "../tests/helpers/mechanism-corpus-public.js";

const [inputPath, outputPath, ...extra] = process.argv.slice(2);
if (!inputPath || !outputPath || extra.length > 0) {
  throw new TypeError(
    "Usage: tsx scripts/evaluate-mechanism-corpus.ts <public-corpus.json> <predictions.json>",
  );
}

const corpus = mechanismPublicCorpusSchema.parse(
  JSON.parse(await readFile(path.resolve(inputPath), "utf8")) as unknown,
);
const predictions = evaluatePublicMechanismCorpus(corpus);
await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await writeFile(
  path.resolve(outputPath),
  `${JSON.stringify(predictions, null, 2)}\n`,
  "utf8",
);
process.stdout.write(
  `${JSON.stringify({
    evaluatorVersion: predictions.evaluatorVersion,
    corpusHash: predictions.corpusHash,
    predictions: predictions.predictions.length,
  })}\n`,
);
