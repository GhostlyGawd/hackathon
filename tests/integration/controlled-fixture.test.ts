import { request } from "node:http";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  FIXTURE_DPA,
  FIXTURE_VERSIONS,
  createFixtureScenario,
  createSubmissionPlan,
  fixtureDispatchSchema,
  fixtureSubmissionPlanSchema,
  startFixtureServer,
  type ControlledFixtureServer,
  type FixtureDispatch,
  type FixtureSubmissionPlan,
  type FixtureVersion,
} from "../../apps/fixture/src/index";

type FixtureSubmissionResponse = Omit<FixtureSubmissionPlan, "dispatches"> & {
  readonly dispatches: readonly (FixtureDispatch & { readonly url: string })[];
};

function recordValue(candidate: unknown): Record<string, unknown> {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate)
  ) {
    throw new TypeError("Expected an object record");
  }
  return candidate as Record<string, unknown>;
}

function stringValue(candidate: unknown): string {
  if (typeof candidate !== "string") throw new TypeError("Expected a string");
  return candidate;
}

function stringArray(candidate: unknown): readonly string[] {
  if (!Array.isArray(candidate)) throw new TypeError("Expected a string array");
  return candidate.map((value) => stringValue(value));
}

interface GroundTruthEntry {
  readonly version: FixtureVersion;
  readonly journey: "STUDENT_SUBMISSION" | "RISKY_ACTION";
  readonly expectedBoundedResult: string;
  readonly expectedEventCount: number;
  readonly expectedDestinations: readonly string[];
  readonly exactStudentEmailDestinations: readonly string[];
  readonly unsupportedTransformDestinations: readonly string[];
  readonly captureVisible: boolean | null;
  readonly dispatchesRealWorldAction: false;
}

async function readGroundTruth(): Promise<{
  readonly applicationEvaluatorAccess: false;
  readonly versions: readonly GroundTruthEntry[];
}> {
  const candidate: unknown = JSON.parse(
    await readFile(
      "apps/fixture/ground-truth/fixture-ground-truth.json",
      "utf8",
    ),
  );
  const value = recordValue(candidate);
  if (value.applicationEvaluatorAccess !== false || !Array.isArray(value.versions)) {
    throw new TypeError("Invalid controlled fixture ground-truth manifest");
  }
  const versions = value.versions.map((entryCandidate): GroundTruthEntry => {
    const entry = recordValue(entryCandidate);
    const version = stringValue(entry.version);
    if (!FIXTURE_VERSIONS.includes(version as FixtureVersion)) {
      throw new TypeError(`Unknown fixture version ${version}`);
    }
    const journey = stringValue(entry.journey);
    if (journey !== "STUDENT_SUBMISSION" && journey !== "RISKY_ACTION") {
      throw new TypeError(`Unknown fixture journey ${journey}`);
    }
    if (!Number.isInteger(entry.expectedEventCount)) {
      throw new TypeError("Expected an integer event count");
    }
    if (
      entry.captureVisible !== null &&
      typeof entry.captureVisible !== "boolean"
    ) {
      throw new TypeError("Expected captureVisible to be boolean or null");
    }
    if (entry.dispatchesRealWorldAction !== false) {
      throw new TypeError("The fixture cannot dispatch a real-world action");
    }
    return {
      version: version as FixtureVersion,
      journey,
      expectedBoundedResult: stringValue(entry.expectedBoundedResult),
      expectedEventCount: entry.expectedEventCount as number,
      expectedDestinations: stringArray(entry.expectedDestinations),
      exactStudentEmailDestinations: stringArray(
        entry.exactStudentEmailDestinations,
      ),
      unsupportedTransformDestinations: stringArray(
        entry.unsupportedTransformDestinations,
      ),
      captureVisible: entry.captureVisible,
      dispatchesRealWorldAction: false,
    };
  });
  return { applicationEvaluatorAccess: false, versions };
}

