import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  scanRepositoryForSecrets,
  scanTextForSecrets,
} from "../../scripts/repository-secret-scan";

describe("SEC-01 tracked repository secret scan", () => {
  it("reports no high-confidence secret material in tracked files", async () => {
    const report = await scanRepositoryForSecrets(process.cwd());

    expect(report.status).toBe("PASS");
    expect(report.filesScanned).toBeGreaterThan(0);
    expect(report.findings).toEqual([]);
    if (process.env.PACTWIRE_WRITE_SEC01_REPORTS === "1") {
      const reportRoot = path.join(
        process.cwd(),
        "artifacts",
        "verification",
        "SEC-01",
        "reports",
      );
      await mkdir(reportRoot, { recursive: true });
      await writeFile(
        path.join(reportRoot, "repository-secret-scan.json"),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8",
      );
    }
  });

  it("detects representative token, private-key, and tracked-env regressions without returning secret values", () => {
    const openAiToken = ["sk", "proj", "fixture", "x".repeat(32)].join("-");
    const privateKey = [
      "-----BEGIN",
      "PRIVATE KEY-----",
      "fictional-test-material",
    ].join(" ");
    const findings = [
      ...scanTextForSecrets("src/config.ts", `token=${openAiToken}`),
      ...scanTextForSecrets("keys/fixture.pem", privateKey),
      ...scanTextForSecrets(".env", "SAFE_FIXTURE_VALUE=true"),
    ];
    const serialized = JSON.stringify(findings);

    expect(findings.map(({ ruleId }) => ruleId)).toEqual([
      "OPENAI_API_KEY",
      "PRIVATE_KEY_MATERIAL",
      "TRACKED_ENV_FILE",
    ]);
    expect(serialized).not.toContain(openAiToken);
    expect(serialized).not.toContain("fictional-test-material");
  });
});
