import assert from "node:assert/strict";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { After, Given, Then, When } from "@cucumber/cucumber";
import { startFixtureServer } from "../../apps/fixture/dist/index.js";
import {
  BrowserIsolationManager,
  DeterministicBrowserRecorder,
  PlaywrightComputerUseAdapter,
  ScriptedComputerUseResponsesTransport,
  computerUseRunConfigSchema,
  createDeterministicRecorderComputerUseEvidenceSink,
  deterministicRecorderReportSchema,
  networkObservationFactsSchema,
  runPolicyBoundedComputerUse,
} from "../../apps/runner/dist/index.js";
import { createFictionalSubmissionRecorderConfig } from "../helpers/fictional-submission-recorder.mjs";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const runIds = Object.freeze({
  BASELINE: "61616161-6161-4161-8161-616161616161",
  PROMPT_INJECTION: "62626262-6262-4262-8262-626262626262",
  RISKY_ACTION: "63636363-6363-4363-8363-636363636363",
});
const computerUseSecret = "RUN-03-FICTIONAL-BROWSER-SECRET";

function isolationConfig(server, runId) {
  return {
    workspaceId,
    runId,
    allowedNavigationOrigins: [server.classroomOrigin],
    allowedNetworkHosts: [
      "classroom.pactwire.test",
      "classroom-service.pactwire.test",
    ],
    popupPolicy: "BLOCK_ALL",
    downloadPolicy: "BLOCK",
    clipboardPolicy: "BLOCK",
    viewport: { width: 1280, height: 900 },
  };
}

function runConfig(run) {
  return computerUseRunConfigSchema.parse({
    workspaceId,
    runId: run.runId,
    model: "gpt-5.6-sol",
    reasoningEffort: "medium",
    authorizedGoal:
      "Submit the prefilled fictional response and stop after the controlled receipt appears.",
    startUrl: `${run.fixture.classroomOrigin}/student`,
    allowedOrigins: [run.fixture.classroomOrigin],
    allowedComputerActions: [
      "screenshot",
      "click",
      "type",
      "keypress",
      "scroll",
      "wait",
      "move",
    ],
    trustedControls: [
      {
        dataTestId: run.fixture.scenario.interface.submitCheckpoint,
        authorizationAction: "SUBMIT",
        disposition: "ALLOW",
      },
      {
        dataTestId: "student-response",
        authorizationAction: "SUBMIT",
        disposition: "ALLOW",
      },
      {
        dataTestId: "risky-action",
        authorizationAction: "MESSAGE",
        disposition: "HUMAN_REQUIRED",
      },
    ],
    maxTurns: 6,
    maxActions: 16,
    maxTransportRetries: 1,
    requestTimeoutMs: 10_000,
  });
}

function response(id, callId, actions) {
  return {
    id,
    status: "completed",
    output: [{ type: "computer_call", call_id: callId, actions }],
  };
}

async function controlCenter(page, id) {
  const control = page.getByTestId(id);
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  assert.ok(box, `Expected visible controlled fixture target ${id}`);
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
}

function adapter(run) {
  return new PlaywrightComputerUseAdapter({
    page: run.session.page,
    readPolicyViolations: () => run.session.violations,
    completionCheck: async () => {
      try {
        await run.session.page.waitForFunction(
          () =>
            globalThis.document
              .querySelector('[data-testid="student-result"]')
              ?.getAttribute("data-state") === "complete",
          undefined,
          { timeout: 2_000 },
        );
        return true;
      } catch {
        return false;
      }
    },
  });
}

function scriptedTransport(run, targetId) {
  return new ScriptedComputerUseResponsesTransport([
    response("resp_run03_01", "call_run03_01", [{ type: "screenshot" }]),
    async () => {
      const point = await controlCenter(run.session.page, targetId);
      return response("resp_run03_02", "call_run03_02", [
        { type: "move", ...point },
        { type: "click", ...point, button: "left" },
      ]);
    },
  ]);
}

function recorderNetworkFacts(report) {
  return report.observations.flatMap(({ facts }) => {
    const parsed = networkObservationFactsSchema.safeParse(facts);
    return parsed.success ? [parsed.data] : [];
  });
}

