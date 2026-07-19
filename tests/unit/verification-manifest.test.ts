import { describe, expect, it } from "vitest";
import {
  validateScreenshotMetadata,
  validateVerificationManifest,
} from "../../packages/evidence/src/manifest";
import { makeValidManifest } from "../helpers/verification-manifest";

describe("verification manifest", () => {
  it("accepts a complete manifest with passing proof and explicit non-applicability", () => {
    expect(validateVerificationManifest(makeValidManifest())).toEqual(
      expect.objectContaining({ ok: true }),
    );
  });

  it("rejects an intentionally incomplete completion manifest", () => {
    const result = validateVerificationManifest({
      schemaVersion: "1.0.0",
      status: "COMPLETE",
      taskId: "FND-02",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it("rejects a complete manifest with skipped tests", () => {
    const result = validateVerificationManifest(
      makeValidManifest({
        testSummary: {
          files: 2,
          passed: 3,
          failed: 0,
          skipped: 1,
          retries: 0,
        },
      }),
    );

    expect(result.ok).toBe(false);
  });

  it("binds artifact directories to the manifest task", () => {
    const result = validateVerificationManifest(
      makeValidManifest({ artifactRoot: "artifacts/verification/FND-03/" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.keyword === "taskRoot")).toBe(
        true,
      );
    }
  });

  it("rejects screenshot metadata without a real viewport and alt text", () => {
    const result = validateScreenshotMetadata({
      kind: "screenshot",
      path: "docs/evidence/UX-01/inventory.png",
      capturedAt: "2026-07-19T18:00:00.000Z",
      caption: "Inventory",
      provenance: "captured",
      sourceCommitSha: "a".repeat(40),
    });

    expect(result.ok).toBe(false);
  });

  it("accepts complete captured screenshot metadata", () => {
    const result = validateScreenshotMetadata({
      kind: "screenshot",
      path: "docs/evidence/UX-01/inventory.png",
      capturedAt: "2026-07-19T18:00:00.000Z",
      viewport: { width: 1440, height: 900 },
      altText: "Fictional software inventory with approval status",
      caption: "Inventory captured from the running Pactwire product.",
      provenance: "captured",
      sourceCommitSha: "a".repeat(40),
    });

    expect(result.ok).toBe(true);
  });

  it("rejects a generated image presented as a captured product screenshot", () => {
    const result = validateScreenshotMetadata({
      kind: "screenshot",
      path: "docs/evidence/UX-01/inventory.png",
      capturedAt: "2026-07-19T18:00:00.000Z",
      viewport: { width: 1440, height: 900 },
      altText: "Inventory concept",
      caption: "Generated inventory concept.",
      provenance: "generated",
      sourceCommitSha: "a".repeat(40),
    });

    expect(result.ok).toBe(false);
  });
});
