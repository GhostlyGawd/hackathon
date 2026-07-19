import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const failures = [];
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);

if (nodeMajor !== 24) {
  failures.push("Expected Node 24, received " + process.versions.node);
}

const rootPackage = JSON.parse(
  await readFile(path.join(process.cwd(), "package.json"), "utf8"),
);
if (rootPackage.packageManager !== "pnpm@11.6.0") {
  failures.push(
    "Expected packageManager pnpm@11.6.0, received " +
      String(rootPackage.packageManager),
  );
}

const playwrightPackage = JSON.parse(
  await readFile(
    path.join(process.cwd(), "node_modules", "playwright-core", "package.json"),
    "utf8",
  ),
);
const browserRegistry = JSON.parse(
  await readFile(
    path.join(process.cwd(), "node_modules", "playwright-core", "browsers.json"),
    "utf8",
  ),
);
const chromium = browserRegistry.browsers.find(
  (browser) => browser.name === "chromium",
);

if (playwrightPackage.version !== "1.61.1") {
  failures.push(
    "Expected playwright-core 1.61.1, received " +
      String(playwrightPackage.version),
  );
}
if (!chromium?.revision || !chromium?.browserVersion) {
  failures.push("Playwright Chromium revision metadata is missing");
}

if (failures.length > 0) {
  console.error("Toolchain contract failed:");
  for (const failure of failures) {
    console.error("- " + failure);
  }
  process.exitCode = 1;
} else {
  console.log(
    [
      "Toolchain contract passed:",
      "Node " + process.versions.node,
      "pnpm 11.6.0",
      "Playwright " + String(playwrightPackage.version),
      "Chromium " + String(chromium.browserVersion),
      "revision " + String(chromium.revision),
    ].join(" "),
  );
}
