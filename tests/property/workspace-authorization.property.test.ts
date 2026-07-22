import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  InMemoryWorkspaceAuthorizationRepository,
  WorkspaceAuthorizationService,
  WorkspaceUnavailableError,
  type WorkspacePermission,
  type WorkspaceRole,
} from "../../packages/core/src/authorization";

const propertyOptions = { seed: 20_260_719, numRuns: 250 } as const;
const roles = [
  "PRIVACY_OFFICER",
  "TEST_OPERATOR",
  "REVIEWER",
  "APPLICATION_APPROVER",
  "SECURITY_REVIEWER",
] as const satisfies readonly WorkspaceRole[];
const permissions = [
  "WORKSPACE_READ",
  "WORKSPACE_EXPORT",
  "ROLE_ASSIGN",
  "AUDIT_READ",
  "REQUIREMENT_CONFIRM",
  "RUN_EXECUTE",
  "EVIDENCE_REVIEW",
  "APPROVAL_RESTORE",
  "DESTINATION_CONFIRM",
  "EVIDENCE_RETENTION_MANAGE",
] as const satisfies readonly WorkspacePermission[];

function idFactory(): () => string {
  let value = 1000;
  return () => {
    value += 1;
    return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
  };
}

function authorizationFixture(): {
  readonly repository: InMemoryWorkspaceAuthorizationRepository;
  readonly service: WorkspaceAuthorizationService;
} {
  const repository = new InMemoryWorkspaceAuthorizationRepository();
  return {
    repository,
    service: new WorkspaceAuthorizationService(repository, {
      idFactory: idFactory(),
      now: () => "2026-07-19T20:10:00.000Z",
    }),
  };
}

const officerA = {
  userId: "fictional-officer-a",
  displayName: "Morgan Vale (Fictional)",
};

describe("workspace authorization properties", () => {
  it("PROP-11: role and access histories append without mutation and preserve human provenance", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...roles), { minLength: 1, maxLength: 30 }),
        async (generatedRoles) => {
          const { repository, service } = authorizationFixture();
          const created = await service.createWorkspace({
            principal: officerA,
            name: "Fictional Cedar Ridge School District",
          });
          const principal = {
            ...officerA,
            activeWorkspaceId: created.workspace.id,
          };

          for (const [index, role] of generatedRoles.entries()) {
            const before = await repository.listAuditEvents(created.workspace.id);
            await service.assignRole({
              principal,
              workspaceId: created.workspace.id,
              targetUserId: `fictional-user-${index}`,
              role,
            });
            const after = await repository.listAuditEvents(created.workspace.id);

            expect(after.slice(0, before.length)).toEqual(before);
            const latest = after.at(-1);
            expect(latest?.action).toBe("workspace.role_assigned");
            expect(latest?.actor.actorId).toBe(officerA.userId);
            expect(Object.isFrozen(after)).toBe(true);
            expect(Object.isFrozen(after.at(-1))).toBe(true);
          }
        },
      ),
      propertyOptions,
    );
  });

  it("PROP-12: cross-workspace read, mutation, reference, and export attempts reveal no target data", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("READ", "ASSIGN", "EXPORT", "CHECK"),
        fc.constantFrom(...roles),
        fc.constantFrom(...permissions),
        async (operation, role, permission) => {
          const { repository, service } = authorizationFixture();
          const createdA = await service.createWorkspace({
            principal: officerA,
            name: "Fictional Cedar Ridge School District",
          });
          const officerB = {
            userId: "fictional-officer-b",
            displayName: "Avery Stone (Fictional)",
          };
          const createdB = await service.createWorkspace({
            principal: officerB,
            name: "Fictional Harbor School District",
          });
          const principalA = {
            ...officerA,
            activeWorkspaceId: createdA.workspace.id,
          };
          const targetBefore = await repository.exportWorkspace(
            createdB.workspace.id,
          );

          const attempt =
            operation === "READ"
              ? service.getWorkspace({
                  principal: principalA,
                  workspaceId: createdB.workspace.id,
                })
              : operation === "ASSIGN"
                ? service.assignRole({
                    principal: principalA,
                    workspaceId: createdB.workspace.id,
                    targetUserId: "fictional-target",
                    role,
                  })
                : operation === "EXPORT"
                  ? service.exportWorkspace({
                      principal: principalA,
                      workspaceId: createdB.workspace.id,
                    })
                  : service.checkPermission({
                      principal: principalA,
                      workspaceId: createdB.workspace.id,
                      permission,
                    });

          await expect(attempt).rejects.toBeInstanceOf(WorkspaceUnavailableError);
          expect(await repository.exportWorkspace(createdB.workspace.id)).toEqual(
            targetBefore,
          );
          const sourceAudits = await repository.listAuditEvents(
            createdA.workspace.id,
          );
          const serialized = JSON.stringify(sourceAudits);
          const latest = sourceAudits.at(-1);
          expect(latest?.action).toBe("workspace.access_denied");
          expect(latest?.details["outcome"]).toBe("DENY");
          expect(latest?.details["reason"]).toBe("WORKSPACE_UNAVAILABLE");
          expect(serialized).not.toContain(createdB.workspace.name);
          expect(serialized).not.toContain(officerB.displayName);
        },
      ),
      propertyOptions,
    );
  });
});
