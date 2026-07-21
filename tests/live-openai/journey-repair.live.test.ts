import { createHash } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  startFixtureServer,
  type ControlledFixtureServer,
} from "../../apps/fixture/src/index";
import {
  BrowserIsolationManager,
  DeterministicBrowserRecorder,
  FetchComputerUseResponsesTransport,
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
  type ComputerUseResponsesTransport,
} from "../../apps/runner/src/index";
import {
  buildJourneyRepairDraft,
  buildJourneyRepairPromotion,
  buildJourneyRepairVerification,
  buildPromotedRepairReplayVersion,
} from "../../packages/core/src/index";
import { createFictionalSubmissionRecorderConfig } from "../helpers/fictional-submission-recorder.mjs";
import { makeReplayJourney, makeReplayVersion } from "../helpers/deterministic-replay-fixtures";
import { repairFixtureIds } from "../helpers/journey-repair-fixtures";

const managers: BrowserIsolationManager[] = [];
const fixtures: ControlledFixtureServer[] = [];
const workspaceId = "11111111-1111-4111-8111-111111111111";
const sourceRunId = "39393939-3939-4939-8939-393939393939";
const discoveryRunId = "40404040-4040-4040-8040-404040404040";
const verificationRunId = "41414141-4141-4141-8141-414141414142";
const liveSecret = "RUN-04-LIVE-FICTIONAL-BROWSER-SECRET";

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.shutdown()));
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.close()));
});

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseContractShape(response: unknown) {
  if (!isRecord(response)) return { responseKind: typeof response };
  const output = Array.isArray(response.output) ? response.output : [];
  return {
    responseFields: Object.keys(response).sort(),
    output: output.map((item) =>
      isRecord(item)
        ? {
            type: typeof item.type === "string" ? item.type : "NON_STRING",
            fields: Object.keys(item).sort(),
            actions: Array.isArray(item.actions)
              ? item.actions.map((action) =>
                  isRecord(action)
                    ? {
                        type:
                          typeof action.type === "string"
                            ? action.type
                            : "NON_STRING",
                        fields: Object.keys(action).sort(),
                      }
                    : { type: "NON_OBJECT", fields: [] },
                )
              : [],
          }
        : { type: "NON_OBJECT", fields: [], actions: [] },
    ),
  };
}

