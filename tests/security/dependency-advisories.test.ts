import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("SEC-01 production dependency advisory regressions", () => {
  it("keeps fast-uri and sharp outside the known vulnerable ranges", async () => {
    const [workspace, lockfile] = await Promise.all([
      readFile("pnpm-workspace.yaml", "utf8"),
      readFile("pnpm-lock.yaml", "utf8"),
    ]);

    expect(workspace).toContain('"fast-uri@>=3.0.0 <3.1.4": 3.1.4');
    expect(workspace).toContain('"sharp@<0.35.0": 0.35.3');
    expect(lockfile).not.toMatch(/fast-uri@3\.1\.[0-3]:/u);
    expect(lockfile).toContain("fast-uri@3.1.4:");
    expect(lockfile).not.toMatch(/sharp@0\.34\./u);
    expect(lockfile).toContain("sharp@0.35.3:");
  });
});
