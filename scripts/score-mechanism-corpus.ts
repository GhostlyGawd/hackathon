import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  mechanismOracleSchema,
  mechanismPredictionSetSchema,
  mechanismPublicCorpusSchema,
  scoreMechanismCorpus,
} from "../packages/core/src/mechanism-validation.js";
import { independentlyVerifyMechanismHashes } from "../tests/helpers/mechanism-corpus-oracle.js";

const [publicPath, sealedPath, predictionPath, reportRoot, ...extra] =
  process.argv.slice(2);
if (
  !publicPath ||
  !sealedPath ||
  !predictionPath ||
  !reportRoot ||
  extra.length > 0
) {
  throw new TypeError(
    "Usage: tsx scripts/score-mechanism-corpus.ts <public-corpus.json> <sealed-manifest.json> <predictions.json> <report-directory>",
  );
}

const [corpus, sealed, predictions] = await Promise.all([
  readFile(path.resolve(publicPath), "utf8").then((value) =>
    mechanismPublicCorpusSchema.parse(JSON.parse(value) as unknown),
  ),
  readFile(path.resolve(sealedPath), "utf8").then((value) =>
    mechanismOracleSchema.parse(JSON.parse(value) as unknown),
  ),
  readFile(path.resolve(predictionPath), "utf8").then((value) =>
    mechanismPredictionSetSchema.parse(JSON.parse(value) as unknown),
  ),
]);
const hashVerifications = independentlyVerifyMechanismHashes(predictions);
const report = scoreMechanismCorpus({
  corpus,
  oracle: sealed,
  predictions,
  hashVerifications,
});
const outputRoot = path.resolve(reportRoot);
await mkdir(outputRoot, { recursive: true });
const percent = (value: number) => (value * 100).toFixed(2);
const chart = `# VAL-01 mechanism-correctness results

This chart is generated from the machine-readable score for corpus \`${report.corpusHash}\`. The bars are point estimates; the line is each metric's required threshold.

~~~mermaid
xychart-beta
    title "Witnessed-conflict precision and recall"
    x-axis ["Precision", "Recall"]
    y-axis "Percent" 0 --> 100
    bar [${percent(report.metrics.precision.estimate)}, ${percent(report.metrics.recall.estimate)}]
    line [${percent(report.thresholds.minimumPrecision)}, ${percent(report.thresholds.minimumRecall)}]
~~~

| Metric | Numerator | Denominator | Estimate | 95% CI | Required |
| --- | ---: | ---: | ---: | ---: | ---: |
| Precision | ${report.metrics.precision.numerator} | ${report.metrics.precision.denominator} | ${percent(report.metrics.precision.estimate)}% | ${percent(report.metrics.precision.ci95.lower)}%–${percent(report.metrics.precision.ci95.upper)}% | ${percent(report.thresholds.minimumPrecision)}% |
| Recall | ${report.metrics.recall.numerator} | ${report.metrics.recall.denominator} | ${percent(report.metrics.recall.estimate)}% | ${percent(report.metrics.recall.ci95.lower)}%–${percent(report.metrics.recall.ci95.upper)}% | ${percent(report.thresholds.minimumRecall)}% |

## Confusion matrix

| | Predicted conflict | Predicted non-conflict |
| --- | ---: | ---: |
| Instrumentable seeded conflict | ${report.confusionMatrix.truePositive} | ${report.confusionMatrix.falseNegative} |
| Other controlled case | ${report.confusionMatrix.falsePositive} | ${report.confusionMatrix.trueNegative} |

This controlled result is mechanism evidence only. It is not evidence of legal compliance, real-vendor behavior, district adoption, or live GPT-5.6 effectiveness.
`;
const reports = [
  ["mechanism-score.json", report],
  ["confusion-matrix.json", {
    corpusHash: report.corpusHash,
    confusionMatrix: report.confusionMatrix,
    metrics: report.metrics,
    thresholds: report.thresholds,
  }],
  ["error-table.json", {
    corpusHash: report.corpusHash,
    errorCount: report.errors.length,
    errors: report.errors,
  }],
  ["hash-verification.json", {
    corpusHash: report.corpusHash,
    verified: hashVerifications.filter(({ valid }) => valid).length,
    total: hashVerifications.length,
    results: hashVerifications,
  }],
  ["mechanism-results.md", chart],
] as const;
await Promise.all(
  reports.map(([name, value]) =>
    writeFile(
      path.join(outputRoot, name),
      typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
      "utf8",
    ),
  ),
);
process.stdout.write(
  `${JSON.stringify({
    passed: report.passed,
    corpusHash: report.corpusHash,
    precision: report.metrics.precision,
    recall: report.metrics.recall,
    errors: report.errors.length,
  })}\n`,
);
if (!report.passed) process.exitCode = 2;
