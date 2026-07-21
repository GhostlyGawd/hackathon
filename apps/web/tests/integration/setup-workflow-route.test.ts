import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as resetFixture } from "../../app/api/demo/reset/route";
import { POST as createSession } from "../../app/api/demo/session/route";
import { GET as readSetupWorkflow } from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/setup/route";
import { GET as listSoftware } from "../../app/api/workspaces/[workspaceId]/software/route";
import {
  fixtureUsers,
  fixtureWorkspaceIds,
  getAccessRuntime,
  principalForFixtureUser,
} from "../../lib/access-fixture";

function request(pathname: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(`http://pactwire.test${pathname}`, { headers });
}

function context(workspaceId: string, softwareId: string) {
  return { params: Promise.resolve({ workspaceId, softwareId }) };
}

async function signIn(): Promise<string> {
  const response = await createSession(
    new NextRequest("http://pactwire.test/api/demo/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userKey: "officer" }),
    }),
  );
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function seedSoftware(): Promise<string> {
  const runtime = await getAccessRuntime();
  const result = await runtime.inventoryService.createSoftware({
    principal: principalForFixtureUser(fixtureUsers.officer),
    workspaceId: fixtureWorkspaceIds.cedarRidge,
    name: "Northstar Classroom (Fictional)",
    vendorName: "Northstar Learning Labs (Fictional)",
    authorizedTenantUrl: "https://cedar.northstar.invalid/classroom",
    districtOwner: "Curriculum and Instruction",
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
  });
  return result.software.id;
}

beforeEach(() => {
  expect(resetFixture().status).toBe(200);
});

describe("setup workflow HTTP boundary", () => {
  it("returns six honest steps and refreshes from persisted authorization records", async () => {
    const cookie = await signIn();
    const softwareId = await seedSoftware();
    const pathname = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software/${softwareId}/setup`;

    const initial = await readSetupWorkflow(
      request(pathname, cookie),
      context(fixtureWorkspaceIds.cedarRidge, softwareId),
    );
    const initialBody = (await initial.json()) as {
      readonly workflow: {
        readonly steps: readonly { readonly id: string; readonly status: string }[];
        readonly statusProvenance: {
          readonly sourceLabel: string;
          readonly isPactwireConclusion: boolean;
        };
      };
    };

    expect(initial.status).toBe(200);
    expect(initial.headers.get("cache-control")).toBe("private, no-store");
    expect(initialBody.workflow.steps).toHaveLength(6);
    expect(initialBody.workflow.steps[1]).toMatchObject({
      id: "authorization",
      status: "ACTION_REQUIRED",
    });
    expect(initialBody.workflow.statusProvenance).toEqual(
      expect.objectContaining({
        sourceLabel: "Imported from Fictional Cedar Ridge App Registry",
        isPactwireConclusion: false,
      }),
    );

    const runtime = await getAccessRuntime();
    await runtime.testAuthorizationService.createAuthorization({
      principal: principalForFixtureUser(fixtureUsers.officer),
      workspaceId: fixtureWorkspaceIds.cedarRidge,
      softwareId,
      authorityBasis: "District-owned fictional training tenant.",
      validFrom: "2026-07-19T20:00:00.000Z",
      reviewAt: "2026-07-20T20:00:00.000Z",
      expiresAt: "2026-07-21T20:00:00.000Z",
      allowedBaseUrl: "https://cedar.northstar.invalid/classroom",
      allowedSupportingDomains: ["assets.northstar.invalid"],
      allowedActions: ["NAVIGATE", "SUBMIT"],
      prohibitedActions: ["DELETE", "PURCHASE", "MESSAGE"],
      redirectPolicy: "ALLOW_LISTED_ONLY",
      popupPolicy: "BLOCK_ALL",
      attestation: {
        authorityConfirmed: true,
        syntheticAccountsOnlyConfirmed: true,
        statement:
          "I confirm the fictional district controls or may test this tenant.",
      },
    });

    const refreshed = await readSetupWorkflow(
      request(pathname, cookie),
      context(fixtureWorkspaceIds.cedarRidge, softwareId),
    );
    const refreshedBody = (await refreshed.json()) as {
      readonly workflow: {
        readonly steps: readonly { readonly id: string; readonly status: string }[];
      };
    };
    expect(refreshedBody.workflow.steps[1]).toMatchObject({
      id: "authorization",
      status: "COMPLETE",
    });
    expect(refreshedBody.workflow.steps[2]).toMatchObject({
      id: "agreement",
      status: "ACTION_REQUIRED",
    });

    const inventory = await listSoftware(
      request(
        `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software`,
        cookie,
      ),
      { params: Promise.resolve({ workspaceId: fixtureWorkspaceIds.cedarRidge }) },
    );
    await expect(inventory.json()).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          authorizationReviewAt: "2026-07-20T20:00:00.000Z",
          nextSafeAction: {
            code: "UPLOAD_AGREEMENT",
            label: "Upload the district agreement",
          },
        }),
      ],
    });
  });

  it("requires a signed workspace session and keeps missing software target-neutral", async () => {
    const cookie = await signIn();
    const missingSoftwareId = "99999999-9999-4999-8999-999999999999";
    const pathname = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/software/${missingSoftwareId}/setup`;

    const unauthenticated = await readSetupWorkflow(
      request(pathname),
      context(fixtureWorkspaceIds.cedarRidge, missingSoftwareId),
    );
    expect(unauthenticated.status).toBe(401);

    const missing = await readSetupWorkflow(
      request(pathname, cookie),
      context(fixtureWorkspaceIds.cedarRidge, missingSoftwareId),
    );
    const body = await missing.text();
    expect(missing.status).toBe(404);
    expect(body).toContain("Software not found or not available.");
    expect(body).not.toContain("Northstar");
  });
});
