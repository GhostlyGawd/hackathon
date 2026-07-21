import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { After, Given, Then, When } from "@cucumber/cucumber";
import { startFixtureServer } from "../../apps/fixture/dist/index.js";
import {
  BrowserIsolationManager,
  DeterministicBrowserRecorder,
  deterministicRecorderReportSchema,
  networkObservationFactsSchema,
} from "../../apps/runner/dist/index.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const runIds = Object.freeze({
  BASELINE: "51515151-5151-4151-8151-515151515151",
  INVISIBLE: "52525252-5252-4252-8252-525252525252",
});
const recorderSecret = "RUN-02-FICTIONAL-LOGIN-SECRET";

function recorderConfig(server, runId) {
  return {
    workspaceId,
    runId,
    captureMode: "BROWSER_CDP",
    authorizedRequestRules: [
      {
        host: "classroom-service.pactwire.test",
        method: "POST",
        path: "/collect",
        fields: ["studentEmail", "submission"],
      },
    ],
    requiredCheckpoints: [
      {
        id: "student-submission-request",
        required: true,
        host: "classroom-service.pactwire.test",
        method: "POST",
        path: "/collect",
        requiredRequestFields: ["studentEmail", "submission"],
        requireResponseMetadata: true,
      },
    ],
    secrets: [recorderSecret],
  };
}

function isolationConfig(server, runId) {
  return {
    workspaceId,
    runId,
    allowedNavigationOrigins: [server.classroomOrigin],
    allowedNetworkHosts: [
      "classroom.pactwire.test",
      "classroom-service.pactwire.test",
      "fixture-analytics.pactwire.test",
      "unknown-destination.pactwire.test",
    ],
    popupPolicy: "BLOCK_ALL",
    downloadPolicy: "ALLOW_ISOLATED",
    clipboardPolicy: "ISOLATED",
    viewport: { width: 1280, height: 900 },
  };
}

function recorderNetworkFacts(report) {
  return report.observations.flatMap(({ facts }) => {
    const result = networkObservationFactsSchema.safeParse(facts);
    return result.success ? [result.data] : [];
  });
}

async function finalizeRecorderEvidence(world, evidenceName) {
  const run = world.run02;
  assert.ok(run);
  assert.equal(run.report, undefined);
  const taskRoot = path.join(
    process.cwd(),
    "artifacts",
    "verification",
    "RUN-02",
  );
  const traceRoot = path.join(taskRoot, "traces");
  const screenshotRoot = path.join(taskRoot, "screenshots");
  await Promise.all([
    mkdir(traceRoot, { recursive: true }),
    mkdir(screenshotRoot, { recursive: true }),
  ]);
  const reportPath = path.join(traceRoot, `${evidenceName}-recorder.json`);
  const browserTracePath = path.join(
    traceRoot,
    `${evidenceName}-browser-trace-raw.zip`,
  );
  await run.session.finalizeArtifacts(async () => {
    run.report = deterministicRecorderReportSchema.parse(
      await run.recorder.stop(),
    );
    await run.session.page.context().tracing.stop({ path: browserTracePath });
    await writeFile(
      reportPath,
      `${JSON.stringify(run.report, null, 2)}\n`,
      "utf8",
    );
  });
  assert.equal(run.report.screenshots.length, 1);
  const recordedScreenshot = path.join(
    run.screenshotDirectory,
    run.report.screenshots[0].artifactName,
  );
  const screenshotPath = path.join(
    screenshotRoot,
    `${evidenceName}-desktop.png`,
  );
  await copyFile(recordedScreenshot, screenshotPath);
  run.evidence = { browserTracePath, evidenceName, reportPath, screenshotPath };

  if (
    process.env.PACTWIRE_CAPTURE_CURATED_EVIDENCE === "1" &&
    process.env.PACTWIRE_EVIDENCE_TASK === "RUN-02"
  ) {
    const curatedRoot = path.join(process.cwd(), "docs", "evidence", "RUN-02");
    await mkdir(curatedRoot, { recursive: true });
    await Promise.all([
      copyFile(
        reportPath,
        path.join(curatedRoot, `${evidenceName}-recorder.json`),
      ),
      copyFile(
        screenshotPath,
        path.join(curatedRoot, `${evidenceName}-desktop.png`),
      ),
    ]);
  }
}

async function submitThroughRecorder(world, evidenceName, forceGap) {
  const run = world.run02;
  assert.ok(run);
  if (forceGap) {
    run.recorder.recordCaptureGap({
      source: "NETWORK",
      checkpointIds: ["student-submission-request"],
      reason: "INSTRUMENTATION_UNAVAILABLE",
      detail:
        "The controlled harness deliberately disabled the required capture stream.",
    });
  }
  await run.recorder.captureStorageChanges("before-submission");
  await run.recorder.recordAction({
    actionId: "submit-fictional-response",
    actor: "DETERMINISTIC",
    kind: "CLICK",
    summary: "Submit the seeded fictional classroom response",
  });
  await run.session.page
    .getByTestId(run.fixture.scenario.interface.submitCheckpoint)
    .click();
  await run.session.page.waitForFunction(
    () =>
      globalThis.document
        .querySelector('[data-testid="student-result"]')
        ?.getAttribute("data-state") === "complete",
  );
  await run.session.page.evaluate(() => {
    globalThis.localStorage.setItem(
      "run-02-recorder-state",
      "fictional-submission-complete",
    );
  });
  await run.recorder.captureStorageChanges("after-submission");
  await run.recorder.captureScreenshot("student-submission-result");
  run.fixtureEvents = run.fixture.readEvents();
  await finalizeRecorderEvidence(world, evidenceName);
}

