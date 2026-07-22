import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as resetFixture } from "../../app/api/demo/reset/route";
import { POST as createSession } from "../../app/api/demo/session/route";
import { GET as listReceipts } from "../../app/api/workspaces/[workspaceId]/receipts/route";
import { GET as getReceipt } from "../../app/api/workspaces/[workspaceId]/receipts/[receiptId]/route";
import { GET as exportReceipt } from "../../app/api/workspaces/[workspaceId]/receipts/[receiptId]/export/route";
import { DELETE as deleteReceiptContent } from "../../app/api/workspaces/[workspaceId]/receipts/[receiptId]/retention/route";
import {
  GET as getRetentionPolicy,
  PUT as updateRetentionPolicy,
} from "../../app/api/workspaces/[workspaceId]/retention/route";
import { fixtureWorkspaceIds } from "../../lib/access-fixture";

const workspaceId = fixtureWorkspaceIds.cedarRidge;
const findingId = "71717171-7171-4171-8171-717171710002";

function request(
  pathname: string,
  cookie?: string,
  init: { readonly method?: string; readonly body?: unknown } = {},
): NextRequest {
  return new NextRequest(`http://pactwire.test${pathname}`, {
    ...(init.method === undefined ? {} : { method: init.method }),
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

async function signIn(
  userKey: "officer" | "operator" | "reviewer",
): Promise<string> {
  const response = await createSession(
    request("/api/demo/session", undefined, {
      method: "POST",
      body: { userKey },
    }),
  );
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function conflictReceiptId(cookie: string): Promise<string> {
  const pathname = `/api/workspaces/${workspaceId}/receipts?findingId=${findingId}`;
  const response = await listReceipts(request(pathname, cookie), {
    params: Promise.resolve({ workspaceId }),
  });
  const body = (await response.json()) as {
    readonly receipts: readonly { readonly receipt: { readonly id: string } }[];
  };
  return body.receipts[0]!.receipt.id;
}

beforeEach(() => {
  expect(resetFixture().status).toBe(200);
});

describe("SEC-01 HTTP security governance", () => {
  it("marks private review exports and denies every public delivery request", async () => {
    const cookie = await signIn("reviewer");
    const receiptId = await conflictReceiptId(cookie);
    const base = `/api/workspaces/${workspaceId}/receipts/${receiptId}/export`;

    const privateExport = await exportReceipt(request(base, cookie), {
      params: Promise.resolve({ workspaceId, receiptId }),
    });
    expect(privateExport.status).toBe(200);
    expect(privateExport.headers.get("x-pactwire-release-scope")).toBe(
      "private-review-only",
    );

    const publicExport = await exportReceipt(
      request(`${base}?delivery=public`, cookie),
      { params: Promise.resolve({ workspaceId, receiptId }) },
    );
    expect(publicExport.status).toBe(403);
    await expect(publicExport.json()).resolves.toMatchObject({
      error: { code: "EVIDENCE_RELEASE_DENIED", reason: "PUBLICATION_NOT_SUPPORTED" },
    });
  });

  it("lets only the privacy officer configure the bounded retention period", async () => {
    const reviewer = await signIn("reviewer");
    const officer = await signIn("officer");
    const pathname = `/api/workspaces/${workspaceId}/retention`;
    const current = await getRetentionPolicy(request(pathname, reviewer), {
      params: Promise.resolve({ workspaceId }),
    });
    await expect(current.json()).resolves.toMatchObject({
      policy: { retentionDays: 30, basis: "PACTWIRE_PRODUCT_DEFAULT" },
    });

    const denied = await updateRetentionPolicy(
      request(pathname, reviewer, { method: "PUT", body: { retentionDays: 45 } }),
      { params: Promise.resolve({ workspaceId }) },
    );
    expect(denied.status).toBe(403);

    const updated = await updateRetentionPolicy(
      request(pathname, officer, { method: "PUT", body: { retentionDays: 45 } }),
      { params: Promise.resolve({ workspaceId }) },
    );
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      policy: { retentionDays: 45, basis: "HUMAN_CONFIGURED" },
    });
  });

  it("requires officer authority plus the exact receipt confirmation and then returns a tombstone boundary", async () => {
    const reviewer = await signIn("reviewer");
    const officer = await signIn("officer");
    const receiptId = await conflictReceiptId(reviewer);
    const pathname = `/api/workspaces/${workspaceId}/receipts/${receiptId}/retention`;
    const context = { params: Promise.resolve({ workspaceId, receiptId }) };

    const denied = await deleteReceiptContent(
      request(pathname, reviewer, {
        method: "DELETE",
        body: { confirmation: `DELETE ${receiptId}`, reason: "Fixture request" },
      }),
      context,
    );
    expect(denied.status).toBe(403);

    const wrongConfirmation = await deleteReceiptContent(
      request(pathname, officer, {
        method: "DELETE",
        body: { confirmation: "DELETE SOMETHING", reason: "Fixture request" },
      }),
      context,
    );
    expect(wrongConfirmation.status).toBe(403);

    const deleted = await deleteReceiptContent(
      request(pathname, officer, {
        method: "DELETE",
        body: { confirmation: `DELETE ${receiptId}`, reason: "Fixture request" },
      }),
      context,
    );
    expect(deleted.status).toBe(200);
    await expect(deleted.json()).resolves.toMatchObject({
      deletion: { status: "COMPLETED", receiptId },
    });

    const detail = await getReceipt(
      request(`/api/workspaces/${workspaceId}/receipts/${receiptId}`, reviewer),
      context,
    );
    expect(detail.status).toBe(410);
    await expect(detail.json()).resolves.toMatchObject({
      error: { code: "EVIDENCE_RECEIPT_CONTENT_DELETED" },
    });
  });
});
