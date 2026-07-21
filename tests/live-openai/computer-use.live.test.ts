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
  PlaywrightComputerUseAdapter,
  computerUseRunConfigSchema,
  createDeterministicRecorderComputerUseEvidenceSink,
  deterministicRecorderReportSchema,
  runPolicyBoundedComputerUse,
  type ComputerUseResponsesTransport,
} from "../../apps/runner/src/index";

const managers: BrowserIsolationManager[] = [];
const fixtures: ControlledFixtureServer[] = [];

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

describe("RUN-03 live GPT-5.6 Sol computer-use contract", () => {
  it("completes the exact authorized fictional submission through the isolated browser", async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required for the opt-in RUN-03 live computer-use contract; this gate is never skipped or replaced by the deterministic adapter.",
      );
    }
    const fixture = await startFixtureServer({
      host: "127.0.0.1",
      port: 0,
      seed: "run-03-live-gpt-56-sol-20260721",
      version: "BASELINE",
    });
    fixtures.push(fixture);
    const manager = new BrowserIsolationManager({
      launchArgs: [
        "--host-resolver-rules=MAP *.pactwire.test 127.0.0.1,EXCLUDE localhost",
      ],
    });
    managers.push(manager);
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    const runId = "64646464-6464-4464-8464-646464646464";
    const session = await manager.startSession({
      workspaceId,
      runId,
      allowedNavigationOrigins: [fixture.classroomOrigin],
      allowedNetworkHosts: [
        "classroom.pactwire.test",
        "classroom-service.pactwire.test",
      ],
      popupPolicy: "BLOCK_ALL",
      downloadPolicy: "BLOCK",
      clipboardPolicy: "BLOCK",
      viewport: { width: 1280, height: 900 },
    });
    const rawRoot = path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "RUN-03",
      "live-raw",
    );
    const screenshotRoot = path.join(rawRoot, "recorder-screenshots");
    await Promise.all([
      mkdir(rawRoot, { recursive: true }),
      mkdir(screenshotRoot, { recursive: true }),
    ]);
    await session.page.context().tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    });
    const recorder = await DeterministicBrowserRecorder.start({
      page: session.page,
      artifactDirectory: screenshotRoot,
      config: {
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
        secrets: ["RUN-03-LIVE-FICTIONAL-BROWSER-SECRET"],
      },
    });
    const config = computerUseRunConfigSchema.parse({
      workspaceId,
      runId,
      model: "gpt-5.6-sol",
      reasoningEffort: "medium",
      authorizedGoal:
        "On the visible fictional classroom page, submit the already prefilled fictional response. Do not edit fields. Stop as soon as the green fictional submission receipt appears.",
      startUrl: `${fixture.classroomOrigin}/student`,
      allowedOrigins: [fixture.classroomOrigin],
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
          dataTestId: fixture.scenario.interface.submitCheckpoint,
          authorizationAction: "SUBMIT",
          disposition: "ALLOW",
        },
        {
          dataTestId: "student-response",
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
    const browser = new PlaywrightComputerUseAdapter({
      page: session.page,
      readPolicyViolations: () => session.violations,
      completionCheck: async () => {
        try {
          await session.page.waitForFunction(
            () =>
              globalThis.document
                .querySelector('[data-testid="student-result"]')
                ?.getAttribute("data-state") === "complete",
            undefined,
            { timeout: 3_000 },
          );
          return true;
        } catch {
          return false;
        }
      },
    });

    const startedAt = Date.now();
    const result = await runPolicyBoundedComputerUse({
      config,
      browser,
      transport,
      evidence: createDeterministicRecorderComputerUseEvidenceSink(recorder),
      secretValues: ["RUN-03-LIVE-FICTIONAL-BROWSER-SECRET"],
    });
    const latencyMs = Date.now() - startedAt;
    expect(
      result,
      `Sanitized response contracts: ${JSON.stringify(observedResponseContracts)}`,
    ).toMatchObject({
      model: "gpt-5.6-sol",
      status: "COMPLETED",
      reason: "DETERMINISTIC_COMPLETION_OBSERVED",
      completionObserved: true,
      policyViolationCount: 0,
    });
    expect(observedModels.some((model) => /^gpt-5\.6-sol(?:-|$)/u.test(model))).toBe(
      true,
    );
    expect(fixture.readEvents()).toHaveLength(1);

    const rawTracePath = path.join(rawRoot, "live-browser-trace-raw.zip");
    const report = await session.finalizeArtifacts(async () => {
      const finalReport = deterministicRecorderReportSchema.parse(
        await recorder.stop(),
      );
      await session.page.context().tracing.stop({ path: rawTracePath });
      return finalReport;
    });
    expect(report.visibility.state).toBe("VISIBLE");
    expect(report.actions).toHaveLength(result.actionSummaries.length);
    expect(report.screenshots).toHaveLength(1);
    const screenshot = report.screenshots[0];
    if (!screenshot) throw new Error("The live recorder screenshot is required.");
    const completedScreenshot = path.join(
      rawRoot,
      "live-completed-desktop.png",
    );
    await copyFile(
      path.join(screenshotRoot, screenshot.artifactName),
      completedScreenshot,
    );
    const manifest = {
      schemaVersion: "1.0.0",
      taskId: "RUN-03",
      fixture: "controlled-fictional-classroom-baseline",
      requestedModel: config.model,
      returnedModels: [...new Set(observedModels)],
      responseIdSha256: result.responseIds.map(sha256),
      status: result.status,
      reason: result.reason,
      turns: result.turns,
      transportAttempts: result.transportAttempts,
      actionCount: result.actionCount,
      policyViolationCount: result.policyViolationCount,
      deterministicVisibility: report.visibility.state,
      observedDispatchCount: fixture.readEvents().length,
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
        path.join(rawRoot, "live-computer-use.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        path.join(rawRoot, "live-actions.json"),
        `${JSON.stringify(result.actionSummaries, null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        path.join(rawRoot, "live-recorder.json"),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8",
      ),
    ]);
  }, 300_000);
});
