import { afterEach, describe, expect, it } from "vitest";
import {
  startFixtureServer,
  type ControlledFixtureServer,
  type FixtureVersion,
} from "../../apps/fixture/src/index";
import {
  BrowserIsolationManager,
  type IsolatedBrowserSession,
} from "../../apps/runner/src/isolated-browser";
import {
  ComputerUseTransportError,
  PlaywrightComputerUseAdapter,
  ScriptedComputerUseResponsesTransport,
  computerUseRunConfigSchema,
  runPolicyBoundedComputerUse,
  type ComputerUseActionEvidence,
} from "../../apps/runner/src/computer-use";

const managers: BrowserIsolationManager[] = [];
const servers: ControlledFixtureServer[] = [];
let ordinal = 0;

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.shutdown()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function harness(version: FixtureVersion) {
  ordinal += 1;
  const server = await startFixtureServer({
    host: "127.0.0.1",
    port: 0,
    seed: `run-03-${version.toLowerCase()}-${ordinal}`,
    version,
  });
  servers.push(server);
  const manager = new BrowserIsolationManager({
    launchArgs: [
      "--host-resolver-rules=MAP *.pactwire.test 127.0.0.1,EXCLUDE localhost",
    ],
  });
  managers.push(manager);
  const session = await manager.startSession({
    workspaceId: "11111111-1111-4111-8111-111111111111",
    runId: `22222222-2222-4222-8222-${ordinal.toString().padStart(12, "0")}`,
    allowedNavigationOrigins: [server.classroomOrigin],
    allowedNetworkHosts: [
      "classroom.pactwire.test",
      "classroom-service.pactwire.test",
    ],
    popupPolicy: "BLOCK_ALL",
    downloadPolicy: "BLOCK",
    clipboardPolicy: "BLOCK",
    viewport: { width: 1280, height: 900 },
  });
  return { server, session };
}

function config(
  server: ControlledFixtureServer,
  session: IsolatedBrowserSession,
  extraControls: readonly Readonly<Record<string, string>>[] = [],
) {
  return computerUseRunConfigSchema.parse({
    workspaceId: session.workspaceId,
    runId: session.runId,
    model: "gpt-5.6-sol",
    reasoningEffort: "medium",
    authorizedGoal:
      "Submit the prefilled fictional response and stop after the controlled receipt appears.",
    startUrl: `${server.classroomOrigin}/student`,
    allowedOrigins: [server.classroomOrigin],
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
        dataTestId: server.scenario.interface.submitCheckpoint,
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
      ...extraControls,
    ],
    maxTurns: 6,
    maxActions: 16,
    maxTransportRetries: 1,
    requestTimeoutMs: 5_000,
  });
}

