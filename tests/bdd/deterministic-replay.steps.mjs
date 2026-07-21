import assert from "node:assert/strict";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Given, Then, When } from "@cucumber/cucumber";
import {
  buildDeterministicReplayVersion,
  buildJourneyVersion,
} from "../../packages/core/dist/index.js";
import {
  createPlaywrightReplayAdapter,
  executeDeterministicReplay,
} from "../../apps/runner/dist/index.js";

const ids = Object.freeze({
  workspace: "11111111-1111-4111-8111-111111111111",
  software: "22222222-2222-4222-8222-222222222222",
  agreement: "33333333-3333-4333-8333-333333333333",
  authorization: "44444444-4444-4444-8444-444444444444",
  journey: "55555555-5555-4555-8555-555555555555",
  journeyVersion: "66666666-6666-4666-8666-666666666666",
  persona: "77777777-7777-4777-8777-777777777777",
  requirement: "99999999-9999-4999-8999-999999999999",
  replay: "12121212-1212-4212-8212-121212121212",
  replayVersion: "13131313-1313-4313-8313-131313131313",
});

function namedStudentJourney() {
  return buildJourneyVersion({
    id: ids.journeyVersion,
    workspaceId: ids.workspace,
    softwareId: ids.software,
    agreementVersionId: ids.agreement,
    journeyId: ids.journey,
    version: 1,
    sourceVersionId: null,
    draft: {
      name: "Submit a fictional classroom response",
      role: "STUDENT",
      goal: "Submit the unique fictional response to the seeded assignment.",
      startState: "Signed in to the fictional student workspace.",
      requirementVersionIds: [ids.requirement],
      authorizationId: ids.authorization,
      personaId: ids.persona,
      testFields: [
        {
          fieldId: "student-email",
          sourceField: "email",
          requirementVersionId: ids.requirement,
        },
        {
          fieldId: "student-response",
          sourceField: "submissionPhrase",
          requirementVersionId: ids.requirement,
        },
      ],
      allowedActions: ["NAVIGATE", "SUBMIT"],
      prohibitedActions: ["MESSAGE", "PURCHASE", "DELETE", "ADMINISTER"],
      checkpoints: [
        {
          checkpointId: "submission-request",
          required: true,
          description: "Observe the fictional submission request.",
          observationSource: "NETWORK",
          requiredVisibility: true,
          requirementVersionIds: [ids.requirement],
          testFieldIds: ["student-email", "student-response"],
        },
      ],
      steps: [
        {
          stepId: "open-assignment",
          instruction: "Open the seeded fictional assignment.",
          action: "NAVIGATE",
        },
        {
          stepId: "submit-response",
          instruction: "Submit the unique fictional response.",
          action: "SUBMIT",
        },
      ],
    },
    createdAt: "2026-07-21T10:05:00.000Z",
    createdBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
  });
}

function humanBaselineReplay() {
  return buildDeterministicReplayVersion({
    id: ids.replayVersion,
    replayId: ids.replay,
    version: 1,
    sourceVersionId: null,
    journey: namedStudentJourney(),
    runnerConfigVersion: "deterministic-replay-v1",
    draft: {
      bindings: [
        {
          bindingId: "student-email-value",
          journeyFieldId: "student-email",
        },
        {
          bindingId: "student-response-value",
          journeyFieldId: "student-response",
        },
      ],
      operations: [
        {
          operationId: "open-student-workspace",
          kind: "NAVIGATE",
          authorizedAction: "NAVIGATE",
          path: "/student",
          expectedStatus: 200,
        },
        {
          operationId: "check-student-email",
          kind: "ASSERT_VALUE",
          locator: { kind: "TEST_ID", value: "student-email" },
          bindingId: "student-email-value",
        },
        {
          operationId: "enter-student-response",
          kind: "FILL",
          authorizedAction: "SUBMIT",
          locator: { kind: "TEST_ID", value: "student-response" },
          bindingId: "student-response-value",
        },
        {
          operationId: "submit-student-response",
          kind: "CLICK",
          authorizedAction: "SUBMIT",
          locator: { kind: "TEST_ID", value: "submit-assignment" },
        },
        {
          operationId: "observe-submission-request",
          kind: "CHECKPOINT",
          checkpointId: "submission-request",
          assertion: {
            kind: "RESPONSE",
            method: "POST",
            path: "/api/submissions",
            status: 200,
          },
        },
        {
          operationId: "confirm-visible-completion",
          kind: "ASSERT_TEXT",
          locator: { kind: "TEST_ID", value: "student-result" },
          text: "Fictional submission completed",
        },
      ],
    },
    createdAt: "2026-07-21T10:10:00.000Z",
    createdBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
  });
}

