import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as resetFixture } from "../../app/api/demo/reset/route";
import { POST as createSession } from "../../app/api/demo/session/route";
import {
  GET as listDestinations,
  POST as observeDestination,
} from "../../app/api/workspaces/[workspaceId]/destinations/route";
import { POST as reviewDestination } from "../../app/api/workspaces/[workspaceId]/destinations/[recordId]/review/route";
import { fixtureWorkspaceIds, getAccessRuntime } from "../../lib/access-fixture";

const workspaceId = fixtureWorkspaceIds.cedarRidge;
const agreementText = [
  "Fictional Cedar Ridge destination schedule.",
  "classroom-service.pactwire.test is operated by Northstar Learning Systems (Fictional) and is an allowed instructional recipient.",
].join("\n");

function request(
  pathname: string,
  options: {
    readonly method?: string;
    readonly body?: unknown;
    readonly cookie?: string;
  } = {},
): NextRequest {
  return new NextRequest(`http://pactwire.test${pathname}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

async function signIn(userKey: "officer" | "reviewer"): Promise<string> {
  const response = await createSession(
    request("/api/demo/session", { method: "POST", body: { userKey } }),
  );
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function seedAgreement() {
  const runtime = await getAccessRuntime();
  const principal = {
    userId: "fictional-officer-a",
    displayName: "Morgan Vale (Fictional)",
    activeWorkspaceId: workspaceId,
  };
  const software = await runtime.inventoryService.createSoftware({
    principal,
    workspaceId,
    name: "Northstar Classroom (Fictional)",
    vendorName: "Northstar Learning Systems (Fictional)",
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
      reason: "Imported existing fictional approval record.",
    },
  });
  const bytes = new TextEncoder().encode(agreementText);
  const uploaded = await runtime.agreementService.uploadAgreement({
    principal,
    workspaceId,
    softwareId: software.software.id,
    fileName: "fictional-destination-schedule.txt",
    mimeType: "text/plain",
    bytes,
  });
  return { software: software.software, agreement: uploaded.agreement };
}

beforeEach(() => {
  expect(resetFixture().status).toBe(200);
});

describe("destination registry HTTP boundary", () => {
  it("defaults observations to UNKNOWN and appends an exact human review", async () => {
    const cookie = await signIn("officer");
    const seeded = await seedAgreement();
    const path = `/api/workspaces/${workspaceId}/destinations`;
    const observationSha256 = createHash("sha256")
      .update("fixture destination request")
      .digest("hex");
    const observedResponse = await observeDestination(
      request(path, {
        method: "POST",
        cookie,
        body: {
          hostname: "CLASSROOM-SERVICE.PACTWIRE.TEST.",
          observationSha256,
          sourceTitle: "Captured request destination",
          sourceLocator: "run://fixture/observation/1",
        },
      }),
      { params: Promise.resolve({ workspaceId }) },
    );
    expect(observedResponse.status).toBe(201);
    const observed = (await observedResponse.json()) as {
      readonly id: string;
      readonly recordId: string;
    };
    expect(observed).toMatchObject({
      hostname: "classroom-service.pactwire.test",
      ownership: { status: "UNKNOWN" },
      classifications: [],
    });

    const reviewedResponse = await reviewDestination(
      request(`${path}/${observed.recordId}/review`, {
        method: "POST",
        cookie,
        body: {
          sourceVersionId: observed.id,
          softwareId: seeded.software.id,
          agreementVersionId: seeded.agreement.id,
          entityId: "northstar-learning-fictional",
          entityName: "Northstar Learning Systems (Fictional)",
          classification: "ALLOWED",
          mappingEvidence: {
            kind: "SIGNED_AGREEMENT",
            title: seeded.agreement.sourceFileName,
            locator: `agreement://${seeded.agreement.id}/page/1`,
            sourceSha256: seeded.agreement.sourceSha256,
            excerpt:
              "classroom-service.pactwire.test is operated by Northstar Learning Systems (Fictional)",
            pageNumber: 1,
          },
          agreementQuote:
            "classroom-service.pactwire.test is operated by Northstar Learning Systems (Fictional) and is an allowed instructional recipient.",
          agreementPageNumber: 1,
          rationale: "I verified the exact fictional source and entity mapping.",
        },
      }),
      { params: Promise.resolve({ workspaceId, recordId: observed.recordId }) },
    );
    expect(reviewedResponse.status).toBe(201);
    await expect(reviewedResponse.json()).resolves.toMatchObject({
      version: 2,
      ownership: {
        status: "CONFIRMED",
        confirmedBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
      },
      classifications: [
        {
          agreementVersionId: seeded.agreement.id,
          status: "ALLOWED",
        },
      ],
    });

    const historyResponse = await listDestinations(
      request(`${path}?recordId=${observed.recordId}`, { cookie }),
      { params: Promise.resolve({ workspaceId }) },
    );
    expect(historyResponse.status).toBe(200);
    await expect(historyResponse.json()).resolves.toMatchObject({
      destinations: [{ version: 2 }],
      history: [{ version: 2 }, { version: 1, ownership: { status: "UNKNOWN" } }],
    });
  });

  it("denies destination confirmation to a reviewer without changing UNKNOWN", async () => {
    const officerCookie = await signIn("officer");
    const seeded = await seedAgreement();
    const path = `/api/workspaces/${workspaceId}/destinations`;
    const observedResponse = await observeDestination(
      request(path, {
        method: "POST",
        cookie: officerCookie,
        body: {
          hostname: "classroom-service.pactwire.test",
          observationSha256: createHash("sha256").update("fixture").digest("hex"),
          sourceTitle: "Captured request destination",
          sourceLocator: "run://fixture/observation/2",
        },
      }),
      { params: Promise.resolve({ workspaceId }) },
    );
    const observed = (await observedResponse.json()) as {
      readonly id: string;
      readonly recordId: string;
    };
    const reviewerCookie = await signIn("reviewer");
    const denied = await reviewDestination(
      request(`${path}/${observed.recordId}/review`, {
        method: "POST",
        cookie: reviewerCookie,
        body: {
          sourceVersionId: observed.id,
          softwareId: seeded.software.id,
          agreementVersionId: seeded.agreement.id,
          entityId: "northstar-learning-fictional",
          entityName: "Northstar Learning Systems (Fictional)",
          classification: "ALLOWED",
          mappingEvidence: {
            kind: "SIGNED_AGREEMENT",
            title: seeded.agreement.sourceFileName,
            locator: `agreement://${seeded.agreement.id}/page/1`,
            sourceSha256: seeded.agreement.sourceSha256,
            excerpt:
              "classroom-service.pactwire.test is operated by Northstar Learning Systems (Fictional)",
            pageNumber: 1,
          },
          agreementQuote:
            "classroom-service.pactwire.test is operated by Northstar Learning Systems (Fictional) and is an allowed instructional recipient.",
          agreementPageNumber: 1,
          rationale: "This role must not be able to confirm the destination.",
        },
      }),
      { params: Promise.resolve({ workspaceId, recordId: observed.recordId }) },
    );
    expect(denied.status).toBe(403);
    const listed = await listDestinations(request(path, { cookie: officerCookie }), {
      params: Promise.resolve({ workspaceId }),
    });
    await expect(listed.json()).resolves.toMatchObject({
      destinations: [{ ownership: { status: "UNKNOWN" }, classifications: [] }],
    });
  });
});
