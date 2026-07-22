import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as resetFixture } from "../../app/api/demo/reset/route";
import { POST as createSession } from "../../app/api/demo/session/route";
import { GET as getRunPreview } from "../../app/api/demo/run-preview/route";
import { GET as getRuns } from "../../app/api/workspaces/[workspaceId]/runs/route";
import { POST as stopRun } from "../../app/api/workspaces/[workspaceId]/runs/[runId]/stop/route";
import { fixtureWorkspaceIds } from "../../lib/access-fixture";

const workspaceId = fixtureWorkspaceIds.cedarRidge;
const runsPath = `/api/workspaces/${workspaceId}/runs`;
const routeContext = { params: Promise.resolve({ workspaceId }) };

function request(
  pathname: string,
  options: {
    readonly body?: unknown;
    readonly cookie?: string;
    readonly method?: string;
  } = {},
): NextRequest {
  return new NextRequest(`http://pactwire.test${pathname}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json" }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
}

async function signIn(
  userKey: "officer" | "operator" | "reviewer",
): Promise<string> {
  const response = await createSession(
    request("/api/demo/session", {
      method: "POST",
      body: { userKey },
    }),
  );
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

beforeEach(() => {
  expect(resetFixture().status).toBe(200);
});

describe("UX-03 live run review HTTP boundary", () => {
  it("serves the real controlled-fixture frame only inside a signed session", async () => {
    const denied = await getRunPreview(request("/api/demo/run-preview"));
    expect(denied.status).toBe(401);

    const cookie = await signIn("reviewer");
    const response = await getRunPreview(
      request("/api/demo/run-preview", { cookie }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
  });

  it("returns an active run with separate model-action and recorder-event facts", async () => {
    const cookie = await signIn("officer");
    const response = await getRuns(request(runsPath, { cookie }), routeContext);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    const active = body.runs.find(
      ({ run }: { readonly run: { readonly state: string } }) =>
        run.state === "RUNNING",
    );

    expect(active).toMatchObject({
      live: {
        journeyName: "Student submits fictional assignment",
        role: "STUDENT",
        allowedScope: {
          origins: ["https://classroom.pactwire.test"],
          actions: ["NAVIGATE", "CLICK", "TYPE"],
        },
        modelAction: {
          summary: "Submit the fictional student's saved response.",
          isChainOfThought: false,
        },
        recorderEvent: {
          source: "NETWORK",
          summary:
            "Observed POST /api/submissions to classroom.pactwire.test.",
        },
      },
    });
    expect(active.live.modelAction).not.toHaveProperty("reasoning");
    expect(active.live.recorderEvent).not.toHaveProperty("requestBody");
  });

  it("lets an authorized operator stop the active run and preserves bounded coverage", async () => {
    const cookie = await signIn("operator");
    const before = await getRuns(request(runsPath, { cookie }), routeContext);
    const beforeBody = await before.json();
    const active = beforeBody.runs.find(
      ({ run }: { readonly run: { readonly state: string } }) =>
        run.state === "RUNNING",
    );
    expect(active?.run.id).toBeTypeOf("string");

    const response = await stopRun(
      request(`${runsPath}/${active.run.id}/stop`, {
        cookie,
        method: "POST",
      }),
      { params: Promise.resolve({ workspaceId, runId: active.run.id }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      run: { id: active.run.id, state: "CANCELED" },
      manifest: {
        terminalStatus: "CANCELED",
        checkpointCoverage: [
          { checkpointId: "submission-request", status: "VERIFIED" },
          { checkpointId: "completion-visible", status: "NOT_TESTED" },
        ],
        missingCoverage: [
          { checkpointId: "completion-visible", status: "NOT_TESTED" },
        ],
      },
    });

    const after = await getRuns(request(runsPath, { cookie }), routeContext);
    const afterBody = await after.json();
    const stopped = afterBody.runs.find(
      ({ run }: { readonly run: { readonly id: string } }) =>
        run.id === active.run.id,
    );
    expect(stopped.run.state).toBe("CANCELED");
    expect(stopped).not.toHaveProperty("live");
  });

  it("denies stop control to a reviewer at the server boundary", async () => {
    const cookie = await signIn("reviewer");
    const before = await getRuns(request(runsPath, { cookie }), routeContext);
    const beforeBody = await before.json();
    const active = beforeBody.runs.find(
      ({ run }: { readonly run: { readonly state: string } }) =>
        run.state === "RUNNING",
    );

    const response = await stopRun(
      request(`${runsPath}/${active.run.id}/stop`, {
        cookie,
        method: "POST",
      }),
      { params: Promise.resolve({ workspaceId, runId: active.run.id }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "PERMISSION_DENIED",
        auditRecorded: true,
      },
    });
  });
});
