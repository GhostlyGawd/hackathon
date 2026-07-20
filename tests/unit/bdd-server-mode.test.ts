import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

function resolveMode(
  overrides: Record<string, string | undefined>,
): string {
  const environment = { ...process.env };
  delete environment.CI;
  delete environment.PACTWIRE_BDD_PRODUCTION;
  Object.assign(environment, overrides);

  return execFileSync(
    process.execPath,
    [path.join(process.cwd(), "scripts", "bdd-server-mode.mjs")],
    { encoding: "utf8", env: environment },
  ).trim();
}

describe("BDD server mode", () => {
  it("uses the already-built production server in CI", () => {
    expect(resolveMode({ CI: "true" })).toBe("production");
  });

  it("keeps development mode as the local default", () => {
    expect(resolveMode({})).toBe("development");
  });

  it("honors an explicit production or development override", () => {
    expect(resolveMode({ PACTWIRE_BDD_PRODUCTION: "1" })).toBe("production");
    expect(
      resolveMode({ CI: "true", PACTWIRE_BDD_PRODUCTION: "0" }),
    ).toBe("development");
  });
});
