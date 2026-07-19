import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { checkRepositoryEvidence } from "../packages/evidence/src/index.js";

const repositoryRoot = process.cwd();
const report = await checkRepositoryEvidence(repositoryRoot);
const reportDirectory = path.join(
  repositoryRoot,
  "artifacts",
  "verification",
  "FND-02",
  "reports",
);
await mkdir(reportDirectory, { recursive: true });
await writeFile(
  path.join(reportDirectory, "traceability.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

if (!report.ok) {
  console.error(`Evidence traceability failed with ${report.issues.length} issue(s):`);
  for (const issue of report.issues) {
    console.error(`- ${issue.code} ${issue.subject}: ${issue.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    [
      "Evidence traceability passed:",
      `${report.counts.requirements} requirements,`,
      `${report.counts.sections} PRD sections,`,
      `${report.counts.tasks} tasks,`,
      `${report.counts.manifests} manifests,`,
      `${report.counts.proofFiles} proof files.`,
    ].join(" "),
  );
}
