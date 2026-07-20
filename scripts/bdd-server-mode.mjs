import process from "node:process";
import { pathToFileURL } from "node:url";

export function resolveBddServerMode(environment) {
  const explicitMode = environment.PACTWIRE_BDD_PRODUCTION;
  if (explicitMode === "1") return "production";
  if (explicitMode === "0") return "development";
  return environment.CI === "true" ? "production" : "development";
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  process.stdout.write(`${resolveBddServerMode(process.env)}\n`);
}
