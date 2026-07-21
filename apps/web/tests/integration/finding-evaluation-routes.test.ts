import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as resetFixture } from "../../app/api/demo/reset/route";
import { POST as createSession } from "../../app/api/demo/session/route";
import { GET as listFindings } from "../../app/api/workspaces/[workspaceId]/findings/route";
import { fixtureWorkspaceIds } from "../../lib/access-fixture";

const workspaceId = fixtureWorkspaceIds.cedarRidge;

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
  userKey: "officer" | "harbor-officer",
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

describe("DET-03 finding evaluation HTTP boundary", () => {
  it("returns every stored bounded state and the machine-readable decision table", async () => {
    const cookie = await signIn("officer");
    const pathname = `/api/workspaces/${workspaceId}/findings`;
    const response = await listFindings(request(pathname, { cookie }), {
      params: Promise.resolve({ workspaceId }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = (await response.json()) as {
      readonly evaluatorVersion: string;
      readonly decisionTable: readonly {
        readonly priority: number;
        readonly state: string;
      }[];
      readonly findings: readonly {
        readonly finding: { readonly state: string };
        readonly display: {
          readonly label: string;
          readonly internalState: string;
        };
        readonly modelExplanation?: {
          readonly label: string;
          readonly excludedFromDecision: boolean;
        };
      }[];
    };

    expect(body.evaluatorVersion).toBe("pactwire-bounded-finding-v1");
    expect(body.decisionTable.map(({ priority }) => priority)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(body.findings.map(({ finding }) => finding.state).sort()).toEqual(
      [
        "NEEDS_REVIEW",
        "NOT_REOBSERVED_IN_NAMED_TESTS",
        "NOT_TESTED",
        "NOT_VISIBLE",
        "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS",
        "WITNESSED_CONFLICT",
      ].sort(),
    );
    expect(
      body.findings.every(
        ({ finding, display }) =>
          finding.state === display.internalState &&
          !/\b(pass|safe|compliant|approved)\b/iu.test(display.label),
      ),
    ).toBe(true);
    expect(
      body.findings.find(
        ({ finding }) => finding.state === "WITNESSED_CONFLICT",
      )?.modelExplanation,
    ).toMatchObject({
      label: "Model explanation — not evidence",
      excludedFromDecision: true,
    });
  });

  it("requires a signed workspace member and conceals cross-workspace findings", async () => {
    const pathname = `/api/workspaces/${workspaceId}/findings`;
    const unsigned = await listFindings(request(pathname), {
      params: Promise.resolve({ workspaceId }),
    });
    expect(unsigned.status).toBe(401);

    const harborCookie = await signIn("harbor-officer");
    const concealed = await listFindings(
      request(pathname, { cookie: harborCookie }),
      { params: Promise.resolve({ workspaceId }) },
    );
    expect(concealed.status).toBe(404);
  });
});
