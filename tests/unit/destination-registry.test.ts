import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalizeDestinationHostname,
  computeDestinationVersionHash,
  destinationVersionSchema,
  resolveDestination,
} from "../../packages/core/src/destination-registry";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const recordId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const observedAt = "2026-07-23T10:00:00.000Z";
const observationHash = createHash("sha256")
  .update("fixture observation")
  .digest("hex");

const unknownDraft = {
  schemaVersion: "destination-registry-v1" as const,
  id: versionId,
  recordId,
  workspaceId,
  hostname: "unknown-destination.pactwire.test",
  version: 1,
  sourceVersionId: null,
  domainFacts: {
    firstObservedAt: observedAt,
    lastObservedAt: observedAt,
    observationHashes: [observationHash],
  },
  ownership: { status: "UNKNOWN" as const },
  classifications: [],
  sourceEvidence: [
    {
      evidenceId: "44444444-4444-4444-8444-444444444444",
      role: "DOMAIN_OBSERVATION" as const,
      kind: "DETERMINISTIC_OBSERVATION" as const,
      title: "Captured request destination",
      locator: "run://fixture/observation/1",
      sourceSha256: observationHash,
      excerpt: "Observed request host unknown-destination.pactwire.test",
      pageNumber: null,
      capturedAt: observedAt,
      recordedBy: {
        kind: "AUTOMATION" as const,
        actorId: "destination-observer",
        component: "deterministic-recorder",
      },
      recordedAt: observedAt,
    },
  ],
  createdAt: observedAt,
  createdBy: {
    kind: "AUTOMATION" as const,
    actorId: "destination-observer",
    component: "deterministic-recorder",
  },
};
const unknownVersion = {
  ...unknownDraft,
  versionHash: computeDestinationVersionHash(unknownDraft),
};

describe("destination registry domain", () => {
  it("canonicalizes exact DNS hostnames and rejects URL, wildcard, and IP inputs", () => {
    expect(canonicalizeDestinationHostname(" Classroom-Service.Pactwire.Test. ")).toBe(
      "classroom-service.pactwire.test",
    );
    expect(() => canonicalizeDestinationHostname("https://pactwire.test/path")).toThrow(
      "exact hostname",
    );
    expect(() => canonicalizeDestinationHostname("*.pactwire.test")).toThrow(
      "exact hostname",
    );
    expect(() => canonicalizeDestinationHostname("127.0.0.1")).toThrow(
      "exact hostname",
    );
    // Shrunk counterexample from seed 20260723: a numeric terminal label is not
    // a valid generated destination and must stay outside the registry.
    expect(() => canonicalizeDestinationHostname("a.0")).toThrow("exact hostname");
  });

  it("keeps an observed but unreviewed destination unknown", () => {
    expect(destinationVersionSchema.parse(unknownVersion)).toMatchObject({
      ownership: { status: "UNKNOWN" },
      classifications: [],
    });
    expect(
      resolveDestination({
        version: unknownVersion,
        agreementVersionId: "55555555-5555-4555-8555-555555555555",
      }),
    ).toEqual({
      status: "UNKNOWN",
      hostname: "unknown-destination.pactwire.test",
      reason: "ENTITY_NOT_CONFIRMED",
    });
  });

  it("refuses confirmation metadata, classifications, or model authors on UNKNOWN", () => {
    expect(() =>
      destinationVersionSchema.parse({
        ...unknownVersion,
        ownership: {
          status: "UNKNOWN",
          entityName: "A model guess",
        },
      }),
    ).toThrow();
    expect(() =>
      destinationVersionSchema.parse({
        ...unknownVersion,
        classifications: [
          {
            softwareId: "66666666-6666-4666-8666-666666666666",
            agreementVersionId: "55555555-5555-4555-8555-555555555555",
            status: "PROHIBITED",
            evidenceIds: ["44444444-4444-4444-8444-444444444444"],
            reviewedBy: { kind: "HUMAN", actorId: "fictional-officer" },
            reviewedAt: observedAt,
            rationale: "Model output cannot supply the missing entity mapping.",
          },
        ],
      }),
    ).toThrow("Unknown ownership cannot carry agreement classifications");
    expect(() =>
      destinationVersionSchema.parse({
        ...unknownVersion,
        createdBy: {
          kind: "MODEL",
          actorId: "model-output",
          model: "gpt-5.6",
        },
      }),
    ).toThrow();
  });

  it("treats an unseen hostname as unknown instead of inferring an entity", () => {
    expect(
      resolveDestination({
        hostname: "never-seen.pactwire.test",
        agreementVersionId: "55555555-5555-4555-8555-555555555555",
      }),
    ).toEqual({
      status: "UNKNOWN",
      hostname: "never-seen.pactwire.test",
      reason: "DESTINATION_UNSEEN",
    });
  });
});
