import { afterEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import {
  startFixtureServer,
  type ControlledFixtureServer,
  type FixtureVersion,
} from "../../apps/fixture/src/index";
import {
  createPlaywrightReplayAdapter,
  executeDeterministicReplay,
} from "../../apps/runner/src/index";
import { makeReplayVersion } from "../helpers/deterministic-replay-fixtures";

const browsers: Browser[] = [];
const contexts: BrowserContext[] = [];
const servers: ControlledFixtureServer[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
  await Promise.all(browsers.splice(0).map((browser) => browser.close()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function harness(version: FixtureVersion, seed: string) {
  const server = await startFixtureServer({
    host: "127.0.0.1",
    port: 0,
    seed,
    version,
  });
  servers.push(server);
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--host-resolver-rules=MAP *.pactwire.test 127.0.0.1,EXCLUDE localhost",
    ],
  });
  browsers.push(browser);
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  return { page, server };
}

function bindingValues(server: ControlledFixtureServer) {
  return {
    "student-email-value": server.scenario.personas.student.email,
    "student-response-value": server.scenario.submission.response,
  };
}

describe("human-authored deterministic replay against the controlled fixture", () => {
  it("reruns the baseline with current seeded values and no model interpretation", async () => {
    const { page, server } = await harness(
      "BASELINE",
      "jrn-03-integration-baseline",
    );
    const replay = makeReplayVersion();
    const outcome = await executeDeterministicReplay({
      replay,
      snapshot: replay.snapshot,
      baseUrl: server.classroomOrigin,
      bindingValues: bindingValues(server),
      adapter: createPlaywrightReplayAdapter(page, { timeoutMs: 5_000 }),
    });

    expect(outcome).toMatchObject({
      state: "COMPLETED",
      arm: "HUMAN_AUTHORED_DETERMINISTIC",
      modelInvocationCount: 0,
      checkpoints: [
        { checkpointId: "submission-request", required: true, status: "VERIFIED" },
      ],
    });
    expect(server.readEvents()).toEqual([
      expect.objectContaining({
        destinationHost: "classroom-service.pactwire.test",
        method: "POST",
        path: "/collect",
        body: {
          studentEmail: server.scenario.personas.student.email,
          submission: server.scenario.submission.response,
        },
        captureVisible: true,
      }),
    ]);
    expect(await page.getByTestId("student-result").getAttribute("data-state")).toBe(
      "complete",
    );
  });

  it("stops the frozen baseline as drifted when the old route and checkpoint move", async () => {
    const { page, server } = await harness(
      "INTERFACE_DRIFT",
      "jrn-03-integration-drift",
    );
    const replay = makeReplayVersion();
    const outcome = await executeDeterministicReplay({
      replay,
      snapshot: replay.snapshot,
      baseUrl: server.classroomOrigin,
      bindingValues: bindingValues(server),
      adapter: createPlaywrightReplayAdapter(page, { timeoutMs: 5_000 }),
    });

    expect(outcome.state).toBe("DRIFTED");
    expect(outcome.trace).toEqual([
      expect.objectContaining({
        operationId: "open-student-workspace",
        status: "DRIFTED",
        reasonCode: "NAVIGATION_STATUS_MISMATCH",
      }),
    ]);
    expect(outcome.checkpoints).toEqual([
      {
        checkpointId: "submission-request",
        required: true,
        status: "NOT_REACHED",
      },
    ]);
    expect(server.readEvents()).toEqual([]);
    const driftMessage = page.getByText("The student checkpoint moved", {
      exact: true,
    });
    await driftMessage.waitFor();
    expect(await driftMessage.isVisible()).toBe(true);
  });

  it("does not let a same-path response from another origin satisfy a checkpoint", async () => {
    const { page, server } = await harness(
      "BASELINE",
      "jrn-03-authorized-origin",
    );
    const otherServer = await startFixtureServer({
      host: "127.0.0.1",
      port: 0,
      seed: "jrn-03-other-origin",
      version: "BASELINE",
    });
    servers.push(otherServer);
    const adapter = createPlaywrightReplayAdapter(page, { timeoutMs: 150 });

    await page.goto(`${otherServer.classroomOrigin}/student`);
    await page
      .getByTestId("student-response")
      .fill(otherServer.scenario.submission.response);
    await Promise.all([
      page.waitForResponse(
        (response) =>
          new URL(response.url()).origin === otherServer.classroomOrigin &&
          new URL(response.url()).pathname === "/api/submissions",
      ),
      page.getByTestId("submit-assignment").click(),
    ]);
    await page.goto(`${server.classroomOrigin}/student`);

    await expect(
      adapter.execute(
        {
          operationId: "authorized-submission-checkpoint",
          kind: "CHECKPOINT",
          checkpointId: "submission-request",
          assertion: {
            kind: "RESPONSE",
            method: "POST",
            path: "/api/submissions",
            status: 200,
          },
        },
        { baseUrl: server.classroomOrigin },
      ),
    ).resolves.toEqual({
      status: "DRIFTED",
      reasonCode: "CHECKPOINT_MISSING",
    });
  });

  it("consumes a response checkpoint so one request cannot prove two observations", async () => {
    const { page, server } = await harness(
      "BASELINE",
      "jrn-03-single-response",
    );
    const adapter = createPlaywrightReplayAdapter(page, { timeoutMs: 150 });
    const checkpoint = {
      operationId: "submission-checkpoint",
      kind: "CHECKPOINT" as const,
      checkpointId: "submission-request",
      assertion: {
        kind: "RESPONSE" as const,
        method: "POST" as const,
        path: "/api/submissions",
        status: 200,
      },
    };

    await page.goto(`${server.classroomOrigin}/student`);
    await page
      .getByTestId("student-response")
      .fill(server.scenario.submission.response);
    await Promise.all([
      page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/submissions",
      ),
      page.getByTestId("submit-assignment").click(),
    ]);

    await expect(
      adapter.execute(checkpoint, { baseUrl: server.classroomOrigin }),
    ).resolves.toEqual({ status: "COMPLETED" });
    await expect(
      adapter.execute(
        { ...checkpoint, operationId: "second-submission-checkpoint" },
        { baseUrl: server.classroomOrigin },
      ),
    ).resolves.toEqual({
      status: "DRIFTED",
      reasonCode: "CHECKPOINT_MISSING",
    });
  });
});
