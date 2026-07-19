import { defineConfig } from "vitest/config";

const project = (name: string, include: string[]) => ({
  extends: true as const,
  test: {
    environment: "node",
    include,
    name,
    passWithNoTests: true,
  },
});

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      project("unit", [
        "tests/unit/**/*.test.ts",
        "apps/*/tests/unit/**/*.test.ts",
        "packages/*/tests/unit/**/*.test.ts",
      ]),
      project("property", [
        "tests/property/**/*.test.ts",
        "apps/*/tests/property/**/*.test.ts",
        "packages/*/tests/property/**/*.test.ts",
      ]),
      project("integration", [
        "tests/integration/**/*.test.ts",
        "apps/*/tests/integration/**/*.test.ts",
        "packages/*/tests/integration/**/*.test.ts",
      ]),
      project("bdd", ["tests/bdd/**/*.test.ts"]),
      project("security", ["tests/security/**/*.test.ts"]),
      project("a11y", ["tests/a11y/**/*.test.ts"]),
      project("live-openai", ["tests/live-openai/**/*.test.ts"]),
    ],
  },
});
