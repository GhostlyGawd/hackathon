import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as resetFixture } from "../../app/api/demo/reset/route";
import { POST as createSession } from "../../app/api/demo/session/route";
import {
  GET as listSoftware,
  POST as createSoftware,
} from "../../app/api/workspaces/[workspaceId]/software/route";
import {
  fixtureWorkspaceIds,
  getAccessRuntime,
} from "../../lib/access-fixture";

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
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

function importedSoftwareBody() {
  return {
    name: "Northstar Classroom (Fictional)",
    vendorName: "Northstar Learning Labs (Fictional)",
    authorizedTenantUrl: "https://cedar.northstar.invalid",
    districtOwner: "Curriculum and Instruction",
    knownVersion: "2026.7-fixture",
    approval: {
      state: "APPROVED",
      setBy: {
        kind: "IMPORTED_SYSTEM",
        actorId: "fictional-district-registry",
        displayName: "Fictional Cedar Ridge App Registry",
        source: "district inventory export",
      },
      reason: "Imported existing district approval record.",
      sourceReference: "AP-2042",
    },
  };
}

beforeEach(() => {
  expect(resetFixture().status).toBe(200);
});

describe("software inventory HTTP boundary", () => {
  it("creates and filters a record while returning explicit approval provenance", async () => {
    const cookie = await signIn("officer");
    const pathname = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software`;
    const created = await createSoftware(
      request(pathname, {
        method: "POST",
        cookie,
        body: importedSoftwareBody(),
      }),
      context(fixtureWorkspaceIds.cedarRidge),
    );
    const createdBody = (await created.json()) as {
      readonly item: {
        readonly software: {
          readonly approvalOrigin: {
            readonly setBy: { readonly kind: string; readonly displayName: string };
          };
        };
        readonly approvalDescription: {
          readonly heading: string;
          readonly isPactwireConclusion: boolean;
        };
      };
    };

    expect(created.status).toBe(201);
    expect(createdBody.item.software.approvalOrigin.setBy).toEqual(
      expect.objectContaining({
        kind: "IMPORTED_SYSTEM",
        displayName: "Fictional Cedar Ridge App Registry",
      }),
    );
    expect(createdBody.item.approvalDescription).toEqual(
      expect.objectContaining({
        heading: "Imported from Fictional Cedar Ridge App Registry",
        isPactwireConclusion: false,
      }),
    );
    expect(
      (await getAccessRuntime()).qualityTelemetry.report().analyticsEvents
        .SOFTWARE_RECORD_CREATED,
    ).toBe(1);

    const listed = await listSoftware(
      request(`${pathname}?approvalState=APPROVED&query=northstar`, { cookie }),
      context(fixtureWorkspaceIds.cedarRidge),
    );
    const listedBody = (await listed.json()) as { readonly items: readonly unknown[] };
    expect(listed.status).toBe(200);
    expect(listedBody.items).toHaveLength(1);
  });

  it("denies operator creation even when the browser claims a stronger role", async () => {
    const cookie = await signIn("operator");
    const pathname = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software`;
    const response = await createSoftware(
      request(pathname, {
        method: "POST",
        cookie,
        body: {
          ...importedSoftwareBody(),
          clientClaimedRole: "PRIVACY_OFFICER",
        },
      }),
      context(fixtureWorkspaceIds.cedarRidge),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PERMISSION_DENIED", auditRecorded: true },
    });
  });

  it("rejects an automated approval origin as invalid input", async () => {
    const cookie = await signIn("officer");
    const pathname = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software`;
    const body = importedSoftwareBody();
    const response = await createSoftware(
      request(pathname, {
        method: "POST",
        cookie,
        body: {
          ...body,
          approval: {
            ...body.approval,
            setBy: {
              kind: "AUTOMATION",
              actorId: "pactwire",
              component: "inventory-import",
            },
          },
        },
      }),
      context(fixtureWorkspaceIds.cedarRidge),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST", auditRecorded: false },
    });
  });

  it("returns a target-neutral response for another workspace's inventory", async () => {
    const cookie = await signIn("officer");
    const response = await listSoftware(
      request(
        `/api/workspaces/${fixtureWorkspaceIds.harbor}/software`,
        { cookie },
      ),
      context(fixtureWorkspaceIds.harbor),
    );
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(body).toContain("Workspace not found or not available.");
    expect(body).not.toContain("Fictional Harbor School District");
    expect(body).not.toContain("Avery Stone");
  });
});
