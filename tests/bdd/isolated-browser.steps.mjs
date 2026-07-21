import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { After, Given, Then, When } from "@cucumber/cucumber";
import { startFixtureServer } from "../../apps/fixture/dist/index.js";
import {
  BrowserIsolationManager,
  isolationTraceSchema,
} from "../../apps/runner/dist/index.js";

const runIds = Object.freeze({
  first: "21212121-2121-4121-8121-212121212121",
  second: "22222222-2222-4222-8222-222222222222",
  crashed: "23232323-2323-4323-8323-232323232323",
  recovered: "24242424-2424-4424-8424-242424242424",
});
const workspaceId = "11111111-1111-4111-8111-111111111111";

function marker(label) {
  return `RUN-01-${label.toUpperCase()}-FICTIONAL-CREDENTIAL`;
}

function config(world, label) {
  const runId = runIds[label];
  assert.ok(runId, `Unknown isolated run label: ${label}`);
  return {
    workspaceId,
    runId,
    allowedNavigationOrigins: [world.run01Fixture.classroomOrigin],
    allowedNetworkHosts: [
      "classroom.pactwire.test",
      "classroom-service.pactwire.test",
    ],
    popupPolicy: "BLOCK_ALL",
    downloadPolicy: "ALLOW_ISOLATED",
    clipboardPolicy: "ISOLATED",
    viewport: { width: 1280, height: 900 },
  };
}

async function startRun(world, label) {
  assert.equal(world.run01Sessions[label], undefined);
  const session = await world.run01Manager.startSession(config(world, label));
  world.run01Sessions[label] = session;
  await session.page.goto(`${world.run01Fixture.classroomOrigin}/student`);
  return session;
}

async function seedState(session, label) {
  await session.page.evaluate((value) => {
    globalThis.document.cookie = `run-marker=${value}; SameSite=Lax`;
    globalThis.localStorage.setItem("run-marker", value);
    return globalThis.navigator.clipboard.writeText(value);
  }, marker(label));
  const downloadPromise = session.page.waitForEvent("download");
  await session.page.evaluate(() => {
    const anchor = globalThis.document.createElement("a");
    anchor.href = "data:text/plain;charset=utf-8,fictional-isolation-download";
    anchor.download = "fictional-run.txt";
    globalThis.document.body.append(anchor);
    anchor.click();
    anchor.remove();
  });
  const download = await downloadPromise;
  return download.path();
}

async function readState(session) {
  return session.page.evaluate(async () => ({
    cookie: globalThis.document.cookie,
    localStorage: globalThis.localStorage.getItem("run-marker"),
    clipboard: await globalThis.navigator.clipboard.readText(),
  }));
}

async function rememberTerminal(world, label, session, assertions) {
  const diagnostics = await session.diagnostics();
  world.run01History[label] = {
    workspaceId: session.workspaceId,
    runId: session.runId,
    terminalState: session.state,
    events: session.events,
    violations: session.violations,
    assertions: {
      ...assertions,
      browserDisconnected: diagnostics.browserConnected === false,
      temporaryRootRemoved: diagnostics.temporaryRootExists === false,
    },
  };
}

After({ tags: "@RUN-01" }, async function () {
  await this.run01Manager?.shutdown();
  await this.run01Fixture?.close();
  this.run01Manager = undefined;
  this.run01Fixture = undefined;
  this.run01Sessions = undefined;
});

Given(/^the RUN-01 controlled fixture and isolated browser manager$/, async function () {
  await this.closeBrowser();
  this.browser = undefined;
  this.context = undefined;
  this.page = undefined;
  this.run01Fixture = await startFixtureServer({
    host: "127.0.0.1",
    port: 0,
    seed: "bdd-run-01-isolation-20260721",
    version: "BASELINE",
  });
  this.run01Manager = new BrowserIsolationManager({
    launchArgs: [
      "--host-resolver-rules=MAP *.pactwire.test 127.0.0.1,EXCLUDE localhost",
    ],
  });
  this.run01Sessions = {};
  this.run01History = {};
});

When(
  "isolated run {string} seeds fictional local browser state and finalizes artifacts",
  async function (label) {
    const session = await startRun(this, label);
    const downloadPath = await seedState(session, label);
    let artifactReadable = false;
    await session.finalizeArtifacts(async () => {
      artifactReadable =
        (await readFile(downloadPath, "utf8")) ===
        "fictional-isolation-download";
    });
    await rememberTerminal(this, label, session, {
      artifactReadableDuringFinalization: artifactReadable,
      downloadRemovedAfterFinalization: !existsSync(downloadPath),
    });
  },
);

