import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { verifyEvidenceReceiptBundle } from "@pactwire/core";
import { POST as resetFixture } from "../../app/api/demo/reset/route";
import { POST as createSession } from "../../app/api/demo/session/route";
import { GET as listReceipts } from "../../app/api/workspaces/[workspaceId]/receipts/route";
import { GET as getReceipt } from "../../app/api/workspaces/[workspaceId]/receipts/[receiptId]/route";
import { GET as exportReceipt } from "../../app/api/workspaces/[workspaceId]/receipts/[receiptId]/export/route";
import { fixtureWorkspaceIds } from "../../lib/access-fixture";

const workspaceId = fixtureWorkspaceIds.cedarRidge;
const findingId = "71717171-7171-4171-8171-717171710002";

function request(pathname: string, cookie?: string): NextRequest {
  return new NextRequest(`http://pactwire.test${pathname}`, {
    headers: cookie ? { cookie } : {},
  });
}

async function signIn(
  userKey: "officer" | "operator" | "reviewer" | "harbor-officer",
): Promise<string> {
  const response = await createSession(
    new NextRequest("http://pactwire.test/api/demo/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userKey }),
    }),
  );
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

beforeEach(() => {
  expect(resetFixture().status).toBe(200);
});

describe("DET-04 evidence receipt HTTP boundary", () => {
  it("returns a directly readable receipt summary and verifier status to an evidence reviewer", async () => {
    const cookie = await signIn("reviewer");
    const pathname = `/api/workspaces/${workspaceId}/receipts?findingId=${findingId}`;
    const response = await listReceipts(request(pathname, cookie), {
      params: Promise.resolve({ workspaceId }),
    });
    const body = (await response.json()) as {
      readonly receipts: readonly {
        readonly receipt: { readonly id: string; readonly findingId: string };
        readonly content: {
          readonly finding: { readonly state: string };
          readonly agreementRule: { readonly confirmedBy: { readonly kind: string } };
          readonly lineage: { readonly screenshotPaths: readonly string[] };
        };
        readonly verification: { readonly status: string };
      }[];
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.receipts).toHaveLength(1);
    expect(body.receipts[0]).toMatchObject({
      receipt: { findingId },
      content: {
        finding: { state: "WITNESSED_CONFLICT" },
        agreementRule: { confirmedBy: { kind: "HUMAN" } },
      },
      verification: { status: "VALID" },
    });
    expect(body.receipts[0]?.content.lineage.screenshotPaths).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("contentBase64");
  });

  it("downloads a sanitized standalone bundle that independently verifies", async () => {
    const cookie = await signIn("reviewer");
    const listPath = `/api/workspaces/${workspaceId}/receipts?findingId=${findingId}`;
    const listed = await listReceipts(request(listPath, cookie), {
      params: Promise.resolve({ workspaceId }),
    });
    const listBody = (await listed.json()) as {
      readonly receipts: readonly { readonly receipt: { readonly id: string } }[];
    };
    const receiptId = listBody.receipts[0]!.receipt.id;
    const detailPath = `/api/workspaces/${workspaceId}/receipts/${receiptId}`;
    const detail = await getReceipt(request(detailPath, cookie), {
      params: Promise.resolve({ workspaceId, receiptId }),
    });
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      readonly verification: { readonly status: string };
      readonly artifacts: readonly {
        readonly kind: string;
        readonly sanitized: boolean;
      }[];
    };
    expect(detailBody.verification.status).toBe("VALID");
    expect(
      detailBody.artifacts.some(
        ({ kind, sanitized }) => kind === "SCREENSHOT" && sanitized,
      ),
    ).toBe(true);

    const exported = await exportReceipt(
      request(`${detailPath}/export`, cookie),
      { params: Promise.resolve({ workspaceId, receiptId }) },
    );
    const serialized = await exported.text();
    const bundle = JSON.parse(serialized) as unknown;

    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-type")).toContain("application/json");
    expect(exported.headers.get("content-disposition")).toContain(
      `${receiptId}.json`,
    );
    expect(verifyEvidenceReceiptBundle(bundle).status).toBe("VALID");
    expect(serialized).not.toMatch(/pw-[a-f0-9]{32}@canary/iu);
  });

  it("requires evidence-review access and conceals another workspace", async () => {
    const pathname = `/api/workspaces/${workspaceId}/receipts?findingId=${findingId}`;
    const unsigned = await listReceipts(request(pathname), {
      params: Promise.resolve({ workspaceId }),
    });
    expect(unsigned.status).toBe(401);

    const operatorCookie = await signIn("operator");
    const denied = await listReceipts(request(pathname, operatorCookie), {
      params: Promise.resolve({ workspaceId }),
    });
    expect(denied.status).toBe(403);

    const harborCookie = await signIn("harbor-officer");
    const concealed = await listReceipts(request(pathname, harborCookie), {
      params: Promise.resolve({ workspaceId }),
    });
    expect(concealed.status).toBe(404);
  });
});
