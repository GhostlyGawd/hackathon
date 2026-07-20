import process from "node:process";
import { pathToFileURL } from "node:url";

export function resolveBddServerMode(environment, arguments_ = []) {
  const requestsProduction = arguments_.includes("--production");
  const requestsDevelopment = arguments_.includes("--development");
  if (requestsProduction && requestsDevelopment) {
    throw new Error("BDD server mode cannot be both production and development");
  }
  if (requestsProduction) return "production";
  if (requestsDevelopment) return "development";

  const explicitMode = environment.PACTWIRE_BDD_PRODUCTION;
  if (explicitMode === "1") return "production";
  if (explicitMode === "0") return "development";
  return environment.CI === "true" ? "production" : "development";
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  process.stdout.write(
    `${resolveBddServerMode(process.env, process.argv.slice(2))}\n`,
  );
}
