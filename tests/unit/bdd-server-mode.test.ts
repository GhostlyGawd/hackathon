import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function resolveMode(
  overrides: Record<string, string | undefined>,
  arguments_: readonly string[] = [],
): string {
  const environment = { ...process.env };
  delete environment.CI;
  delete environment.PACTWIRE_BDD_PRODUCTION;
  Object.assign(environment, overrides);

  return execFileSync(
    process.execPath,
    [
      path.join(process.cwd(), "scripts", "bdd-server-mode.mjs"),
      ...arguments_,
    ],
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

  it("allows the canonical verifier to force the already-built production server", () => {
    expect(resolveMode({}, ["--production"])).toBe("production");
  });

  it("pins full verification to production BDD mode on every operating system", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { readonly scripts?: Readonly<Record<string, string>> };

    expect(packageJson.scripts?.verify).toContain(
      "pnpm test:bdd -- --production",
    );
  });
});
