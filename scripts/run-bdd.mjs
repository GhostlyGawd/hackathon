import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { resolveBddServerMode } from "./bdd-server-mode.mjs";

const repositoryRoot = process.cwd();
const baseUrl = process.env.PACTWIRE_BDD_BASE_URL ?? "http://127.0.0.1:3210";
const requireFromWeb = createRequire(
  path.join(repositoryRoot, "apps", "web", "package.json"),
);
const requireFromRoot = createRequire(
  path.join(repositoryRoot, "package.json"),
);

await mkdir(
  path.join(
    repositoryRoot,
    "artifacts",
    "verification",
    "JRN-01",
    "reports",
  ),
  { recursive: true },
);
await mkdir(
  path.join(
    repositoryRoot,
    "artifacts",
    "verification",
    "AGR-02",
    "reports",
  ),
  { recursive: true },
);
await mkdir(
  path.join(
    repositoryRoot,
    "artifacts",
    "verification",
    "AGR-02",
    "screenshots",
  ),
  { recursive: true },
);
await mkdir(
  path.join(
    repositoryRoot,
    "artifacts",
    "verification",
    "AGR-01",
    "reports",
  ),
  { recursive: true },
);
await mkdir(
  path.join(
    repositoryRoot,
    "artifacts",
    "verification",
    "AGR-01",
    "screenshots",
  ),
  { recursive: true },
);
await mkdir(
  path.join(
    repositoryRoot,
    "artifacts",
    "verification",
    "JRN-01",
    "screenshots",
  ),
  { recursive: true },
);

await mkdir(
  path.join(
    repositoryRoot,
    "artifacts",
    "verification",
    "AUT-04",
    "reports",
  ),
  { recursive: true },
);
await mkdir(
  path.join(
    repositoryRoot,
    "artifacts",
    "verification",
    "AUT-04",
    "screenshots",
  ),
  { recursive: true },
);
await mkdir(
  path.join(
    repositoryRoot,
    "artifacts",
    "verification",
    "AUT-01",
    "reports",
  ),
  { recursive: true },
);
await mkdir(
  path.join(
    repositoryRoot,
    "artifacts",
    "verification",
    "AUT-03",
    "reports",
  ),
  { recursive: true },
);
await mkdir(
  path.join(
    repositoryRoot,
    "artifacts",
    "verification",
    "AUT-03",
    "screenshots",
  ),
  { recursive: true },
);
await mkdir(
  path.join(
    repositoryRoot,
    "artifacts",
    "verification",
    "AUT-02",
    "reports",
  ),
  { recursive: true },
);
await mkdir(
  path.join(
    repositoryRoot,
    "artifacts",
    "verification",
    "AUT-02",
    "screenshots",
  ),
  { recursive: true },
);
await mkdir(
  path.join(
    repositoryRoot,
    "artifacts",
    "verification",
    "AUT-01",
    "screenshots",
  ),
  { recursive: true },
);

async function waitForServer(url, server) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`The Pactwire test server exited with ${server.exitCode}`);
    }
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}/health`);
}

async function stopServer(server) {
  if (server.exitCode !== null || server.killed) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}

const nextBinary = requireFromWeb.resolve("next/dist/bin/next");
const cucumberPackage = requireFromRoot.resolve(
  "@cucumber/cucumber/package.json",
);
const cucumberBinary = path.join(
  path.dirname(cucumberPackage),
  "bin",
  "cucumber.js",
);
const nextCommand =
  resolveBddServerMode(process.env) === "production" ? "start" : "dev";
const ownsServer = !process.env.PACTWIRE_BDD_BASE_URL;
const server = ownsServer
  ? spawn(
      process.execPath,
      [nextBinary, nextCommand, "--hostname", "127.0.0.1", "--port", "3210"],
      {
        cwd: path.join(repositoryRoot, "apps", "web"),
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: "1",
          PACTWIRE_FIXTURE_MODE: "1",
          PACTWIRE_SESSION_SECRET:
            "pactwire-bdd-fictional-session-secret-20260719",
        },
        stdio: "inherit",
      },
    )
  : undefined;

let exitCode;
try {
  if (server) await waitForServer(baseUrl, server);
  const cucumber = spawn(
    process.execPath,
    [
      cucumberBinary,
      "--config",
      "cucumber.mjs",
      ...(process.env.PACTWIRE_BDD_TAGS
        ? ["--tags", process.env.PACTWIRE_BDD_TAGS]
        : []),
    ],
    {
      cwd: repositoryRoot,
      env: { ...process.env, PACTWIRE_BDD_BASE_URL: baseUrl },
      stdio: "inherit",
    },
  );
  exitCode = await new Promise((resolve, reject) => {
    cucumber.once("error", reject);
    cucumber.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  if (server) await stopServer(server);
}

process.exitCode = exitCode ?? 1;