function evidenceMode(world) {
  return world.fixtureVersion === "BASELINE" ? "baseline" : "drift";
}

Given(
  "a human-authored deterministic replay is frozen for the named student journey",
  function () {
    this.deterministicReplay = humanBaselineReplay();
    assert.equal(this.deterministicReplay.modelInvocationCount, 0);
    assert.equal(this.deterministicReplay.createdBy.kind, "HUMAN");
  },
);

When("the non-model baseline replays the frozen student journey", async function () {
  const mode = evidenceMode(this);
  const traceRoot = path.join(
    process.cwd(),
    "artifacts",
    "verification",
    "JRN-03",
    "traces",
  );
  await mkdir(traceRoot, { recursive: true });
  const browserTracePath = path.join(traceRoot, `${mode}-browser-trace.zip`);
  await this.context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: false,
    title: `JRN-03 ${mode} deterministic replay`,
  });
  try {
    this.deterministicReplayOutcome = await executeDeterministicReplay({
      replay: this.deterministicReplay,
      snapshot: this.deterministicReplay.snapshot,
      baseUrl: this.fixtureServer.classroomOrigin,
      bindingValues: {
        "student-email-value":
          this.fixtureServer.scenario.personas.student.email,
        "student-response-value":
          this.fixtureServer.scenario.submission.response,
      },
      adapter: createPlaywrightReplayAdapter(this.page, { timeoutMs: 5_000 }),
    });
  } finally {
    await this.context.tracing.stop({ path: browserTracePath });
  }
  this.deterministicReplayBrowserTracePath = browserTracePath;
  this.fixtureEvents = this.fixtureServer.readEvents();
});

Then("the deterministic replay outcome is {string}", function (state) {
  assert.equal(this.deterministicReplayOutcome.state, state);
});

Then(
  "replay checkpoint {string} is {string}",
  function (checkpointId, status) {
    const checkpoint = this.deterministicReplayOutcome.checkpoints.find(
      (candidate) => candidate.checkpointId === checkpointId,
    );
    assert.equal(checkpoint?.status, status);
  },
);

Then(
  "the replay trace records zero model calls and no raw fictional values",
  function () {
    assert.equal(this.deterministicReplayOutcome.modelInvocationCount, 0);
    const serialized = JSON.stringify(this.deterministicReplayOutcome);
    assert.equal(
      serialized.includes(this.fixtureServer.scenario.personas.student.email),
      false,
    );
    assert.equal(
      serialized.includes(this.fixtureServer.scenario.submission.response),
      false,
    );
    assert.equal(
      this.deterministicReplayOutcome.trace.filter((event) => event.valueHash)
        .length,
      2,
    );
  },
);

Then("the replay trace stops at {string}", function (reasonCode) {
  assert.equal(this.deterministicReplayOutcome.trace.at(-1)?.reasonCode, reasonCode);
});

Then("the fixture records no replay submission request", function () {
  assert.deepEqual(this.fixtureServer.readEvents(), []);
});

Then(
  "I capture the {string} deterministic replay evidence",
  async function (mode) {
    assert.equal(mode, evidenceMode(this));
    const screenshotRoot = path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "JRN-03",
      "screenshots",
    );
    const traceRoot = path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "JRN-03",
      "traces",
    );
    await Promise.all([
      mkdir(screenshotRoot, { recursive: true }),
      mkdir(traceRoot, { recursive: true }),
    ]);
    const screenshotPath = path.join(
      screenshotRoot,
      `${mode}-replay-desktop.png`,
    );
    const replayTracePath = path.join(traceRoot, `${mode}-replay-trace.json`);
    await this.page.setViewportSize({ width: 1440, height: 1100 });
    await Promise.all([
      this.page.screenshot({ path: screenshotPath, fullPage: true }),
      writeFile(
        replayTracePath,
        `${JSON.stringify(this.deterministicReplayOutcome, null, 2)}\n`,
        "utf8",
      ),
    ]);

    if (
      process.env.PACTWIRE_CAPTURE_CURATED_EVIDENCE === "1" &&
      process.env.PACTWIRE_EVIDENCE_TASK === "JRN-03"
    ) {
      const curatedRoot = path.join(
        process.cwd(),
        "docs",
        "evidence",
        "JRN-03",
      );
      await mkdir(curatedRoot, { recursive: true });
      await Promise.all([
        copyFile(
          screenshotPath,
          path.join(curatedRoot, `${mode}-replay-desktop.png`),
        ),
        copyFile(
          replayTracePath,
          path.join(curatedRoot, `${mode}-replay-trace.json`),
        ),
        copyFile(
          this.deterministicReplayBrowserTracePath,
          path.join(curatedRoot, `${mode}-browser-trace.zip`),
        ),
      ]);
    }
  },
);
