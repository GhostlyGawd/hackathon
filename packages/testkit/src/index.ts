import { PGlite } from "@electric-sql/pglite";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export interface DatabaseTestService {
  readonly database: PGlite;
  close(): Promise<void>;
}

export interface FilesystemObjectStore {
  readonly root: string;
  close(): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  put(key: string, value: Uint8Array): Promise<void>;
}

export async function createDatabaseTestService(): Promise<DatabaseTestService> {
  const database = new PGlite();
  await database.exec(
    "CREATE TABLE IF NOT EXISTS pactwire_migrations (version text PRIMARY KEY, name text NOT NULL, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
  );

  return {
    database,
    async close() {
      await database.close();
    },
  };
}

export async function createFilesystemObjectStore(): Promise<FilesystemObjectStore> {
  const root = await mkdtemp(path.join(tmpdir(), "pactwire-object-store-"));

  const resolveKey = (key: string): string => {
    const resolved = path.resolve(root, key);
    if (!resolved.startsWith(root + path.sep)) {
      throw new Error("Object key escapes the isolated store");
    }
    return resolved;
  };

  return {
    root,
    async close() {
      await rm(root, { force: true, recursive: true });
    },
    async get(key) {
      return readFile(resolveKey(key));
    },
    async put(key, value) {
      const destination = resolveKey(key);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, value);
    },
  };
}
