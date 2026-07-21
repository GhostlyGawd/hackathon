import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  IsolationResourceConflictError,
  IsolationResourceRegistry,
  type IsolationResourceAllocation,
} from "../../apps/runner/src/isolated-browser";

const seed = 20260721;
const numRuns = 250;
const uuid = fc.uuid({ version: 4 });
const allocationArbitrary = fc.record({
  workspaceId: uuid,
  runId: uuid,
  browserId: uuid,
  contextId: uuid,
  clipboardId: uuid,
  downloadScopeId: uuid,
  releaseAfterRegister: fc.boolean(),
});

function resourceIds(allocation: IsolationResourceAllocation): readonly string[] {
  return [
    allocation.browserId,
    allocation.contextId,
    allocation.clipboardId,
    allocation.downloadScopeId,
  ];
}

describe("isolated browser lifecycle properties", () => {
  it("PROP-20: arbitrary run order and concurrency never share a resource", () => {
    fc.assert(
      fc.property(
        fc.array(allocationArbitrary, { minLength: 1, maxLength: 40 }),
        (candidates) => {
          const registry = new IsolationResourceRegistry();
          const usedRuns = new Set<string>();
          const usedResources = new Set<string>();
          const activeRuns = new Set<string>();

          for (const candidate of candidates) {
            const { releaseAfterRegister, ...allocation } = candidate;
            const resources = resourceIds(allocation);
            const conflicts =
              usedRuns.has(allocation.runId) ||
              resources.some((resource) => usedResources.has(resource)) ||
              new Set(resources).size !== resources.length;
            if (conflicts) {
              expect(() => registry.register(allocation)).toThrow(
                IsolationResourceConflictError,
              );
              continue;
            }

            registry.register(allocation);
            usedRuns.add(allocation.runId);
            for (const resource of resources) usedResources.add(resource);
            activeRuns.add(allocation.runId);
            if (releaseAfterRegister) {
              registry.release(allocation.runId);
              activeRuns.delete(allocation.runId);
            }

            const active = registry.activeAllocations();
            expect(new Set(active.map((entry) => entry.runId))).toEqual(activeRuns);
            const activeResources = active.flatMap((entry) => resourceIds(entry));
            expect(new Set(activeResources).size).toBe(activeResources.length);
          }
        },
      ),
      { seed, numRuns },
    );
  });

  it("PROP-20: released resources can never be assigned to a later run", () => {
    fc.assert(
      fc.property(
        allocationArbitrary,
        uuid.filter((candidate) => candidate.length > 0),
        (candidate, laterRunId) => {
          const { releaseAfterRegister: _ignored, ...allocation } = candidate;
          fc.pre(laterRunId !== allocation.runId);
          const registry = new IsolationResourceRegistry();
          registry.register(allocation);
          registry.release(allocation.runId);

          expect(() =>
            registry.register({ ...allocation, runId: laterRunId }),
          ).toThrow(IsolationResourceConflictError);
        },
      ),
      { seed, numRuns },
    );
  });
});
