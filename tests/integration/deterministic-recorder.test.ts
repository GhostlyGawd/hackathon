import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  startFixtureServer,
  type ControlledFixtureServer,
  type FixtureVersion,
} from "../../apps/fixture/src/index";
import {
  DeterministicBrowserRecorder,
  networkObservationFactsSchema,
  type DeterministicRecorderReport,
} from "../../apps/runner/src/deterministic-recorder";
import {
  BrowserIsolationManager,
  type IsolatedBrowserSession,
} from "../../apps/runner/src/isolated-browser";

const managers: BrowserIsolationManager[] = [];
const servers: ControlledFixtureServer[] = [];
const temporaryRoots: string[] = [];
const workspaceId = "11111111-1111-4111-8111-111111111111";

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.shutdown()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function fixture(version: FixtureVersion, seed: string) {
  const server = await startFixtureServer({
    host: "127.0.0.1",
    port: 0,
    seed,
    version,
  });
  servers.push(server);
  return server;
}

function isolationManager() {
  const manager = new BrowserIsolationManager({
    launchArgs: [
      "--host-resolver-rules=MAP *.pactwire.test 127.0.0.1,EXCLUDE localhost",
    ],
  });
  managers.push(manager);
  return manager;
}

async function runContext(
  version: FixtureVersion,
  runId: string,
  options: { readonly includeOptionalAuthorizedField?: boolean } = {},
) {
  const server = await fixture(version, `run-02-${version.toLowerCase()}-20260721`);
  const manager = isolationManager();
  const session = await manager.startSession({
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
  });
  const artifactRoot = await mkdtemp(path.join(tmpdir(), "pactwire-recorder-test-"));
  temporaryRoots.push(artifactRoot);
  const recorder = await DeterministicBrowserRecorder.start({
    page: session.page,
    artifactDirectory: artifactRoot,
    config: {
      workspaceId,
      runId,
      captureMode: "BROWSER_CDP",
      authorizedRequestRules: [
        {
          host: "classroom-service.pactwire.test",
          method: "POST",
          path: "/collect",
          fields: [
            "studentEmail",
            "submission",
            ...(options.includeOptionalAuthorizedField
              ? ["optionalMetadata"]
              : []),
          ],
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
      secrets: ["FICTIONAL-RUNNER-SECRET-123456"],
    },
  });
  return { artifactRoot, manager, recorder, server, session };
}

async function submitStudent(
  session: IsolatedBrowserSession,
  recorder: DeterministicBrowserRecorder,
) {
  await session.page.goto(new URL("/student", session.page.url()).toString());
  await recorder.captureStorageChanges("before-submission");
  await recorder.recordAction({
    actionId: "submit-fictional-response",
    actor: "DETERMINISTIC",
    kind: "CLICK",
    summary: "Submit the seeded fictional classroom response",
  });
  const completed = session.page
    .getByTestId("student-result")
    .getByText(/submission completed|declared capture gap/iu);
  await session.page.getByTestId("submit-assignment").click();
  await completed.waitFor();
  await session.page.evaluate(() =>
    localStorage.setItem("recorder-test-state", "fictional-complete"),
  );
  await recorder.captureStorageChanges("after-submission");
  await recorder.captureScreenshot("student-submission-result");
}

function networkFacts(report: DeterministicRecorderReport) {
  return report.observations
    .filter(({ source }) => source === "NETWORK")
    .map(({ facts }) => networkObservationFactsSchema.safeParse(facts))
    .filter((result) => result.success)
    .map((result) => result.data);
}

function isStudentSubmissionRequest(
  facts: ReturnType<typeof networkFacts>[number],
) {
  return (
    facts.request.host === "classroom-service.pactwire.test" &&
    facts.request.method === "POST" &&
    facts.request.path === "/collect"
  );
}

describe("real Chromium deterministic recording", () => {
  it("captures independently ordered browser, network, screenshot, action, response, and storage facts without raw bodies", async () => {
    const context = await runContext(
      "BASELINE",
      "22222222-2222-4222-8222-222222222222",
    );
    await context.session.page.goto(`${context.server.classroomOrigin}/student`);
    await submitStudent(context.session, context.recorder);
    const report = await context.recorder.stop();

    expect(report.captureMode).toBe("BROWSER_CDP");
    expect(report.visibility).toMatchObject({
      state: "VISIBLE",
      allRequiredVisible: true,
      checkpoints: [
        expect.objectContaining({
          checkpointId: "student-submission-request",
          exercised: true,
          visible: true,
        }),
      ],
    });
    expect(report.actions).toEqual([
      expect.objectContaining({
        actionId: "submit-fictional-response",
        actor: "DETERMINISTIC",
        kind: "CLICK",
      }),
    ]);
    expect(report.observations.map(({ sequence }) => sequence)).toEqual(
      report.observations.map((_, index) => index),
    );
    expect(report.observations.some(({ source }) => source === "BROWSER")).toBe(
      true,
    );
    expect(report.observations.some(({ source }) => source === "STORAGE")).toBe(
      true,
    );

    const request = networkFacts(report).find(isStudentSubmissionRequest);
    expect(request).toMatchObject({
      kind: "NETWORK_REQUEST",
      request: {
        method: "POST",
        host: "classroom-service.pactwire.test",
        path: "/collect",
        authorizedFields: [
          expect.objectContaining({ name: "studentEmail", present: true }),
          expect.objectContaining({ name: "submission", present: true }),
        ],
      },
    });
    expect(request?.request.initiator.type).toBe("script");
    expect(request?.response?.status).toBe(204);
    const expectedEmailHash = createHash("sha256")
      .update(JSON.stringify(context.server.scenario.personas.student.email))
      .digest("hex");
    expect(request?.request.authorizedFields[0]?.valueSha256).toBe(
      expectedEmailHash,
    );

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(context.server.scenario.personas.student.email);
    expect(serialized).not.toContain(context.server.scenario.submission.response);
    expect(serialized).not.toContain("FICTIONAL-RUNNER-SECRET-123456");
    expect(report.screenshots).toHaveLength(1);
    const screenshot = report.screenshots[0]!;
    const screenshotPath = path.join(context.artifactRoot, screenshot.artifactName);
    expect(existsSync(screenshotPath)).toBe(true);
    expect(createHash("sha256").update(await readFile(screenshotPath)).digest("hex"))
      .toBe(screenshot.sha256);
    expect(context.server.readEvents()).toHaveLength(1);

    await context.session.finalizeArtifacts(() => Promise.resolve());
  });

  it("classifies a forced required capture gap as NOT_VISIBLE even when a matching request is otherwise observed", async () => {
    const context = await runContext(
      "INVISIBLE",
      "33333333-3333-4333-8333-333333333333",
    );
    await context.session.page.goto(`${context.server.classroomOrigin}/student`);
    context.recorder.recordCaptureGap({
      source: "NETWORK",
      checkpointIds: ["student-submission-request"],
      reason: "INSTRUMENTATION_UNAVAILABLE",
      detail: "The required stream was deliberately disabled by the controlled harness.",
    });
    await submitStudent(context.session, context.recorder);
    const report = await context.recorder.stop();

    expect(
      networkFacts(report).some(isStudentSubmissionRequest),
    ).toBe(true);
    expect(report.visibility).toMatchObject({
      state: "NOT_VISIBLE",
      allRequiredVisible: false,
      checkpoints: [
        expect.objectContaining({
          exercised: true,
          visible: false,
          gapReasons: ["INSTRUMENTATION_UNAVAILABLE"],
        }),
      ],
    });
    expect(report.visibility.state).not.toBe("VISIBLE");
    expect(
      report.observations.some(
        ({ source, facts }) =>
          source === "RECORDER" &&
          JSON.stringify(facts).includes("INSTRUMENTATION_UNAVAILABLE"),
      ),
    ).toBe(true);

    await context.session.finalizeArtifacts(() => Promise.resolve());
  });

  it("keeps required visibility when only an allowed optional request field is absent", async () => {
    const context = await runContext(
      "BASELINE",
      "45454545-4545-4545-8545-454545454545",
      { includeOptionalAuthorizedField: true },
    );
    await context.session.page.goto(`${context.server.classroomOrigin}/student`);
    await submitStudent(context.session, context.recorder);
    const report = await context.recorder.stop();

    const request = networkFacts(report).find(isStudentSubmissionRequest);
    expect(request?.request.authorizedFieldCapture).toBe("MISSING_FIELDS");
    expect(request?.request.authorizedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "optionalMetadata", present: false }),
      ]),
    );
    expect(report.visibility).toMatchObject({
      state: "VISIBLE",
      allRequiredVisible: true,
    });

    await context.session.finalizeArtifacts(() => Promise.resolve());
  });

  it("marks an opaque required body uninspectable and keeps service workers blocked by the isolated context", async () => {
    const context = await runContext(
      "BASELINE",
      "44444444-4444-4444-8444-444444444444",
    );
    await context.session.page.goto(`${context.server.classroomOrigin}/student`);
    const serviceWorker = await context.session.page.evaluate(async () => {
      if (!("serviceWorker" in globalThis.navigator)) {
        return { available: false, registered: false, controlled: false };
      }
      try {
        await globalThis.navigator.serviceWorker.register(
          "/fixture-service-worker.js",
        );
        return {
          available: true,
          registered: true,
          controlled: globalThis.navigator.serviceWorker.controller !== null,
        };
      } catch {
        return {
          available: true,
          registered: false,
          controlled: globalThis.navigator.serviceWorker.controller !== null,
        };
      }
    });
    expect(serviceWorker.controlled).toBe(false);

    const fixturePort = new URL(context.server.classroomOrigin).port;
    await context.session.page.evaluate(async (url) => {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: new Uint8Array([1, 2, 3, 4]),
      }).catch(() => undefined);
    }, `http://classroom-service.pactwire.test:${fixturePort}/collect`);
    const report = await context.recorder.stop();

    expect(report.visibility).toMatchObject({
      state: "NOT_VISIBLE",
      checkpoints: [
        expect.objectContaining({
          exercised: true,
          visible: false,
        }),
      ],
    });
    expect(report.visibility.checkpoints[0]?.gapReasons).toContain(
      "REQUEST_FIELDS_UNINSPECTABLE",
    );
    expect(JSON.stringify(report)).not.toContain("opaque-ciphertext");
    expect(
      networkFacts(report).some(
        ({ response }) => response?.fromServiceWorker === true,
      ),
    ).toBe(false);

    await context.session.finalizeArtifacts(() => Promise.resolve());
  });
});
