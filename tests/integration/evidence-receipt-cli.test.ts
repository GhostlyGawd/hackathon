import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { serializeEvidenceReceiptBundle } from "../../packages/core/src/evidence-receipt";
import { makeEvidenceReceiptBundle } from "../helpers/evidence-receipt-fixtures";

const execute = promisify(execFile);

async function runVerifier(bundle: unknown) {
  const root = await mkdtemp(path.join(tmpdir(), "pactwire-receipt-cli-"));
  const bundlePath = path.join(root, "receipt.json");
  await writeFile(
    bundlePath,
    typeof bundle === "string"
      ? bundle
      : serializeEvidenceReceiptBundle(bundle),
    "utf8",
  );
  try {
    const result = await execute(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/verify-evidence-receipt.ts",
        bundlePath,
      ],
      { cwd: process.cwd() },
    );
    return { exitCode: 0, stdout: result.stdout };
  } catch (error) {
    const result = error as Error & {
      readonly code?: number;
      readonly stdout?: string;
    };
    return { exitCode: result.code ?? 1, stdout: result.stdout ?? "" };
  }
}

describe("DET-04 standalone verifier process", () => {
  it("recomputes every included hash without repository or application access", async () => {
    const bundle = makeEvidenceReceiptBundle();
    const result = await runVerifier(bundle);
    const report = JSON.parse(result.stdout) as {
      readonly status: string;
      readonly verifiedArtifactCount: number;
      readonly verifiedHashCount: number;
    };

    expect(result.exitCode).toBe(0);
    expect(report.status).toBe("VALID");
    expect(report.verifiedArtifactCount).toBe(bundle.artifacts.length);
    expect(report.verifiedHashCount).toBe(bundle.artifacts.length + 2);
  });

  it("returns a non-zero result and exact mismatch when one exported byte changes", async () => {
    const bundle = makeEvidenceReceiptBundle();
    const changed = {
      ...bundle,
      artifacts: bundle.artifacts.map((artifact, index) =>
        index === 0
          ? {
              ...artifact,
              contentBase64: Buffer.from("corrupt").toString("base64"),
            }
          : artifact,
      ),
    };
    const result = await runVerifier(JSON.stringify(changed));
    const report = JSON.parse(result.stdout) as {
      readonly status: string;
      readonly issues: readonly { readonly code: string }[];
    };

    expect(result.exitCode).toBe(2);
    expect(report.status).toBe("INVALID");
    expect(report.issues.map(({ code }) => code)).toContain(
      "ARTIFACT_HASH_MISMATCH",
    );
  });
});
