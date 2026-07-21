import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BROWSER_CDP_RECORDER_VERSION,
  canonicalizeRecorderCandidates,
  deterministicRecorderConfigSchema,
  deterministicRecorderReportSchema,
  evaluateRequiredVisibility,
  sanitizeRecorderUrl,
  summarizeAuthorizedRequestFields,
} from "../../apps/runner/src/deterministic-recorder";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const observedAt = "2026-07-21T07:00:00.000Z";

function checkpoint() {
  return {
    id: "student-submission-request",
    required: true,
    host: "classroom-service.pactwire.test",
    method: "POST",
    path: "/collect",
    requiredRequestFields: ["studentEmail", "submission"],
    requireResponseMetadata: true,
  } as const;
}

describe("deterministic recorder contracts", () => {
  it("accepts only the P0 browser-CDP mode and exact minimized capture rules", () => {
    const parsed = deterministicRecorderConfigSchema.parse({
      workspaceId,
      runId,
      captureMode: "BROWSER_CDP",
      authorizedRequestRules: [
        {
          host: "classroom-service.pactwire.test",
          method: "POST",
          path: "/collect",
          fields: ["studentEmail", "submission"],
        },
      ],
      requiredCheckpoints: [checkpoint()],
      secrets: ["FICTIONAL-LOGIN-SECRET-123456"],
    });

    expect(parsed.recorderVersion).toBe(BROWSER_CDP_RECORDER_VERSION);
    expect(parsed.captureMode).toBe("BROWSER_CDP");
    expect(
      deterministicRecorderConfigSchema.safeParse({
        ...parsed,
        captureMode: "PROXY",
      }).success,
    ).toBe(false);
    expect(
      deterministicRecorderConfigSchema.safeParse({
        ...parsed,
        requiredCheckpoints: [checkpoint(), checkpoint()],
      }).success,
    ).toBe(false);
    expect(
      deterministicRecorderConfigSchema.safeParse({
        ...parsed,
        authorizedRequestRules: [
          {
            host: "classroom-service.pactwire.test",
            method: "POST",
            path: "https://outside.invalid/collect",
            fields: ["studentEmail"],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      deterministicRecorderConfigSchema.safeParse({
        ...parsed,
        requiredCheckpoints: [{ ...checkpoint(), required: false }],
      }).success,
    ).toBe(false);
  });

  it("retains a request destination while minimizing query, fragment, and configured-secret values", () => {
    const secret = "FICTIONAL-LOGIN-SECRET-123456";
    const raw =
      `https://classroom-service.pactwire.test/collect?studentEmail=pw-fictional&token=${secret}` +
      "#fictional-response";
    const sanitized = sanitizeRecorderUrl(raw, [secret]);

    expect(sanitized).toContain(
      "https://classroom-service.pactwire.test/collect?",
    );
    expect(sanitized).toContain("studentEmail=");
    expect(sanitized).toContain("token=");
    expect(sanitized).not.toContain("pw-fictional");
    expect(sanitized).not.toContain(secret);
    expect(sanitized).not.toContain("fictional-response");
  });

  it("canonicalizes logical event order and nested facts independently of arrival order", () => {
    const candidates = [
      {
        logicalClock: 20,
        stableKey: "network:2",
        source: "NETWORK" as const,
        observedAt,
        facts: {
          response: { status: 204, mimeType: "text/plain" },
          request: { host: "classroom-service.pactwire.test", method: "POST" },
        },
      },
      {
        logicalClock: 10,
        stableKey: "browser:1",
        source: "BROWSER" as const,
        observedAt,
        facts: { pageUrl: "https://classroom.pactwire.test/student", kind: "NAVIGATION" },
      },
    ];
    const reordered = [
      {
        ...candidates[1]!,
        facts: { kind: "NAVIGATION", pageUrl: "https://classroom.pactwire.test/student" },
      },
      {
        ...candidates[0]!,
        facts: {
          request: { method: "POST", host: "classroom-service.pactwire.test" },
          response: { mimeType: "text/plain", status: 204 },
        },
      },
    ];

    const left = canonicalizeRecorderCandidates({
      workspaceId,
      runId,
      recorderVersion: BROWSER_CDP_RECORDER_VERSION,
      candidates,
    });
    const right = canonicalizeRecorderCandidates({
      workspaceId,
      runId,
      recorderVersion: BROWSER_CDP_RECORDER_VERSION,
      candidates: reordered,
    });

    expect(right).toEqual(left);
    expect(left.map(({ sequence }) => sequence)).toEqual([0, 1]);
    expect(left.map(({ source }) => source)).toEqual(["BROWSER", "NETWORK"]);
  });

  it("rejects a recorder report when an observation changes without its canonical hash", () => {
    const [observation] = canonicalizeRecorderCandidates({
      workspaceId,
      runId,
      recorderVersion: BROWSER_CDP_RECORDER_VERSION,
      candidates: [
        {
          logicalClock: 1,
          stableKey: "browser:1",
          source: "BROWSER",
          observedAt,
          facts: { kind: "NAVIGATION", pageUrl: "https://classroom.pactwire.test/student" },
        },
      ],
    });
    expect(observation).toBeDefined();
    const report = {
      schemaVersion: "1.0.0",
      recorderVersion: BROWSER_CDP_RECORDER_VERSION,
      captureMode: "BROWSER_CDP",
      workspaceId,
      runId,
      startedAt: observedAt,
      stoppedAt: "2026-07-21T07:00:01.000Z",
      actions: [],
      screenshots: [],
      observations: [
        {
          ...observation,
          facts: { kind: "NAVIGATION", pageUrl: "https://tampered.invalid/" },
        },
      ],
      visibility: {
        state: "NOT_TESTED",
        allRequiredVisible: false,
        checkpoints: [
          {
            checkpointId: "student-submission-request",
            required: true,
            exercised: false,
            visible: false,
            observationIds: [],
            gapReasons: [],
          },
        ],
      },
      limitations: ["Fixture report for integrity validation."],
    };

    expect(deterministicRecorderReportSchema.safeParse(report).success).toBe(
      false,
    );
  });

  it("hashes only authorized request fields and never persists a raw body or secret", () => {
    const studentEmail = "pw-0123456789abcdef0123456789abcdef@canary.pactwire.invalid";
    const submission = "PACTWIRE-FICTIONAL-0123456789ABCDEF0123456789ABCDEF";
    const secret = "FICTIONAL-LOGIN-SECRET-123456";
    const summary = summarizeAuthorizedRequestFields({
      postData: JSON.stringify({
        studentEmail,
        submission,
        unrelated: "must-not-persist",
        authorization: secret,
      }),
      fieldNames: ["studentEmail", "submission"],
      secrets: [secret],
    });

    expect(summary.status).toBe("CAPTURED");
    expect(summary.fields).toEqual([
      {
        name: "studentEmail",
        present: true,
        valueSha256: createHash("sha256").update(JSON.stringify(studentEmail)).digest("hex"),
        valueType: "string",
      },
      {
        name: "submission",
        present: true,
        valueSha256: createHash("sha256").update(JSON.stringify(submission)).digest("hex"),
        valueType: "string",
      },
    ]);
    const persisted = JSON.stringify(summary);
    expect(persisted).not.toContain(studentEmail);
    expect(persisted).not.toContain(submission);
    expect(persisted).not.toContain("must-not-persist");
    expect(persisted).not.toContain(secret);

    expect(
      summarizeAuthorizedRequestFields({
        postData: "opaque-ciphertext",
        fieldNames: ["studentEmail"],
        secrets: [],
      }),
    ).toEqual({ status: "UNINSPECTABLE", fields: [] });
  });

  it("makes every required capture gap NOT_VISIBLE and keeps unexercised paths NOT_TESTED", () => {
    const visibleSignal = {
      checkpointId: checkpoint().id,
      observationId: "33333333-3333-4333-8333-333333333333",
      requestFieldsVisible: true,
      responseMetadataVisible: true,
    };

    expect(
      evaluateRequiredVisibility({
        checkpoints: [checkpoint()],
        signals: [visibleSignal],
        gaps: [],
      }),
    ).toMatchObject({ state: "VISIBLE", allRequiredVisible: true });

    expect(
      evaluateRequiredVisibility({
        checkpoints: [checkpoint()],
        signals: [visibleSignal],
        gaps: [
          {
            checkpointIds: [checkpoint().id],
            reason: "INSTRUMENTATION_UNAVAILABLE",
          },
        ],
      }),
    ).toMatchObject({
      state: "NOT_VISIBLE",
      allRequiredVisible: false,
      checkpoints: [
        expect.objectContaining({
          checkpointId: checkpoint().id,
          exercised: true,
          visible: false,
          gapReasons: ["INSTRUMENTATION_UNAVAILABLE"],
        }),
      ],
    });

    expect(
      evaluateRequiredVisibility({
        checkpoints: [checkpoint()],
        signals: [],
        gaps: [],
      }),
    ).toMatchObject({ state: "NOT_TESTED", allRequiredVisible: false });
  });
});
