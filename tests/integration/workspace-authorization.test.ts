import { afterEach, describe, expect, it } from "vitest";
import {
  PostgresWorkspaceAuthorizationRepository,
  WorkspaceAuthorizationService,
  WorkspaceUnavailableError,
} from "../../packages/core/src/authorization";
import { applyCoreMigrations } from "../../packages/core/src/migrations";
import {
  createDatabaseTestService,
  type DatabaseTestService,
} from "../../packages/testkit/src/index";

const databases: DatabaseTestService[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((service) => service.close()));
});

function idFactory(): () => string {
  let value = 100;
  return () => {
    value += 1;
    return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
  };
}

describe("PostgreSQL workspace authorization boundary", () => {
  it("keeps cross-workspace reads and exports invisible while preserving a denial audit", async () => {
    const database = await createDatabaseTestService();
    databases.push(database);
    await applyCoreMigrations(database.database);
    const repository = new PostgresWorkspaceAuthorizationRepository(
      database.database,
    );
    const service = new WorkspaceAuthorizationService(repository, {
      idFactory: idFactory(),
      now: () => "2026-07-19T20:00:00.000Z",
    });
    const creatorA = {
      userId: "fictional-officer-a",
      displayName: "Morgan Vale (Fictional)",
    };
    const creatorB = {
      userId: "fictional-officer-b",
      displayName: "Avery Stone (Fictional)",
    };
    const createdA = await service.createWorkspace({
      principal: creatorA,
      name: "Fictional Cedar Ridge School District",
    });
    const createdB = await service.createWorkspace({
      principal: creatorB,
      name: "Fictional Harbor School District",
    });
    const principalA = {
      ...creatorA,
      activeWorkspaceId: createdA.workspace.id,
    };

    await expect(
      service.getWorkspace({
        principal: principalA,
        workspaceId: createdB.workspace.id,
      }),
    ).rejects.toMatchObject({
      status: 404,
      publicMessage: "Workspace not found or not available.",
    });
    await expect(
      service.exportWorkspace({
        principal: principalA,
        workspaceId: createdB.workspace.id,
      }),
    ).rejects.toBeInstanceOf(WorkspaceUnavailableError);

    const audits = await repository.listAuditEvents(createdA.workspace.id);
    const serialized = JSON.stringify(audits);
    expect(
      audits.filter((event) => event.action === "workspace.access_denied"),
    ).toHaveLength(2);
    expect(serialized).not.toContain(createdB.workspace.name);
    expect(serialized).not.toContain(creatorB.displayName);
  });
});
