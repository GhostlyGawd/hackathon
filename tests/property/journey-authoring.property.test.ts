import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildJourneyVersion } from "../../packages/core/src/index";
import {
  journeyFixtureIds,
  journeyPrincipal,
  makeJourneyDraft,
} from "../helpers/journey-authoring-fixtures";

const propertyOptions = { seed: 20_260_721, numRuns: 250 } as const;

describe("named journey properties", () => {
  it("PROP-25: every accepted required checkpoint retains a complete causal link", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/u),
          { minLength: 1, maxLength: 6 },
        ),
        fc.uniqueArray(
          fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/u),
          { minLength: 1, maxLength: 6 },
        ),
        (fieldIds, checkpointIds) => {
          const testFields = fieldIds.map((fieldId, index) => ({
            fieldId,
            sourceField: index === 0 ? "email" : `fictionalField${index}`,
            requirementVersionId: journeyFixtureIds.confirmedRequirement,
          }));
          const checkpoints = checkpointIds.map((checkpointId) => ({
            checkpointId,
            required: true,
            description: `Observe fictional checkpoint ${checkpointId}.`,
            observationSource: "NETWORK" as const,
            requiredVisibility: true,
            requirementVersionIds: [journeyFixtureIds.confirmedRequirement],
            testFieldIds: [...fieldIds],
          }));
          const journey = buildJourneyVersion({
            id: journeyFixtureIds.versionOne,
            workspaceId: journeyFixtureIds.workspace,
            softwareId: journeyFixtureIds.software,
            agreementVersionId: journeyFixtureIds.agreement,
            journeyId: journeyFixtureIds.journey,
            version: 1,
            sourceVersionId: null,
            draft: makeJourneyDraft({ testFields, checkpoints }),
            createdAt: "2026-07-21T10:05:00.000Z",
            createdBy: { kind: "HUMAN", actorId: journeyPrincipal.userId },
          });

          const acceptedFields = new Set(
            journey.testFields.map((field) => field.fieldId),
          );
          for (const checkpoint of journey.checkpoints.filter(
            (item) => item.required,
          )) {
            expect(checkpoint.requiredVisibility).toBe(true);
            expect(checkpoint.requirementVersionIds).not.toHaveLength(0);
            expect(checkpoint.testFieldIds).not.toHaveLength(0);
            expect(
              checkpoint.testFieldIds.every((fieldId) =>
                acceptedFields.has(fieldId),
              ),
            ).toBe(true);
          }
        },
      ),
      propertyOptions,
    );
  });

  it("PROP-25: appending generated edits cannot change historical journey bytes", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 120 }).filter(
          (value) => value.trim().length > 0,
        ),
        (goal) => {
          const first = buildJourneyVersion({
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
          });
          const before = JSON.stringify(first);
          const second = buildJourneyVersion({
            id: journeyFixtureIds.versionTwo,
            workspaceId: journeyFixtureIds.workspace,
            softwareId: journeyFixtureIds.software,
            agreementVersionId: journeyFixtureIds.agreement,
            journeyId: journeyFixtureIds.journey,
            version: 2,
            sourceVersionId: first.id,
            draft: makeJourneyDraft({ goal }),
            createdAt: "2026-07-21T10:06:00.000Z",
            createdBy: { kind: "HUMAN", actorId: journeyPrincipal.userId },
          });

          expect(JSON.stringify(first)).toBe(before);
          expect(second.sourceVersionId).toBe(first.id);
          expect(second.version).toBe(first.version + 1);
          expect(second.journeyId).toBe(first.journeyId);
        },
      ),
      propertyOptions,
    );
  });
});
