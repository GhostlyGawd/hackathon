import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as resetFixture } from "../../app/api/demo/reset/route";
import { POST as createSession } from "../../app/api/demo/session/route";
import {
  GET as getApproval,
  POST as considerFinding,
} from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/approval/route";
import { POST as recordDecision } from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/approval/decision/route";
import {
  fixtureFindingIds,
  fixtureRunHistorySoftwareId,
  fixtureWorkspaceIds,
} from "../../lib/access-fixture";

const workspaceId = fixtureWorkspaceIds.cedarRidge;
const softwareId = fixtureRunHistorySoftwareId;
const approvalPath =
  `/api/workspaces/${workspaceId}/software/${softwareId}/approval`;
const routeContext = {
  params: Promise.resolve({ workspaceId, softwareId }),
};

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
  userKey: "officer" | "reviewer" | "harbor-officer",
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

describe("DET-05 approval authority HTTP boundary", () => {
  it("applies one exact receipt-linked hold and leaves a repaired rerun on HOLD", async () => {
    const cookie = await signIn("reviewer");

    const initial = await getApproval(request(approvalPath, { cookie }), routeContext);
    expect(initial.status).toBe(200);
    expect(initial.headers.get("cache-control")).toBe("private, no-store");
    await expect(initial.json()).resolves.toMatchObject({
      approval: { state: "APPROVED", events: [], holdReceipts: [] },
    });

    const apply = () =>
      considerFinding(
        request(approvalPath, {
          method: "POST",
          cookie,
          body: { findingId: fixtureFindingIds.conflict },
        }),
        routeContext,
      );
    const held = await apply();
    const duplicate = await apply();
    expect(held.status).toBe(200);
    await expect(held.json()).resolves.toMatchObject({
      outcome: "HOLD_APPLIED",
      approval: {
        state: "HOLD",
        events: [
          {
            from: "APPROVED",
            to: "HOLD",
            reason: "WITNESSED_CONFLICT",
          },
        ],
        holdReceipts: [
          {
            findingId: fixtureFindingIds.conflict,
            reason: "WITNESSED_CONFLICT",
          },
        ],
      },
    });
    await expect(duplicate.json()).resolves.toMatchObject({
      outcome: "ALREADY_RECORDED",
      approval: { state: "HOLD" },
    });

    const repaired = await considerFinding(
      request(approvalPath, {
        method: "POST",
        cookie,
        body: { findingId: fixtureFindingIds.repaired },
      }),
      routeContext,
    );
    await expect(repaired.json()).resolves.toMatchObject({
      outcome: "NO_CHANGE",
      reason: "FINDING_DOES_NOT_AUTHORIZE_A_STATE_CHANGE",
      approval: { state: "HOLD" },
    });
  });

  it("derives prior visibility and a frozen retry from stored manifests before holding", async () => {
    const cookie = await signIn("reviewer");
    const response = await considerFinding(
      request(approvalPath, {
        method: "POST",
        cookie,
        body: { findingId: fixtureFindingIds.visibilityRetry },
      }),
      routeContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      outcome: "HOLD_APPLIED",
      approval: {
        state: "HOLD",
        events: [{ reason: "REQUIRED_VISIBILITY_LOSS" }],
        holdReceipts: [
          {
            findingId: fixtureFindingIds.visibilityRetry,
            checkpointId: "completion-visible",
          },
        ],
      },
    });
  });

  it("requires an authorized human, a signed reason, and a stored clean rerun to restore", async () => {
    const reviewerCookie = await signIn("reviewer");
    const officerCookie = await signIn("officer");
    const held = await considerFinding(
      request(approvalPath, {
        method: "POST",
        cookie: reviewerCookie,
        body: { findingId: fixtureFindingIds.conflict },
      }),
      routeContext,
    );
    const heldBody = (await held.json()) as {
      readonly approval: {
        readonly holdReceipts: readonly { readonly receiptId: string }[];
      };
    };
    const decisionBody = {
      outcome: "RESTORE_APPROVED",
      rationale:
        "I reviewed the named fictional rerun and accept only its recorded scope.",
      namedScopeAcknowledged: true,
      receiptId: heldBody.approval.holdReceipts[0]!.receiptId,
      reviewedFindingId: fixtureFindingIds.repaired,
    };

    const denied = await recordDecision(
      request(`${approvalPath}/decision`, {
        method: "POST",
        cookie: reviewerCookie,
        body: decisionBody,
      }),
      routeContext,
    );
    expect(denied.status).toBe(403);

    const restored = await recordDecision(
      request(`${approvalPath}/decision`, {
        method: "POST",
        cookie: officerCookie,
        body: decisionBody,
      }),
      routeContext,
    );
    expect(restored.status).toBe(200);
    await expect(restored.json()).resolves.toMatchObject({
      outcome: "DECISION_RECORDED",
      approval: {
        state: "APPROVED",
        decisions: [
          {
            outcome: "RESTORE_APPROVED",
            actor: { kind: "HUMAN", actorId: "fictional-officer-a" },
            reviewedRun: {
              findingState: "NOT_REOBSERVED_IN_NAMED_TESTS",
            },
          },
        ],
      },
    });
  });

  it("requires a signed member and conceals the approval subject across workspaces", async () => {
    const unsigned = await getApproval(request(approvalPath), routeContext);
    expect(unsigned.status).toBe(401);

    const harborCookie = await signIn("harbor-officer");
    const concealed = await getApproval(
      request(approvalPath, { cookie: harborCookie }),
      routeContext,
    );
    expect(concealed.status).toBe(404);
  });
});
