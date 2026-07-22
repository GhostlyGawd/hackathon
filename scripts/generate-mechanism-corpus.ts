import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  checkMechanismCorpusCoverage,
  computeMechanismEvidenceHash,
} from "../packages/core/src/mechanism-validation.js";
import { generatePublicMechanismCorpus } from "../tests/helpers/mechanism-corpus-public.js";
import { generateSealedMechanismOracle } from "../tests/helpers/mechanism-corpus-oracle.js";

const args = process.argv.slice(2);
let root = path.join(
  process.cwd(),
  "artifacts",
  "verification",
  "VAL-01",
);
if (args.length > 0) {
  if (args.length !== 2 || args[0] !== "--root" || !args[1]) {
    throw new TypeError(
      "Usage: tsx scripts/generate-mechanism-corpus.ts [--root <directory>]",
    );
  }
  root = path.resolve(args[1]);
}

const corpus = generatePublicMechanismCorpus(20_260_722);
const sealed = generateSealedMechanismOracle(corpus);
const coverage = checkMechanismCorpusCoverage(corpus, sealed);
const blindedRoot = path.join(root, "blinded");
const sealedRoot = path.join(root, "sealed");
const reportRoot = path.join(root, "reports");
await Promise.all(
  [blindedRoot, sealedRoot, reportRoot].map((directory) =>
    mkdir(directory, { recursive: true }),
  ),
);
await Promise.all([
  writeFile(
    path.join(blindedRoot, "corpus-public.json"),
    `${JSON.stringify(corpus, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    path.join(sealedRoot, "corpus-oracle.json"),
    `${JSON.stringify(sealed, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    path.join(reportRoot, "corpus-coverage.json"),
    `${JSON.stringify(coverage, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    path.join(reportRoot, "oracle-commitment.json"),
    `${JSON.stringify(
      {
        schemaVersion: "1.0.0",
        corpusHash: sealed.corpusHash,
        oracleHash: computeMechanismEvidenceHash(sealed),
        entryCount: sealed.entries.length,
        disclosure:
          "The sealed answer manifest was unavailable to the evaluated process; this post-run commitment does not expose its labels.",
      },
      null,
      2,
    )}\n`,
    "utf8",
  ),
]);

process.stdout.write(
  `${JSON.stringify({
    corpusHash: sealed.corpusHash,
    cases: coverage.counts.totalCases,
    instrumentableConflicts: coverage.counts.instrumentableConflicts,
    coveragePassed: coverage.passed,
  })}\n`,
);
if (!coverage.passed) process.exitCode = 2;
