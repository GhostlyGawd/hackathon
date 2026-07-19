import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  Aes256GcmSecretCipher,
  REDACTED_SECRET,
  SECRET_SCREENSHOT_MASK_SELECTORS,
  configuredSecretRepresentations,
  containsSecretRepresentation,
  redactSecretText,
  redactStructuredValue,
  secretMetadataSchema,
  secretValueSchema,
} from "../../packages/core/src/secret-isolation";

function generatedSecret(): string {
  return `runtime/${randomUUID()}?value=${randomUUID()}`;
}

describe("secret isolation primitives", () => {
  it("redacts every configured exact representation and is idempotent", () => {
    const secret = generatedSecret();
    const representations = configuredSecretRepresentations(secret);
    const raw = representations.map((value, index) => `${index}:${value}`).join("\n");

    expect(representations.length).toBeGreaterThanOrEqual(5);
    const once = redactSecretText(raw, [secret]);
    expect(once).toContain(REDACTED_SECRET);
    expect(containsSecretRepresentation(once, [secret])).toBe(false);
    expect(redactSecretText(once, [secret])).toBe(once);
  });

  it("redacts sensitive structured fields even when their values are not registered", () => {
    const secret = generatedSecret();
    const input = {
      headers: {
        authorization: `Bearer ${secret}`,
        cookie: `session=${secret}`,
        accept: "application/json",
      },
      body: {
        password: secret,
        access_token: "unregistered-access-token-value",
        client_secret: "unregistered-client-secret-value",
        note: `encoded=${encodeURIComponent(secret)}`,
      },
    };

    const output = redactStructuredValue(input, [secret]);
    expect(output).toEqual({
      headers: {
        authorization: REDACTED_SECRET,
        cookie: REDACTED_SECRET,
        accept: "application/json",
      },
      body: {
        password: REDACTED_SECRET,
        access_token: REDACTED_SECRET,
        client_secret: REDACTED_SECRET,
        note: `encoded=${REDACTED_SECRET}`,
      },
    });
    expect(input.body.password).toBe(secret);
  });

  it("rejects malformed Unicode and the reserved marker before encoding", () => {
    expect(secretValueSchema.safeParse("\uD800".repeat(12)).success).toBe(false);
    expect(
      secretValueSchema.safeParse(`${REDACTED_SECRET}-fixture-value`).success,
    ).toBe(false);
  });

  it("compares expiration timestamps as instants rather than offset strings", () => {
    const result = secretMetadataSchema.safeParse({
      id: randomUUID(),
      workspaceId: randomUUID(),
      softwareId: randomUUID(),
      label: "Offset expiry fixture",
      kind: "PASSWORD",
      status: "ACTIVE",
      keyVersion: "fixture-key-v1",
      createdAt: "2026-07-19T20:30:00.000Z",
      expiresAt: "2026-07-19T22:00:00.000+02:00",
      createdBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
    });

    expect(result.success).toBe(false);
  });

  it("encrypts with workspace-bound authenticated data and defines screenshot masks", () => {
    const secret = generatedSecret();
    const cipher = new Aes256GcmSecretCipher(randomBytes(32), "fixture-key-v1");
    const aad = "workspace-a/software-a/secret-a";
    const envelope = cipher.encrypt(secret, aad);

    expect(JSON.stringify(envelope)).not.toContain(secret);
    expect(cipher.decrypt(envelope, aad)).toBe(secret);
    expect(() => cipher.decrypt(envelope, `${aad}/other-context`)).toThrow();
    expect(SECRET_SCREENSHOT_MASK_SELECTORS).toEqual(
      expect.arrayContaining([
        "input[type='password']",
        "[data-secret]",
        "[autocomplete='current-password']",
      ]),
    );
  });
});
