import { mkdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkCuratedEvidenceLinks,
  checkRepositoryEvidence,
  collectCommandEvidence,
  ensureArtifactLayout,
  validateVerificationManifest,
  verificationManifestSchema,
  writeVerificationManifest,
} from "../../packages/evidence/src/index";
import { makeValidManifest } from "../helpers/verification-manifest";

const temporaryRoots: string[] = [];

async function temporaryRepository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "pactwire-evidence-test-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { force: true, recursive: true }),
    ),
  );
});

describe("evidence harness integration", () => {
  it("loads the checked-in draft 2020-12 JSON Schema", async () => {
    const schemaPath = path.join(
      process.cwd(),
      "packages",
      "evidence",
      "schema",
      "verification-manifest.schema.json",
    );
    const fromDisk = JSON.parse(await readFile(schemaPath, "utf8")) as unknown;

    expect(fromDisk).toEqual(verificationManifestSchema);
    expect(validateVerificationManifest(makeValidManifest()).ok).toBe(true);
  });

  it("creates the complete artifact directory convention and writes a validated manifest", async () => {
    const repositoryRoot = await temporaryRepository();
    const layout = await ensureArtifactLayout(repositoryRoot, "FND-02");
    const manifestPath = await writeVerificationManifest(
      repositoryRoot,
      makeValidManifest(),
    );

    expect(manifestPath).toBe(layout.manifest);
    await expect(readFile(layout.manifest, "utf8")).resolves.toContain(
      '"taskId": "FND-02"',
    );
    for (const directory of [
      layout.reports,
      layout.traces,
      layout.screenshots,
      layout.videos,
    ]) {
      expect((await stat(directory)).isDirectory()).toBe(true);
    }
  });

  it("collects command output while removing secrets and personal roots", async () => {
    const repositoryRoot = await temporaryRepository();
    const secret = "synthetic-secret-value";
    const command = await collectCommandEvidence({
      repositoryRoot,
      taskId: "FND-02",
      phase: "GREEN",
      name: "Sanitization fixture",
      executable: process.execPath,
      args: [
        "-e",
        `console.log(${JSON.stringify(secret)}); console.log(process.cwd())`,
      ],
      secrets: [secret],
    });
    const output = await readFile(
      path.join(repositoryRoot, command.outputPath ?? "missing"),
      "utf8",
    );

    expect(command.exitCode).toBe(0);
    expect(output).toContain("[REDACTED_SECRET]");
    expect(output).toContain("$REPOSITORY");
    expect(output).not.toContain(secret);
    expect(output).not.toContain(repositoryRoot);
  });

  it("reports a broken local link in curated evidence", async () => {
    const repositoryRoot = await temporaryRepository();
    const evidenceDirectory = path.join(
      repositoryRoot,
      "docs",
      "evidence",
      "FND-02",
    );
    const readme = path.join(evidenceDirectory, "README.md");
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(readme, "[missing](missing-report.json)\n", "utf8");

    const issues = await checkCuratedEvidenceLinks(repositoryRoot, [readme]);

    expect(issues).toContainEqual(
      expect.objectContaining({ code: "BROKEN_EVIDENCE_LINK" }),
    );
  });

  it("finds no orphan requirement, section, test, proof, or completed-task evidence in the repository", async () => {
    const report = await checkRepositoryEvidence(process.cwd());

    expect(report.issues).toEqual([]);
    expect(report.counts).toEqual(
      expect.objectContaining({
        requirements: 43,
        sections: 26,
        tasks: 35,
        manifests: 19,
        proofFiles: 187,
      }),
    );
  });

  it("fails a repository when a completed task has no manifest", async () => {
    const repositoryRoot = await temporaryRepository();
    const docs = path.join(repositoryRoot, "docs");
    await mkdir(docs, { recursive: true });
    await writeFile(
      path.join(docs, "PRD.md"),
      [
        "## 23. Fixed decisions",
        "",
        "- The fixture decision is fixed.",
        "",
        "## 24. Open implementation decisions",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(docs, "IMPLEMENTATION_PLAN.md"),
      [
        "| Task | Priority | Depends on | Output | Status |",
        "| --- | --- | --- | --- | --- |",
        "| FND-01 | P0 | — | Foundation | COMPLETE |",
        "| 23. Fixed decisions | FND-01 | drift check |",
        "| 24. Open decisions | FND-01 | decision record |",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(docs, "fixed-decisions.json"),
      `${JSON.stringify({ decisions: ["The fixture decision is fixed."] })}\n`,
      "utf8",
    );

    const report = await checkRepositoryEvidence(repositoryRoot);

    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "MISSING_COMPLETION_MANIFEST",
        subject: "FND-01",
      }),
    );
  });
});
