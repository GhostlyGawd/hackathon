import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as resetFixture } from "../../app/api/demo/reset/route";
import { POST as createSession } from "../../app/api/demo/session/route";
import { POST as uploadAgreement } from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/agreements/route";
import { POST as proposeRequirements } from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/agreements/[agreementVersionId]/proposals/route";
import { POST as considerFinding } from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/approval/route";
import { POST as recordDecision } from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/approval/decision/route";
import { GET as getQualityReport } from "../../app/api/workspaces/[workspaceId]/quality/route";
import { GET as listReceipts } from "../../app/api/workspaces/[workspaceId]/receipts/route";
import { GET as getReceipt } from "../../app/api/workspaces/[workspaceId]/receipts/[receiptId]/route";
import { GET as exportReceipt } from "../../app/api/workspaces/[workspaceId]/receipts/[receiptId]/export/route";
import { GET as getRuns } from "../../app/api/workspaces/[workspaceId]/runs/route";
import { POST as stopRun } from "../../app/api/workspaces/[workspaceId]/runs/[runId]/stop/route";
import {
  fixtureFindingIds,
  fixtureRunHistorySoftwareId,
  fixtureWorkspaceIds,
  getAccessRuntime,
} from "../../lib/access-fixture";

const workspaceId = fixtureWorkspaceIds.cedarRidge;
const softwareId = fixtureRunHistorySoftwareId;
const workspaceContext = { params: Promise.resolve({ workspaceId }) };
const approvalContext = { params: Promise.resolve({ workspaceId, softwareId }) };

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
  userKey: "officer" | "operator" | "reviewer" | "harbor-officer",
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

