import assert from "node:assert/strict";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { After, Given, Then, When } from "@cucumber/cucumber";
import { startFixtureServer } from "../../apps/fixture/dist/index.js";
import {
  InMemoryDeterministicReplayRepository,
  InMemoryJourneyRepairRepository,
  buildJourneyRepairDraft,
  buildJourneyRepairPromotion,
  buildJourneyRepairVerification,
  buildPromotedRepairReplayVersion,
} from "../../packages/core/dist/index.js";
import {
  BrowserIsolationManager,
  DeterministicBrowserRecorder,
  ScriptedComputerUseResponsesTransport,
  computerUseRunConfigSchema,
  createDeterministicRecorderComputerUseEvidenceSink,
  createDeterministicRecorderReplayEvidenceSink,
  createJourneyRepairDiscoveryBrowserAdapter,
  createPlaywrightReplayAdapter,
  deriveJourneyRepairCandidate,
  deterministicRecorderReportSchema,
  executeDeterministicReplay,
  executeJourneyRepairCandidate,
  runPolicyBoundedComputerUse,
} from "../../apps/runner/dist/index.js";
import { createFictionalSubmissionRecorderConfig } from "../helpers/fictional-submission-recorder.mjs";
import {
  run04Ids,
  run04SourceReplay,
  run04StudentJourney,
} from "../helpers/run-04-replay.mjs";

const run04Secret = "RUN-04-FICTIONAL-RECORDER-SECRET";
const runIds = Object.freeze({
  INTERFACE_DRIFT: Object.freeze({
    source: "31313131-3131-4131-8131-313131313131",
    discovery: "32323232-3232-4232-8232-323232323232",
    verification: "33333333-3333-4333-8333-333333333334",
    sourceAudit: "34343434-3434-4434-8434-343434343434",
    promotedAudit: "35353535-3535-4535-8535-353535353535",
  }),
  FAILURE: Object.freeze({
    source: "36363636-3636-4636-8636-363636363636",
    discovery: "37373737-3737-4737-8737-373737373737",
    sourceAudit: "38383838-3838-4838-8838-383838383838",
  }),
});

function taskRoot(...segments) {
  return path.join(
    process.cwd(),
    "artifacts",
    "verification",
    "RUN-04",
    ...segments,
  );
}

function isolationConfig(fixture, runId) {
  return {
    workspaceId: run04Ids.workspace,
    runId,
    allowedNavigationOrigins: [fixture.classroomOrigin],
    allowedNetworkHosts: [
      "classroom.pactwire.test",
      "classroom-service.pactwire.test",
    ],
    popupPolicy: "BLOCK_ALL",
    downloadPolicy: "BLOCK",
    clipboardPolicy: "BLOCK",
    viewport: { width: 1440, height: 1100 },
  };
}

function bindingValues(fixture) {
  return {
    "student-email-value": fixture.scenario.personas.student.email,
    "student-response-value": fixture.scenario.submission.response,
  };
}

function replayAudit(replay, eventId) {
  return {
    eventId,
    eventType: "AUDIT_RECORDED",
    workspaceId: replay.workspaceId,
    subjectType: "deterministic_replay_version",
    subjectId: replay.id,
    action: replay.version === 1 ? "replay.created" : "replay.versioned",
    actor: replay.createdBy,
    occurredAt: replay.createdAt,
    details: {
      replayId: replay.replayId,
      sourceVersionId: replay.sourceVersionId,
      arm: replay.arm,
    },
  };
}

function modelResponse(id, callId, actions) {
  return {
    id,
    status: "completed",
    output: [{ type: "computer_call", call_id: callId, actions }],
  };
}

function stoppedResponse(id) {
  return {
    id,
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "The bounded path is unavailable." }],
      },
    ],
  };
}

async function controlCenter(page, testId) {
  const control = page.getByTestId(testId);
  await control.waitFor();
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  assert.ok(box, `Expected reviewed RUN-04 control ${testId}`);
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
}

