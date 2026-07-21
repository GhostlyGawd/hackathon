import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const createdRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("task-scoped Playwright trace sanitizer", () => {
  it("sanitizes a trace inside RUN-04 while preserving verification-root containment", async () => {
    const root = path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "RUN-04",
      `sanitizer-contract-${randomUUID()}`,
    );
    createdRoots.push(root);
    await mkdir(root, { recursive: true });
    await writeFile(
      path.join(root, "trace.trace"),
      `source=${process.cwd()}\\packages\\core\n`,
      "utf8",
    );

    const result = spawnSync(
      process.execPath,
      [
        path.join(
          process.cwd(),
          "scripts",
          "sanitize-extracted-playwright-trace.mjs",
        ),
        root,
        process.cwd(),
      ],
      { encoding: "utf8" },
    );

    expect(result.status, result.stderr).toBe(0);
    await expect(readFile(path.join(root, "trace.trace"), "utf8")).resolves.toBe(
      "source=$REPOSITORY\\packages\\core\n",
    );
    await expect(
      readFile(path.join(root, "sanitization.json"), "utf8"),
    ).resolves.toContain('"passed": true');
  });
});
