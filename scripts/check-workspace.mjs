import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const expectedPackages = [
  "apps/web",
  "apps/runner",
  "apps/fixture",
  "packages/core",
  "packages/evidence",
  "packages/testkit",
];
const expectedScripts = [
  "lint",
  "typecheck",
  "build",
  "test:unit",
  "test:property",
  "test:integration",
  "test:bdd",
  "test:e2e",
  "test:security",
  "test:a11y",
  "test:live-openai",
  "verify",
];

const failures = [];

async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
  } catch (error) {
    failures.push(
      `${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

const rootPackage = await readJson("package.json");
if (rootPackage) {
  for (const script of expectedScripts) {
    if (typeof rootPackage.scripts?.[script] !== "string") {
      failures.push(`package.json: missing script ${script}`);
    }
  }
}

for (const packagePath of expectedPackages) {
  const packageJson = await readJson(path.join(packagePath, "package.json"));
  if (!packageJson?.name) {
    failures.push(`${packagePath}/package.json: missing package name`);
  }

  try {
    await access(path.join(root, packagePath, "tsconfig.json"));
  } catch {
    failures.push(`${packagePath}/tsconfig.json: missing`);
  }
}

for (const requiredFile of [
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "tsconfig.base.json",
  "eslint.config.mjs",
  "vitest.config.ts",
  "playwright.config.ts",
  ".github/workflows/ci.yml",
]) {
  try {
    await access(path.join(root, requiredFile));
  } catch {
    failures.push(`${requiredFile}: missing`);
  }
}

if (failures.length > 0) {
  console.error("Workspace contract failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Workspace contract passed for ${expectedPackages.length} packages and ${expectedScripts.length} canonical scripts.`,
  );
}