async function initializeRun04(world, version) {
  await world.closeBrowser();
  world.browser = undefined;
  world.context = undefined;
  world.page = undefined;
  const fixture = await startFixtureServer({
    host: "127.0.0.1",
    port: 0,
    seed: `bdd-run-04-${version.toLowerCase()}-20260721`,
    version,
  });
  const manager = new BrowserIsolationManager({
    launchArgs: [
      "--host-resolver-rules=MAP *.pactwire.test 127.0.0.1,EXCLUDE localhost",
    ],
  });
  const sourceReplay = run04SourceReplay();
  const replayRepository = new InMemoryDeterministicReplayRepository();
  const repairRepository = new InMemoryJourneyRepairRepository();
  await replayRepository.appendVersion(
    sourceReplay,
    replayAudit(sourceReplay, runIds[version].sourceAudit),
  );
  const run = {
    version,
    fixture,
    manager,
    sourceReplay,
    replayRepository,
    repairRepository,
    openSession: undefined,
    openRecorder: undefined,
    traceActive: false,
  };
  world.run04 = run;

  await mkdir(taskRoot("screenshots"), { recursive: true });
  await mkdir(taskRoot("traces"), { recursive: true });
  const session = await manager.startSession(
    isolationConfig(fixture, runIds[version].source),
  );
  run.openSession = session;
  const rawTracePath = taskRoot(
    "traces",
    `${version.toLowerCase()}-source-browser-trace-raw.zip`,
  );
  await session.page.context().tracing.start({
    screenshots: true,
    snapshots: true,
    sources: false,
    title: `RUN-04 ${version} frozen replay drift`,
  });
  run.traceActive = true;
  try {
    run.sourceOutcome = await executeDeterministicReplay({
      replay: sourceReplay,
      snapshot: sourceReplay.snapshot,
      baseUrl: fixture.classroomOrigin,
      bindingValues: bindingValues(fixture),
      adapter: createPlaywrightReplayAdapter(session.page, { timeoutMs: 3_000 }),
    });
    run.beforeScreenshotPath = taskRoot(
      "screenshots",
      `${version.toLowerCase()}-before-desktop.png`,
    );
    await session.page.screenshot({
      path: run.beforeScreenshotPath,
      fullPage: true,
      animations: "disabled",
      caret: "hide",
    });
  } finally {
    await session.page.context().tracing.stop({ path: rawTracePath });
    run.traceActive = false;
    await session.abort("FROZEN_REPLAY_DRIFTED");
    run.openSession = undefined;
  }
  run.sourceTracePath = rawTracePath;
  assert.equal(run.sourceOutcome.state, "DRIFTED");
}

function repairConfig(run, trustedControls) {
  return computerUseRunConfigSchema.parse({
    workspaceId: run04Ids.workspace,
    runId: runIds[run.version].discovery,
    model: "gpt-5.6-sol",
    reasoningEffort: "medium",
    authorizedGoal:
      run.version === "INTERFACE_DRIFT"
        ? "Find the moved fictional student workspace and submit the prefilled fictional response."
        : "Submit the prefilled fictional response and stop if the bounded path remains unavailable.",
    startUrl: `${run.fixture.classroomOrigin}/student`,
    allowedOrigins: [run.fixture.classroomOrigin],
    allowedComputerActions: ["screenshot", "click", "move", "wait"],
    trustedControls,
    maxTurns: 6,
    maxActions: 16,
    maxTransportRetries: 0,
    requestTimeoutMs: 10_000,
  });
}

