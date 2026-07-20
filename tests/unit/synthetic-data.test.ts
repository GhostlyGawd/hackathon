import { describe, expect, it } from "vitest";
import {
  FICTIONAL_CONFIRMATION_STATEMENT_VERSION,
  InMemorySyntheticDataRepository,
  LikelyRealDataError,
  SyntheticDataService,
  generateCanaryValue,
  scanSyntheticPersona,
} from "../../packages/core/src/synthetic-data";
import {
  InMemoryWorkspaceAuthorizationRepository,
  WorkspaceAuthorizationService,
} from "../../packages/core/src/authorization";

function ids(): () => string {
  let value = 12_000;
  return () => {
    value += 1;
    return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
  };
}

async function fixture() {
  const idFactory = ids();
  const workspaceRepository = new InMemoryWorkspaceAuthorizationRepository();
  const authorization = new WorkspaceAuthorizationService(workspaceRepository, {
    idFactory,
    now: () => "2026-07-20T00:30:00.000Z",
  });
  const created = await authorization.createWorkspace({
    principal: {
      userId: "fictional-officer-a",
      displayName: "Morgan Vale (Fictional)",
    },
    name: "Fictional Cedar Ridge School District",
  });
  await authorization.assignRole({
    principal: {
      userId: "fictional-officer-a",
      displayName: "Morgan Vale (Fictional)",
      activeWorkspaceId: created.workspace.id,
    },
    workspaceId: created.workspace.id,
    targetUserId: "fictional-operator-a",
    role: "TEST_OPERATOR",
  });
  const principal = {
    userId: "fictional-operator-a",
    displayName: "Riley Chen (Fictional)",
    activeWorkspaceId: created.workspace.id,
  };
  let token = 0;
  const repository = new InMemorySyntheticDataRepository(workspaceRepository);
  const service = new SyntheticDataService(repository, authorization, {
    idFactory,
    now: () => "2026-07-20T00:30:00.000Z",
    tokenFactory: () => (++token).toString(16).padStart(32, "0"),
  });
  return { principal, repository, service, workspaceId: created.workspace.id };
}

const safeDraft = {
  role: "STUDENT" as const,
  displayName: "Nova Reed (Fictional)",
  email: "nova.reed@student.pactwire.invalid",
  fields: {
    classPhrase: "Fictional astronomy class",
    submissionPhrase: "Fictional response about Saturn",
  },
};

describe("synthetic persona and canary primitives", () => {
  it("blocks routable email, numeric student ID, phone, and unmarked names without echoing values", () => {
    const candidate = {
      role: "STUDENT",
      displayName: "Taylor Morgan",
      email: "taylor@real-school.edu",
      fields: {
        studentId: "123456789",
        guardianPhone: "212-555-0199",
      },
    };
    const result = scanSyntheticPersona(candidate);

    expect(result.outcome).toBe("BLOCKED");
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "NOT_MARKED_FICTIONAL",
        "ROUTABLE_EMAIL_DOMAIN",
        "POSSIBLE_STUDENT_IDENTIFIER",
        "POSSIBLE_PHONE_NUMBER",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain(candidate.email);
    expect(JSON.stringify(result)).not.toContain(candidate.fields.studentId);
  });

  it("accepts obviously fictional values and formats address canaries on a reserved domain", () => {
    expect(scanSyntheticPersona(safeDraft)).toMatchObject({
      outcome: "CLEAR",
      findings: [],
    });
    expect(generateCanaryValue("email", "a".repeat(32))).toBe(
      `pw-${"a".repeat(32)}@canary.pactwire.invalid`,
    );
    expect(generateCanaryValue("submissionPhrase", "b".repeat(32))).toBe(
      `PACTWIRE-FICTIONAL-${"b".repeat(32).toUpperCase()}`,
    );
  });

  it("requires attestation and never persists a likely-real draft", async () => {
    const context = await fixture();
    await expect(
      context.service.createPersona({
        principal: context.principal,
        workspaceId: context.workspaceId,
        ...safeDraft,
        confirmedFictional: false,
      }),
    ).rejects.toThrow();
    await expect(
      context.service.createPersona({
        principal: context.principal,
        workspaceId: context.workspaceId,
        role: "STUDENT",
        displayName: "Taylor Morgan",
        email: "taylor@real-school.edu",
        fields: { studentId: "123456789" },
        confirmedFictional: true,
      }),
    ).rejects.toBeInstanceOf(LikelyRealDataError);
    await expect(
      context.service.listPersonas({
        principal: context.principal,
        workspaceId: context.workspaceId,
      }),
    ).resolves.toEqual([]);
  });

  it("records confirmation and creates one idempotent mapping per run, persona, and field", async () => {
    const context = await fixture();
    const persona = await context.service.createPersona({
      principal: context.principal,
      workspaceId: context.workspaceId,
      ...safeDraft,
      confirmedFictional: true,
    });
    expect(persona.fictionalConfirmation.statementVersion).toBe(
      FICTIONAL_CONFIRMATION_STATEMENT_VERSION,
    );
    expect(persona.scanResult).toMatchObject({ outcome: "CLEAR", findings: [] });

    const runId = "11111111-2222-4333-8444-555555555555";
    const input = {
      principal: context.principal,
      workspaceId: context.workspaceId,
      runId,
      selections: [
        {
          personaId: persona.id,
          sourceFields: ["email", "submissionPhrase"],
        },
      ],
    };
    const first = await context.service.generateRunCanaries(input);
    const replay = await context.service.generateRunCanaries(input);

    expect(first).toHaveLength(2);
    expect(replay).toEqual(first);
    expect(new Set(first.map((canary) => canary.value)).size).toBe(2);
    expect(first.every((canary) => canary.personaId === persona.id)).toBe(true);
    expect(first.find((canary) => canary.sourceField === "email")?.value).toMatch(
      /@canary\.pactwire\.invalid$/u,
    );
  });
});