function submissionResponse(candidate: unknown): FixtureSubmissionResponse {
  const value = recordValue(candidate);
  if (!Array.isArray(value.dispatches)) {
    throw new TypeError("Expected dispatches to be an array");
  }
  const dispatches = value.dispatches.map((dispatchCandidate) => {
    const dispatchValue = recordValue(dispatchCandidate);
    const dispatch = fixtureDispatchSchema.parse({
      destinationHost: dispatchValue.destinationHost,
      method: dispatchValue.method,
      path: dispatchValue.path,
      transform: dispatchValue.transform,
      body: dispatchValue.body,
    });
    return { ...dispatch, url: stringValue(dispatchValue.url) };
  });
  const plan = fixtureSubmissionPlanSchema.parse({
    fixtureRunId: value.fixtureRunId,
    terminalStatus: value.terminalStatus,
    httpStatus: value.httpStatus,
    captureVisibility: value.captureVisibility,
    visibilityReason: value.visibilityReason,
    failureReason: value.failureReason,
    dispatches: dispatches.map(({ url: _url, ...dispatch }) => dispatch),
  });
  return { ...plan, dispatches };
}

const servers: ControlledFixtureServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function start(
  version: (typeof FIXTURE_VERSIONS)[number],
): Promise<ControlledFixtureServer> {
  const server = await startFixtureServer({
    host: "127.0.0.1",
    port: 0,
    seed: "integration-seed-20260721",
    version,
  });
  servers.push(server);
  return server;
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sendDispatch(
  server: ControlledFixtureServer,
  dispatch: FixtureDispatch & { readonly url: string },
): Promise<number> {
  const serverUrl = new URL(server.origin);
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(dispatch.body);
    const outbound = request(
      {
        hostname: serverUrl.hostname,
        port: serverUrl.port,
        path: dispatch.path,
        method: dispatch.method,
        headers: {
          host: `${dispatch.destinationHost}:${serverUrl.port}`,
          origin: server.classroomOrigin,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode ?? 0));
      },
    );
    outbound.once("error", reject);
    outbound.end(body);
  });
}