async function runDiscovery(world, mode) {
  const run = world.run04;
  assert.ok(run);
  const success = mode === "BOUNDED";
  const trustedControls = success
    ? [
        {
          dataTestId: "moved-student-link",
          authorizationAction: "NAVIGATE",
          disposition: "ALLOW",
        },
        {
          dataTestId: "turn-in-response",
          authorizationAction: "SUBMIT",
          disposition: "ALLOW",
        },
      ]
    : [
        {
          dataTestId: "submit-assignment",
          authorizationAction: "SUBMIT",
          disposition: "ALLOW",
        },
      ];
  const config = repairConfig(run, trustedControls);
  const session = await run.manager.startSession(
    isolationConfig(run.fixture, runIds[run.version].discovery),
  );
  run.openSession = session;
  const screenshotRoot = taskRoot(
    "screenshots",
    `${run.version.toLowerCase()}-discovery-recorder`,
  );
  const recorder = await DeterministicBrowserRecorder.start({
    page: session.page,
    artifactDirectory: screenshotRoot,
    config: createFictionalSubmissionRecorderConfig({
      workspaceId: run04Ids.workspace,
      runId: runIds[run.version].discovery,
      secrets: [run04Secret],
    }),
  });
  run.openRecorder = recorder;
  const tracePath = taskRoot(
    "traces",
    `${run.version.toLowerCase()}-discovery-browser-trace-raw.zip`,
  );
  await session.page.context().tracing.start({
    screenshots: true,
    snapshots: true,
    sources: false,
    title: `RUN-04 ${run.version} model repair discovery`,
  });
  run.traceActive = true;
  const discovery = createJourneyRepairDiscoveryBrowserAdapter({
    page: session.page,
    config,
    readPolicyViolations: () => session.violations,
    completionCheck: async () =>
      (await session.page
        .getByTestId("student-result")
        .getAttribute("data-state")
        .catch(() => null)) === "complete",
  });
  const responses = success
    ? [
        modelResponse("resp_run04_01", "call_run04_01", [
          { type: "screenshot" },
        ]),
        async () => {
          const point = await controlCenter(session.page, "moved-student-link");
          return modelResponse("resp_run04_02", "call_run04_02", [
            { type: "click", ...point, button: "left" },
          ]);
        },
        async () => {
          const point = await controlCenter(session.page, "turn-in-response");
          return modelResponse("resp_run04_03", "call_run04_03", [
            { type: "click", ...point, button: "left" },
          ]);
        },
      ]
    : [
        modelResponse("resp_run04_failure_01", "call_run04_failure_01", [
          { type: "screenshot" },
        ]),
        async () => {
          const point = await controlCenter(session.page, "submit-assignment");
          return modelResponse(
            "resp_run04_failure_02",
            "call_run04_failure_02",
            [{ type: "click", ...point, button: "left" }],
          );
        },
        stoppedResponse("resp_run04_failure_03"),
      ];
  const transport = new ScriptedComputerUseResponsesTransport(responses);
  try {
    run.discoveryResult = await runPolicyBoundedComputerUse({
      config,
      browser: discovery.browser,
      transport,
      evidence: createDeterministicRecorderComputerUseEvidenceSink(recorder),
      secretValues: [run04Secret],
    });
    run.discoveryObservations = discovery.readObservations();
    await recorder.captureScreenshot(
      success ? "repair-discovery-completed" : "repair-discovery-unresolved",
    );
    run.discoveryReport = await session.finalizeArtifacts(async () => {
      const report = deterministicRecorderReportSchema.parse(
        await recorder.stop(),
      );
      run.openRecorder = undefined;
      await session.page.context().tracing.stop({ path: tracePath });
      run.traceActive = false;
      return report;
    });
    run.openSession = undefined;
  } catch (error) {
    await recorder.stop().catch(() => undefined);
    run.openRecorder = undefined;
    if (run.traceActive) {
      await session.page.context().tracing.stop({ path: tracePath }).catch(() => undefined);
      run.traceActive = false;
    }
    await session.abort("REPAIR_DISCOVERY_FAILED").catch(() => undefined);
    run.openSession = undefined;
    throw error;
  }
  run.discoveryScreenshotRoot = screenshotRoot;
  run.discoveryTracePath = tracePath;
  const candidate = deriveJourneyRepairCandidate(
    run.sourceReplay,
    run.discoveryObservations,
  );
  run.repair = buildJourneyRepairDraft({
    id: run04Ids.repair,
    sourceReplay: run.sourceReplay,
    candidate,
    diagnosis: success
      ? "The reviewed student route and submit selector moved inside the frozen origin."
      : "The bounded submit path remained unavailable after the model attempt.",
    modelInvocationCount: run.discoveryResult.turns,
    proposedBy: {
      kind: "MODEL",
      actorId: "run-04-bdd-model",
      model: "gpt-5.6-sol",
    },
    createdAt: "2026-07-21T11:00:00.000Z",
  });
  await run.repairRepository.appendDraft(run.repair);

  if (!success) {
    run.verification = buildJourneyRepairVerification({
      id: run04Ids.verification,
      repair: run.repair,
      sourceReplay: run.sourceReplay,
      executionState: "FAILED",
      checkpoints: [],
      recorderVisibility: run.discoveryReport.visibility.state,
      verifiedAt: "2026-07-21T11:05:00.000Z",
      verifiedBy: {
        kind: "AUTOMATION",
        actorId: "run-04-bdd-verifier",
        component: "journey-repair-verifier",
      },
    });
    await run.repairRepository.appendVerification(run.verification);
  }
}

