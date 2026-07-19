import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface CoreMigration {
  readonly version: string;
  readonly name: string;
  readonly sha256: string;
  readonly sql: string;
}

export interface MigrationDatabase {
  exec(sql: string): Promise<unknown>;
  query<T extends object>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ readonly rows: readonly T[] }>;
}

const migrationFiles = [
  { version: "0001", name: "initial", fileName: "0001_initial.sql" },
  {
    version: "0002",
    name: "software_inventory",
    fileName: "0002_software_inventory.sql",
  },
] as const;

export async function loadCoreMigrations(): Promise<readonly CoreMigration[]> {
  return Promise.all(
    migrationFiles.map(async ({ version, name, fileName }) => {
      const sql = await readFile(
        new URL(`../migrations/${fileName}`, import.meta.url),
        "utf8",
      );
      return {
        version,
        name,
        sql,
        sha256: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

export async function applyCoreMigrations(
  database: MigrationDatabase,
): Promise<readonly string[]> {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS pactwire_migrations (
      version text PRIMARY KEY,
      name text NOT NULL,
      sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const migrations = await loadCoreMigrations();
  const applied: string[] = [];

  for (const migration of migrations) {
    const existing = await database.query<{ sha256: string }>(
      "SELECT sha256 FROM pactwire_migrations WHERE version = $1",
      [migration.version],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].sha256 !== migration.sha256) {
        throw new Error(`Migration ${migration.version} checksum changed after application`);
      }
      continue;
    }

    await database.exec("BEGIN");
    try {
      await database.exec(migration.sql);
      await database.query(
        "INSERT INTO pactwire_migrations (version, name, sha256) VALUES ($1, $2, $3)",
        [migration.version, migration.name, migration.sha256],
      );
      await database.exec("COMMIT");
      applied.push(migration.version);
    } catch (error) {
      await database.exec("ROLLBACK");
      throw error;
    }
  }

  return applied;
}
