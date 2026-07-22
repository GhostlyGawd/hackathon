import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as resetFixture } from "../../app/api/demo/reset/route";
import { POST as createSession } from "../../app/api/demo/session/route";
import {
  GET as listJourneys,
  POST as saveJourney,
} from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/journeys/route";
import {
  fixtureWorkspaceIds,
  getAccessRuntime,
} from "../../lib/access-fixture";

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

async function seedPrerequisites() {
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
  const authorization =
    await runtime.testAuthorizationService.createAuthorization({
      principal,
      workspaceId,
      softwareId: software.software.id,
      authorityBasis: "District-owned fictional training tenant.",
      validFrom: "2026-07-19T19:00:00.000Z",
      reviewAt: "2026-07-25T19:00:00.000Z",
      expiresAt: "2026-08-01T19:00:00.000Z",
      allowedBaseUrl: "https://cedar.northstar.invalid/classroom",
      allowedSupportingDomains: ["assets.northstar.invalid"],
      allowedActions: ["NAVIGATE", "SUBMIT"],
      prohibitedActions: ["DELETE", "PURCHASE", "MESSAGE", "ADMINISTER"],
      redirectPolicy: "ALLOW_LISTED_ONLY",
      popupPolicy: "BLOCK_ALL",
      attestation: {
        authorityConfirmed: true,
        syntheticAccountsOnlyConfirmed: true,
        statement: "Only the fictional controlled tenant may be tested.",
      },
    });
  const uploaded = await runtime.agreementService.uploadAgreement({
    principal,
    workspaceId,
    softwareId: software.software.id,
    fileName: "Northstar-DPA-fictional.txt",
    mimeType: "text/plain",
    bytes: new TextEncoder().encode(
      "Fictional Cedar Ridge DPA\nPurpose: classroom instruction only.\fFictional Cedar Ridge DPA\nRecipients: district-authorized subprocessors only.",
    ),
  });
  const proposed =
    await runtime.requirementProposalService.proposeRequirements({
      principal,
      workspaceId,
      softwareId: software.software.id,
      agreementVersionId: uploaded.agreement.id,
    });
  const confirmed = await runtime.requirementReviewService.reviewRequirement({
    principal,
    workspaceId,
    softwareId: software.software.id,
    agreementVersionId: uploaded.agreement.id,
    sourceVersionId: proposed.proposals[0]!.id,
    decision: "CONFIRM",
    executable: true,
    edits: { action: "Transmit" },
    rationale: "I checked this bounded rule against the cited fictional source.",
  });
  const persona = await runtime.syntheticDataService.createPersona({
    principal,
    workspaceId,
    role: "STUDENT",
    displayName: "Nova Reed (Fictional)",
    email: "nova.reed@student.pactwire.invalid",
    fields: { submissionPhrase: "Fictional response about Saturn" },
    confirmedFictional: true,
  });
  const draft = {
    name: "Submit a fictional classroom response",
    role: "STUDENT",
    goal: "Submit the unique fictional response to the seeded assignment.",
    startState: "Signed in to the fictional student workspace.",
    requirementVersionIds: [confirmed.id],
    authorizationId: authorization.id,
    personaId: persona.id,
    testFields: [
      {
        fieldId: "student-email",
        sourceField: "email",
        requirementVersionId: confirmed.id,
      },
      {
        fieldId: "student-response",
        sourceField: "submissionPhrase",
        requirementVersionId: confirmed.id,
      },
    ],
    allowedActions: ["NAVIGATE", "SUBMIT"],
    prohibitedActions: ["DELETE", "PURCHASE", "MESSAGE", "ADMINISTER"],
    checkpoints: [
      {
        checkpointId: "submission-request",
        required: true,
        description: "Observe the fictional submission request.",
        observationSource: "NETWORK",
        requiredVisibility: true,
        requirementVersionIds: [confirmed.id],
        testFieldIds: ["student-email", "student-response"],
      },
    ],
    steps: [
      {
        stepId: "open-assignment",
        instruction: "Open the seeded fictional assignment.",
        action: "NAVIGATE",
      },
      {
        stepId: "submit-response",
        instruction: "Submit the unique fictional response.",
        action: "SUBMIT",
      },
    ],
  };
  return {
    agreementVersionId: uploaded.agreement.id,
    draft,
    path: `/api/workspaces/${workspaceId}/software/${software.software.id}/journeys`,
    routeContext: {
      params: Promise.resolve({
        workspaceId,
        softwareId: software.software.id,
      }),
    },
  };
}