After({ tags: "@RUN-04" }, async function () {
  const run = this.run04;
  if (!run) return;
  await run.openRecorder?.stop().catch(() => undefined);
  if (run.traceActive && run.openSession) {
    await run.openSession.page.context().tracing.stop().catch(() => undefined);
  }
  await run.openSession?.abort("BDD_SCENARIO_CLEANUP").catch(() => undefined);
  await run.manager?.shutdown();
  await run.fixture?.close();
  this.run04 = undefined;
});

Given(
  "a frozen student replay encounters the seeded interface drift",
  async function () {
    await initializeRun04(this, "INTERFACE_DRIFT");
    assert.equal(
      this.run04.sourceOutcome.trace.at(-1)?.reasonCode,
      "NAVIGATION_STATUS_MISMATCH",
    );
  },
);

Given(
  "a frozen student replay encounters the seeded unrepairable outage",
  async function () {
    await initializeRun04(this, "FAILURE");
    assert.equal(
      this.run04.sourceOutcome.trace.at(-1)?.reasonCode,
      "CHECKPOINT_STATUS_MISMATCH",
    );
  },
);

When(
  "the RUN-04 model adapter follows the reviewed moved route and submit control",
  async function () {
    await runDiscovery(this, "BOUNDED");
    assert.equal(this.run04.discoveryResult.status, "COMPLETED");
  },
);

When(
  "the RUN-04 model adapter attempts the reviewed submit control",
  async function () {
    await runDiscovery(this, "UNRESOLVED");
    assert.equal(this.run04.discoveryResult.status, "FAILED");
  },
);

Then("the proposed repair changes only the moved path and selector", function () {
  assert.equal(this.run04.repair.status, "BOUNDED_DRAFT");
  assert.deepEqual(this.run04.repair.violations, []);
  assert.deepEqual(
    this.run04.repair.changes.map(({ operationId, field, before, after }) => ({
      operationId,
      field,
      before,
      after,
    })),
    [
      {
        operationId: "open-student-workspace",
        field: "path",
        before: "/student",
        after: "/learner",
      },
      {
        operationId: "submit-student-response",
        field: "locator",
        before: "submit-assignment",
        after: "turn-in-response",
      },
    ],
  );
});

Then("the model-proposed repair remains inactive", async function () {
  const versions = await this.run04.replayRepository.listVersions(
    run04Ids.workspace,
    run04Ids.software,
    run04Ids.journeyVersion,
  );
  const history = await this.run04.repairRepository.listHistory(
    run04Ids.workspace,
    run04Ids.software,
    run04Ids.journeyVersion,
  );
  assert.equal(versions.length, 1);
  assert.equal(history.length, 1);
  assert.equal(history[0].promotion, undefined);
});

When(
  "deterministic replay verifies the RUN-04 repair in a fresh isolated browser",
  async function () {
    const run = this.run04;
    const runId = runIds.INTERFACE_DRIFT.verification;
    const session = await run.manager.startSession(
      isolationConfig(run.fixture, runId),
    );
    run.openSession = session;
    const screenshotRoot = taskRoot(
      "screenshots",
      "interface_drift-verification-recorder",
    );
    const recorder = await DeterministicBrowserRecorder.start({
      page: session.page,
      artifactDirectory: screenshotRoot,
      config: createFictionalSubmissionRecorderConfig({
        workspaceId: run04Ids.workspace,
        runId,
        secrets: [run04Secret],
      }),
    });
    run.openRecorder = recorder;
    const tracePath = taskRoot(
      "traces",
      "interface_drift-verification-browser-trace-raw.zip",
    );
    await session.page.context().tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
      title: "RUN-04 deterministic repair verification",
    });
    run.traceActive = true;
    try {
      run.candidateOutcome = await executeJourneyRepairCandidate({
        repair: run.repair,
        sourceReplay: run.sourceReplay,
        snapshot: run.sourceReplay.snapshot,
        baseUrl: run.fixture.classroomOrigin,
        bindingValues: bindingValues(run.fixture),
        adapter: createPlaywrightReplayAdapter(session.page, { timeoutMs: 3_000 }),
        evidence: createDeterministicRecorderReplayEvidenceSink(recorder),
      });
      await recorder.captureScreenshot("original-checkpoint-verified");
      run.verificationReport = await session.finalizeArtifacts(async () => {
        const report = deterministicRecorderReportSchema.parse(
          await recorder.stop(),
        );
        run.openRecorder = undefined;
        await session.page.context().tracing.stop({ path: tracePath });
        run.traceActive = false;
        return report;
      });
      run.openSession = undefined;
    } catch (error) {
      await recorder.stop().catch(() => undefined);
      run.openRecorder = undefined;
      if (run.traceActive) {
        await session.page.context().tracing.stop({ path: tracePath }).catch(() => undefined);
        run.traceActive = false;
      }
      await session.abort("REPAIR_VERIFICATION_FAILED").catch(() => undefined);
      run.openSession = undefined;
      throw error;
    }
    run.verificationScreenshotRoot = screenshotRoot;
    run.verificationTracePath = tracePath;
    run.verification = buildJourneyRepairVerification({
      id: run04Ids.verification,
      repair: run.repair,
      sourceReplay: run.sourceReplay,
      executionState: run.candidateOutcome.state,
      checkpoints: run.candidateOutcome.checkpoints,
      recorderVisibility: run.verificationReport.visibility.state,
      verifiedAt: "2026-07-21T11:05:00.000Z",
      verifiedBy: {
        kind: "AUTOMATION",
        actorId: "run-04-bdd-verifier",
        component: "journey-repair-verifier",
      },
    });
    await run.repairRepository.appendVerification(run.verification);
  },
);