describe("controlled fixture HTTP boundary", () => {
  it("serves the fictional scenario and DPA while every ground-truth route stays unavailable", async () => {
    const server = await start("BASELINE");

    const health = await fetch(`${server.origin}/health`);
    expect(health.status).toBe(200);

    const scenarioResponse = await fetch(`${server.origin}/api/fixture`);
    expect(scenarioResponse.status).toBe(200);
    expect(scenarioResponse.headers.get("cache-control")).toContain("no-store");
    const scenarioText = await scenarioResponse.text();
    expect(JSON.parse(scenarioText)).toEqual(server.scenario);
    expect(scenarioText).not.toMatch(
      /ground.?truth|expectedBoundedResult|WITNESSED_CONFLICT/iu,
    );

    const dpa = await fetch(`${server.origin}/fixture-dpa.txt`);
    expect(dpa.status).toBe(200);
    expect(await dpa.text()).toBe(FIXTURE_DPA.text);
    expect(
      await readFile(
        "apps/fixture/assets/pactwire-classroom-fixture-dpa.txt",
        "utf8",
      ),
    ).toBe(FIXTURE_DPA.text);

    for (const path of [
      "/__ground-truth",
      "/ground-truth/fixture-ground-truth.json",
      "/api/expected-result",
    ]) {
      const response = await fetch(`${server.origin}${path}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        code: "NOT_FOUND",
        message: "Fixture resource not found.",
      });
    }

    const packageJsonCandidate: unknown = JSON.parse(
      await readFile("apps/fixture/package.json", "utf8"),
    );
    const packageJson = recordValue(packageJsonCandidate);
    expect(Object.keys(recordValue(packageJson.exports))).toEqual(["."]);
    const groundTruth = await readGroundTruth();
    expect(groundTruth.applicationEvaluatorAccess).toBe(false);
    expect(groundTruth.versions.map(({ version }) => version)).toEqual(FIXTURE_VERSIONS);
  });

  it("turns a fictional submission into real destination-specific requests and an observed event ledger", async () => {
    const server = await start("REGRESSION");
    const response = await postJson(`${server.origin}/api/submissions`, {
      studentEmail: server.scenario.personas.student.email,
      submission: server.scenario.submission.response,
    });

    expect(response.status).toBe(200);
    const body = submissionResponse(await response.json());
    expect(body).toMatchObject(createSubmissionPlan(server.scenario));
    expect(body.dispatches).toHaveLength(2);
    const [classroomDispatch, analyticsDispatch] = body.dispatches;
    if (!classroomDispatch || !analyticsDispatch) {
      throw new TypeError("Regression mode requires two dispatches");
    }
    expect(classroomDispatch.url).toMatch(
      /^http:\/\/classroom-service\.pactwire\.test:\d+\/collect$/u,
    );
    expect(analyticsDispatch.url).toMatch(
      /^http:\/\/fixture-analytics\.pactwire\.test:\d+\/collect$/u,
    );

    for (const dispatch of body.dispatches) {
      expect(await sendDispatch(server, dispatch)).toBe(204);
    }

    expect(server.readEvents()).toEqual([
      expect.objectContaining({
        sequence: 1,
        destinationHost: "classroom-service.pactwire.test",
        body: {
          studentEmail: server.scenario.personas.student.email,
          submission: server.scenario.submission.response,
        },
        captureVisible: true,
      }),
      expect.objectContaining({
        sequence: 2,
        destinationHost: "fixture-analytics.pactwire.test",
        body: {
          event: "submission_completed",
          studentEmail: server.scenario.personas.student.email,
        },
        captureVisible: true,
      }),
    ]);
  });

  it("fails closed for non-fictional input, risky actions, outages, and declared capture loss", async () => {
    const baseline = await start("BASELINE");
    const realLooking = await postJson(`${baseline.origin}/api/submissions`, {
      studentEmail: "student@real-school.example",
      submission: baseline.scenario.submission.response,
    });
    expect(realLooking.status).toBe(422);
    expect(await realLooking.json()).toEqual({
      code: "FICTIONAL_INPUT_REQUIRED",
      message: "Use only the seeded fictional identity and submission.",
    });
    expect(baseline.readEvents()).toEqual([]);

    const risky = await start("RISKY_ACTION");
    const riskyResponse = await postJson(`${risky.origin}/api/risky-actions`, {
      action: "MESSAGE_REAL_PERSON",
    });
    expect(riskyResponse.status).toBe(409);
    expect(await riskyResponse.json()).toMatchObject({
      status: "HUMAN_REQUIRED",
      reasonCode: "REAL_WORLD_ACTION",
      dispatches: [],
    });
    expect(risky.readEvents()).toEqual([]);

    const failure = await start("FAILURE");
    const failedSubmission = await postJson(
      `${failure.origin}/api/submissions`,
      {
        studentEmail: failure.scenario.personas.student.email,
        submission: failure.scenario.submission.response,
      },
    );
    expect(failedSubmission.status).toBe(503);
    expect(await failedSubmission.json()).toMatchObject({
      terminalStatus: "FAILED",
      failureReason: "FIXTURE_SUBMISSION_UNAVAILABLE",
      dispatches: [],
    });

    const invisible = await start("INVISIBLE");
    const invisibleResponse = await postJson(
      `${invisible.origin}/api/submissions`,
      {
        studentEmail: invisible.scenario.personas.student.email,
        submission: invisible.scenario.submission.response,
      },
    );
    expect(invisibleResponse.status).toBe(200);
    expect(await invisibleResponse.json()).toMatchObject({
      captureVisibility: "UNAVAILABLE",
      visibilityReason: "REQUIRED_SUBMISSION_CAPTURE_UNAVAILABLE",
    });
  });

  it("keeps the independent oracle aligned with every seeded mechanism without exporting its expected result", async () => {
    const groundTruth = await readGroundTruth();
    for (const expected of groundTruth.versions) {
      const scenario = createFixtureScenario({
        seed: "oracle-alignment-20260721",
        version: expected.version,
      });
      const plan = createSubmissionPlan(scenario);
      const dispatches = expected.journey === "RISKY_ACTION" ? [] : plan.dispatches;
      expect(dispatches).toHaveLength(expected.expectedEventCount);
      expect(dispatches.map(({ destinationHost }) => destinationHost)).toEqual(
        expected.expectedDestinations,
      );
      expect(
        dispatches
          .filter(
            ({ body }) =>
              body.studentEmail === scenario.personas.student.email,
          )
          .map(({ destinationHost }) => destinationHost),
      ).toEqual(expected.exactStudentEmailDestinations);
      expect(
        dispatches
          .filter(({ transform }) => transform === "UNSUPPORTED_OPAQUE")
          .map(({ destinationHost }) => destinationHost),
      ).toEqual(expected.unsupportedTransformDestinations);
      expect(
        dispatches.length === 0
          ? null
          : plan.captureVisibility === "VISIBLE",
      ).toBe(expected.captureVisible);
      expect(expected.dispatchesRealWorldAction).toBe(false);
    }
  });
});