function adapter(session: IsolatedBrowserSession) {
  return new PlaywrightComputerUseAdapter({
    page: session.page,
    readPolicyViolations: () => session.violations,
    completionCheck: async () => {
      try {
        await session.page.waitForFunction(
          () =>
            document
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

async function center(
  session: IsolatedBrowserSession,
  dataTestId: string,
): Promise<{ x: number; y: number }> {
  const control = session.page.getByTestId(dataTestId);
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  if (!box) throw new Error(`No box for ${dataTestId}`);
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
}

function response(
  id: string,
  callId: string,
  actions: readonly Readonly<Record<string, unknown>>[],
) {
  return {
    id,
    status: "completed",
    output: [{ type: "computer_call", call_id: callId, actions }],
  };
}

function evidenceSink() {
  const actions: ComputerUseActionEvidence[] = [];
  const screenshots: string[] = [];
  return {
    actions,
    screenshots,
    sink: {
      recordAction(action: ComputerUseActionEvidence) {
        actions.push(action);
        return Promise.resolve();
      },
      captureScreenshot(checkpointId: string) {
        screenshots.push(checkpointId);
        return Promise.resolve();
      },
    },
  };
}

describe("RUN-03 real isolated browser computer-use loop", () => {
  it("exchanges original screenshots, executes a reviewed batched action, and trusts deterministic completion", async () => {
    const { server, session } = await harness("BASELINE");
    const transport = new ScriptedComputerUseResponsesTransport([
      response("resp_1", "call_1", [{ type: "screenshot" }]),
      async () => {
        const point = await center(
          session,
          server.scenario.interface.submitCheckpoint,
        );
        return response("resp_2", "call_2", [
          { type: "move", ...point },
          { type: "click", ...point, button: "left" },
        ]);
      },
    ]);
    const evidence = evidenceSink();
    const result = await runPolicyBoundedComputerUse({
      config: config(server, session),
      browser: adapter(session),
      transport,
      evidence: evidence.sink,
      secretValues: [],
    });

    expect(result).toMatchObject({
      status: "COMPLETED",
      reason: "DETERMINISTIC_COMPLETION_OBSERVED",
      turns: 2,
      actionCount: 3,
      completionObserved: true,
      policyViolationCount: 0,
    });
    expect(transport.requests).toHaveLength(2);
    expect(transport.requests[1]).toMatchObject({
      previous_response_id: "resp_1",
      input: [
        {
          type: "computer_call_output",
          call_id: "call_1",
          output: {
            type: "computer_screenshot",
            detail: "original",
          },
        },
      ],
    });
    expect(JSON.stringify(transport.requests[1])).toMatch(
      /"image_url":"data:image\/png;base64,/u,
    );
    expect(
      await session.page.getByTestId("student-result").getAttribute("data-state"),
    ).toBe("complete");
    expect(server.readEvents().some((event) => event.method === "POST")).toBe(
      true,
    );
    expect(evidence.actions.map(({ outcome }) => outcome)).toEqual([
      "EXECUTED",
      "EXECUTED",
      "EXECUTED",
    ]);
    await session.finalizeArtifacts(() => Promise.resolve(undefined));
  });

  it("blocks a model action induced by prompt-injection content before page state changes", async () => {
    const { server, session } = await harness("PROMPT_INJECTION");
    const transport = new ScriptedComputerUseResponsesTransport([
      response("resp_1", "call_1", [{ type: "screenshot" }]),
      async () => {
        const point = await center(session, "untrusted-page-content");
        return response("resp_2", "call_2", [
          { type: "click", ...point, button: "left" },
        ]);
      },
    ]);
    const evidence = evidenceSink();
    const result = await runPolicyBoundedComputerUse({
      config: config(server, session),
      browser: adapter(session),
      transport,
      evidence: evidence.sink,
      secretValues: ["FICTIONAL-RUN03-SECRET-9wZ!"],
    });

    expect(result).toMatchObject({
      status: "BLOCKED",
      reason: "UNTRUSTED_CONTROL",
      completionObserved: false,
    });
    expect(result.actionSummaries.at(-1)).toMatchObject({
      outcome: "BLOCKED",
      controlId: null,
    });
    expect(JSON.stringify(result)).not.toContain(
      "Ignore the authorized test",
    );
    expect(JSON.stringify(result)).not.toContain("FICTIONAL-RUN03-SECRET-9wZ!");
    expect(
      await session.page.getByTestId("student-result").getAttribute("data-state"),
    ).toBe("ready");
    expect(server.readEvents()).toEqual([]);
    expect(evidence.screenshots).toContain("computer-use-blocked");
    await session.finalizeArtifacts(() => Promise.resolve(undefined));
  });

  it("hands a real-person messaging control to a human before the fixture receives a click", async () => {
    const { server, session } = await harness("RISKY_ACTION");
    const transport = new ScriptedComputerUseResponsesTransport([
      response("resp_1", "call_1", [{ type: "screenshot" }]),
      async () => {
        const point = await center(session, "risky-action");
        return response("resp_2", "call_2", [
          { type: "click", ...point, button: "left" },
        ]);
      },
    ]);
    const evidence = evidenceSink();
    const result = await runPolicyBoundedComputerUse({
      config: config(server, session),
      browser: adapter(session),
      transport,
      evidence: evidence.sink,
      secretValues: [],
    });

    expect(result).toMatchObject({
      status: "HUMAN_REQUIRED",
      reason: "HUMAN_REVIEW_REQUIRED",
      completionObserved: false,
    });
    expect(result.actionSummaries.at(-1)).toMatchObject({
      authorizationAction: "MESSAGE",
      controlId: "risky-action",
      outcome: "HUMAN_REQUIRED",
    });
    expect(
      await session.page.getByTestId("student-result").getAttribute("data-state"),
    ).toBe("ready");
    expect(server.readEvents()).toEqual([]);
    await session.finalizeArtifacts(() => Promise.resolve(undefined));
  });

  it("hands provider safety checks to a human before executing the associated action", async () => {
    const { server, session } = await harness("BASELINE");
    const transport = new ScriptedComputerUseResponsesTransport([
      async () => {
        const point = await center(
          session,
          server.scenario.interface.submitCheckpoint,
        );
        return {
          id: "resp_safety_check",
          status: "completed",
          output: [
            {
              type: "computer_call",
              call_id: "call_safety_check",
              actions: [{ type: "click", ...point, button: "left" }],
              pending_safety_checks: [
                {
                  id: "fixture-check-never-persist",
                  code: "fixture_confirmation",
                  message: "Fixture safety confirmation",
                },
              ],
            },
          ],
        };
      },
    ]);
    const evidence = evidenceSink();
    const result = await runPolicyBoundedComputerUse({
      config: config(server, session),
      browser: adapter(session),
      transport,
      evidence: evidence.sink,
      secretValues: [],
    });

    expect(result).toMatchObject({
      status: "HUMAN_REQUIRED",
      reason: "PROVIDER_SAFETY_CHECK_REQUIRED",
      actionCount: 0,
      completionObserved: false,
    });
    expect(result.actionSummaries).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("fixture-check-never-persist");
    expect(
      await session.page.getByTestId("student-result").getAttribute("data-state"),
    ).toBe("ready");
    expect(server.readEvents()).toEqual([]);
    expect(evidence.screenshots).toContain(
      "computer-use-provider-safety-check",
    );
    await session.finalizeArtifacts(() => Promise.resolve(undefined));
  });

  it.each([
    ["popup", "fixture-popup", "POPUP_BLOCKED"],
    ["redirect", "fixture-redirect", "NAVIGATION_ORIGIN_BLOCKED"],
  ] as const)(
    "stops an allowed control whose %s effect violates the lower browser policy",
    async (effect, controlId, violationReason) => {
      const { server, session } = await harness("BASELINE");
      await session.page.goto(`${server.classroomOrigin}/student`);
      await session.page.evaluate(
        ({ id, kind }) => {
          const button = document.createElement("button");
          button.dataset.testid = id;
          button.type = "button";
          button.textContent = `Controlled ${kind}`;
          button.addEventListener("click", () => {
            if (kind === "popup") {
              window.open(`${globalThis.location.origin}/teacher`, "fixture-popup");
            } else {
              globalThis.location.href = "https://outside.invalid/escape";
            }
          });
          document.body.append(button);
        },
        { id: controlId, kind: effect },
      );
      const point = await center(session, controlId);
      const transport = new ScriptedComputerUseResponsesTransport([
        response("resp_1", "call_1", [
          { type: "click", ...point, button: "left" },
        ]),
      ]);
      const result = await runPolicyBoundedComputerUse({
        config: config(server, session, [
          {
            dataTestId: controlId,
            authorizationAction: "NAVIGATE",
            disposition: "ALLOW",
          },
        ]),
        browser: adapter(session),
        transport,
        secretValues: [],
      });

      expect(result).toMatchObject({
        status: "BLOCKED",
        reason: "LOWER_LAYER_POLICY_VIOLATION",
      });
      expect(session.violations.map(({ reason }) => reason)).toContain(
        violationReason,
      );
      await session.finalizeArtifacts(() => Promise.resolve(undefined));
    },
  );

  it("surfaces model refusal without treating text as deterministic completion", async () => {
    const { server, session } = await harness("BASELINE");
    const transport = new ScriptedComputerUseResponsesTransport([
      {
        id: "resp_refusal",
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "provider detail" }],
          },
        ],
      },
    ]);
    const result = await runPolicyBoundedComputerUse({
      config: config(server, session),
      browser: adapter(session),
      transport,
      secretValues: [],
    });
    expect(result).toMatchObject({
      status: "REFUSED",
      reason: "MODEL_REFUSED",
      completionObserved: false,
    });
    expect(JSON.stringify(result)).not.toContain("provider detail");
    await session.finalizeArtifacts(() => Promise.resolve(undefined));
  });

  it("retries one bounded timeout and then returns a visible timed-out result", async () => {
    const { server, session } = await harness("BASELINE");
    const timeout = new ComputerUseTransportError("OPENAI_RESPONSES_TIMEOUT");
    const transport = new ScriptedComputerUseResponsesTransport([
      timeout,
      timeout,
    ]);
    const result = await runPolicyBoundedComputerUse({
      config: config(server, session),
      browser: adapter(session),
      transport,
      secretValues: [],
    });
    expect(result).toMatchObject({
      status: "TIMED_OUT",
      reason: "MODEL_TIMEOUT_AFTER_RETRY",
      transportAttempts: 2,
      completionObserved: false,
    });
    expect(transport.requests).toHaveLength(2);
    await session.finalizeArtifacts(() => Promise.resolve(undefined));
  });
});