describe("QLT-01 quality observability HTTP boundary", () => {
  it("records the critical run, receipt, rule, and human-decision path without exposing raw identities", async () => {
    const operatorCookie = await signIn("operator");
    const reviewerCookie = await signIn("reviewer");
    const officerCookie = await signIn("officer");

    const runsPath = `/api/workspaces/${workspaceId}/runs`;
    const runsResponse = await getRuns(
      request(runsPath, { cookie: operatorCookie }),
      workspaceContext,
    );
    const runsBody = (await runsResponse.json()) as {
      readonly runs: readonly {
        readonly run: { readonly id: string; readonly state: string };
      }[];
    };
    const activeRun = runsBody.runs.find(({ run }) => run.state === "RUNNING");
    expect(activeRun).toBeDefined();
    const runId = activeRun!.run.id;
    const stopped = await stopRun(
      request(`${runsPath}/${runId}/stop`, {
        cookie: operatorCookie,
        method: "POST",
      }),
      { params: Promise.resolve({ workspaceId, runId }) },
    );
    expect(stopped.status).toBe(200);

    const receiptListPath =
      `/api/workspaces/${workspaceId}/receipts?findingId=${fixtureFindingIds.conflict}`;
    const listed = await listReceipts(
      request(receiptListPath, { cookie: reviewerCookie }),
      workspaceContext,
    );
    const listedBody = (await listed.json()) as {
      readonly receipts: readonly { readonly receipt: { readonly id: string } }[];
    };
    const receiptId = listedBody.receipts[0]!.receipt.id;
    const receiptPath = `/api/workspaces/${workspaceId}/receipts/${receiptId}`;
    expect(
      (
        await getReceipt(request(receiptPath, { cookie: reviewerCookie }), {
          params: Promise.resolve({ workspaceId, receiptId }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await exportReceipt(
          request(`${receiptPath}/export`, { cookie: reviewerCookie }),
          { params: Promise.resolve({ workspaceId, receiptId }) },
        )
      ).status,
    ).toBe(200);

    const approvalPath =
      `/api/workspaces/${workspaceId}/software/${softwareId}/approval`;
    const held = await considerFinding(
      request(approvalPath, {
        method: "POST",
        cookie: reviewerCookie,
        body: { findingId: fixtureFindingIds.conflict },
      }),
      approvalContext,
    );
    expect(held.status).toBe(200);
    const heldBody = (await held.json()) as {
      readonly approval: {
        readonly holdReceipts: readonly { readonly receiptId: string }[];
      };
    };
    const decided = await recordDecision(
      request(`${approvalPath}/decision`, {
        method: "POST",
        cookie: officerCookie,
        body: {
          outcome: "KEEP_HOLD",
          rationale:
            "I reviewed the named fictional run and am keeping the existing hold.",
          namedScopeAcknowledged: true,
          receiptId: heldBody.approval.holdReceipts[0]!.receiptId,
          reviewedFindingId: fixtureFindingIds.conflict,
        },
      }),
      approvalContext,
    );
    expect(decided.status).toBe(200);

    const qualityPath = `/api/workspaces/${workspaceId}/quality`;
    const quality = await getQualityReport(
      request(qualityPath, { cookie: reviewerCookie }),
      workspaceContext,
    );
    expect(quality.status).toBe(200);
    expect(quality.headers.get("cache-control")).toBe("private, no-store");
    const qualityText = await quality.text();
    const report = JSON.parse(qualityText) as {
      readonly analyticsEvents: Readonly<Record<string, number>>;
      readonly responsibilityLanes: Readonly<Record<string, number>>;
    };

    expect(report.analyticsEvents).toMatchObject({
      APPROVAL_PLACED_ON_HOLD: 1,
      HUMAN_DECISION_RECORDED: 1,
      RECEIPT_EXPORTED: 1,
      RECEIPT_VIEWED: 1,
      RUN_TERMINAL: 1,
    });
    expect(report.responsibilityLanes).toMatchObject({
      HARNESS: 1,
      HUMAN_DECISION: 1,
      RECORDER: 1,
      RULE_EVALUATION: 1,
    });
    expect(qualityText).not.toContain(runId);
    expect(qualityText).not.toContain(receiptId);
    expect(qualityText).not.toContain("fictional-officer-a");

    const harborWorkspaceId = fixtureWorkspaceIds.harbor;
    const harborCookie = await signIn("harbor-officer");
    const harborQuality = await getQualityReport(
      request(`/api/workspaces/${harborWorkspaceId}/quality`, {
        cookie: harborCookie,
      }),
      { params: Promise.resolve({ workspaceId: harborWorkspaceId }) },
    );
    expect(harborQuality.status).toBe(200);
    const harborReport = (await harborQuality.json()) as {
      readonly counts: { readonly analyticsEvents: number; readonly structuredLogs: number };
    };
    expect(harborReport.counts).toMatchObject({
      analyticsEvents: 0,
      structuredLogs: 0,
    });
  });

  it("requires audit authority and conceals the quality report across workspaces", async () => {
    const qualityPath = `/api/workspaces/${workspaceId}/quality`;
    const unsigned = await getQualityReport(request(qualityPath), workspaceContext);
    expect(unsigned.status).toBe(401);

    const operatorCookie = await signIn("operator");
    const denied = await getQualityReport(
      request(qualityPath, { cookie: operatorCookie }),
      workspaceContext,
    );
    expect(denied.status).toBe(403);

    const harborCookie = await signIn("harbor-officer");
    const concealed = await getQualityReport(
      request(qualityPath, { cookie: harborCookie }),
      workspaceContext,
    );
    expect(concealed.status).toBe(404);
  });

  it("measures a real requirement-proposal attempt in the model responsibility lane", async () => {
    const officerCookie = await signIn("officer");
    const runtime = await getAccessRuntime();
    const item = await runtime.inventoryService.createSoftware({
      principal: {
        userId: "fictional-officer-a",
        displayName: "Morgan Vale (Fictional)",
        activeWorkspaceId: workspaceId,
      },
      workspaceId,
      name: "Quality Lane Classroom (Fictional)",
      vendorName: "Quality Lane Labs (Fictional)",
      authorizedTenantUrl: "https://quality-lane.pactwire.invalid/classroom",
      districtOwner: "Fictional Curriculum Team",
      approval: {
        state: "APPROVED",
        setBy: {
          kind: "IMPORTED_SYSTEM",
          actorId: "fictional-district-registry",
          displayName: "Fictional Cedar Ridge App Registry",
          source: "district inventory export",
        },
        reason: "Imported fictional approval for a controlled quality test.",
      },
    });
    const softwarePath = `/api/workspaces/${workspaceId}/software/${item.software.id}`;
    const agreementPath = `${softwarePath}/agreements`;
    const form = new FormData();
    form.set(
      "file",
      new File(
        ["Fictional agreement\nPurpose: classroom instruction only."],
        "quality-lane-agreement.txt",
        { type: "text/plain" },
      ),
    );
    const uploaded = await uploadAgreement(
      new NextRequest(`http://pactwire.test${agreementPath}`, {
        method: "POST",
        headers: { cookie: officerCookie },
        body: form,
      }),
      { params: Promise.resolve({ workspaceId, softwareId: item.software.id }) },
    );
    expect(uploaded.status).toBe(201);
    const uploadedBody = (await uploaded.json()) as {
      readonly agreement: { readonly id: string };
    };
    const proposalPath =
      `${agreementPath}/${uploadedBody.agreement.id}/proposals`;
    const proposed = await proposeRequirements(
      request(proposalPath, { method: "POST", cookie: officerCookie }),
      {
        params: Promise.resolve({
          workspaceId,
          softwareId: item.software.id,
          agreementVersionId: uploadedBody.agreement.id,
        }),
      },
    );
    expect(proposed.status).toBe(201);

    const quality = await getQualityReport(
      request(`/api/workspaces/${workspaceId}/quality`, {
        cookie: officerCookie,
      }),
      workspaceContext,
    );
    const report = (await quality.json()) as {
      readonly analyticsEvents: Readonly<Record<string, number>>;
      readonly observability: Readonly<Record<string, number>>;
      readonly responsibilityLanes: Readonly<Record<string, number>>;
    };
    expect(report.analyticsEvents).toMatchObject({
      AGREEMENT_UPLOADED: 1,
      REQUIREMENT_PROPOSED: 1,
    });
    expect(report.responsibilityLanes.MODEL).toBe(1);
    expect(report.observability).toMatchObject({
      estimatedCostMicroUsd: 0,
      latencyMs: 1,
      modelFailureCount: 0,
      retryCount: 0,
    });
  });
});
