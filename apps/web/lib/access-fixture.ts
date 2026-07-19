import { randomUUID } from "node:crypto";
import {
  InMemoryWorkspaceAuthorizationRepository,
  InMemorySoftwareInventoryRepository,
  SoftwareInventoryService,
  WorkspaceAuthorizationService,
  type WorkspacePrincipal,
} from "@pactwire/core";

export const fixtureWorkspaceIds = Object.freeze({
  cedarRidge: "11111111-1111-4111-8111-111111111111",
  harbor: "22222222-2222-4222-8222-222222222222",
});

export interface FixtureUser {
  readonly key: "officer" | "operator" | "reviewer" | "harbor-officer";
  readonly userId: string;
  readonly displayName: string;
  readonly activeWorkspaceId: string;
}

export const fixtureUsers: Readonly<Record<FixtureUser["key"], FixtureUser>> =
  Object.freeze({
    officer: Object.freeze({
      key: "officer",
      userId: "fictional-officer-a",
      displayName: "Morgan Vale (Fictional)",
      activeWorkspaceId: fixtureWorkspaceIds.cedarRidge,
    }),
    operator: Object.freeze({
      key: "operator",
      userId: "fictional-operator-a",
      displayName: "Riley Chen (Fictional)",
      activeWorkspaceId: fixtureWorkspaceIds.cedarRidge,
    }),
    reviewer: Object.freeze({
      key: "reviewer",
      userId: "fictional-reviewer-a",
      displayName: "Jordan Brooks (Fictional)",
      activeWorkspaceId: fixtureWorkspaceIds.cedarRidge,
    }),
    "harbor-officer": Object.freeze({
      key: "harbor-officer",
      userId: "fictional-officer-b",
      displayName: "Avery Stone (Fictional)",
      activeWorkspaceId: fixtureWorkspaceIds.harbor,
    }),
  });

export interface AccessRuntime {
  readonly repository: InMemoryWorkspaceAuthorizationRepository;
  readonly service: WorkspaceAuthorizationService;
  readonly inventoryRepository: InMemorySoftwareInventoryRepository;
  readonly inventoryService: SoftwareInventoryService;
}

export function isFixtureMode(): boolean {
  if (process.env.PACTWIRE_FIXTURE_MODE === "1") {
    return true;
  }
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.PACTWIRE_FIXTURE_MODE !== "0"
  );
}

function fixtureIdFactory(): () => string {
  const firstIds = [
    fixtureWorkspaceIds.cedarRidge,
    "31313131-3131-4131-8131-313131313131",
    "32323232-3232-4232-8232-323232323232",
    "33333333-3333-4333-8333-333333333334",
    fixtureWorkspaceIds.harbor,
    "34343434-3434-4434-8434-343434343434",
    "35353535-3535-4535-8535-353535353535",
    "36363636-3636-4636-8636-363636363636",
    "37373737-3737-4737-8737-373737373737",
    "38383838-3838-4838-8838-383838383838",
    "39393939-3939-4939-8939-393939393939",
    "40404040-4040-4040-8040-404040404040",
    "41414141-4141-4141-8141-414141414141",
    "42424242-4242-4242-8242-424242424242",
  ];
  return () => firstIds.shift() ?? randomUUID();
}

function fixtureClock(): () => string {
  let offset = 0;
  return () => {
    const current = new Date(Date.UTC(2026, 6, 19, 20, 30, offset));
    offset += 1;
    return current.toISOString();
  };
}

async function createFixtureRuntime(): Promise<AccessRuntime> {
  if (!isFixtureMode()) {
    throw new Error("The local access fixture is disabled");
  }
  const repository = new InMemoryWorkspaceAuthorizationRepository();
  const idFactory = fixtureIdFactory();
  const now = fixtureClock();
  const service = new WorkspaceAuthorizationService(repository, {
    idFactory,
    now,
  });
  await service.createWorkspace({
    principal: principalForFixtureUser(fixtureUsers.officer),
    name: "Fictional Cedar Ridge School District",
  });
  await service.createWorkspace({
    principal: principalForFixtureUser(fixtureUsers["harbor-officer"]),
    name: "Fictional Harbor School District",
  });
  await service.assignRole({
    principal: principalForFixtureUser(fixtureUsers.officer),
    workspaceId: fixtureWorkspaceIds.cedarRidge,
    targetUserId: fixtureUsers.operator.userId,
    role: "TEST_OPERATOR",
  });
  await service.assignRole({
    principal: principalForFixtureUser(fixtureUsers.officer),
    workspaceId: fixtureWorkspaceIds.cedarRidge,
    targetUserId: fixtureUsers.reviewer.userId,
    role: "REVIEWER",
  });
  const inventoryRepository = new InMemorySoftwareInventoryRepository(
    repository,
  );
  const inventoryService = new SoftwareInventoryService(
    inventoryRepository,
    service,
    { idFactory, now },
  );
  return Object.freeze({
    repository,
    service,
    inventoryRepository,
    inventoryService,
  });
}

let fixtureRuntime: Promise<AccessRuntime> | undefined;

export function getAccessRuntime(): Promise<AccessRuntime> {
  fixtureRuntime ??= createFixtureRuntime();
  return fixtureRuntime;
}

export function resetAccessRuntime(): void {
  fixtureRuntime = undefined;
}

export function fixtureUserByKey(key: string): FixtureUser | undefined {
  return fixtureUsers[key as FixtureUser["key"]];
}

export function fixtureUserById(userId: string): FixtureUser | undefined {
  return Object.values(fixtureUsers).find((user) => user.userId === userId);
}

export function principalForFixtureUser(user: FixtureUser): WorkspacePrincipal {
  return {
    userId: user.userId,
    displayName: user.displayName,
    activeWorkspaceId: user.activeWorkspaceId,
  };
}
