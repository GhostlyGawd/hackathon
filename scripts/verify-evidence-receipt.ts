import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import {
  canonicalJson,
  verifyEvidenceReceiptBundle,
  type ReceiptVerificationReport,
} from "../packages/core/src/evidence-receipt.js";

function usage(): never {
  process.stderr.write(
    "Usage: pnpm receipt:verify <receipt-bundle.json> [--output <report.json>]\n",
  );
  process.exit(64);
}

function invalidJsonReport(message: string): ReceiptVerificationReport {
  return {
    verifierVersion: "pactwire-evidence-receipt-v1",
    receiptId: null,
    status: "INVALID",
    verifiedArtifactCount: 0,
    verifiedHashCount: 0,
    issues: [
      {
        code: "BUNDLE_SCHEMA_INVALID",
        path: "$",
        message,
      },
    ],
  };
}

const args = process.argv.slice(2);
const bundlePath = args[0];
if (!bundlePath || bundlePath.startsWith("-")) usage();
let outputPath: string | undefined;
if (args.length > 1) {
  if (args[1] !== "--output" || !args[2] || args.length !== 3) usage();
  outputPath = args[2];
}

let report: ReceiptVerificationReport;
try {
  const serialized = await readFile(bundlePath, "utf8");
  let candidate: unknown;
  try {
    candidate = JSON.parse(serialized) as unknown;
  } catch (error) {
    report = invalidJsonReport(
      error instanceof Error ? error.message : "Receipt bundle is not valid JSON.",
    );
    candidate = undefined;
  }
  if (candidate !== undefined) report = verifyEvidenceReceiptBundle(candidate);
} catch (error) {
  report = invalidJsonReport(
    error instanceof Error ? error.message : "Receipt bundle could not be read.",
  );
}

const output = `${canonicalJson(report!)}\n`;
if (outputPath) await writeFile(outputPath, output, "utf8");
process.stdout.write(output);
process.exitCode = report!.status === "VALID" ? 0 : 2;
