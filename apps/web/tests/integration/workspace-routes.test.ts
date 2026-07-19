import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as resetFixture } from "../../app/api/demo/reset/route";
import { POST as createSession } from "../../app/api/demo/session/route";
import { POST as createWorkspace } from "../../app/api/workspaces/route";
import { GET as getWorkspace } from "../../app/api/workspaces/[workspaceId]/route";
import { GET as getAudit } from "../../app/api/workspaces/[workspaceId]/audit/route";
import { GET as exportWorkspace } from "../../app/api/workspaces/[workspaceId]/export/route";
import { POST as assignRole } from "../../app/api/workspaces/[workspaceId]/roles/route";
import { fixtureWorkspaceIds } from "../../lib/access-fixture";

interface RouteContext {
  readonly params: Promise<{ workspaceId: string }>;
}

function request(
  pathname: string,
  options: {
    readonly method?: string;
    readonly body?: unknown;
    readonly cookie?: string;
  } = {},
): NextRequest {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.cookie) headers.set("cookie", options.cookie);
  return new NextRequest(`http://pactwire.test${pathname}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
}

function context(workspaceId: string): RouteContext {
  return { params: Promise.resolve({ workspaceId }) };
}

async function signIn(userKey: "officer" | "operator"): Promise<string> {
  const response = await createSession(
    request("/api/demo/session", {
      method: "POST",
      body: { userKey },
    }),
  );
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie?.split(";", 1)[0] ?? "";
}

beforeEach(() => {
  expect(resetFixture().status).toBe(200);
});

describe("workspace authorization HTTP boundary", () => {
  it("requires a signed server session for workspace reads and creation", async () => {
    const readResponse = await getWorkspace(
      request(`/api/workspaces/${fixtureWorkspaceIds.cedarRidge}`),
      context(fixtureWorkspaceIds.cedarRidge),
    );
    const createResponse = await createWorkspace(
      request("/api/workspaces", {
        method: "POST",
        body: { name: "Fictional New District" },
      }),
    );

    expect(readResponse.status).toBe(401);
    expect(createResponse.status).toBe(401);
  });

  it("authorizes every restricted route from stored roles, not browser claims", async () => {
    const operatorCookie = await signIn("operator");
    const operatorRequest = (pathname: string, body?: unknown) =>
      request(pathname, {
        cookie: operatorCookie,
        ...(body === undefined ? {} : { body, method: "POST" }),
      });

    const readResponse = await getWorkspace(
      operatorRequest(`/api/workspaces/${fixtureWorkspaceIds.cedarRidge}`),
      context(fixtureWorkspaceIds.cedarRidge),
    );
    const auditResponse = await getAudit(
      operatorRequest(
        `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/audit`,
      ),
      context(fixtureWorkspaceIds.cedarRidge),
    );
    const exportResponse = await exportWorkspace(
      operatorRequest(
        `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/export`,
      ),
      context(fixtureWorkspaceIds.cedarRidge),
    );
    const roleResponse = await assignRole(
      operatorRequest(
        `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/roles`,
        {
          targetUserId: "fictional-target",
          role: "REVIEWER",
          clientClaimedRole: "PRIVACY_OFFICER",
        },
      ),
      context(fixtureWorkspaceIds.cedarRidge),
    );

    expect(readResponse.status).toBe(200);
    expect(auditResponse.status).toBe(403);
    expect(exportResponse.status).toBe(403);
    expect(roleResponse.status).toBe(403);
  });

  it("returns the same target-neutral response for cross-workspace reads and exports", async () => {
    const officerCookie = await signIn("officer");
    const readResponse = await getWorkspace(
      request(`/api/workspaces/${fixtureWorkspaceIds.harbor}`, {
        cookie: officerCookie,
      }),
      context(fixtureWorkspaceIds.harbor),
    );
    const exportResponse = await exportWorkspace(
      request(`/api/workspaces/${fixtureWorkspaceIds.harbor}/export`, {
        cookie: officerCookie,
      }),
      context(fixtureWorkspaceIds.harbor),
    );
    const bodies = `${await readResponse.text()}${await exportResponse.text()}`;

    expect(readResponse.status).toBe(404);
    expect(exportResponse.status).toBe(404);
    expect(bodies).toContain("Workspace not found or not available.");
    expect(bodies).not.toContain("Fictional Harbor School District");
    expect(bodies).not.toContain("Avery Stone");
  });

  it("creates a workspace with the authenticated human as privacy officer", async () => {
    const officerCookie = await signIn("officer");
    const response = await createWorkspace(
      request("/api/workspaces", {
        method: "POST",
        cookie: officerCookie,
        body: { name: "Fictional New District" },
      }),
    );
    const body = (await response.json()) as {
      readonly ownerAssignment: { readonly role: string; readonly userId: string };
    };

    expect(response.status).toBe(201);
    expect(body.ownerAssignment).toMatchObject({
      role: "PRIVACY_OFFICER",
      userId: "fictional-officer-a",
    });
  });

  it("returns a safe 400 for invalid role input", async () => {
    const officerCookie = await signIn("officer");
    const response = await assignRole(
      request(`/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/roles`, {
        method: "POST",
        cookie: officerCookie,
        body: { targetUserId: "fictional-target", role: "ROOT" },
      }),
      context(fixtureWorkspaceIds.cedarRidge),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST", auditRecorded: false },
    });
  });
});