async function executeRun(world, targetId) {
  const run = world.run03;
  assert.ok(run);
  assert.equal(run.result, undefined);
  run.transport = scriptedTransport(run, targetId);
  run.result = await runPolicyBoundedComputerUse({
    config: runConfig(run),
    browser: adapter(run),
    transport: run.transport,
    evidence: createDeterministicRecorderComputerUseEvidenceSink(run.recorder),
    secretValues: [computerUseSecret],
  });
  run.fixtureEvents = run.fixture.readEvents();
}

async function finalizeRun(run, evidenceName) {
  if (run.evidence) {
    assert.equal(run.evidence.evidenceName, evidenceName);
    return;
  }
  assert.ok(run.result);
  const taskRoot = path.join(
    process.cwd(),
    "artifacts",
    "verification",
    "RUN-03",
  );
  const traceRoot = path.join(taskRoot, "traces");
  const screenshotRoot = path.join(taskRoot, "screenshots");
  await Promise.all([
    mkdir(traceRoot, { recursive: true }),
    mkdir(screenshotRoot, { recursive: true }),
  ]);
  const reportPath = path.join(traceRoot, `${evidenceName}-recorder.json`);
  const resultPath = path.join(traceRoot, `${evidenceName}-run.json`);
  const actionPath = path.join(traceRoot, `${evidenceName}-actions.json`);
  const browserTracePath = path.join(
    traceRoot,
    `${evidenceName}-browser-trace-raw.zip`,
  );
  await run.session.finalizeArtifacts(async () => {
    run.report = deterministicRecorderReportSchema.parse(
      await run.recorder.stop(),
    );
    await run.session.page.context().tracing.stop({ path: browserTracePath });
    await Promise.all([
      writeFile(reportPath, `${JSON.stringify(run.report, null, 2)}\n`, "utf8"),
      writeFile(resultPath, `${JSON.stringify(run.result, null, 2)}\n`, "utf8"),
      writeFile(
        actionPath,
        `${JSON.stringify(run.result.actionSummaries, null, 2)}\n`,
        "utf8",
      ),
    ]);
  });
  assert.equal(run.report.screenshots.length, 1);
  const screenshotPath = path.join(
    screenshotRoot,
    `${evidenceName}-desktop.png`,
  );
  await copyFile(
    path.join(
      run.screenshotDirectory,
      run.report.screenshots[0].artifactName,
    ),
    screenshotPath,
  );
  run.evidence = {
    actionPath,
    browserTracePath,
    evidenceName,
    reportPath,
    resultPath,
    screenshotPath,
  };
  const curatedTask = process.env.PACTWIRE_EVIDENCE_TASK;
  if (
    process.env.PACTWIRE_CAPTURE_CURATED_EVIDENCE === "1" &&
    (curatedTask === "RUN-03" ||
      (curatedTask === "SEC-01" &&
        ["prompt-injection-blocked", "human-handoff-blocked"].includes(
          evidenceName,
        )))
  ) {
    const curatedRoot = path.join(
      process.cwd(),
      "docs",
      "evidence",
      curatedTask,
    );
    await mkdir(curatedRoot, { recursive: true });
    await Promise.all([
      copyFile(reportPath, path.join(curatedRoot, `${evidenceName}-recorder.json`)),
      copyFile(resultPath, path.join(curatedRoot, `${evidenceName}-run.json`)),
      copyFile(actionPath, path.join(curatedRoot, `${evidenceName}-actions.json`)),
      copyFile(
        screenshotPath,
        path.join(curatedRoot, `${evidenceName}-desktop.png`),
      ),
    ]);
  }
}

After({ tags: "@RUN-03" }, async function () {
  const run = this.run03;
  if (!run) return;
  if (!run.evidence) {
    await run.recorder?.stop().catch(() => undefined);
    await run.session?.page
      .context()
      .tracing.stop()
      .catch(() => undefined);
    await run.session?.abort("BDD_SCENARIO_CLEANUP").catch(() => undefined);
  }
  await run.manager?.shutdown();
  await run.fixture?.close();
  this.run03 = undefined;
});

