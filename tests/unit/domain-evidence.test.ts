import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  generateMigrationEvidenceReport,
  generateStateTransitionMarkdown,
} from "../../packages/core/src/evidence";
import {
  approvalTransitionTable,
  runTransitionTable,
} from "../../packages/core/src/domain";
import { loadCoreMigrations } from "../../packages/core/src/migrations";

describe("FND-03 generated domain evidence", () => {
  it("keeps the committed state diagram and migration inventory derived from code", async () => {
    const [stateEvidence, migrationEvidence, migrations] = await Promise.all([
      readFile("docs/evidence/FND-03/state-transitions.md", "utf8"),
      readFile("docs/evidence/FND-03/migration-report.json", "utf8"),
      loadCoreMigrations(),
    ]);
    const report = generateMigrationEvidenceReport(migrations);

    expect(stateEvidence).toBe(generateStateTransitionMarkdown());
    expect(JSON.parse(migrationEvidence) as unknown).toEqual(report);
    expect(report.totalTables).toBe(22);
    expect(report.migrations[0]?.immutableTables).toEqual(
      expect.arrayContaining([
        "agreement_versions",
        "requirement_versions",
        "journey_versions",
        "canaries",
        "run_events",
        "approval_events",
        "human_decisions",
      ]),
    );
    expect(report.migrations[1]?.immutableTables).toContain(
      "software_approval_origins",
    );
    expect(report.migrations[2]?.immutableTables).toContain(
      "authorization_policy_decisions",
    );
    expect(stateEvidence).toContain("stateDiagram-v2");
    expect(stateEvidence).toContain("AUTOMATION");
    expect(Object.isFrozen(approvalTransitionTable[0])).toBe(true);
    expect(Object.isFrozen(approvalTransitionTable[0]?.from)).toBe(true);
    expect(Object.isFrozen(runTransitionTable[0])).toBe(true);
    expect(Object.isFrozen(runTransitionTable[0]?.from)).toBe(true);
  });
});
