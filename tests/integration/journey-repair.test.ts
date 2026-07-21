import { afterEach, describe, expect, it } from "vitest";
import {
  startFixtureServer,
  type ControlledFixtureServer,
} from "../../apps/fixture/src/index";
import {
  BrowserIsolationManager,
  DeterministicBrowserRecorder,
  ScriptedComputerUseResponsesTransport,
  computerUseRunConfigSchema,
  createDeterministicRecorderReplayEvidenceSink,
  createJourneyRepairDiscoveryBrowserAdapter,
  createPlaywrightReplayAdapter,
  deriveJourneyRepairCandidate,
  deterministicRecorderReportSchema,
  executeDeterministicReplay,
  executeJourneyRepairCandidate,
  runPolicyBoundedComputerUse,
} from "../../apps/runner/src/index";
import {
  buildJourneyRepairDraft,
  buildJourneyRepairVerification,
  buildPromotedRepairReplayVersion,
} from "../../packages/core/src/index";
import { createFictionalSubmissionRecorderConfig } from "../helpers/fictional-submission-recorder.mjs";
import { makeReplayVersion } from "../helpers/deterministic-replay-fixtures";
import {
  makePromotedRepairInput,
  repairFixtureIds,
} from "../helpers/journey-repair-fixtures";

const managers: BrowserIsolationManager[] = [];
const fixtures: ControlledFixtureServer[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.shutdown()));
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.close()));
});

function response(id: string, callId: string, actions: readonly unknown[]) {
  return {
    id,
    status: "completed",
    output: [{ type: "computer_call", call_id: callId, actions }],
  };
}

async function center(
  page: Awaited<ReturnType<BrowserIsolationManager["startSession"]>>["page"],
  testId: string,
) {
  const target = page.getByTestId(testId);
  await target.waitFor();
  const box = await target.boundingBox();
  if (!box) throw new Error(`Missing repair target ${testId}`);
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
}

async function fixtureHarness(version: "INTERFACE_DRIFT" | "FAILURE", seed: string) {
  const fixture = await startFixtureServer({
    host: "127.0.0.1",
    port: 0,
    seed,
    version,
  });
  fixtures.push(fixture);
  const manager = new BrowserIsolationManager({
    launchArgs: [
      "--host-resolver-rules=MAP *.pactwire.test 127.0.0.1,EXCLUDE localhost",
    ],
  });
  managers.push(manager);
  return { fixture, manager };
}

function sessionConfig(
  fixture: ControlledFixtureServer,
  runId: string,
) {
  return {
    workspaceId: "11111111-1111-4111-8111-111111111111",
    runId,
    allowedNavigationOrigins: [fixture.classroomOrigin],
    allowedNetworkHosts: [
      "classroom.pactwire.test",
      "classroom-service.pactwire.test",
    ],
    popupPolicy: "BLOCK_ALL" as const,
    downloadPolicy: "BLOCK" as const,
    clipboardPolicy: "BLOCK" as const,
    viewport: { width: 1280, height: 900 },
  };
}

function values(fixture: ControlledFixtureServer) {
  return {
    "student-email-value": fixture.scenario.personas.student.email,
    "student-response-value": fixture.scenario.submission.response,
  };
}

