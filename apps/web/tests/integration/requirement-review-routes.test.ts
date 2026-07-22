import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as resetFixture } from "../../app/api/demo/reset/route";
import { POST as createSession } from "../../app/api/demo/session/route";
import { POST as uploadAgreement } from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/agreements/route";
import { POST as proposeRequirements } from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/agreements/[agreementVersionId]/proposals/route";
import {
  GET as listRequirements,
  POST as reviewRequirement,
} from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/agreements/[agreementVersionId]/requirements/route";
import { fixtureWorkspaceIds, getAccessRuntime } from "../../lib/access-fixture";

function request(
  pathname: string,
  options: {
    readonly method?: string;
    readonly body?: BodyInit;
    readonly cookie?: string;
    readonly json?: boolean;
  } = {},
): NextRequest {
  const headers = new Headers();
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.json) headers.set("content-type", "application/json");
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

async function signIn(userKey: "officer" | "reviewer"): Promise<string> {
  const response = await createSession(
    new NextRequest("http://pactwire.test/api/demo/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userKey }),
    }),
  );
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function seedProposal(cookie: string) {
  const runtime = await getAccessRuntime();
  const workspaceId = fixtureWorkspaceIds.cedarRidge;
  const principal = {
    userId: "fictional-officer-a",
    displayName: "Morgan Vale (Fictional)",
    activeWorkspaceId: workspaceId,
  };
  const software = await runtime.inventoryService.createSoftware({
    principal,
    workspaceId,
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
  const form = new FormData();
  form.set(
    "file",
    new File(
      [
        "Fictional Cedar Ridge DPA\nPurpose: classroom instruction only.\fFictional Cedar Ridge DPA\nRecipients: district-authorized subprocessors only.",
      ],
      "Northstar-DPA-fictional.txt",
      { type: "text/plain" },
    ),
  );
  const uploadPath = `/api/workspaces/${workspaceId}/software/${software.software.id}/agreements`;
  const uploaded = await uploadAgreement(
    request(uploadPath, { method: "POST", cookie, body: form }),
    { params: Promise.resolve({ workspaceId, softwareId: software.software.id }) },
  );
  const agreement = (await uploaded.json()) as {
    readonly agreement: { readonly id: string };
  };
  const basePath = `/api/workspaces/${workspaceId}/software/${software.software.id}/agreements/${agreement.agreement.id}`;
  const context = agreementContext(
    workspaceId,
    software.software.id,
    agreement.agreement.id,
  );
  const proposed = await proposeRequirements(
    request(`${basePath}/proposals`, { method: "POST", cookie }),
    context,
  );
  const proposalBody = (await proposed.json()) as {
    readonly proposals: readonly { readonly id: string }[];
  };
  return {
    basePath,
    context,
    proposalId: proposalBody.proposals[0]!.id,
  };
}

beforeEach(() => {
  expect(resetFixture().status).toBe(200);
});

describe("requirement review HTTP boundary", () => {
  it("appends a human confirmation and exposes immutable history", async () => {
    const officerCookie = await signIn("officer");
    const seeded = await seedProposal(officerCookie);
    const response = await reviewRequirement(
      request(`${seeded.basePath}/requirements`, {
        method: "POST",
        cookie: officerCookie,
        json: true,
        body: JSON.stringify({
          sourceVersionId: seeded.proposalId,
          decision: "CONFIRM",
          executable: true,
          edits: { action: "Transmit" },
          rationale: "I confirmed this bounded rule against the cited source.",
        }),
      }),
      seeded.context,
    );
    expect(response.status).toBe(201);
    const confirmed = (await response.json()) as {
      readonly id: string;
      readonly citation: unknown;
    };
    expect(confirmed).toMatchObject({
      sourceVersionId: seeded.proposalId,
      version: 2,
      status: "CONFIRMED",
      executable: true,
      details: { action: "Transmit" },
      confirmedBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
    });
    expect(
      (await getAccessRuntime()).qualityTelemetry.report().analyticsEvents
        .REQUIREMENT_CONFIRMED,
    ).toBe(1);
    const history = await listRequirements(
      request(`${seeded.basePath}/requirements`, { cookie: officerCookie }),
      seeded.context,
    );
    expect(history.status).toBe(200);
    await expect(history.json()).resolves.toMatchObject({
      current: [{ id: confirmed.id, status: "CONFIRMED" }],
      versions: [
        { id: confirmed.id, sourceVersionId: seeded.proposalId },
        { id: seeded.proposalId, status: "PROPOSED", executable: false },
      ],
    });
  });

  it("denies the reviewer role and returns a bounded stale-review conflict", async () => {
    const officerCookie = await signIn("officer");
    const seeded = await seedProposal(officerCookie);
    const reviewerCookie = await signIn("reviewer");
    const payload = JSON.stringify({
      sourceVersionId: seeded.proposalId,
      decision: "AMBIGUOUS",
      rationale: "The recipient restriction needs human clarification.",
    });
    const denied = await reviewRequirement(
      request(`${seeded.basePath}/requirements`, {
        method: "POST",
        cookie: reviewerCookie,
        json: true,
        body: payload,
      }),
      seeded.context,
    );
    expect(denied.status).toBe(403);
    const created = await reviewRequirement(
      request(`${seeded.basePath}/requirements`, {
        method: "POST",
        cookie: officerCookie,
        json: true,
        body: payload,
      }),
      seeded.context,
    );
    expect(created.status).toBe(201);
    expect(
      (await getAccessRuntime()).qualityTelemetry.report().analyticsEvents
        .REQUIREMENT_MARKED_AMBIGUOUS,
    ).toBe(1);
    const stale = await reviewRequirement(
      request(`${seeded.basePath}/requirements`, {
        method: "POST",
        cookie: officerCookie,
        json: true,
        body: payload,
      }),
      seeded.context,
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: {
        code: "REQUIREMENT_REVIEW_CONFLICT",
        auditRecorded: false,
      },
    });
  });
});
