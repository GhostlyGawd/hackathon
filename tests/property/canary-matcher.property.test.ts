import { Buffer } from "node:buffer";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { matchCanaryObservation } from "../../packages/core/src/canary-matcher";
import type { Canary } from "../../packages/core/src/domain";

const propertyOptions = { seed: 20_260_720, numRuns: 1_000 } as const;
const corpusOptions = { seed: 20_260_720, numRuns: 2_000 } as const;
const workspaceId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const observation = {
  id: "33333333-3333-4333-8333-333333333333",
  workspaceId,
  runId,
  source: "NETWORK" as const,
  recorderVersion: "pactwire-browser-cdp-recorder-v1",
  sequence: 0,
  observedAt: "2026-07-20T12:00:00.000Z",
  payloadHash: "b".repeat(64),
  facts: {},
};
const hexToken = fc
  .array(fc.constantFrom(..."0123456789abcdef"), { minLength: 32, maxLength: 32 })
  .map((characters) => characters.join(""));
const location = fc.constantFrom("BODY", "HEADER", "QUERY");

function canary(token: string): Canary {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    workspaceId,
    runId,
    personaId: "55555555-5555-4555-8555-555555555555",
    sourceField: "email",
    value: `pw-${token}@canary.pactwire.invalid`,
    generatedAt: "2026-07-20T11:59:00.000Z",
  };
}

function outcome(value: string, sourceCanary: Canary, candidateLocation: "BODY" | "HEADER" | "QUERY") {
  return matchCanaryObservation({
    observation,
    canaries: [sourceCanary],
    candidates: [
      {
        location: candidateLocation,
        path: `${candidateLocation.toLowerCase()}.studentEmail`,
        value,
      },
    ],
  }).outcomes[0];
}

describe("PROP-06 canary matcher soundness", () => {
  it("matches every generated canary only through an enumerated reversible transform", () => {
    fc.assert(
      fc.property(
        hexToken,
        location,
        fc.constantFrom("EXACT", "URL_ENCODED", "BASE64"),
        (token, candidateLocation, transform) => {
          const sourceCanary = canary(token);
          const value =
            transform === "EXACT"
              ? sourceCanary.value
              : transform === "URL_ENCODED"
                ? encodeURIComponent(sourceCanary.value)
                : Buffer.from(sourceCanary.value, "utf8").toString("base64");

          expect(outcome(value, sourceCanary, candidateLocation)).toMatchObject({
            status: "MATCHED",
            transform,
            canaryId: sourceCanary.id,
            canarySourceField: "email",
            candidateLocation,
          });
        },
      ),
      propertyOptions,
    );
  });

  it("never matches arbitrary whole-field payloads outside the declared transform set", () => {
    fc.assert(
      fc.property(
        hexToken,
        location,
        fc.string({ maxLength: 2_000 }),
        fc.string({ minLength: 1, maxLength: 80 }),
        (token, candidateLocation, noise, separator) => {
          const sourceCanary = canary(token);
          const allowed = new Set([
            sourceCanary.value,
            encodeURIComponent(sourceCanary.value),
            Buffer.from(sourceCanary.value, "utf8").toString("base64"),
          ]);
          const value = `${noise}${separator}${sourceCanary.value}`;
          fc.pre(!allowed.has(value));

          expect(outcome(value, sourceCanary, candidateLocation)).toMatchObject({
            status: "NO_MATCH",
            reasonCode: "NO_ENUMERATED_MATCH",
          });
        },
      ),
      corpusOptions,
    );
  });

  it("keeps arbitrary body, header, and query values false when they contain no canary", () => {
    fc.assert(
      fc.property(
        hexToken,
        location,
        fc.string({ maxLength: 4_096 }),
        (token, candidateLocation, value) => {
          const sourceCanary = canary(token);
          const allowed = new Set([
            sourceCanary.value,
            encodeURIComponent(sourceCanary.value),
            Buffer.from(sourceCanary.value, "utf8").toString("base64"),
          ]);
          fc.pre(!allowed.has(value));

          expect(outcome(value, sourceCanary, candidateLocation)?.status).toBe(
            "NO_MATCH",
          );
        },
      ),
      corpusOptions,
    );
  });
});
