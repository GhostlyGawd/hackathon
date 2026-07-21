import { describe, expect, it } from "vitest";
import {
  buildJourneyVersion,
  journeyVersionSchema,
} from "../../packages/core/src/index";
import {
  journeyFixtureIds,
  journeyPrincipal,
  makeJourneyDraft,
} from "../helpers/journey-authoring-fixtures";

function build(overrides: Readonly<Record<string, unknown>> = {}) {
  return buildJourneyVersion({
    id: journeyFixtureIds.versionOne,
    workspaceId: journeyFixtureIds.workspace,
    softwareId: journeyFixtureIds.software,
    agreementVersionId: journeyFixtureIds.agreement,
    journeyId: journeyFixtureIds.journey,
    version: 1,
    sourceVersionId: null,
    draft: makeJourneyDraft(),
    createdAt: "2026-07-21T10:05:00.000Z",
    createdBy: { kind: "HUMAN", actorId: journeyPrincipal.userId },
    ...overrides,
  });
}

describe("named journey domain", () => {
  it("builds an immutable runnable-shape version with an inspectable causal chain", () => {
    const journey = build();

    expect(journeyVersionSchema.parse(journey)).toEqual(journey);
    expect(journey).toMatchObject({
      version: 1,
      sourceVersionId: null,
      goal: "Submit the unique fictional response to the seeded assignment.",
      startState: "Signed in to the fictional student workspace.",
      requirementVersionIds: [journeyFixtureIds.confirmedRequirement],
      personaId: journeyFixtureIds.persona,
    });
    expect(journey.checkpoints[0]).toMatchObject({
      required: true,
      requiredVisibility: true,
      requirementVersionIds: [journeyFixtureIds.confirmedRequirement],
      testFieldIds: ["student-email", "student-response"],
    });
    expect(Object.isFrozen(journey)).toBe(true);
    expect(Object.isFrozen(journey.checkpoints)).toBe(true);
  });

  it.each([
    ["missing goal", { goal: "" }],
    ["missing start state", { startState: "" }],
    ["no required checkpoint", {
      checkpoints: [
        {
          ...makeJourneyDraft().checkpoints[0]!,
          required: false,
          requiredVisibility: false,
        },
      ],
    }],
    ["checkpoint without a synthetic field", {
      checkpoints: [
        { ...makeJourneyDraft().checkpoints[0]!, testFieldIds: [] },
      ],
    }],
    ["checkpoint linked outside the journey requirements", {
      checkpoints: [
        {
          ...makeJourneyDraft().checkpoints[0]!,
          requirementVersionIds: [
            "12121212-1212-4212-8212-121212121212",
          ],
        },
      ],
    }],
  ])("rejects %s", (_label, draftOverride) => {
    expect(() =>
      build({ draft: makeJourneyDraft(draftOverride) }),
    ).toThrow();
  });

  it("requires an appended version to identify its immutable source", () => {
    expect(() => build({ version: 2, sourceVersionId: null })).toThrow();
    expect(() =>
      build({
        version: 1,
        sourceVersionId: journeyFixtureIds.versionOne,
      }),
    ).toThrow();
  });
});
