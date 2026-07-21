import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  sha256CanonicalValue,
  verifyEvidenceReceiptBundle,
} from "../../packages/core/src/evidence-receipt";
import {
  makeEvidenceReceiptBundle,
  makeReceiptArtifacts,
} from "../helpers/evidence-receipt-fixtures";

const seed = 20260721;
const numRuns = 500;

describe("DET-04 receipt properties", () => {
  it("PROP-08 gives canonical equivalent JSON objects the same hash", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string({ minLength: 1 }), fc.jsonValue()), (record) => {
        const reversed = Object.fromEntries(Object.entries(record).reverse());
        expect(canonicalJson(record)).toBe(canonicalJson(reversed));
        expect(sha256CanonicalValue(record)).toBe(
          sha256CanonicalValue(reversed),
        );
        const firstArtifacts = makeReceiptArtifacts({
          ACTION_TRACE: { actions: [], metadata: record },
        });
        const secondArtifacts = makeReceiptArtifacts({
          ACTION_TRACE: { metadata: reversed, actions: [] },
        }).toReversed();
        expect(
          makeEvidenceReceiptBundle({ artifacts: firstArtifacts }).receipt
            .manifestHash,
        ).toBe(
          makeEvidenceReceiptBundle({ artifacts: secondArtifacts }).receipt
            .manifestHash,
        );
      }),
      { seed, numRuns },
    );
  }, 20_000);

  it("PROP-09 detects every generated one-byte artifact mutation", () => {
    const bundle = makeEvidenceReceiptBundle();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: bundle.artifacts.length - 1 }),
        fc.nat(255),
        (artifactIndex, xorMaskCandidate) => {
          const xorMask = xorMaskCandidate === 0 ? 1 : xorMaskCandidate;
          const artifacts = bundle.artifacts.map((artifact, index) => {
            if (index !== artifactIndex) return artifact;
            const bytes = Buffer.from(artifact.contentBase64, "base64");
            bytes[0] = (bytes[0] ?? 0) ^ xorMask;
            return { ...artifact, contentBase64: bytes.toString("base64") };
          });
          expect(
            verifyEvidenceReceiptBundle({ ...bundle, artifacts }).status,
          ).toBe("INVALID");
        },
      ),
      { seed, numRuns },
    );
  });

  it("PROP-10 corrections supersede without mutating the original receipt", () => {
    fc.assert(
      fc.property(fc.uuid(), (candidateId) => {
        const original = makeEvidenceReceiptBundle();
        const snapshot = structuredClone(original);
        const correction = makeEvidenceReceiptBundle({
          correction: true,
          receiptId: candidateId,
        });

        expect(correction.receipt.supersedesReceiptId).toBe(
          original.receipt.id,
        );
        expect(correction.receipt.supersedesFindingId).toBe(
          original.receipt.findingId,
        );
        expect(correction.receipt.findingId).not.toBe(
          original.receipt.findingId,
        );
        expect(original).toEqual(snapshot);
        expect(verifyEvidenceReceiptBundle(original).status).toBe("VALID");
        expect(verifyEvidenceReceiptBundle(correction).status).toBe("VALID");
      }),
      { seed, numRuns: 200 },
    );
  });
});