When(
  "isolated run {string} starts against the same authorized origin",
  async function (label) {
    await startRun(this, label);
  },
);

Then(
  "isolated run {string} sees no state from {string}",
  async function (label, priorLabel) {
    const session = this.run01Sessions[label];
    assert.ok(session);
    const state = await readState(session);
    assert.deepEqual(state, { cookie: "", localStorage: null, clipboard: "" });
    assert.equal(JSON.stringify(state).includes(marker(priorLabel)), false);
    await session.finalizeArtifacts(() => Promise.resolve());
    await rememberTerminal(this, label, session, {
      cookieEmpty: state.cookie === "",
      localStorageEmpty: state.localStorage === null,
      clipboardEmpty: state.clipboard === "",
      priorMarkerAbsent: true,
    });
  },
);

Then(
  "every resource from isolated run {string} is destroyed",
  function (label) {
    const terminal = this.run01History[label];
    assert.ok(terminal);
    assert.equal(terminal.terminalState, "CLOSED");
    assert.equal(terminal.assertions.browserDisconnected, true);
    assert.equal(terminal.assertions.temporaryRootRemoved, true);
    assert.equal(terminal.assertions.downloadRemovedAfterFinalization, true);
    assert.equal(terminal.assertions.artifactReadableDuringFinalization, true);
    assert.equal(this.run01Manager.activeSessionCount, 0);
  },
);

When(
  "isolated run {string} seeds fictional local browser state and its renderer crashes",
  async function (label) {
    const session = await startRun(this, label);
    const downloadPath = await seedState(session, label);
    const crashEvent = session.page.waitForEvent("crash");
    const cdp = await session.page.context().newCDPSession(session.page);
    await cdp.send("Page.crash").catch(() => undefined);
    await crashEvent;
    await session.waitForTermination();
    await rememberTerminal(this, label, session, {
      downloadRemovedAfterCrash: !existsSync(downloadPath),
    });
  },
);

Then(
  "isolated run {string} is terminal {string} with every resource destroyed",
  function (label, state) {
    const terminal = this.run01History[label];
    assert.ok(terminal);
    assert.equal(terminal.terminalState, state);
    assert.equal(terminal.assertions.browserDisconnected, true);
    assert.equal(terminal.assertions.temporaryRootRemoved, true);
    assert.equal(terminal.assertions.downloadRemovedAfterCrash, true);
    assert.equal(this.run01Manager.activeSessionCount, 0);
  },
);

Then(/^I capture the RUN-01 "([^"]+)" trace$/, async function (name) {
  const sessions = Object.values(this.run01History);
  assert.ok(sessions.length >= 2);
  const candidateTrace = isolationTraceSchema.parse({
    schemaVersion: "1.0.0",
    source: "PACTWIRE_ISOLATED_BROWSER",
    capturedAt: new Date().toISOString(),
    sessions,
  });
  const candidateSerialized = JSON.stringify(candidateTrace);
  for (const label of Object.keys(runIds)) {
    assert.equal(candidateSerialized.includes(marker(label)), false);
  }
  const trace = isolationTraceSchema.parse({
    ...candidateTrace,
    sessions: candidateTrace.sessions.map((session) => ({
      ...session,
      assertions: {
        ...session.assertions,
        rawFictionalMarkerAbsentFromTrace: true,
      },
    })),
  });
  const serialized = `${JSON.stringify(trace, null, 2)}\n`;
  for (const label of Object.keys(runIds)) {
    assert.equal(serialized.includes(marker(label)), false);
  }
  const traceRoot = path.join(
    process.cwd(),
    "artifacts",
    "verification",
    "RUN-01",
    "traces",
  );
  await mkdir(traceRoot, { recursive: true });
  const tracePath = path.join(traceRoot, `${name}-trace.json`);
  await writeFile(tracePath, serialized, "utf8");
  if (
    process.env.PACTWIRE_CAPTURE_CURATED_EVIDENCE === "1" &&
    process.env.PACTWIRE_EVIDENCE_TASK === "RUN-01"
  ) {
    const curatedRoot = path.join(process.cwd(), "docs", "evidence", "RUN-01");
    await mkdir(curatedRoot, { recursive: true });
    await copyFile(tracePath, path.join(curatedRoot, `${name}-trace.json`));
  }
});