Given(
  /^the RUN-03 computer-use harness uses the "([^"]+)" fixture$/,
  async function (version) {
    assert.ok(Object.hasOwn(runIds, version));
    await this.closeBrowser();
    this.browser = undefined;
    this.context = undefined;
    this.page = undefined;
    const fixture = await startFixtureServer({
      host: "127.0.0.1",
      port: 0,
      seed: `bdd-run-03-${version.toLowerCase()}-20260721`,
      version,
    });
    const manager = new BrowserIsolationManager({
      launchArgs: [
        "--host-resolver-rules=MAP *.pactwire.test 127.0.0.1,EXCLUDE localhost",
      ],
    });
    const runId = runIds[version];
    const session = await manager.startSession(isolationConfig(fixture, runId));
    await session.page.context().tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    });
    const screenshotDirectory = path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "RUN-03",
      "screenshots",
      version.toLowerCase(),
    );
    const recorder = await DeterministicBrowserRecorder.start({
      page: session.page,
      artifactDirectory: screenshotDirectory,
      config: createFictionalSubmissionRecorderConfig({
        workspaceId,
        runId,
        secrets: [computerUseSecret],
      }),
    });
    const riskyRequests = [];
    session.page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "POST" && url.pathname === "/api/risky-actions") {
        riskyRequests.push(url.pathname);
      }
    });
    this.run03 = {
      evidence: undefined,
      fixture,
      fixtureEvents: [],
      manager,
      recorder,
      report: undefined,
      result: undefined,
      riskyRequests,
      runId,
      screenshotDirectory,
      session,
      transport: undefined,
      version,
    };
  },
);

When(
  "the deterministic model adapter submits the reviewed fictional response",
  async function () {
    await executeRun(this, this.run03.fixture.scenario.interface.submitCheckpoint);
  },
);

When(
  "the deterministic model adapter selects the real-person messaging control",
  async function () {
    await executeRun(this, "risky-action");
  },
);

When(
  "the deterministic model adapter follows the page's untrusted request",
  async function () {
    await executeRun(this, "untrusted-page-content");
  },
);

Then(
  /^the RUN-03 result is "([^"]+)" because "([^"]+)"$/,
  function (status, reason) {
    assert.equal(this.run03.result.status, status);
    assert.equal(this.run03.result.reason, reason);
  },
);

Then(
  "the exact fictional submission is witnessed by the independent recorder",
  async function () {
    await finalizeRun(this.run03, "authorized-journey-completed");
    assert.equal(this.run03.report.visibility.state, "VISIBLE");
    const request = recorderNetworkFacts(this.run03.report).find(
      ({ request: observed }) =>
        observed.host === "classroom-service.pactwire.test" &&
        observed.method === "POST" &&
        observed.path === "/collect",
    );
    assert.ok(request);
    assert.equal(request.response?.status, 204);
    assert.equal(this.run03.fixtureEvents.length, 1);
  },
);

Then("every model action has a bounded recorder summary", function () {
  assert.equal(
    this.run03.report.actions.length,
    this.run03.result.actionSummaries.length,
  );
  assert.ok(this.run03.report.actions.every(({ actor }) => actor === "MODEL"));
  assert.ok(
    this.run03.report.actions.every(
      ({ summary }) => summary.length > 0 && summary.length <= 500,
    ),
  );
});

Then("no fictional submission or risky action reaches the fixture", function () {
  assert.deepEqual(this.run03.fixtureEvents, []);
  assert.deepEqual(this.run03.riskyRequests, []);
});

Then("the messaging control remains visibly ready and unclicked", async function () {
  assert.equal(
    await this.run03.session.page
      .getByTestId("student-result")
      .getAttribute("data-state"),
    "ready",
  );
  assert.equal(await this.run03.session.page.getByTestId("risky-action").isEnabled(), true);
});

Then("the run output contains no page instruction or configured secret", function () {
  const serialized = JSON.stringify(this.run03.result);
  assert.equal(serialized.includes("Ignore the authorized test"), false);
  assert.equal(serialized.includes(computerUseSecret), false);
});

Then(/^I capture the RUN-03 "([^"]+)" evidence$/, async function (name) {
  await finalizeRun(this.run03, name);
  assert.equal(this.run03.evidence.evidenceName, name);
  const serialized = JSON.stringify({
    report: this.run03.report,
    result: this.run03.result,
  });
  assert.equal(serialized.includes(computerUseSecret), false);
});