function sessionConfig(fixture: ControlledFixtureServer, runId: string) {
  return {
    workspaceId,
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

async function copyLastRecorderScreenshot(
  report: ReturnType<typeof deterministicRecorderReportSchema.parse>,
  sourceRoot: string,
  destination: string,
): Promise<void> {
  const screenshot = report.screenshots.at(-1);
  if (!screenshot) throw new Error("The live RUN-04 screenshot is required.");
  await copyFile(path.join(sourceRoot, screenshot.artifactName), destination);
}

describe("RUN-04 live GPT-5.6 Sol journey repair contract", () => {
  it("discovers the seeded interface change and produces an exactly verified human-promotable draft", async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required for the opt-in RUN-04 live repair contract; this gate is never skipped or replaced by the deterministic adapter.",
      );
    }
    const fixture = await startFixtureServer({
      host: "127.0.0.1",
      port: 0,
      seed: "run-04-live-gpt-56-sol-repair-20260721",
      version: "INTERFACE_DRIFT",
    });
    fixtures.push(fixture);
    const manager = new BrowserIsolationManager({
      launchArgs: [
        "--host-resolver-rules=MAP *.pactwire.test 127.0.0.1,EXCLUDE localhost",
      ],
    });
    managers.push(manager);
    const rawRoot = path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "RUN-04",
      "live-raw",
    );
    const discoveryScreenshots = path.join(rawRoot, "discovery-screenshots");
    const verificationScreenshots = path.join(
      rawRoot,
      "verification-screenshots",
    );
    await Promise.all([
      mkdir(rawRoot, { recursive: true }),
      mkdir(discoveryScreenshots, { recursive: true }),
      mkdir(verificationScreenshots, { recursive: true }),
    ]);

    const sourceReplay = makeReplayVersion();
    const sourceSession = await manager.startSession(
      sessionConfig(fixture, sourceRunId),
    );
    const sourceTracePath = path.join(rawRoot, "live-source-trace-raw.zip");
    await sourceSession.page.context().tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    });
    const sourceOutcome = await executeDeterministicReplay({
      replay: sourceReplay,
      snapshot: sourceReplay.snapshot,
      baseUrl: fixture.classroomOrigin,
      bindingValues: values(fixture),
      adapter: createPlaywrightReplayAdapter(sourceSession.page, {
        timeoutMs: 5_000,
      }),
    });
    expect(sourceOutcome.state).toBe("DRIFTED");
    await sourceSession.page.screenshot({
      path: path.join(rawRoot, "live-before-drift-desktop.png"),
      fullPage: true,
      animations: "disabled",
      caret: "hide",
    });
    await sourceSession.page.context().tracing.stop({ path: sourceTracePath });
    await sourceSession.abort("SOURCE_REPLAY_DRIFTED");

    const discoverySession = await manager.startSession(
      sessionConfig(fixture, discoveryRunId),
    );
    const discoveryTracePath = path.join(
      rawRoot,
      "live-discovery-trace-raw.zip",
    );
    await discoverySession.page.context().tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    });
    const discoveryRecorder = await DeterministicBrowserRecorder.start({
      page: discoverySession.page,
      artifactDirectory: discoveryScreenshots,
      config: createFictionalSubmissionRecorderConfig({
        workspaceId,
        runId: discoveryRunId,
        secrets: [liveSecret],
      }),
    });
    const config = computerUseRunConfigSchema.parse({
      workspaceId,
      runId: discoveryRunId,
      model: "gpt-5.6-sol",
      reasoningEffort: "medium",
      authorizedGoal:
        "The old fictional student route may show a reviewed link to the moved workspace. Follow that link, then submit the already prefilled fictional response. Do not edit any field. Stop as soon as the green fictional submission receipt appears.",
      startUrl: `${fixture.classroomOrigin}/student`,
      allowedOrigins: [fixture.classroomOrigin],
      allowedComputerActions: ["screenshot", "click", "scroll", "wait", "move"],
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
      maxTurns: 10,
      maxActions: 30,
      maxTransportRetries: 1,
      requestTimeoutMs: 120_000,
    });
    const observedModels: string[] = [];
    const observedUsage: Record<string, unknown>[] = [];
    const observedResponseContracts: ReturnType<typeof responseContractShape>[] =
      [];
    const baseTransport = new FetchComputerUseResponsesTransport({
      apiKey,
      timeoutMs: 120_000,
    });
    const transport: ComputerUseResponsesTransport = {
      async create(request) {
        const response = await baseTransport.create(request);
        observedResponseContracts.push(responseContractShape(response));
        if (isRecord(response)) {
          if (typeof response.model === "string") observedModels.push(response.model);
          if (isRecord(response.usage)) observedUsage.push(response.usage);
        }
        return response;
      },
    };
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
    const startedAt = Date.now();
    const modelResult = await runPolicyBoundedComputerUse({
      config,
      browser: discovery.browser,
      transport,
      evidence: createDeterministicRecorderComputerUseEvidenceSink(
        discoveryRecorder,
      ),
      secretValues: [liveSecret],
    });
    const latencyMs = Date.now() - startedAt;
    expect(modelResult).toMatchObject({
      model: "gpt-5.6-sol",
      status: "COMPLETED",
      reason: "DETERMINISTIC_COMPLETION_OBSERVED",
      completionObserved: true,
      policyViolationCount: 0,
    });
    expect(observedModels.some((model) => /^gpt-5\.6-sol(?:-|$)/u.test(model))).toBe(
      true,
    );
    const observations = discovery.readObservations();
    const candidate = deriveJourneyRepairCandidate(sourceReplay, observations);
    expect(candidate).not.toBeNull();
    const repair = buildJourneyRepairDraft({
      id: repairFixtureIds.repair,
      sourceReplay,
      candidate,
      diagnosis:
        "GPT-5.6 Sol followed the reviewed moved route and submit control inside the frozen origin.",
      modelInvocationCount: modelResult.turns,
      proposedBy: {
        kind: "MODEL",
        actorId: "run-04-live-model",
        model: "gpt-5.6-sol",
      },
      createdAt: "2026-07-21T11:00:00.000Z",
    });
    expect(repair.status).toBe("BOUNDED_DRAFT");
    await discoveryRecorder.captureScreenshot("live-repair-discovery-completed");
    const discoveryReport = await discoverySession.finalizeArtifacts(async () => {
      const report = deterministicRecorderReportSchema.parse(
        await discoveryRecorder.stop(),
      );
      await discoverySession.page.context().tracing.stop({
        path: discoveryTracePath,
      });
      return report;
    });
    expect(discoveryReport.visibility.state).toBe("VISIBLE");
    await copyLastRecorderScreenshot(
      discoveryReport,
      discoveryScreenshots,
      path.join(rawRoot, "live-model-repair-desktop.png"),
    );

    const verificationSession = await manager.startSession(
      sessionConfig(fixture, verificationRunId),
    );
    const verificationTracePath = path.join(
      rawRoot,
      "live-verification-trace-raw.zip",
    );
    await verificationSession.page.context().tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    });
    const verificationRecorder = await DeterministicBrowserRecorder.start({
      page: verificationSession.page,
      artifactDirectory: verificationScreenshots,
      config: createFictionalSubmissionRecorderConfig({
        workspaceId,
        runId: verificationRunId,
        secrets: [liveSecret],
      }),
    });
    const candidateOutcome = await executeJourneyRepairCandidate({
      repair,
      sourceReplay,
      snapshot: sourceReplay.snapshot,
      baseUrl: fixture.classroomOrigin,
      bindingValues: values(fixture),
      adapter: createPlaywrightReplayAdapter(verificationSession.page, {
        timeoutMs: 5_000,
      }),
      evidence: createDeterministicRecorderReplayEvidenceSink(
        verificationRecorder,
      ),
    });
    await verificationRecorder.captureScreenshot(
      "live-original-checkpoint-verified",
    );
    const verificationReport = await verificationSession.finalizeArtifacts(
      async () => {
        const report = deterministicRecorderReportSchema.parse(
          await verificationRecorder.stop(),
        );
        await verificationSession.page.context().tracing.stop({
          path: verificationTracePath,
        });
        return report;
      },
    );
    expect(candidateOutcome.state).toBe("COMPLETED");
    expect(verificationReport.visibility.state).toBe("VISIBLE");
    const verification = buildJourneyRepairVerification({
      id: repairFixtureIds.verification,
      repair,
      sourceReplay,
      executionState: candidateOutcome.state,
      checkpoints: candidateOutcome.checkpoints,
      recorderVisibility: verificationReport.visibility.state,
      verifiedAt: "2026-07-21T11:05:00.000Z",
      verifiedBy: {
        kind: "AUTOMATION",
        actorId: "run-04-live-verifier",
        component: "journey-repair-verifier",
      },
    });
    expect(verification.status).toBe("VERIFIED_DRAFT");
    const promotedReplay = buildPromotedRepairReplayVersion({
      id: repairFixtureIds.promotedReplay,
      repair,
      verification,
      sourceReplay,
      journey: makeReplayJourney(),
      createdAt: "2026-07-21T11:10:00.000Z",
      createdBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
    });
    const promotion = buildJourneyRepairPromotion({
      id: repairFixtureIds.promotion,
      repair,
      verification,
      sourceReplay,
      promotedReplay,
      rationale:
        "I reviewed the same authorized actions and exact frozen checkpoint.",
      reviewedAt: promotedReplay.createdAt,
      reviewedBy: promotedReplay.createdBy,
    });
    await copyLastRecorderScreenshot(
      verificationReport,
      verificationScreenshots,
      path.join(rawRoot, "live-checkpoint-verified-desktop.png"),
    );

    const liveManifest = {
      schemaVersion: "1.0.0",
      taskId: "RUN-04",
      fixture: "controlled-fictional-classroom-interface-drift",
      requestedModel: config.model,
      returnedModels: [...new Set(observedModels)],
      responseIdSha256: modelResult.responseIds.map(sha256),
      status: modelResult.status,
      reason: modelResult.reason,
      turns: modelResult.turns,
      transportAttempts: modelResult.transportAttempts,
      actionCount: modelResult.actionCount,
      policyViolationCount: modelResult.policyViolationCount,
      sourceReplayState: sourceOutcome.state,
      repairStatus: repair.status,
      repairChanges: repair.changes,
      deterministicVerification: verification.status,
      verifiedCheckpointIds: verification.verifiedCheckpointIds,
      recorderVisibility: verificationReport.visibility.state,
      promotedReplayVersion: promotedReplay.version,
      promotedByKind: promotion.reviewedBy.kind,
      usage: observedUsage,
      responseContracts: observedResponseContracts,
      latencyMs,
      rawResponseIncluded: false,
      responseIdIncluded: false,
      screenshotDataIncluded: false,
      apiKeyIncluded: false,
      passed: true,
    };
    await Promise.all([
      writeFile(
        path.join(rawRoot, "live-repair-contract.json"),
        `${JSON.stringify(liveManifest, null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        path.join(rawRoot, "live-model-actions.json"),
        `${JSON.stringify(modelResult.actionSummaries, null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        path.join(rawRoot, "live-model-observations.json"),
        `${JSON.stringify(observations, null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        path.join(rawRoot, "live-repair-draft.json"),
        `${JSON.stringify(repair, null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        path.join(rawRoot, "live-discovery-recorder.json"),
        `${JSON.stringify(discoveryReport, null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        path.join(rawRoot, "live-candidate-outcome.json"),
        `${JSON.stringify(candidateOutcome, null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        path.join(rawRoot, "live-verification.json"),
        `${JSON.stringify(verification, null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        path.join(rawRoot, "live-verification-recorder.json"),
        `${JSON.stringify(verificationReport, null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        path.join(rawRoot, "live-promotion.json"),
        `${JSON.stringify(promotion, null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        path.join(rawRoot, "live-promoted-replay.json"),
        `${JSON.stringify(promotedReplay, null, 2)}\n`,
        "utf8",
      ),
    ]);
  }, 300_000);
});
