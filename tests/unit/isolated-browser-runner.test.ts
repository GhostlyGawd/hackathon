import { describe, expect, it } from "vitest";
import {
  BrowserRequestPolicyError,
  IsolationResourceConflictError,
  IsolationResourceRegistry,
  evaluateBrowserRequestPolicy,
  isolatedBrowserSessionConfigSchema,
  type IsolationResourceAllocation,
} from "../../apps/runner/src/isolated-browser";

const config = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  runId: "22222222-2222-4222-8222-222222222222",
  allowedNavigationOrigins: ["https://classroom.pactwire.invalid"],
  allowedNetworkHosts: [
    "classroom.pactwire.invalid",
    "classroom-service.pactwire.invalid",
  ],
  popupPolicy: "BLOCK_ALL" as const,
  downloadPolicy: "ALLOW_ISOLATED" as const,
  clipboardPolicy: "ISOLATED" as const,
  viewport: { width: 1440, height: 1100 },
};

function allocation(
  overrides: Partial<IsolationResourceAllocation> = {},
): IsolationResourceAllocation {
  return {
    workspaceId: config.workspaceId,
    runId: config.runId,
    browserId: "33333333-3333-4333-8333-333333333333",
    contextId: "44444444-4444-4444-8444-444444444444",
    clipboardId: "55555555-5555-4555-8555-555555555555",
    downloadScopeId: "66666666-6666-4666-8666-666666666666",
    ...overrides,
  };
}

describe("isolated browser runner policy", () => {
  it("accepts exact origins and hosts but rejects scope-shaped configuration tricks", () => {
    expect(isolatedBrowserSessionConfigSchema.parse(config)).toEqual(config);
    for (const invalid of [
      {
        ...config,
        allowedNavigationOrigins: [
          "https://classroom.pactwire.invalid/path-that-is-not-an-origin",
        ],
      },
      {
        ...config,
        allowedNavigationOrigins: [
          "https://classroom.pactwire.invalid@outside.invalid",
        ],
      },
      {
        ...config,
        allowedNetworkHosts: ["classroom-service.pactwire.invalid"],
      },
      {
        ...config,
        allowedNetworkHosts: [
          "classroom.pactwire.invalid",
          "classroom.pactwire.invalid",
        ],
      },
    ]) {
      expect(() => isolatedBrowserSessionConfigSchema.parse(invalid)).toThrow();
    }
  });

  it("allows only exact navigation origins and exact HTTP network hosts", () => {
    const policy = isolatedBrowserSessionConfigSchema.parse(config);
    expect(
      evaluateBrowserRequestPolicy(policy, {
        url: "https://classroom.pactwire.invalid/student",
        navigation: true,
      }),
    ).toEqual({ allowed: true, reason: "ALLOWED" });
    expect(
      evaluateBrowserRequestPolicy(policy, {
        url: "https://classroom-service.pactwire.invalid/collect",
        navigation: false,
      }),
    ).toEqual({ allowed: true, reason: "ALLOWED" });
    expect(
      evaluateBrowserRequestPolicy(policy, {
        url: "wss://classroom-service.pactwire.invalid/events",
        navigation: false,
      }),
    ).toEqual({ allowed: true, reason: "ALLOWED" });

    const blocked = [
      {
        url: "https://classroom.pactwire.invalid.evil.invalid/student",
        navigation: true,
        reason: "NAVIGATION_ORIGIN_BLOCKED",
      },
      {
        url: "https://classroom.pactwire.invalid:444/student",
        navigation: true,
        reason: "NAVIGATION_ORIGIN_BLOCKED",
      },
      {
        url: "https://tracker.outside.invalid/collect",
        navigation: false,
        reason: "NETWORK_HOST_BLOCKED",
      },
      {
        url: "file:///etc/passwd",
        navigation: true,
        reason: "PROTOCOL_BLOCKED",
      },
      {
        url: "https://user:secret@classroom.pactwire.invalid/student",
        navigation: true,
        reason: "URL_CREDENTIALS_BLOCKED",
      },
      {
        url: "wss://tracker.outside.invalid/events",
        navigation: false,
        reason: "NETWORK_HOST_BLOCKED",
      },
    ] as const;
    for (const candidate of blocked) {
      expect(
        evaluateBrowserRequestPolicy(policy, {
          url: candidate.url,
          navigation: candidate.navigation,
        }),
      ).toEqual({ allowed: false, reason: candidate.reason });
    }
    expect(() =>
      evaluateBrowserRequestPolicy(policy, {
        url: "not a URL",
        navigation: false,
      }),
    ).toThrow(BrowserRequestPolicyError);
  });

  it("never reuses a run or browser resource, including after release", () => {
    const registry = new IsolationResourceRegistry();
    const first = allocation();
    registry.register(first);
    expect(registry.activeAllocations()).toEqual([first]);
    expect(() => registry.register(first)).toThrow(IsolationResourceConflictError);

    registry.release(first.runId);
    expect(registry.activeAllocations()).toEqual([]);
    expect(() =>
      registry.register(
        allocation({
          runId: "77777777-7777-4777-8777-777777777777",
        }),
      ),
    ).toThrow(IsolationResourceConflictError);
    expect(() => registry.release(first.runId)).toThrow(
      IsolationResourceConflictError,
    );
  });
});
