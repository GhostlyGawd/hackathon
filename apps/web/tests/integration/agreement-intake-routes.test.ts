import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as resetFixture } from "../../app/api/demo/reset/route";
import { POST as createSession } from "../../app/api/demo/session/route";
import {
  GET as listAgreements,
  POST as uploadAgreement,
} from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/agreements/route";
import { GET as readAgreementSource } from "../../app/api/workspaces/[workspaceId]/software/[softwareId]/agreements/[agreementVersionId]/source/route";
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

function context(workspaceId: string, softwareId: string) {
  return { params: Promise.resolve({ workspaceId, softwareId }) };
}

function sourceContext(
  workspaceId: string,
  softwareId: string,
  agreementVersionId: string,
) {
  return {
    params: Promise.resolve({ workspaceId, softwareId, agreementVersionId }),
  };
}

async function signIn(
  userKey: "officer" | "operator" | "reviewer",
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

function agreementForm(
  text: string,
  overrides: { readonly name?: string; readonly type?: string } = {},
): FormData {
  const form = new FormData();
  form.set(
    "file",
    new File([text], overrides.name ?? "Northstar-DPA-fictional.txt", {
      type: overrides.type ?? "text/plain",
    }),
  );
  form.set("effectiveFrom", "2026-07-01");
  form.set("effectiveUntil", "2027-06-30");
  form.set("uploadedBy", "forged-model-actor");
  return form;
}

beforeEach(() => {
  expect(resetFixture().status).toBe(200);
});

describe("agreement intake HTTP boundary", () => {
  it("uploads, lists, reuses, versions, and downloads exact source bytes", async () => {
    const cookie = await signIn("officer");
    const softwareId = await seededSoftwareId();
    const workspaceId = fixtureWorkspaceIds.cedarRidge;
    const pathname = `/api/workspaces/${workspaceId}/software/${softwareId}/agreements`;
    const versionOneText =
      "Purpose: classroom instruction only.\fRecipients: authorized subprocessors only.";
    const created = await uploadAgreement(
      request(pathname, {
        method: "POST",
        cookie,
        body: agreementForm(versionOneText),
      }),
      context(workspaceId, softwareId),
    );
    const createdBody = (await created.json()) as {
      readonly agreement: {
        readonly id: string;
        readonly version: number;
        readonly sourceSha256: string;
        readonly createdBy: { readonly kind: string; readonly actorId: string };
        readonly pageMap: readonly unknown[];
      };
      readonly duplicate: boolean;
    };
    expect(created.status).toBe(201);
    expect(createdBody).toMatchObject({
      duplicate: false,
      agreement: {
        version: 1,
        createdBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
      },
    });
    expect(createdBody.agreement.pageMap).toHaveLength(2);

    const duplicate = await uploadAgreement(
      request(pathname, {
        method: "POST",
        cookie,
        body: agreementForm(versionOneText),
      }),
      context(workspaceId, softwareId),
    );
    await expect(duplicate.json()).resolves.toMatchObject({
      duplicate: true,
      agreement: { id: createdBody.agreement.id, version: 1 },
    });
    expect(duplicate.status).toBe(200);

    const changed = await uploadAgreement(
      request(pathname, {
        method: "POST",
        cookie,
        body: agreementForm(`${versionOneText}!`),
      }),
      context(workspaceId, softwareId),
    );
    const changedBody = (await changed.json()) as {
      readonly agreement: { readonly version: number; readonly sourceSha256: string };
    };
    expect(changed.status).toBe(201);
    expect(changedBody.agreement.version).toBe(2);
    expect(changedBody.agreement.sourceSha256).not.toBe(
      createdBody.agreement.sourceSha256,
    );

    const listed = await listAgreements(
      request(pathname, { cookie }),
      context(workspaceId, softwareId),
    );
    await expect(listed.json()).resolves.toMatchObject({
      agreements: [{ version: 2 }, { version: 1 }],
    });
    const sourcePath = `${pathname}/${createdBody.agreement.id}/source`;
    const source = await readAgreementSource(
      request(sourcePath, { cookie }),
      sourceContext(workspaceId, softwareId, createdBody.agreement.id),
    );
    expect(source.status).toBe(200);
    expect(source.headers.get("content-type")).toContain("text/plain");
    expect(source.headers.get("content-disposition")).toContain(
      'filename="Northstar-DPA-fictional.txt"',
    );
    await expect(source.text()).resolves.toBe(versionOneText);
  });

  it("rejects malformed input without creating a version", async () => {
    const cookie = await signIn("officer");
    const softwareId = await seededSoftwareId();
    const workspaceId = fixtureWorkspaceIds.cedarRidge;
    const pathname = `/api/workspaces/${workspaceId}/software/${softwareId}/agreements`;
    const response = await uploadAgreement(
      request(pathname, {
        method: "POST",
        cookie,
        body: agreementForm("not a pdf", {
          name: "broken.pdf",
          type: "application/pdf",
        }),
      }),
      context(workspaceId, softwareId),
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AGREEMENT_CORRUPT", auditRecorded: false },
    });
    const listed = await listAgreements(
      request(pathname, { cookie }),
      context(workspaceId, softwareId),
    );
    await expect(listed.json()).resolves.toEqual({ agreements: [] });
  });

  it("lets reviewers read but denies forged uploads and other-workspace access", async () => {
    const officerCookie = await signIn("officer");
    const softwareId = await seededSoftwareId();
    const workspaceId = fixtureWorkspaceIds.cedarRidge;
    const pathname = `/api/workspaces/${workspaceId}/software/${softwareId}/agreements`;
    await uploadAgreement(
      request(pathname, {
        method: "POST",
        cookie: officerCookie,
        body: agreementForm("Fictional agreement source."),
      }),
      context(workspaceId, softwareId),
    );
    const reviewerCookie = await signIn("reviewer");
    const listed = await listAgreements(
      request(pathname, { cookie: reviewerCookie }),
      context(workspaceId, softwareId),
    );
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({ agreements: [{}] });

    const denied = await uploadAgreement(
      request(pathname, {
        method: "POST",
        cookie: reviewerCookie,
        body: agreementForm("Forged upload."),
      }),
      context(workspaceId, softwareId),
    );
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({
      error: { code: "PERMISSION_DENIED", auditRecorded: true },
    });

    const hidden = await listAgreements(
      request(
        `/api/workspaces/${fixtureWorkspaceIds.harbor}/software/${softwareId}/agreements`,
        { cookie: reviewerCookie },
      ),
      context(fixtureWorkspaceIds.harbor, softwareId),
    );
    expect(hidden.status).toBe(404);
    expect(await hidden.text()).not.toContain("Fictional Harbor School District");
  });
});
