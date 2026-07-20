import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as resetFixture } from "../../app/api/demo/reset/route";
import { POST as createSession } from "../../app/api/demo/session/route";
import {
  GET as listPersonas,
  POST as createPersona,
} from "../../app/api/workspaces/[workspaceId]/personas/route";
import { POST as scanPersona } from "../../app/api/workspaces/[workspaceId]/personas/scan/route";
import {
  GET as listCanaries,
  POST as generateCanaries,
} from "../../app/api/workspaces/[workspaceId]/runs/[runId]/canaries/route";
import { fixtureWorkspaceIds } from "../../lib/access-fixture";

function request(
  pathname: string,
  options: {
    readonly method?: string;
    readonly body?: unknown;
    readonly cookie?: string;
  } = {},
): NextRequest {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.cookie) headers.set("cookie", options.cookie);
  return new NextRequest(`http://pactwire.test${pathname}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

function workspaceContext(workspaceId: string) {
  return { params: Promise.resolve({ workspaceId }) };
}

function runContext(workspaceId: string, runId: string) {
  return { params: Promise.resolve({ workspaceId, runId }) };
}

async function signIn(
  userKey: "officer" | "operator" | "reviewer" | "harbor-officer",
): Promise<string> {
  const response = await createSession(
    request("/api/demo/session", { method: "POST", body: { userKey } }),
  );
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

beforeEach(() => {
  expect(resetFixture().status).toBe(200);
});

const runA = "81818181-8181-4181-8181-818181818181";
const runB = "82828282-8282-4282-8282-828282828282";
const safeDraft = {
  role: "STUDENT",
  displayName: "Nova Reed (Fictional)",
  email: "nova.reed@student.pactwire.invalid",
  fields: { submissionPhrase: "Fictional response about Saturn" },
};

describe("synthetic data HTTP boundary", () => {
  it("blocks likely real data before persistence without echoing the submitted values", async () => {
    const cookie = await signIn("operator");
    const path = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/personas`;
    const unsafe = {
      role: "STUDENT",
      displayName: "Taylor Morgan",
      email: "taylor@real-school.edu",
      fields: { studentId: "123456789" },
    };
    const scan = await scanPersona(
      request(`${path}/scan`, { method: "POST", cookie, body: unsafe }),
      workspaceContext(fixtureWorkspaceIds.cedarRidge),
    );
    const scanBody = (await scan.json()) as {
      readonly scan: {
        readonly outcome: string;
        readonly findings: readonly { readonly code: string }[];
      };
    };
    expect(scanBody.scan.outcome).toBe("BLOCKED");
    expect(scanBody.scan.findings.map((finding) => finding.code)).toContain(
      "ROUTABLE_EMAIL_DOMAIN",
    );
    const created = await createPersona(
      request(path, {
        method: "POST",
        cookie,
        body: { ...unsafe, confirmedFictional: true },
      }),
      workspaceContext(fixtureWorkspaceIds.cedarRidge),
    );
    const createdText = await created.text();
    expect(created.status).toBe(422);
    expect(createdText).toContain("LIKELY_REAL_DATA");
    expect(createdText).not.toContain(unsafe.email);
    expect(createdText).not.toContain(unsafe.fields.studentId);

    const listed = await listPersonas(
      request(path, { cookie }),
      workspaceContext(fixtureWorkspaceIds.cedarRidge),
    );
    const listedBody = (await listed.json()) as {
      readonly personas: readonly unknown[];
    };
    expect(listedBody).toEqual({ personas: [] });
  });

  it("creates confirmed personas and idempotent run canaries for an operator", async () => {
    const cookie = await signIn("operator");
    const personaPath = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/personas`;
    const created = await createPersona(
      request(personaPath, {
        method: "POST",
        cookie,
        body: { ...safeDraft, confirmedFictional: true },
      }),
      workspaceContext(fixtureWorkspaceIds.cedarRidge),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      readonly persona: { readonly id: string };
    };
    const persona = createdBody.persona;
    const canaryPath = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/runs/${runA}/canaries`;
    const input = {
      selections: [
        { personaId: persona.id, sourceFields: ["email", "submissionPhrase"] },
      ],
    };
    const generated = await generateCanaries(
      request(canaryPath, { method: "POST", cookie, body: input }),
      runContext(fixtureWorkspaceIds.cedarRidge, runA),
    );
    const replay = await generateCanaries(
      request(canaryPath, { method: "POST", cookie, body: input }),
      runContext(fixtureWorkspaceIds.cedarRidge, runA),
    );
    const generatedBody = (await generated.json()) as {
      readonly canaries: readonly {
        readonly sourceField: string;
        readonly value: string;
      }[];
    };
    const replayBody = (await replay.json()) as typeof generatedBody;
    expect(generated.status).toBe(201);
    expect(replayBody).toEqual(generatedBody);
    expect(generatedBody.canaries).toHaveLength(2);
    expect(
      generatedBody.canaries.find((canary) => canary.sourceField === "email")
        ?.value,
    ).toMatch(/@canary\.pactwire\.invalid$/u);

    const unrelated = await listCanaries(
      request(`/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/runs/${runB}/canaries`, {
        cookie,
      }),
      runContext(fixtureWorkspaceIds.cedarRidge, runB),
    );
    const unrelatedBody = (await unrelated.json()) as {
      readonly canaries: readonly unknown[];
    };
    expect(unrelatedBody).toEqual({ canaries: [] });
  });

  it("derives permission and workspace scope from the signed session", async () => {
    const reviewerCookie = await signIn("reviewer");
    const claimedRoleDenied = await createPersona(
      request(`/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/personas`, {
        method: "POST",
        cookie: reviewerCookie,
        body: {
          ...safeDraft,
          confirmedFictional: true,
          clientClaimedRole: "TEST_OPERATOR",
        },
      }),
      workspaceContext(fixtureWorkspaceIds.cedarRidge),
    );
    expect(claimedRoleDenied.status).toBe(403);

    const forgedEnvelopeDenied = await createPersona(
      request(`/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/personas`, {
        method: "POST",
        cookie: reviewerCookie,
        body: {
          ...safeDraft,
          confirmedFictional: true,
          principal: {
            userId: "fictional-officer-a",
            displayName: "Morgan Vale (Fictional)",
            activeWorkspaceId: fixtureWorkspaceIds.cedarRidge,
          },
          workspaceId: fixtureWorkspaceIds.cedarRidge,
        },
      }),
      workspaceContext(fixtureWorkspaceIds.cedarRidge),
    );
    expect(forgedEnvelopeDenied.status).toBe(403);

    const forgedScanDenied = await scanPersona(
      request(
        `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/personas/scan`,
        {
          method: "POST",
          cookie: reviewerCookie,
          body: {
            ...safeDraft,
            principal: {
              userId: "fictional-officer-a",
              displayName: "Morgan Vale (Fictional)",
              activeWorkspaceId: fixtureWorkspaceIds.cedarRidge,
            },
            workspaceId: fixtureWorkspaceIds.cedarRidge,
          },
        },
      ),
      workspaceContext(fixtureWorkspaceIds.cedarRidge),
    );
    expect(forgedScanDenied.status).toBe(403);

    const officerCookie = await signIn("officer");
    const personaPath = `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/personas`;
    const created = await createPersona(
      request(personaPath, {
        method: "POST",
        cookie: officerCookie,
        body: { ...safeDraft, confirmedFictional: true },
      }),
      workspaceContext(fixtureWorkspaceIds.cedarRidge),
    );
    const createdBody = (await created.json()) as {
      readonly persona: { readonly id: string };
    };
    const forgedCanariesDenied = await generateCanaries(
      request(
        `/api/workspaces/${fixtureWorkspaceIds.cedarRidge}/runs/${runA}/canaries`,
        {
          method: "POST",
          cookie: reviewerCookie,
          body: {
            selections: [
              {
                personaId: createdBody.persona.id,
                sourceFields: ["email"],
              },
            ],
            principal: {
              userId: "fictional-officer-a",
              displayName: "Morgan Vale (Fictional)",
              activeWorkspaceId: fixtureWorkspaceIds.cedarRidge,
            },
            workspaceId: fixtureWorkspaceIds.cedarRidge,
            runId: runA,
          },
        },
      ),
      runContext(fixtureWorkspaceIds.cedarRidge, runA),
    );
    expect(forgedCanariesDenied.status).toBe(403);

    const crossWorkspace = await listPersonas(
      request(`/api/workspaces/${fixtureWorkspaceIds.harbor}/personas`, {
        cookie: officerCookie,
      }),
      workspaceContext(fixtureWorkspaceIds.harbor),
    );
    expect(crossWorkspace.status).toBe(404);
  });
});
