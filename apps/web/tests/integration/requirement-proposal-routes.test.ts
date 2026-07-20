import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as resetFixture } from "../../app/api/demo/reset/route";
import { POST as createSession } from "../../app/api/demo/session/route";
import { POST as uploadAgreement } from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/agreements/route";
import {
  GET as listProposals,
  POST as proposeRequirements,
} from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/agreements/[agreementVersionId]/proposals/route";
import { fixtureWorkspaceIds, getAccessRuntime } from "../../lib/access-fixture";

function request(
  pathname: string,
  options: {
    readonly method?: string;
    readonly body?: BodyInit;
    readonly cookie?: string;
  } = {},
): NextRequest {
  const headers = new Headers();
  if (options.cookie) headers.set("cookie", options.cookie);
  return new NextRequest(`http://pactwire.test${pathname}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined ? {} : { body: options.body }),
  });
}

function agreementContext(
  workspaceId: string,
  softwareId: string,
  agreementVersionId: string,
) {
  return {
    params: Promise.resolve({ workspaceId, softwareId, agreementVersionId }),
  };
}

function softwareContext(workspaceId: string, softwareId: string) {
  return { params: Promise.resolve({ workspaceId, softwareId }) };
}

async function signIn(
  userKey: "officer" | "reviewer",
): Promise<string> {
  const response = await createSession(
    new NextRequest("http://pactwire.test/api/demo/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userKey }),
    }),
  );
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function seededSoftwareId(): Promise<string> {
  const runtime = await getAccessRuntime();
  const item = await runtime.inventoryService.createSoftware({
    principal: {
      userId: "fictional-officer-a",
      displayName: "Morgan Vale (Fictional)",
      activeWorkspaceId: fixtureWorkspaceIds.cedarRidge,
    },
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
    },
  });
  return item.software.id;
}

async function upload(
  cookie: string,
  softwareId: string,
  fileName = "Northstar-DPA-fictional.txt",
) {
  const workspaceId = fixtureWorkspaceIds.cedarRidge;
  const path = `/api/workspaces/${workspaceId}/software/${softwareId}/agreements`;
  const form = new FormData();
  form.set(
    "file",
    new File(
      [
        "Fictional Cedar Ridge DPA\nPurpose: classroom instruction only.\fFictional Cedar Ridge DPA\nRecipients: district-authorized subprocessors only.",
      ],
      fileName,
      { type: "text/plain" },
    ),
  );
  const response = await uploadAgreement(
    request(path, { method: "POST", cookie, body: form }),
    softwareContext(workspaceId, softwareId),
  );
  expect(response.status).toBe(201);
  return (await response.json()) as {
    readonly agreement: { readonly id: string };
  };
}

beforeEach(() => {
  expect(resetFixture().status).toBe(200);
});

describe("requirement proposal HTTP boundary", () => {
  it("generates and lists an exact, visibly non-executable fixture proposal", async () => {
    const cookie = await signIn("officer");
    const softwareId = await seededSoftwareId();
    const uploaded = await upload(cookie, softwareId);
    const workspaceId = fixtureWorkspaceIds.cedarRidge;
    const path = `/api/workspaces/${workspaceId}/software/${softwareId}/agreements/${uploaded.agreement.id}/proposals`;
    const routeContext = agreementContext(
      workspaceId,
      softwareId,
      uploaded.agreement.id,
    );

    const created = await proposeRequirements(
      request(path, { method: "POST", cookie }),
      routeContext,
    );
    const createdBody = (await created.json()) as {
      readonly run: { readonly id: string };
      readonly proposals: readonly unknown[];
    };
    expect(created.status).toBe(201);
    expect(createdBody).toMatchObject({
      run: {
        status: "SUCCEEDED",
        provider: "DETERMINISTIC_FIXTURE",
        totalEstimatedCostMicroUsd: 0,
      },
      proposals: [
        {
          status: "PROPOSED",
          executable: false,
          details: {
            sourceText: "Purpose: classroom instruction only.",
            pageNumber: 1,
            purposeRestriction: "Classroom instruction only",
          },
          citation: { page: 1 },
        },
      ],
    });

    const listed = await listProposals(request(path, { cookie }), routeContext);
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      runs: [{ id: createdBody.run.id, status: "SUCCEEDED" }],
      proposals: [{ executable: false }],
    });
  });

  it("persists a safe refusal run but creates no proposal", async () => {
    const cookie = await signIn("officer");
    const softwareId = await seededSoftwareId();
    const uploaded = await upload(
      cookie,
      softwareId,
      "model-refusal-Northstar-DPA-fictional.txt",
    );
    const workspaceId = fixtureWorkspaceIds.cedarRidge;
    const path = `/api/workspaces/${workspaceId}/software/${softwareId}/agreements/${uploaded.agreement.id}/proposals`;
    const routeContext = agreementContext(
      workspaceId,
      softwareId,
      uploaded.agreement.id,
    );

    const refused = await proposeRequirements(
      request(path, { method: "POST", cookie }),
      routeContext,
    );
    expect(refused.status).toBe(422);
    await expect(refused.json()).resolves.toMatchObject({
      error: {
        code: "REQUIREMENT_PROPOSAL_REFUSED",
        message:
          "The model declined to propose requirements. No proposal was created.",
        auditRecorded: true,
      },
      run: { status: "REFUSED" },
      proposals: [],
    });
    const listed = await listProposals(request(path, { cookie }), routeContext);
    await expect(listed.json()).resolves.toMatchObject({
      runs: [{ status: "REFUSED" }],
      proposals: [],
    });
  });

  it("lets a reviewer read proposal history but denies model invocation", async () => {
    const officerCookie = await signIn("officer");
    const softwareId = await seededSoftwareId();
    const uploaded = await upload(officerCookie, softwareId);
    const workspaceId = fixtureWorkspaceIds.cedarRidge;
    const path = `/api/workspaces/${workspaceId}/software/${softwareId}/agreements/${uploaded.agreement.id}/proposals`;
    const routeContext = agreementContext(
      workspaceId,
      softwareId,
      uploaded.agreement.id,
    );
    const reviewerCookie = await signIn("reviewer");

    const denied = await proposeRequirements(
      request(path, { method: "POST", cookie: reviewerCookie }),
      routeContext,
    );
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({
      error: { code: "PERMISSION_DENIED", auditRecorded: true },
    });
    const listed = await listProposals(
      request(path, { cookie: reviewerCookie }),
      routeContext,
    );
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toEqual({ runs: [], proposals: [] });
  });
});