beforeEach(() => {
  expect(resetFixture().status).toBe(200);
});

describe("named journey HTTP boundary", () => {
  it("creates and lists a runnable source-bound journey", async () => {
    const cookie = await signIn("officer");
    const seeded = await seedPrerequisites();
    const created = await saveJourney(
      request(seeded.path, {
        method: "POST",
        cookie,
        json: true,
        body: JSON.stringify({
          agreementVersionId: seeded.agreementVersionId,
          draft: seeded.draft,
        }),
      }),
      seeded.routeContext,
    );

    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      readonly journey: {
        readonly version: { readonly id: string };
      };
    };
    expect(body.journey).toMatchObject({
      readiness: { status: "RUNNABLE", blockers: [] },
      causalLinks: [
        {
          requirementVersionId: seeded.draft.requirementVersionIds[0],
          sourceField: "email",
          checkpointIds: ["submission-request"],
        },
        expect.objectContaining({ sourceField: "submissionPhrase" }),
      ],
    });
    expect(
      (await getAccessRuntime()).qualityTelemetry.report().analyticsEvents
        .JOURNEY_CREATED,
    ).toBe(1);
    const listed = await listJourneys(
      request(
        `${seeded.path}?agreementVersionId=${seeded.agreementVersionId}`,
        { cookie },
      ),
      seeded.routeContext,
    );
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      current: [
        { version: { id: body.journey.version.id, version: 1 } },
      ],
      versions: [{ version: { id: body.journey.version.id } }],
    });
  });

  it("denies a reviewer and returns bounded prerequisite and stale-version errors", async () => {
    const officerCookie = await signIn("officer");
    const seeded = await seedPrerequisites();
    const reviewerCookie = await signIn("reviewer");
    const denied = await saveJourney(
      request(seeded.path, {
        method: "POST",
        cookie: reviewerCookie,
        json: true,
        body: JSON.stringify({
          agreementVersionId: seeded.agreementVersionId,
          draft: seeded.draft,
        }),
      }),
      seeded.routeContext,
    );
    expect(denied.status).toBe(403);

    const blocked = await saveJourney(
      request(seeded.path, {
        method: "POST",
        cookie: officerCookie,
        json: true,
        body: JSON.stringify({
          agreementVersionId: seeded.agreementVersionId,
          draft: {
            ...seeded.draft,
            allowedActions: ["NAVIGATE", "SUBMIT", "UPLOAD"],
          },
        }),
      }),
      seeded.routeContext,
    );
    expect(blocked.status).toBe(422);
    await expect(blocked.json()).resolves.toMatchObject({
      error: {
        code: "JOURNEY_PREREQUISITE_BLOCKED",
        auditRecorded: false,
        blockers: [
          { code: "ACTION_OUTSIDE_AUTHORIZATION" },
        ],
      },
    });

    const first = await saveJourney(
      request(seeded.path, {
        method: "POST",
        cookie: officerCookie,
        json: true,
        body: JSON.stringify({
          agreementVersionId: seeded.agreementVersionId,
          draft: seeded.draft,
        }),
      }),
      seeded.routeContext,
    );
    const firstBody = (await first.json()) as {
      readonly journey: { readonly version: { readonly id: string } };
    };
    const appendPayload = JSON.stringify({
      agreementVersionId: seeded.agreementVersionId,
      sourceVersionId: firstBody.journey.version.id,
      draft: {
        ...seeded.draft,
        goal: "Append a bounded fictional journey edit.",
      },
    });
    expect(
      (
        await saveJourney(
          request(seeded.path, {
            method: "POST",
            cookie: officerCookie,
            json: true,
            body: appendPayload,
          }),
          seeded.routeContext,
        )
      ).status,
    ).toBe(201);
    const stale = await saveJourney(
      request(seeded.path, {
        method: "POST",
        cookie: officerCookie,
        json: true,
        body: appendPayload,
      }),
      seeded.routeContext,
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: { code: "JOURNEY_VERSION_CONFLICT", auditRecorded: false },
    });
  });
});
