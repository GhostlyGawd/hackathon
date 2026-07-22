import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import process from "node:process";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright-core";

export interface QualityBrowserSession {
  readonly baseUrl: string;
  readonly browser: Browser;
  readonly context: BrowserContext;
  readonly page: Page;
  close(): Promise<void>;
}

function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a local quality-test port"));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

async function waitForServer(
  server: ChildProcess,
  baseUrl: string,
  output: () => string,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `Quality browser server exited with ${server.exitCode}: ${output()}`,
      );
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${baseUrl}/health: ${output()}`);
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.killed) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}

export async function startQualityBrowserSession(
  roleKey: "officer" | "operator" | "reviewer",
): Promise<QualityBrowserSession> {
  const repositoryRoot = process.cwd();
  const webRoot = path.join(repositoryRoot, "apps", "web");
  const requireFromWeb = createRequire(path.join(webRoot, "package.json"));
  const nextBinary = requireFromWeb.resolve("next/dist/bin/next");
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let output = "";
  const server = spawn(
    process.execPath,
    [nextBinary, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: webRoot,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        PACTWIRE_FIXTURE_MODE: "1",
        PACTWIRE_SESSION_SECRET:
          "pactwire-quality-fictional-session-secret-20260722",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const stream of [server.stdout, server.stderr]) {
    stream?.on("data", (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-8_000);
    });
  }
  await waitForServer(server, baseUrl, () => output);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: baseUrl });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const reset = await context.request.post("/api/demo/reset");
  if (!reset.ok()) {
    await context.close();
    await browser.close();
    await stopServer(server);
    throw new Error(`Quality fixture reset failed with ${reset.status()}`);
  }
  await page.goto("/");
  await page.getByTestId("session-select").selectOption(roleKey);
  await page.getByTestId("start-session").click();
  await page.getByTestId("workspace-title").waitFor();

  return Object.freeze({
    baseUrl,
    browser,
    context,
    page,
    async close() {
      await context.close();
      await browser.close();
      await stopServer(server);
    },
  });
}