Then(
  "the original {string} checkpoint is verified by the shared recorder",
  function (checkpointId) {
    assert.equal(this.run04.verification.status, "VERIFIED_DRAFT");
    assert.equal(this.run04.verificationReport.visibility.state, "VISIBLE");
    assert.deepEqual(this.run04.verification.verifiedCheckpointIds, [
      checkpointId,
    ]);
    assert.equal(
      this.run04.candidateOutcome.checkpoints.find(
        (candidate) => candidate.checkpointId === checkpointId,
      )?.status,
      "VERIFIED",
    );
  },
);

When(
  "the fictional privacy officer promotes the verified RUN-04 repair",
  async function () {
    const run = this.run04;
    run.promotedReplay = buildPromotedRepairReplayVersion({
      id: run04Ids.promotedReplay,
      repair: run.repair,
      verification: run.verification,
      sourceReplay: run.sourceReplay,
      journey: run04StudentJourney(),
      createdAt: "2026-07-21T11:10:00.000Z",
      createdBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
    });
    run.promotion = buildJourneyRepairPromotion({
      id: run04Ids.promotion,
      repair: run.repair,
      verification: run.verification,
      sourceReplay: run.sourceReplay,
      promotedReplay: run.promotedReplay,
      rationale:
        "I reviewed the same authorized actions and exact frozen checkpoint.",
      reviewedAt: run.promotedReplay.createdAt,
      reviewedBy: run.promotedReplay.createdBy,
    });
    await run.replayRepository.appendVersion(
      run.promotedReplay,
      replayAudit(run.promotedReplay, runIds.INTERFACE_DRIFT.promotedAudit),
    );
    await run.repairRepository.appendPromotion(
      run.promotion,
      run.promotedReplay,
    );
  },
);

Then(
  "replay version {int} appends to the human-owned source version",
  async function (version) {
    const versions = await this.run04.replayRepository.listVersions(
      run04Ids.workspace,
      run04Ids.software,
      run04Ids.journeyVersion,
    );
    assert.equal(versions.length, 2);
    assert.equal(versions[0].version, version);
    assert.equal(versions[0].sourceVersionId, this.run04.sourceReplay.id);
    assert.equal(versions[0].createdBy.kind, "HUMAN");
    const history = await this.run04.repairRepository.listHistory(
      run04Ids.workspace,
      run04Ids.software,
      run04Ids.journeyVersion,
    );
    assert.equal(history[0].promotion?.promotedReplayVersionId, versions[0].id);
  },
);

Then(
  "the repair attempt is {string} and the path is {string}",
  function (repairStatus, pathStatus) {
    assert.equal(this.run04.repair.status, repairStatus);
    assert.equal(this.run04.verification.status, pathStatus);
    assert.equal(this.run04.discoveryReport.visibility.state, "NOT_TESTED");
  },
);

Then("no RUN-04 replay version can be promoted", async function () {
  assert.throws(() =>
    buildPromotedRepairReplayVersion({
      id: run04Ids.promotedReplay,
      repair: this.run04.repair,
      verification: this.run04.verification,
      sourceReplay: this.run04.sourceReplay,
      journey: run04StudentJourney(),
      createdAt: "2026-07-21T11:10:00.000Z",
      createdBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
    }),
  );
  const versions = await this.run04.replayRepository.listVersions(
    run04Ids.workspace,
    run04Ids.software,
    run04Ids.journeyVersion,
  );
  assert.equal(versions.length, 1);
});

