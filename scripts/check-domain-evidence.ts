import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  generateMigrationEvidenceReport,
  generateStateTransitionMarkdown,
} from "../packages/core/src/evidence.js";
import { loadCoreMigrations } from "../packages/core/src/migrations.js";

const repositoryRoot = process.cwd();
const evidenceRoot = path.join(
  repositoryRoot,
  "docs",
  "evidence",
  "FND-03",
);
const expectedTransitions = generateStateTransitionMarkdown();
const expectedMigrationReport = `${JSON.stringify(
  generateMigrationEvidenceReport(await loadCoreMigrations()),
  null,
  2,
)}\n`;
const checks = [
  {
    name: "state transitions",
    path: path.join(evidenceRoot, "state-transitions.md"),
    expected: expectedTransitions,
  },
  {
    name: "migration report",
    path: path.join(evidenceRoot, "migration-report.json"),
    expected: expectedMigrationReport,
  },
] as const;
const failures: string[] = [];

for (const check of checks) {
  let actual: string | undefined;
  try {
    actual = await readFile(check.path, "utf8");
  } catch {
    actual = undefined;
  }
  if (actual !== check.expected) {
    failures.push(`${check.name} is missing or stale`);
  }
}

const reportDirectory = path.join(
  repositoryRoot,
  "artifacts",
  "verification",
  "FND-03",
  "reports",
);
await mkdir(reportDirectory, { recursive: true });
await writeFile(
  path.join(reportDirectory, "domain-evidence.json"),
  `${JSON.stringify(
    {
      ok: failures.length === 0,
      checked: checks.map((check) =>
        path.relative(repositoryRoot, check.path).replaceAll(path.sep, "/"),
      ),
      failures,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

if (failures.length > 0) {
  console.error("Domain evidence check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    "Domain evidence passed: reducer transitions and migration report are current.",
  );
}