After({ tags: "@RUN-02" }, async function () {
  const run = this.run02;
  if (!run) return;
  if (!run.report) {
    await run.recorder?.stop().catch(() => undefined);
    await run.session?.page
      .context()
      .tracing.stop()
      .catch(() => undefined);
    await run.session?.abort("BDD_SCENARIO_CLEANUP").catch(() => undefined);
  }
  await run.manager?.shutdown();
  await run.fixture?.close();
  this.run02 = undefined;
});

Given(
  /^the RUN-02 recorder runs the controlled fixture in "([^"]+)" mode$/,
  async function (version) {
    assert.ok(Object.hasOwn(runIds, version));
    await this.closeBrowser();
    this.browser = undefined;
    this.context = undefined;
    this.page = undefined;
    const fixture = await startFixtureServer({
      host: "127.0.0.1",
      port: 0,
      seed: `bdd-run-02-${version.toLowerCase()}-20260721`,
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
      "RUN-02",
      "screenshots",
      version.toLowerCase(),
    );
    const recorder = await DeterministicBrowserRecorder.start({
      page: session.page,
      artifactDirectory: screenshotDirectory,
      config: recorderConfig(fixture, runId),
    });
    this.run02 = {
      fixture,
      fixtureEvents: [],
      manager,
      recorder,
      report: undefined,
      screenshotDirectory,
      session,
      version,
    };
    await session.page.goto(`${fixture.classroomOrigin}/student`);
    await session.page.getByTestId("submission-form").waitFor();
  },
);

When("the independent recorder captures the seeded student submission", async function () {
  await submitThroughRecorder(this, "baseline-observation", false);
});

When(
  "the controlled harness cuts the required recorder stream before submission",
  async function () {
    await submitThroughRecorder(this, "visibility-loss", true);
  },
);

Then("the required recorder checkpoint is {string}", function (state) {
  assert.equal(this.run02.report.visibility.state, state);
  assert.equal(this.run02.report.visibility.checkpoints.length, 1);
  assert.equal(
    this.run02.report.visibility.checkpoints[0].visible,
    state === "VISIBLE",
  );
});

Then(
  "the recorder contains the authorized request hashes and response metadata",
  function () {
    const facts = recorderNetworkFacts(this.run02.report).find(
      ({ request }) =>
        request.host === "classroom-service.pactwire.test" &&
        request.method === "POST" &&
        request.path === "/collect",
    );
    assert.ok(facts);
    assert.equal(facts.request.method, "POST");
    assert.equal(facts.request.path, "/collect");
    assert.equal(facts.response?.status, 204);
    assert.deepEqual(
      facts.request.authorizedFields.map(({ name, present }) => ({ name, present })),
      [
        { name: "studentEmail", present: true },
        { name: "submission", present: true },
      ],
    );
    assert.equal(
      facts.request.authorizedFields[0].valueSha256,
      createHash("sha256")
        .update(JSON.stringify(this.run02.fixture.scenario.personas.student.email))
        .digest("hex"),
    );
    assert.equal(this.run02.fixtureEvents.length, 1);
    assert.equal(
      this.run02.fixtureEvents[0].destinationHost,
      "classroom-service.pactwire.test",
    );
  },
);

Then("no raw fictional request body appears in recorder data", function () {
  const serialized = JSON.stringify(this.run02.report);
  assert.equal(
    serialized.includes(this.run02.fixture.scenario.personas.student.email),
    false,
  );
  assert.equal(
    serialized.includes(this.run02.fixture.scenario.submission.response),
    false,
  );
  assert.equal(serialized.includes(recorderSecret), false);
});

Then(
  "the recorder preserves the capture gap independently of page content",
  function () {
    const gap = this.run02.report.observations.find(
      ({ source, facts }) =>
        source === "RECORDER" &&
        facts.kind === "CAPTURE_GAP" &&
        facts.reason === "INSTRUMENTATION_UNAVAILABLE",
    );
    assert.ok(gap);
    assert.equal(gap.facts.source, "NETWORK");
    assert.deepEqual(gap.facts.checkpointIds, ["student-submission-request"]);
    assert.equal(
      JSON.stringify(gap.facts).includes("required capture is unavailable"),
      false,
    );
  },
);

Then("no clean recorder state is available", function () {
  assert.equal(this.run02.report.visibility.state, "NOT_VISIBLE");
  assert.notEqual(this.run02.report.visibility.state, "VISIBLE");
  assert.deepEqual(
    this.run02.report.visibility.checkpoints[0].gapReasons,
    ["INSTRUMENTATION_UNAVAILABLE"],
  );
});

Then(/^I capture the RUN-02 "([^"]+)" evidence$/, function (evidenceName) {
  assert.equal(this.run02.evidence.evidenceName, evidenceName);
  assert.equal(existsSync(this.run02.evidence.reportPath), true);
  assert.equal(existsSync(this.run02.evidence.screenshotPath), true);
  assert.equal(existsSync(this.run02.evidence.browserTracePath), true);
});
