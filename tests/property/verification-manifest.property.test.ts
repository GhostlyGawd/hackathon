import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateVerificationManifest } from "../../packages/evidence/src/manifest";
import { makeValidManifest } from "../helpers/verification-manifest";

const propertyOptions = { seed: 20_260_719, numRuns: 200 } as const;

const requiredFields = [
  "schemaVersion",
  "taskId",
  "title",
  "status",
  "prdSections",
  "functionalRequirements",
  "sourceCommitSha",
  "startedAt",
  "completedAt",
  "artifactRoot",
  "curatedEvidenceRoot",
  "environment",
  "commands",
  "testSummary",
  "propertyTests",
  "bdd",
  "visualEvidence",
  "proofs",
  "sanitization",
  "knownLimitations",
  "reviewer",
] as const;

function recordField(
  candidate: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const value = candidate[field];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} is not an object`);
  }
  return value as Record<string, unknown>;
}

describe("verification manifest properties", () => {
  it("accepts generated valid required-field combinations", () => {
    fc.assert(
      fc.property(
        fc.record({
          taskId: fc.constantFrom("FND-02", "AUT-01", "UX-01", "DEMO-01"),
          title: fc.string({ minLength: 1, maxLength: 100 }),
          sections: fc.uniqueArray(fc.integer({ min: 1, max: 26 }), {
            minLength: 1,
            maxLength: 10,
          }),
          requirements: fc.uniqueArray(
            fc.constantFrom("FR-001", "FR-023", "FR-056"),
            { maxLength: 3 },
          ),
          seed: fc.integer(),
          numRuns: fc.integer({ min: 1, max: 10_000 }),
        }),
        ({ taskId, title, sections, requirements, seed, numRuns }) => {
          const candidate = makeValidManifest({
            taskId,
            title,
            prdSections: sections,
            functionalRequirements: requirements,
            artifactRoot: `artifacts/verification/${taskId}/`,
            curatedEvidenceRoot: `docs/evidence/${taskId}/`,
            propertyTests: {
              applicable: true,
              results: [
                {
                  id: "generated-validity",
                  seed,
                  numRuns,
                  passed: true,
                },
              ],
            },
          });

          expect(validateVerificationManifest(candidate).ok).toBe(true);
        },
      ),
      propertyOptions,
    );
  });

  it("rejects every arbitrarily removed required field", () => {
    fc.assert(
      fc.property(fc.constantFrom(...requiredFields), (field) => {
        const candidate = structuredClone(makeValidManifest());
        delete candidate[field];

        expect(validateVerificationManifest(candidate).ok).toBe(false);
      }),
      propertyOptions,
    );
  });

  it("rejects generated contradictory completion claims", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "failed-test",
          "skipped-test",
          "retried-test",
          "failed-regression",
          "zero-source-sha",
          "wrong-artifact-root",
          "backward-time",
          "inapplicable-property-results",
          "inapplicable-bdd-scenarios",
          "unreviewed-sanitization",
        ),
        (contradiction) => {
          const candidate = structuredClone(makeValidManifest());
          switch (contradiction) {
            case "failed-test":
              recordField(candidate, "testSummary")["failed"] = 1;
              break;
            case "skipped-test":
              recordField(candidate, "testSummary")["skipped"] = 1;
              break;
            case "retried-test":
              recordField(candidate, "testSummary")["retries"] = 1;
              break;
            case "failed-regression": {
              const commands = candidate["commands"];
              if (Array.isArray(commands) && commands[1]) {
                (commands[1] as Record<string, unknown>)["exitCode"] = 1;
              }
              break;
            }
            case "zero-source-sha":
              candidate["sourceCommitSha"] = "0".repeat(40);
              break;
            case "wrong-artifact-root":
              candidate["artifactRoot"] = "artifacts/verification/FND-99/";
              break;
            case "backward-time":
              candidate["completedAt"] = "2026-07-19T17:00:00.000Z";
              break;
            case "inapplicable-property-results":
              recordField(candidate, "propertyTests")["applicable"] = false;
              break;
            case "inapplicable-bdd-scenarios":
              candidate["bdd"] = {
                applicable: false,
                rationale: "Not applicable",
                scenarios: [
                  { feature: "example.feature", scenario: "Example", passed: true },
                ],
              };
              break;
            case "unreviewed-sanitization":
              recordField(candidate, "sanitization")["reviewed"] = false;
              break;
          }

          expect(validateVerificationManifest(candidate).ok).toBe(false);
        },
      ),
      propertyOptions,
    );
  });
});
