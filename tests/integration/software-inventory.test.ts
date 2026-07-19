import { afterEach, describe, expect, it } from "vitest";
import {
  PostgresSoftwareInventoryRepository,
  SoftwareInventoryService,
} from "../../packages/core/src/inventory";
import {
  PostgresWorkspaceAuthorizationRepository,
  WorkspaceAuthorizationService,
} from "../../packages/core/src/authorization";
import { applyCoreMigrations } from "../../packages/core/src/migrations";
import {
  createDatabaseTestService,
  type DatabaseTestService,
} from "../../packages/testkit/src/index";

const databases: DatabaseTestService[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

function ids(): () => string {
  let value = 500;
  return () => {
    value += 1;
    return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
  };
}

function createInput(
  principal: {
    readonly userId: string;
    readonly displayName: string;
    readonly activeWorkspaceId: string;
  },
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    principal,
    workspaceId: principal.activeWorkspaceId,
    name: "Northstar Classroom (Fictional)",
    vendorName: "Northstar Learning Labs (Fictional)",
    authorizedTenantUrl: "https://cedar.northstar.invalid",
    districtOwner: "Curriculum and Instruction",
    knownVersion: "2026.7-fixture",
    approval: {
      state: "APPROVED",
      setBy: {
        kind: "IMPORTED_SYSTEM",
        actorId: "fictional-district-registry",
        displayName: "Fictional Cedar Ridge App Registry",
        source: "district inventory export",
      },
      reason: "Imported existing district approval record.",
      sourceReference: "AP-2042",
    },
    ...overrides,
  };
}

async function services() {
  const database = await createDatabaseTestService();
  databases.push(database);
  await applyCoreMigrations(database.database);
  const authorizationRepository = new PostgresWorkspaceAuthorizationRepository(
    database.database,
  );
  const idFactory = ids();
  const authorization = new WorkspaceAuthorizationService(
    authorizationRepository,
    { idFactory, now: () => "2026-07-19T20:45:00.000Z" },
  );
  const inventoryRepository = new PostgresSoftwareInventoryRepository(
    database.database,
  );
  const inventory = new SoftwareInventoryService(
    inventoryRepository,
    authorization,
    { idFactory, now: () => "2026-07-19T20:46:00.000Z" },
  );
  return { database, authorization, inventory, inventoryRepository };
}

describe("PostgreSQL software inventory", () => {
  it("creates the software record and immutable approval origin in one transaction", async () => {
    const { database, authorization, inventory, inventoryRepository } =
      await services();
    const creator = {
      userId: "fictional-officer-a",
      displayName: "Morgan Vale (Fictional)",
    };
    const workspace = await authorization.createWorkspace({
      principal: creator,
      name: "Fictional Cedar Ridge School District",
    });
    const principal = {
      ...creator,
      activeWorkspaceId: workspace.workspace.id,
    };

    const item = await inventory.createSoftware(createInput(principal));
    expect(item.software).toMatchObject({
      name: "Northstar Classroom (Fictional)",
      approvalState: "APPROVED",
      approvalOrigin: {
        state: "APPROVED",
        setBy: {
          kind: "IMPORTED_SYSTEM",
          displayName: "Fictional Cedar Ridge App Registry",
        },
      },
    });
    expect(item.latestRun).toBeNull();

    const origins = await database.database.query<{
      readonly actor_kind: string;
      readonly source_reference: string;
    }>(
      "SELECT actor_kind, source_reference FROM software_approval_origins WHERE workspace_id = $1 AND software_id = $2",
      [principal.activeWorkspaceId, item.software.id],
    );
    expect(origins.rows).toEqual([
      { actor_kind: "IMPORTED_SYSTEM", source_reference: "AP-2042" },
    ]);
    await expect(
      database.database.query(
        "UPDATE software_approval_origins SET source_reference = 'CHANGED' WHERE workspace_id = $1 AND software_id = $2",
        [principal.activeWorkspaceId, item.software.id],
      ),
    ).rejects.toThrow("immutable");

    await database.database.query(
      "UPDATE software_records SET approval_state = 'HOLD', approval_owner = 'HUMAN' WHERE workspace_id = $1 AND id = $2",
      [principal.activeWorkspaceId, item.software.id],
    );
    await database.database.query(
      "INSERT INTO software_approval_origins (workspace_id, id, software_id, state, actor_kind, set_by, reason, source_reference, recorded_by, recorded_at) VALUES ($1, $2, $3, 'HOLD', 'HUMAN', $4, 'Fictional human hold decision.', 'HR-102', $5, $6)",
      [
        principal.activeWorkspaceId,
        "99999999-9999-4999-8999-999999999999",
        item.software.id,
        {
          kind: "HUMAN",
          actorId: "fictional-approver-a",
          displayName: "Dana Lopez (Fictional)",
        },
        { kind: "HUMAN", actorId: "fictional-officer-a" },
        "2026-07-19T21:00:00.000Z",
      ],
    );
    const current = await inventoryRepository.readSoftware(
      principal.activeWorkspaceId,
      item.software.id,
    );
    expect(current).toMatchObject({
      approvalState: "HOLD",
      approvalOrigin: {
        state: "HOLD",
        setBy: {
          kind: "HUMAN",
          displayName: "Dana Lopez (Fictional)",
        },
      },
    });
    const history = await database.database.query<{ readonly count: number }>(
      "SELECT count(*)::int AS count FROM software_approval_origins WHERE workspace_id = $1 AND software_id = $2",
      [principal.activeWorkspaceId, item.software.id],
    );
    expect(history.rows[0]?.count).toBe(2);
  });

  it("lists and filters only the active workspace without losing provenance", async () => {
    const { authorization, inventory } = await services();
    const creatorA = {
      userId: "fictional-officer-a",
      displayName: "Morgan Vale (Fictional)",
    };
    const creatorB = {
      userId: "fictional-officer-b",
      displayName: "Avery Stone (Fictional)",
    };
    const workspaceA = await authorization.createWorkspace({
      principal: creatorA,
      name: "Fictional Cedar Ridge School District",
    });
    const workspaceB = await authorization.createWorkspace({
      principal: creatorB,
      name: "Fictional Harbor School District",
    });
    const principalA = {
      ...creatorA,
      activeWorkspaceId: workspaceA.workspace.id,
    };
    const principalB = {
      ...creatorB,
      activeWorkspaceId: workspaceB.workspace.id,
    };
    await inventory.createSoftware(createInput(principalA));
    await inventory.createSoftware(
      createInput(principalA, {
        name: "Beacon Assessment (Fictional)",
        approval: {
          state: "REJECTED",
          setBy: {
            kind: "HUMAN",
            actorId: "fictional-approver-a",
            displayName: "Dana Lopez (Fictional)",
          },
          reason: "District application review decision.",
          sourceReference: "AR-901",
        },
      }),
    );
    await inventory.createSoftware(
      createInput(principalB, { name: "Harbor Secret Product (Fictional)" }),
    );

    const approved = await inventory.listSoftware({
      principal: principalA,
      workspaceId: principalA.activeWorkspaceId,
      approvalState: "APPROVED",
      query: "northstar",
    });
    expect(approved).toHaveLength(1);
    expect(approved[0]?.software.name).toBe(
      "Northstar Classroom (Fictional)",
    );
    expect(JSON.stringify(approved)).not.toContain("Harbor Secret Product");
    await expect(
      inventory.listSoftware({
        principal: principalA,
        workspaceId: principalB.activeWorkspaceId,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
