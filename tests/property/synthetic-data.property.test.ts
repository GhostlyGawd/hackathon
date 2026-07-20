import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  InMemorySyntheticDataRepository,
  SyntheticDataService,
} from "../../packages/core/src/synthetic-data";
import {
  InMemoryWorkspaceAuthorizationRepository,
  WorkspaceAuthorizationService,
} from "../../packages/core/src/authorization";

const propertyOptions = { seed: 20_260_719, numRuns: 250 } as const;

function ids(): () => string {
  let value = 20_000;
  return () => {
    value += 1;
    return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
  };
}

async function fixture() {
  const idFactory = ids();
  const repository = new InMemoryWorkspaceAuthorizationRepository();
  const authorization = new WorkspaceAuthorizationService(repository, {
    idFactory,
    now: () => "2026-07-20T00:30:00.000Z",
  });
  const workspaceA = await authorization.createWorkspace({
    principal: {
      userId: "fictional-officer-a",
      displayName: "Morgan Vale (Fictional)",
    },
    name: "Fictional Cedar Ridge School District",
  });
  const workspaceB = await authorization.createWorkspace({
    principal: {
      userId: "fictional-officer-b",
      displayName: "Avery Frost (Fictional)",
    },
    name: "Fictional Harbor Point School District",
  });
  const principalA = {
    userId: "fictional-officer-a",
    displayName: "Morgan Vale (Fictional)",
    activeWorkspaceId: workspaceA.workspace.id,
  };
  const principalB = {
    userId: "fictional-officer-b",
    displayName: "Avery Frost (Fictional)",
    activeWorkspaceId: workspaceB.workspace.id,
  };
  let token = 0n;
  const service = new SyntheticDataService(
    new InMemorySyntheticDataRepository(repository),
    authorization,
    {
      idFactory,
      now: () => "2026-07-20T00:30:00.000Z",
      tokenFactory: () => (++token).toString(16).padStart(32, "0"),
    },
  );
  const personaA = await service.createPersona({
    principal: principalA,
    workspaceId: workspaceA.workspace.id,
    role: "STUDENT",
    displayName: "Nova Reed (Fictional)",
    email: "nova.reed@student.pactwire.invalid",
    fields: {
      classPhrase: "Fictional astronomy class",
      submissionPhrase: "Fictional response about Saturn",
      gradeBand: "Fictional grade seven",
    },
    confirmedFictional: true,
  });
  const personaB = await service.createPersona({
    principal: principalB,
    workspaceId: workspaceB.workspace.id,
    role: "STUDENT",
    displayName: "Orion Lake (Fictional)",
    email: "orion.lake@student.pactwire.invalid",
    fields: {
      classPhrase: "Fictional marine biology class",
      submissionPhrase: "Fictional response about coral",
      gradeBand: "Fictional grade eight",
    },
    confirmedFictional: true,
  });
  return {
    service,
    workspaceA: {
      principal: principalA,
      persona: personaA,
      workspaceId: workspaceA.workspace.id,
    },
    workspaceB: {
      principal: principalB,
      persona: personaB,
      workspaceId: workspaceB.workspace.id,
    },
  };
}

describe("synthetic data properties", () => {
  it("PROP-16: canaries are unique per run, map to one source, and keep address values non-deliverable", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(
          fc.constantFrom("email", "displayName", "classPhrase", "submissionPhrase", "gradeBand"),
          { minLength: 1, maxLength: 5 },
        ),
        fc.uuid(),
        fc.uuid(),
        async (sourceFields, runA, runB) => {
          fc.pre(runA !== runB);
          const context = await fixture();
          const selectionA = [
            { personaId: context.workspaceA.persona.id, sourceFields },
          ];
          const selectionB = [
            { personaId: context.workspaceB.persona.id, sourceFields },
          ];
          const first = await context.service.generateRunCanaries({
            principal: context.workspaceA.principal,
            workspaceId: context.workspaceA.workspaceId,
            runId: runA,
            selections: selectionA,
          });
          const replay = await context.service.generateRunCanaries({
            principal: context.workspaceA.principal,
            workspaceId: context.workspaceA.workspaceId,
            runId: runA,
            selections: selectionA,
          });
          const second = await context.service.generateRunCanaries({
            principal: context.workspaceA.principal,
            workspaceId: context.workspaceA.workspaceId,
            runId: runB,
            selections: selectionA,
          });
          const otherWorkspace = await context.service.generateRunCanaries({
            principal: context.workspaceB.principal,
            workspaceId: context.workspaceB.workspaceId,
            runId: runA,
            selections: selectionB,
          });

          expect(replay).toEqual(first);
          expect(first).toHaveLength(sourceFields.length);
          expect(new Set(first.map((canary) => canary.sourceField))).toEqual(
            new Set(sourceFields),
          );
          expect(
            first.every(
              (canary) => canary.personaId === context.workspaceA.persona.id,
            ),
          ).toBe(true);
          const allGenerated = [...first, ...second, ...otherWorkspace];
          expect(
            new Set(allGenerated.map((canary) => canary.value)).size,
          ).toBe(allGenerated.length);
          expect(
            allGenerated
              .filter((canary) => canary.sourceField === "email")
              .every((canary) => canary.value.endsWith(".invalid")),
          ).toBe(true);
        },
      ),
      propertyOptions,
    );
  });
});
