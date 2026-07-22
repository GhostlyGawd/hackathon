import { describe, expect, it } from "vitest";
import {
  AuthenticationRequiredError,
  InMemoryWorkspaceAuthorizationRepository,
  PermissionDeniedError,
  WorkspaceAuthorizationService,
  roleCan,
} from "../../packages/core/src/authorization";

const workspaceId = "71717171-7171-4171-8171-717171717171";

function deterministicService(): {
  readonly repository: InMemoryWorkspaceAuthorizationRepository;
  readonly service: WorkspaceAuthorizationService;
} {
  const ids = [
    workspaceId,
    "72727272-7272-4272-8272-727272727272",
    "73737373-7373-4373-8373-737373737373",
    "74747474-7474-4474-8474-747474747474",
    "75757575-7575-4575-8575-757575757575",
    "76767676-7676-4676-8676-767676767676",
    "77777777-7777-4777-8777-777777777778",
    "78787878-7878-4878-8878-787878787878",
  ];
  const repository = new InMemoryWorkspaceAuthorizationRepository();
  const service = new WorkspaceAuthorizationService(repository, {
    idFactory: () => {
      const id = ids.shift();
      if (!id) {
        throw new Error("Deterministic test IDs exhausted");
      }
      return id;
    },
    now: () => "2026-07-19T20:00:00.000Z",
  });
  return { repository, service };
}

const creator = {
  userId: "fictional-officer",
  displayName: "Morgan Vale (Fictional)",
};

describe("workspace server authorization", () => {
  it("creates a workspace with its human creator as privacy officer and audits both facts", async () => {
    const { repository, service } = deterministicService();

    const created = await service.createWorkspace({
      principal: creator,
      name: "Fictional Cedar Ridge School District",
    });
    const audits = await repository.listAuditEvents(workspaceId);

    expect(created.workspace.id).toBe(workspaceId);
    expect(created.ownerAssignment.role).toBe("PRIVACY_OFFICER");
    expect(created.ownerAssignment.userId).toBe(creator.userId);
    expect(audits.map((event) => event.action)).toEqual([
      "workspace.created",
      "workspace.role_assigned",
    ]);
    expect(audits.every((event) => event.actor.actorId === creator.userId)).toBe(
      true,
    );
  });

  it("loads roles server-side and denies an operator's privacy-officer action without mutation", async () => {
    const { repository, service } = deterministicService();
    await service.createWorkspace({ principal: creator, name: "Fictional District" });
    const officer = { ...creator, activeWorkspaceId: workspaceId };
    await service.assignRole({
      principal: officer,
      workspaceId,
      targetUserId: "fictional-operator",
      role: "TEST_OPERATOR",
    });
    const operator = {
      userId: "fictional-operator",
      displayName: "Riley Chen (Fictional)",
      activeWorkspaceId: workspaceId,
    };

    await expect(
      service.assignRole({
        principal: operator,
        workspaceId,
        targetUserId: "fictional-reviewer",
        role: "REVIEWER",
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);

    const assignments = await repository.listRoleAssignments(
      workspaceId,
      "fictional-reviewer",
    );
    const audits = await repository.listAuditEvents(workspaceId);
    expect(assignments).toEqual([]);
    const denial = audits.find(
      (event) => event.action === "workspace.access_denied",
    );
    expect(denial?.actor.actorId).toBe("fictional-operator");
    expect(denial?.details["permission"]).toBe("ROLE_ASSIGN");
    expect(denial?.details["reason"]).toBe("ROLE_MISSING");
  });

  it("uses an explicit permission matrix for the three AUT-01 roles", () => {
    expect(roleCan("PRIVACY_OFFICER", "ROLE_ASSIGN")).toBe(true);
    expect(roleCan("TEST_OPERATOR", "RUN_EXECUTE")).toBe(true);
    expect(roleCan("TEST_OPERATOR", "ROLE_ASSIGN")).toBe(false);
    expect(roleCan("REVIEWER", "AUDIT_READ")).toBe(true);
    expect(roleCan("REVIEWER", "RUN_EXECUTE")).toBe(false);
    expect(roleCan("PRIVACY_OFFICER", "EVIDENCE_RETENTION_MANAGE")).toBe(true);
    expect(roleCan("REVIEWER", "EVIDENCE_RETENTION_MANAGE")).toBe(false);
  });

  it("does not let a forged active-workspace claim write into that workspace's audit", async () => {
    const { repository, service } = deterministicService();
    await service.createWorkspace({ principal: creator, name: "Fictional District" });
    const forgedPrincipal = {
      userId: "fictional-outsider",
      displayName: "Unknown Fictional User",
      activeWorkspaceId: workspaceId,
    };

    await expect(
      service.getWorkspace({
        principal: forgedPrincipal,
        workspaceId: "79797979-7979-4979-8979-797979797979",
      }),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);

    const audits = await repository.listAuditEvents(workspaceId);
    expect(
      audits.some((event) => event.actor.actorId === forgedPrincipal.userId),
    ).toBe(false);
  });
});
