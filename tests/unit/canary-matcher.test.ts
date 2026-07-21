import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  CANARY_MATCHER_VERSION,
  matchCanaryObservation,
} from "../../packages/core/src/canary-matcher";
import type { Canary } from "../../packages/core/src/domain";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const observation = {
  id: "33333333-3333-4333-8333-333333333333",
  workspaceId,
  runId,
  source: "NETWORK" as const,
  recorderVersion: "pactwire-browser-cdp-recorder-v1",
  sequence: 4,
  observedAt: "2026-07-20T12:00:00.000Z",
  payloadHash: "a".repeat(64),
  facts: { kind: "NETWORK_REQUEST" },
};
const emailCanary: Canary = {
  id: "44444444-4444-4444-8444-444444444444",
  workspaceId,
  runId,
  personaId: "55555555-5555-4555-8555-555555555555",
  sourceField: "email",
  value: "pw-0123456789abcdef0123456789abcdef@canary.pactwire.invalid",
  generatedAt: "2026-07-20T11:59:00.000Z",
};
const responseCanary: Canary = {
  id: "66666666-6666-4666-8666-666666666666",
  workspaceId,
  runId,
  personaId: emailCanary.personaId,
  sourceField: "submissionPhrase",
  value: "PACTWIRE-FICTIONAL-ABCDEF0123456789ABCDEF0123456789",
  generatedAt: emailCanary.generatedAt,
};

function match(value: string, overrides: Record<string, unknown> = {}) {
  return matchCanaryObservation({
    observation,
    canaries: [emailCanary, responseCanary],
    candidates: [
      {
        location: "BODY",
        path: "student.email",
        value,
        ...overrides,
      },
    ],
  });
}

describe("DET-02 deterministic canary matcher", () => {
  it("records an exact whole-field match with reproducible run, field, and source lineage", () => {
    const first = match(emailCanary.value);
    const second = match(emailCanary.value);

    expect(first).toEqual(second);
    expect(first.matcherVersion).toBe(CANARY_MATCHER_VERSION);
    expect(first.counts).toEqual({
      matched: 1,
      noMatch: 0,
      unsupported: 0,
      collisions: 0,
    });
    expect(first.outcomes[0]).toMatchObject({
      status: "MATCHED",
      workspaceId,
      runId,
      observationId: observation.id,
      observationSource: "NETWORK",
      candidateLocation: "BODY",
      candidatePath: "student.email",
      canaryId: emailCanary.id,
      canarySourceField: "email",
      transform: "EXACT",
      match: {
        workspaceId,
        runId,
        canaryId: emailCanary.id,
        observationId: observation.id,
        transform: "EXACT",
        createdAt: observation.observedAt,
      },
    });
    expect(first.outcomes[0]?.candidateValueSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(first)).not.toContain(emailCanary.value);
    expect(JSON.stringify(first)).not.toContain(responseCanary.value);
  });

  it.each([
    ["URL_ENCODED", encodeURIComponent(emailCanary.value)],
    ["BASE64", Buffer.from(responseCanary.value, "utf8").toString("base64")],
  ] as const)("accepts only the canonical %s transform", (transform, value) => {
    const report = match(value);

    expect(report.outcomes[0]).toMatchObject({
      status: "MATCHED",
      transform,
    });
  });

  it("does not turn semantic similarity or a canary-containing body into a match", () => {
    const candidates = [
      emailCanary.value.toUpperCase(),
      `student=${emailCanary.value}`,
      `The fictional email is ${emailCanary.value}.`,
    ];

    for (const value of candidates) {
      const report = match(value);
      expect(report.outcomes[0]).toMatchObject({
        status: "NO_MATCH",
        reasonCode: "NO_ENUMERATED_MATCH",
      });
      expect(report.counts.matched).toBe(0);
    }
  });

  it("returns an unsupported-transform result without claiming a match", () => {
    const report = match("opaque-0123456789abcdef01234567", {
      requestedTransform: "OPAQUE_REFERENCE",
    });

    expect(report.outcomes[0]).toMatchObject({
      status: "UNSUPPORTED_TRANSFORM",
      requestedTransform: "OPAQUE_REFERENCE",
      reasonCode: "TRANSFORM_NOT_ENUMERATED",
    });
    expect(report.counts).toEqual({
      matched: 0,
      noMatch: 0,
      unsupported: 1,
      collisions: 0,
    });
    expect(report.outcomes[0]).not.toHaveProperty("match");
  });

  it("refuses a positive match when two canary records collide", () => {
    const duplicate: Canary = {
      ...emailCanary,
      id: "77777777-7777-4777-8777-777777777777",
      personaId: "88888888-8888-4888-8888-888888888888",
    };
    const report = matchCanaryObservation({
      observation,
      canaries: [emailCanary, duplicate],
      candidates: [
        { location: "HEADER", path: "x-student-email", value: emailCanary.value },
      ],
    });

    expect(report.outcomes[0]).toMatchObject({
      status: "COLLISION",
      reasonCode: "MULTIPLE_CANARY_MATCHES",
      canaryIds: [emailCanary.id, duplicate.id].sort(),
    });
    expect(report.counts.matched).toBe(0);
    expect(report.outcomes[0]).not.toHaveProperty("match");
  });

  it("rejects canaries from a different run before matching", () => {
    expect(() =>
      matchCanaryObservation({
        observation,
        canaries: [
          {
            ...emailCanary,
            runId: "99999999-9999-4999-8999-999999999999",
          },
        ],
        candidates: [
          { location: "QUERY", path: "student", value: emailCanary.value },
        ],
      }),
    ).toThrow(/same workspace and run/iu);
  });
});