describe("RUN-04 model-assisted repair against a real isolated browser", () => {
  it("discovers a moved interface, verifies the frozen checkpoint, and permits human promotion", async () => {
    const { fixture, manager } = await fixtureHarness(
      "INTERFACE_DRIFT",
      "run-04-integration-bounded-repair",
    );
    const sourceReplay = makeReplayVersion();
    const driftSession = await manager.startSession(
      sessionConfig(fixture, "26262626-2626-4626-8626-262626262626"),
    );
    const drift = await executeDeterministicReplay({
      replay: sourceReplay,
      snapshot: sourceReplay.snapshot,
      baseUrl: fixture.classroomOrigin,
      bindingValues: values(fixture),
      adapter: createPlaywrightReplayAdapter(driftSession.page, { timeoutMs: 2_000 }),
    });
    expect(drift.state).toBe("DRIFTED");
    await driftSession.abort("SOURCE_REPLAY_DRIFTED");

    const discoverySession = await manager.startSession(
      sessionConfig(fixture, "27272727-2727-4727-8727-272727272727"),
    );
    const config = computerUseRunConfigSchema.parse({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      runId: "27272727-2727-4727-8727-272727272727",
      model: "gpt-5.6-sol",
      reasoningEffort: "medium",
      authorizedGoal:
        "Find the moved fictional student workspace and submit the prefilled fictional response.",
      startUrl: `${fixture.classroomOrigin}/student`,
      allowedOrigins: [fixture.classroomOrigin],
      allowedComputerActions: ["screenshot", "click", "move", "wait"],
      trustedControls: [
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
      ],
      maxTurns: 6,
      maxActions: 12,
      maxTransportRetries: 0,
      requestTimeoutMs: 10_000,
    });
    const discovery = createJourneyRepairDiscoveryBrowserAdapter({
      page: discoverySession.page,
      config,
      readPolicyViolations: () => discoverySession.violations,
      completionCheck: async () =>
        (await discoverySession.page
          .getByTestId("student-result")
          .getAttribute("data-state")
          .catch(() => null)) === "complete",
    });
    const transport = new ScriptedComputerUseResponsesTransport([
      response("resp_repair_01", "call_repair_01", [{ type: "screenshot" }]),
      async () => {
        const point = await center(discoverySession.page, "moved-student-link");
        return response("resp_repair_02", "call_repair_02", [
          { type: "click", ...point, button: "left" },
        ]);
      },
      async () => {
        const point = await center(discoverySession.page, "turn-in-response");
        return response("resp_repair_03", "call_repair_03", [
          { type: "click", ...point, button: "left" },
        ]);
      },
    ]);
    const discoveryResult = await runPolicyBoundedComputerUse({
      config,
      browser: discovery.browser,
      transport,
      secretValues: ["RUN-04-FICTIONAL-SECRET"],
    });
    expect(discoveryResult.status).toBe("COMPLETED");
    const candidate = deriveJourneyRepairCandidate(
      sourceReplay,
      discovery.readObservations(),
    );
    expect(candidate).not.toBeNull();
    const repair = buildJourneyRepairDraft({
      id: repairFixtureIds.repair,
      sourceReplay,
      candidate,
      diagnosis: "The student route and reviewed submit control moved.",
      modelInvocationCount: discoveryResult.turns,
      proposedBy: {
        kind: "MODEL",
        actorId: "run-04-integration-model",
        model: "gpt-5.6-sol",
      },
      createdAt: "2026-07-21T11:00:00.000Z",
    });
    expect(repair.status).toBe("BOUNDED_DRAFT");
    await discoverySession.abort("REPAIR_DRAFT_CAPTURED");

    const verificationRunId = "28282828-2828-4828-8828-282828282828";
    const verificationSession = await manager.startSession(
      sessionConfig(fixture, verificationRunId),
    );
    const recorder = await DeterministicBrowserRecorder.start({
      page: verificationSession.page,
      artifactDirectory: "artifacts/verification/RUN-04/integration-screenshots",
      config: createFictionalSubmissionRecorderConfig({
        workspaceId: "11111111-1111-4111-8111-111111111111",
        runId: verificationRunId,
        secrets: ["RUN-04-FICTIONAL-SECRET"],
      }),
    });
    const candidateOutcome = await executeJourneyRepairCandidate({
      repair,
      sourceReplay,
      snapshot: sourceReplay.snapshot,
      baseUrl: fixture.classroomOrigin,
      bindingValues: values(fixture),
      adapter: createPlaywrightReplayAdapter(verificationSession.page, {
        timeoutMs: 2_000,
      }),
      evidence: createDeterministicRecorderReplayEvidenceSink(recorder),
      now: () => "2026-07-21T11:05:00.000Z",
    });
    await recorder.captureScreenshot("repair-checkpoint-verified");
    const report = deterministicRecorderReportSchema.parse(await recorder.stop());
    await verificationSession.abort("REPAIR_VERIFIED");
    expect(candidateOutcome.state).toBe("COMPLETED");
    expect(report.visibility.state).toBe("VISIBLE");
    const verification = buildJourneyRepairVerification({
      id: repairFixtureIds.verification,
      repair,
      sourceReplay,
      executionState: candidateOutcome.state,
      checkpoints: candidateOutcome.checkpoints,
      recorderVisibility: report.visibility.state,
      verifiedAt: "2026-07-21T11:05:00.000Z",
      verifiedBy: {
        kind: "AUTOMATION",
        actorId: "run-04-integration-verifier",
        component: "journey-repair-verifier",
      },
    });
    expect(verification.status).toBe("VERIFIED_DRAFT");
    expect(
      buildPromotedRepairReplayVersion(
        makePromotedRepairInput(repair, verification),
      ),
    ).toMatchObject({ version: 2, sourceVersionId: sourceReplay.id });
  }, 60_000);

  it("keeps an unrepairable outage not tested and unpromotable", () => {
    const sourceReplay = makeReplayVersion();
    const repair = buildJourneyRepairDraft({
      id: repairFixtureIds.repair,
      sourceReplay,
      candidate: null,
      diagnosis: "The fixture remained unavailable after the bounded attempt.",
      modelInvocationCount: 1,
      proposedBy: {
        kind: "MODEL",
        actorId: "run-04-integration-model",
        model: "gpt-5.6-sol",
      },
      createdAt: "2026-07-21T11:00:00.000Z",
    });
    const verification = buildJourneyRepairVerification({
      id: repairFixtureIds.verification,
      repair,
      sourceReplay,
      executionState: "FAILED",
      checkpoints: [],
      recorderVisibility: "NOT_TESTED",
      verifiedAt: "2026-07-21T11:05:00.000Z",
      verifiedBy: {
        kind: "AUTOMATION",
        actorId: "run-04-integration-verifier",
        component: "journey-repair-verifier",
      },
    });

    expect(repair.status).toBe("UNRESOLVED");
    expect(verification.status).toBe("NOT_TESTED");
    expect(() =>
      buildPromotedRepairReplayVersion(
        makePromotedRepairInput(repair, verification),
      ),
    ).toThrow();
  });
});
