import { TextDecoder, TextEncoder } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDatabaseTestService,
  createFilesystemObjectStore,
  type DatabaseTestService,
  type FilesystemObjectStore,
} from "../../packages/testkit/src/index";

const databases: DatabaseTestService[] = [];
const stores: FilesystemObjectStore[] = [];

afterEach(async () => {
  await Promise.all([
    ...databases.splice(0).map((service) => service.close()),
    ...stores.splice(0).map((service) => service.close()),
  ]);
});

describe("foundation test services", () => {
  it("applies a PostgreSQL migration and queries the migrated table", async () => {
    const service = await createDatabaseTestService();
    databases.push(service);

    await service.database.exec(
      "CREATE TABLE workspace_smoke (id text PRIMARY KEY, name text NOT NULL)",
    );
    await service.database.query(
      "INSERT INTO workspace_smoke (id, name) VALUES ($1, $2)",
      ["workspace-fixture", "Fictional District"],
    );
    const result = await service.database.query<{ name: string }>(
      "SELECT name FROM workspace_smoke WHERE id = $1",
      ["workspace-fixture"],
    );

    expect(result.rows).toEqual([{ name: "Fictional District" }]);
  });

  it("writes and reads bytes in an isolated filesystem object store", async () => {
    const store = await createFilesystemObjectStore();
    stores.push(store);
    const value = new TextEncoder().encode("synthetic evidence");

    await store.put("workspace-fixture/run-smoke/evidence.txt", value);
    const stored = await store.get(
      "workspace-fixture/run-smoke/evidence.txt",
    );

    expect(new TextDecoder().decode(stored)).toBe("synthetic evidence");
  });

  it("rejects object keys that escape the isolated store", async () => {
    const store = await createFilesystemObjectStore();
    stores.push(store);

    await expect(
      store.put("../outside.txt", new TextEncoder().encode("blocked")),
    ).rejects.toThrow("Object key escapes the isolated store");
  });
});
