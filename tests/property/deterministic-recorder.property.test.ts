import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BROWSER_CDP_RECORDER_VERSION,
  canonicalizeRecorderCandidates,
  evaluateRequiredVisibility,
} from "../../apps/runner/src/deterministic-recorder";

const propertyOptions = Object.freeze({ seed: 20260721, numRuns: 250 });
const workspaceId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

describe("deterministic recorder properties", () => {
  it("PROP-22: orders and hashes the same logical observations identically under every arrival permutation", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            logicalClock: fc.integer({ min: 0, max: 1_000_000 }),
            source: fc.constantFrom("BROWSER", "NETWORK", "STORAGE", "RECORDER"),
            facts: fc.dictionary(
              fc.string({ minLength: 1, maxLength: 12 }),
              fc.oneof(fc.string(), fc.integer(), fc.boolean()),
              { maxKeys: 8 },
            ),
          }),
          { minLength: 1, maxLength: 30, selector: (value) => value.logicalClock },
        ),
        fc.integer(),
        (values, shuffleSeed) => {
          const candidates = values.map((value) => ({
            ...value,
            stableKey: `${value.source}:${value.logicalClock}`,
            observedAt: "2026-07-21T07:00:00.000Z",
          }));
          const shuffled = fc.sample(
            fc.shuffledSubarray(candidates, {
              minLength: candidates.length,
              maxLength: candidates.length,
            }),
            { seed: shuffleSeed, numRuns: 1 },
          )[0]!;
          const input = {
            workspaceId,
            runId,
            recorderVersion: BROWSER_CDP_RECORDER_VERSION,
          };
          expect(
            canonicalizeRecorderCandidates({ ...input, candidates: shuffled }),
          ).toEqual(
            canonicalizeRecorderCandidates({ ...input, candidates }),
          );
        },
      ),
      propertyOptions,
    );
  });

  it("PROP-05: any known gap at a required checkpoint prevents visible or clean classification", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (hasSignal, requestFieldsVisible, responseMetadataVisible) => {
          const checkpoint = {
            id: "required-network-checkpoint",
            required: true,
            host: "classroom-service.pactwire.test",
            method: "POST" as const,
            path: "/collect",
            requiredRequestFields: ["studentEmail"],
            requireResponseMetadata: true,
          };
          const result = evaluateRequiredVisibility({
            checkpoints: [checkpoint],
            signals: hasSignal
              ? [
                  {
                    checkpointId: checkpoint.id,
                    observationId: "33333333-3333-4333-8333-333333333333",
                    requestFieldsVisible,
                    responseMetadataVisible,
                  },
                ]
              : [],
            gaps: [
              {
                checkpointIds: [checkpoint.id],
                reason: "CAPTURE_STREAM_INTERRUPTED",
              },
            ],
          });

          expect(result.state).toBe("NOT_VISIBLE");
          expect(result.allRequiredVisible).toBe(false);
          expect(result.checkpoints[0]).toMatchObject({
            required: true,
            visible: false,
            gapReasons: ["CAPTURE_STREAM_INTERRUPTED"],
          });
        },
      ),
      propertyOptions,
    );
  });
});
