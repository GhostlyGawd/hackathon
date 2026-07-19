import { describe, expect, it } from "vitest";
import { authorizationSchema } from "../../packages/core/src/domain";
import {
  effectiveAuthorizationStatus,
  evaluateAuthorizationPolicy,
} from "../../packages/core/src/test-authorization";

const authorization = {
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
  allowedDomains: [
    "cedar.northstar.invalid",
    "assets.northstar.invalid",
  ],
  allowedActions: ["NAVIGATE", "SUBMIT"] as const,
  prohibitedActions: [
    "DOWNLOAD",
    "UPLOAD",
    "MESSAGE",
    "PURCHASE",
    "DELETE",
    "ADMINISTER",
  ] as const,
  redirectPolicy: "ALLOW_LISTED_ONLY" as const,
  popupPolicy: "BLOCK_ALL" as const,
  attestation: {
    authorityConfirmed: true as const,
    syntheticAccountsOnlyConfirmed: true as const,
    statement:
      "I confirm the fictional district controls or may test this tenant.",
  },
  attestedBy: {
    kind: "HUMAN" as const,
    actorId: "fictional-officer-a",
  },
  attestedAt: "2026-07-19T20:00:00.000Z",
};

describe("test authorization policy", () => {
  it("requires a human attestation, bounded dates, and non-overlapping scope", () => {
    expect(authorizationSchema.parse(authorization)).toEqual(authorization);
    expect(
      authorizationSchema.safeParse({
        ...authorization,
        attestation: {
          ...authorization.attestation,
          authorityConfirmed: false,
        },
      }).success,
    ).toBe(false);
    expect(
      authorizationSchema.safeParse({
        ...authorization,
        allowedActions: ["NAVIGATE", "DELETE"],
      }).success,
    ).toBe(false);
    expect(
      authorizationSchema.safeParse({
        ...authorization,
        reviewAt: "2026-07-22T20:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("blocks an unlisted redirect, every popup, and a prohibited action beneath the model", () => {
    const redirect = evaluateAuthorizationPolicy(
      authorization,
      {
        kind: "REDIRECT",
        targetUrl: "https://tracker.outside.invalid/collect?student=fictional",
      },
      "2026-07-19T20:30:00.000Z",
    );
    const popup = evaluateAuthorizationPolicy(
      authorization,
      {
        kind: "POPUP",
        targetUrl: "https://cedar.northstar.invalid/classroom/help",
      },
      "2026-07-19T20:30:00.000Z",
    );
    const action = evaluateAuthorizationPolicy(
      authorization,
      { kind: "ACTION", action: "DELETE" },
      "2026-07-19T20:30:00.000Z",
    );

    expect(redirect).toMatchObject({
      allowed: false,
      reason: "DOMAIN_NOT_ALLOWED",
      message: "Redirect blocked because its destination is outside this authorization.",
      targetDomain: "tracker.outside.invalid",
    });
    expect(redirect.message).not.toContain("tracker.outside.invalid");
    expect(popup).toMatchObject({
      allowed: false,
      reason: "POPUP_BLOCKED",
      message: "Popups are blocked by this authorization.",
    });
    expect(action).toMatchObject({
      allowed: false,
      reason: "ACTION_PROHIBITED",
      message: "DELETE is prohibited by this authorization.",
    });
  });

  it("allows only the authorized base path and explicitly listed actions", () => {
    expect(
      evaluateAuthorizationPolicy(
        authorization,
        {
          kind: "NAVIGATION",
          targetUrl:
            "https://cedar.northstar.invalid/classroom/fictional-student",
        },
        "2026-07-19T20:30:00.000Z",
      ),
    ).toMatchObject({ allowed: true, reason: "POLICY_ALLOWED" });
    expect(
      evaluateAuthorizationPolicy(
        authorization,
        {
          kind: "NAVIGATION",
          targetUrl: "https://cedar.northstar.invalid/admin",
        },
        "2026-07-19T20:30:00.000Z",
      ),
    ).toMatchObject({ allowed: false, reason: "BASE_PATH_NOT_ALLOWED" });
    expect(
      evaluateAuthorizationPolicy(
        authorization,
        { kind: "ACTION", action: "SUBMIT" },
        "2026-07-19T20:30:00.000Z",
      ),
    ).toMatchObject({ allowed: true, reason: "POLICY_ALLOWED" });
  });

  it("derives current status from time and revocation instead of trusting an ACTIVE label", () => {
    expect(
      effectiveAuthorizationStatus(
        authorization,
        "2026-07-19T19:59:59.000Z",
      ),
    ).toBe("NOT_YET_VALID");
    expect(
      effectiveAuthorizationStatus(
        authorization,
        "2026-07-20T20:00:00.000Z",
      ),
    ).toBe("REVIEW_DUE");
    expect(
      effectiveAuthorizationStatus(
        authorization,
        "2026-07-21T20:00:00.000Z",
      ),
    ).toBe("EXPIRED");
    expect(
      effectiveAuthorizationStatus(
        { ...authorization, status: "REVOKED" },
        "2026-07-19T20:30:00.000Z",
      ),
    ).toBe("REVOKED");
  });
});
