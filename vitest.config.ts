import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const project = (name: string, include: string[]) => ({
  extends: true as const,
  test: {
    environment: "node",
    include,
    name,
    passWithNoTests: true,
    ...(name === "integration"
      ? {
          hookTimeout: 30_000,
          maxWorkers: 4,
          testTimeout: 30_000,
        }
      : name === "property"
        ? {
            maxWorkers: 1,
          }
      : {}),
  },
});

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@pactwire/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
    },
  },
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
