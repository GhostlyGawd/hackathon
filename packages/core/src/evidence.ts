import {
  approvalTransitionTable,
  runTransitionTable,
} from "./domain.js";
import type { CoreMigration } from "./migrations.js";

export interface MigrationEvidenceReport {
  readonly schemaVersion: "1.0.0";
  readonly migrationCount: number;
  readonly totalTables: number;
  readonly migrations: readonly {
    readonly version: string;
    readonly name: string;
    readonly sha256: string;
    readonly tables: readonly string[];
    readonly immutableTables: readonly string[];
  }[];
}

function markdownCell(value: readonly string[] | string): string {
  const rendered = Array.isArray(value) ? value.join(", ") : String(value);
  return rendered.replaceAll("|", "\\|");
}

export function generateStateTransitionMarkdown(): string {
  const approvalRows = approvalTransitionTable
    .map(
      (row) =>
        `| ${markdownCell(row.actorKind)} | ${markdownCell(row.from)} | ${markdownCell(row.to)} | ${markdownCell(row.reasons)} |`,
    )
    .join("\n");
  const runRows = runTransitionTable
    .map(
      (row) =>
        `| ${markdownCell(row.eventType)} | ${markdownCell(row.from)} | ${markdownCell(row.to)} | Actor provenance required |`,
    )
    .join("\n");

  return `# FND-03 state-transition evidence

This table and diagram are generated from the reducer transition definitions in \`packages/core/src/domain.ts\`. They describe authority and allowed state movement; they are not evidence of a user-facing workflow.

## Approval transitions

| Actor | From | To | Allowed reasons |
| --- | --- | --- | --- |
${approvalRows}

The \`MODEL\` actor has no approval transition. Human restoration to \`APPROVED\` additionally requires a signed \`HumanDecision\` identifier. No event may leave \`RETIRED\`.

~~~mermaid
stateDiagram-v2
    [*] --> UNKNOWN: human or imported decision
    UNKNOWN --> APPROVED: human signed decision or import
    UNKNOWN --> HOLD: human or import
    UNKNOWN --> REJECTED: human or import
    UNKNOWN --> RETIRED: human only
    APPROVED --> UNKNOWN: human or import
    APPROVED --> HOLD: automation only for witnessed conflict or required visibility loss
    APPROVED --> HOLD: human or import
    APPROVED --> REJECTED: human or import
    APPROVED --> RETIRED: human only
    HOLD --> UNKNOWN: human or import
    HOLD --> APPROVED: signed human decision or import
    HOLD --> REJECTED: human or import
    HOLD --> RETIRED: human only
    REJECTED --> UNKNOWN: human or import
    REJECTED --> APPROVED: signed human decision or import
    REJECTED --> HOLD: human or import
    REJECTED --> RETIRED: human only
~~~

## Run transitions

| Event | From | To | Evidence rule |
| --- | --- | --- | --- |
${runRows}

~~~mermaid
stateDiagram-v2
    [*] --> QUEUED: frozen configuration
    QUEUED --> RUNNING: RUN_STARTED
    RUNNING --> COMPLETED: verified manifest
    RUNNING --> PARTIAL: manifest or explicit integrity failure
    RUNNING --> FAILED: manifest or explicit integrity failure
    QUEUED --> CANCELED: manifest or explicit integrity failure
    RUNNING --> CANCELED: manifest or explicit integrity failure
    COMPLETED --> QUEUED: new retry with identical snapshot
    PARTIAL --> QUEUED: new retry with identical snapshot
    FAILED --> QUEUED: new retry with identical snapshot
    CANCELED --> QUEUED: new retry with identical snapshot
~~~

Terminal run records cannot transition in place. A retry is a new run linked to the terminal source and carries an exact copy of the frozen agreement, journey, authorization, runner version, and snapshot hash.
`;
}

function matches(sql: string, pattern: RegExp): string[] {
  return Array.from(sql.matchAll(pattern), (match) => match[1]).filter(
    (value): value is string => value !== undefined,
  );
}

export function generateMigrationEvidenceReport(
  migrations: readonly CoreMigration[],
): MigrationEvidenceReport {
  const reports = migrations.map((migration) => ({
    version: migration.version,
    name: migration.name,
    sha256: migration.sha256,
    tables: matches(migration.sql, /^CREATE TABLE ([a-z_]+)\s*\(/gmu),
    immutableTables: matches(
      migration.sql,
      /^CREATE TRIGGER ([a-z_]+)_immutable\s+/gmu,
    ),
  }));

  return {
    schemaVersion: "1.0.0",
    migrationCount: reports.length,
    totalTables: reports.reduce(
      (count, migration) => count + migration.tables.length,
      0,
    ),
    migrations: reports,
  };
}