async function copyRecorderScreenshot(report, sourceRoot, destination) {
  const screenshot = report.screenshots.at(-1);
  assert.ok(screenshot, "RUN-04 recorder screenshot is required");
  await copyFile(path.join(sourceRoot, screenshot.artifactName), destination);
}

Then(/^I capture the RUN-04 "([^"]+)" evidence$/, async function (name) {
  const run = this.run04;
  const expected = run.version === "INTERFACE_DRIFT"
    ? "bounded-repair"
    : "unresolved-repair";
  assert.equal(name, expected);
  const traceRoot = taskRoot("traces");
  const screenshotRoot = taskRoot("screenshots");
  const artifacts = [
    {
      name: `${name}-source-outcome.json`,
      value: run.sourceOutcome,
    },
    {
      name: `${name}-model-run.json`,
      value: run.discoveryResult,
    },
    {
      name: `${name}-model-observations.json`,
      value: run.discoveryObservations,
    },
    {
      name: `${name}-model-recorder.json`,
      value: run.discoveryReport,
    },
    { name: `${name}-draft.json`, value: run.repair },
    { name: `${name}-verification.json`, value: run.verification },
    ...(run.candidateOutcome
      ? [{ name: `${name}-candidate-outcome.json`, value: run.candidateOutcome }]
      : []),
    ...(run.verificationReport
      ? [{ name: `${name}-verification-recorder.json`, value: run.verificationReport }]
      : []),
    ...(run.promotion
      ? [
          { name: `${name}-promotion.json`, value: run.promotion },
          { name: `${name}-promoted-replay.json`, value: run.promotedReplay },
        ]
      : []),
  ];
  await Promise.all(
    artifacts.map(({ name: artifactName, value }) =>
      writeFile(
        path.join(traceRoot, artifactName),
        `${JSON.stringify(value, null, 2)}\n`,
        "utf8",
      ),
    ),
  );
  const discoveryScreenshotPath = path.join(
    screenshotRoot,
    `${name}-model-discovery-desktop.png`,
  );
  await copyRecorderScreenshot(
    run.discoveryReport,
    run.discoveryScreenshotRoot,
    discoveryScreenshotPath,
  );
  let verificationScreenshotPath;
  if (run.verificationReport) {
    verificationScreenshotPath = path.join(
      screenshotRoot,
      `${name}-checkpoint-verified-desktop.png`,
    );
    await copyRecorderScreenshot(
      run.verificationReport,
      run.verificationScreenshotRoot,
      verificationScreenshotPath,
    );
  }

  const serialized = JSON.stringify({
    artifacts: artifacts.map(({ value }) => value),
    discoveryReport: run.discoveryReport,
    verificationReport: run.verificationReport,
  });
  assert.equal(serialized.includes(run04Secret), false);
  assert.equal(
    serialized.includes(run.fixture.scenario.personas.student.email),
    false,
  );
  assert.equal(
    serialized.includes(run.fixture.scenario.submission.response),
    false,
  );

  if (
    process.env.PACTWIRE_CAPTURE_CURATED_EVIDENCE === "1" &&
    process.env.PACTWIRE_EVIDENCE_TASK === "RUN-04"
  ) {
    const curatedRoot = path.join(process.cwd(), "docs", "evidence", "RUN-04");
    await mkdir(curatedRoot, { recursive: true });
    await Promise.all([
      copyFile(
        run.beforeScreenshotPath,
        path.join(curatedRoot, `${name}-before-desktop.png`),
      ),
      copyFile(
        discoveryScreenshotPath,
        path.join(curatedRoot, `${name}-model-discovery-desktop.png`),
      ),
      ...(verificationScreenshotPath
        ? [
            copyFile(
              verificationScreenshotPath,
              path.join(
                curatedRoot,
                `${name}-checkpoint-verified-desktop.png`,
              ),
            ),
          ]
        : []),
      ...artifacts.map(({ name: artifactName }) =>
        copyFile(
          path.join(traceRoot, artifactName),
          path.join(curatedRoot, artifactName),
        ),
      ),
    ]);
  }
});
