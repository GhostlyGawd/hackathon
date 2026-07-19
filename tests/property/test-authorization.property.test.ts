import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  authorizationActionSchema,
  evaluateAuthorizationPolicy,
} from "../../packages/core/src/test-authorization";

const seed = 20_260_719;
const propertyOptions = { seed, numRuns: 250 } as const;

const baseAuthorization = {
  id: "44444444-4444-4444-8444-444444444444",
  workspaceId: "11111111-1111-4111-8111-111111111111",
  softwareId: "22222222-2222-4222-8222-222222222222",
  version: 1,
  status: "ACTIVE" as const,
  validFrom: "2026-07-19T20:00:00.000Z",
  reviewAt: "2026-07-20T20:00:00.000Z",
  expiresAt: "2026-07-21T20:00:00.000Z",
  authorityBasis: "District-owned fictional training tenant.",
  allowedBaseUrl: "https://cedar.northstar.invalid/classroom",
  allowedDomains: ["cedar.northstar.invalid"],
  allowedActions: ["NAVIGATE", "SUBMIT"] as const,
  prohibitedActions: ["DELETE", "PURCHASE"] as const,
  redirectPolicy: "ALLOW_LISTED_ONLY" as const,
  popupPolicy: "ALLOW_LISTED_ONLY" as const,
  attestation: {
    authorityConfirmed: true as const,
    syntheticAccountsOnlyConfirmed: true as const,
    statement:
      "I confirm the fictional district controls or may test this tenant.",
  },
  attestedBy: { kind: "HUMAN" as const, actorId: "fictional-officer-a" },
  attestedAt: "2026-07-19T20:00:00.000Z",
};

describe("test authorization properties", () => {
  it("PROP-13: every exact domain outside the explicit allowlist is denied", () => {
    fc.assert(
      fc.property(
        fc
          .stringMatching(/^[a-z][a-z0-9]{0,18}$/)
          .map((label) => `${label}.outside.invalid`),
        fc.constantFrom("NAVIGATION" as const, "REDIRECT" as const, "POPUP" as const),
        (domain, kind) => {
          const decision = evaluateAuthorizationPolicy(
            baseAuthorization,
            { kind, targetUrl: `https://${domain}/untrusted` },
            "2026-07-19T20:30:00.000Z",
          );
          expect(decision.allowed).toBe(false);
          expect(decision.reason).toBe("DOMAIN_NOT_ALLOWED");
          expect(decision.targetDomain).toBe(domain);
          expect(decision.message).not.toContain(domain);
        },
      ),
      propertyOptions,
    );
  });

  it("PROP-13: every action outside the explicit action allowlist is denied", () => {
    const outsideActions = authorizationActionSchema.options.filter(
      (action) => !baseAuthorization.allowedActions.includes(action as never),
    );
    fc.assert(
      fc.property(fc.constantFrom(...outsideActions), (action) => {
        const decision = evaluateAuthorizationPolicy(
          baseAuthorization,
          { kind: "ACTION", action },
          "2026-07-19T20:30:00.000Z",
        );
        expect(decision.allowed).toBe(false);
        expect(["ACTION_NOT_ALLOWED", "ACTION_PROHIBITED"]).toContain(
          decision.reason,
        );
      }),
      propertyOptions,
    );
  });

  it("PROP-14: expired or revoked authorization can never pass the run queue gate", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.record({
            status: fc.constant("ACTIVE" as const),
            now: fc.constantFrom(
              "2026-07-21T20:00:00.000Z",
              "2027-01-01T00:00:00.000Z",
            ),
          }),
          fc.record({
            status: fc.constant("REVOKED" as const),
            now: fc.constant("2026-07-19T20:30:00.000Z"),
          }),
        ),
        ({ status, now }) => {
          const decision = evaluateAuthorizationPolicy(
            { ...baseAuthorization, status },
            { kind: "RUN_QUEUE" },
            now,
          );
          expect(decision.allowed).toBe(false);
          expect(["AUTHORIZATION_EXPIRED", "AUTHORIZATION_REVOKED"]).toContain(
            decision.reason,
          );
        },
      ),
      propertyOptions,
    );
  });
});
