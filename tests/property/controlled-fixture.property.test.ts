import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  FIXTURE_VERSIONS,
  createFixtureScenario,
  createSubmissionPlan,
  type FixturePublicScenario,
} from "../../apps/fixture/src/index";

const propertyOptions = { seed: 20_260_721, numRuns: 250 } as const;
const seedArbitrary = fc.stringMatching(/^[A-Za-z0-9_-]{1,48}$/u);

function stableFacts(scenario: FixturePublicScenario) {
  return {
    fixtureId: scenario.fixtureId,
    seed: scenario.seed,
    product: scenario.product,
    fictionalOnly: scenario.fictionalOnly,
    personas: scenario.personas,
    assignment: scenario.assignment,
    submission: scenario.submission,
    agreement: scenario.agreement,
  };
}

describe("controlled fixture generated invariants", () => {
  it("PROP-23 reproduces every public scenario and traffic plan from the same seed", () => {
    fc.assert(
      fc.property(
        seedArbitrary,
        fc.constantFrom(...FIXTURE_VERSIONS),
        (seed, version) => {
          const first = createFixtureScenario({ seed, version });
          const second = createFixtureScenario({ seed, version });

          expect(second).toEqual(first);
          expect(createSubmissionPlan(second)).toEqual(
            createSubmissionPlan(first),
          );
        },
      ),
      propertyOptions,
    );
  });

  it("PROP-24 keeps stable fictional facts fixed while versions alter declared behavior only", () => {
    fc.assert(
      fc.property(seedArbitrary, (seed) => {
        const scenarios = FIXTURE_VERSIONS.map((version) =>
          createFixtureScenario({ seed, version }),
        );
        const baseline = scenarios[0];
        expect(baseline).toBeDefined();

        for (const scenario of scenarios) {
          expect(stableFacts(scenario)).toEqual(stableFacts(baseline!));
          expect(scenario.declaredChanges).toEqual(
            [...scenario.declaredChanges].sort(),
          );
          expect(new Set(scenario.declaredChanges).size).toBe(
            scenario.declaredChanges.length,
          );
        }
      }),
      propertyOptions,
    );
  });
});
