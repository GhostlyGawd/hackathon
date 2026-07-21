import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  parseEvidenceReceiptBundle,
  serializeEvidenceReceiptBundle,
  sha256CanonicalValue,
  verifyEvidenceReceiptBundle,
} from "../../packages/core/src/evidence-receipt";
import {
  makeEvidenceReceiptBundle,
  makeReceiptArtifacts,
  rawCanaryValue,
} from "../helpers/evidence-receipt-fixtures";

describe("DET-04 verifiable evidence receipt", () => {
  it("binds every required lineage artifact to the exact bounded finding", () => {
    const bundle = makeEvidenceReceiptBundle();

    expect(bundle.receipt.findingState).toBe("WITNESSED_CONFLICT");
    expect(bundle.receipt.runManifestHash).toBe(
      bundle.content.deterministicBasis.runManifestHash,
    );
    expect(Object.keys(bundle.receipt.artifactHashes).sort()).toEqual(
      bundle.artifacts.map(({ path }) => path).sort(),
    );
    expect(bundle.content.lineage).toMatchObject({
      agreementCitationPath: "agreement/confirmed-citation.json",
      findingEvaluationPath: "findings/evaluation.json",
      runConfigurationPath: "configuration/frozen-run.json",
      observedEventPaths: ["observations/request-0001.json"],
      canaryMatchPaths: ["matches/email-canary.json"],
      destinationRecordPaths: [
        "destinations/fixture-analytics-v1.json",
      ],
      screenshotPaths: ["screenshots/fictional-submission.png"],
      actionTracePaths: ["actions/trace.json"],
    });
    expect(bundle.content.agreementRule.confirmedBy.kind).toBe("HUMAN");
    expect(bundle.content.agreementRule.quotedText).toBe(
      "Student email is restricted to authorized service providers.",
    );
    expect(bundle.content.agreementRule.sourceSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(bundle.content.nextHumanDecision).toMatch(/review/iu);
    expect(verifyEvidenceReceiptBundle(bundle)).toMatchObject({
      status: "VALID",
      issues: [],
    });
  });

  it("serializes deterministically and imports into a separately verified bundle", () => {
    const bundle = makeEvidenceReceiptBundle();
    const first = serializeEvidenceReceiptBundle(bundle);
    const second = serializeEvidenceReceiptBundle(bundle);

    expect(first).toEqual(second);
    expect(first).toBe(`${canonicalJson(bundle)}\n`);
    const imported = parseEvidenceReceiptBundle(first);
    expect(imported).toEqual(bundle);
    expect(verifyEvidenceReceiptBundle(imported).status).toBe("VALID");
  });

  it("detects changed artifact bytes, metadata, content, and manifest hashes", () => {
    const bundle = makeEvidenceReceiptBundle();
    const cases = [
      {
        ...bundle,
        artifacts: bundle.artifacts.map((artifact, index) =>
          index === 0
            ? { ...artifact, contentBase64: Buffer.from("changed").toString("base64") }
            : artifact,
        ),
      },
      {
        ...bundle,
        content: {
          ...bundle.content,
          nextHumanDecision: "Ignore the recorded conflict.",
        },
      },
      {
        ...bundle,
        receipt: { ...bundle.receipt, manifestHash: "0".repeat(64) },
      },
    ];

    for (const corrupted of cases) {
      const report = verifyEvidenceReceiptBundle(corrupted);
      expect(report.status).toBe("INVALID");
      expect(report.issues.length).toBeGreaterThan(0);
    }
  });

  it("redacts configured secrets and never exports the raw canary", () => {
    const artifacts = makeReceiptArtifacts({
      OBSERVED_EVENT: {
        eventType: "NETWORK_REQUEST",
        hostname: "fixture-analytics.pactwire.test",
        authorization: "fixture-api-secret-value-123456",
        submittedValue: rawCanaryValue,
      },
    });
    const bundle = makeEvidenceReceiptBundle({ artifacts });
    const serialized = serializeEvidenceReceiptBundle(bundle);
    const observedEvent = bundle.artifacts.find(
      ({ kind }) => kind === "OBSERVED_EVENT",
    );

    expect(serialized).not.toContain(rawCanaryValue);
    expect(serialized).not.toContain("fixture-api-secret-value-123456");
    expect(
      Buffer.from(observedEvent?.contentBase64 ?? "", "base64").toString(
        "utf8",
      ),
    ).toContain("[REDACTED_SECRET]");
    expect(observedEvent?.redactionCount).toBe(2);
  });

  it("requires all agreement, observation, match, destination, screenshot, action, and configuration lineage", () => {
    const artifacts = makeReceiptArtifacts().filter(
      ({ kind }) => kind !== "SCREENSHOT",
    );

    expect(() => makeEvidenceReceiptBundle({ artifacts })).toThrow(
      /screenshot/iu,
    );
  });

  it("rejects an agreement whose exact cited span does not match the confirmed rule", () => {
    const bundle = makeEvidenceReceiptBundle();
    const agreementArtifact = bundle.artifacts.find(
      ({ kind }) => kind === "AGREEMENT_CITATION",
    );
    expect(agreementArtifact).toBeDefined();
    const decoded = JSON.parse(
      Buffer.from(agreementArtifact!.contentBase64, "base64").toString("utf8"),
    ) as { readonly quotedText: string };
    expect(decoded.quotedText).toBe(
      "Student email is restricted to authorized service providers.",
    );
  });

  it("rejects self-consistent rehashing that breaks semantic lineage", () => {
    const bundle = makeEvidenceReceiptBundle();
    const artifacts = bundle.artifacts.map((artifact) => {
      if (artifact.kind !== "AGREEMENT_CITATION") return artifact;
      const content = JSON.parse(
        Buffer.from(artifact.contentBase64, "base64").toString("utf8"),
      ) as Record<string, unknown>;
      const changedContent = {
        ...content,
        quotedText: "A different agreement span.",
      };
      const bytes = Buffer.from(canonicalJson(changedContent), "utf8");
      return {
        ...artifact,
        contentBase64: bytes.toString("base64"),
        byteLength: bytes.byteLength,
        sha256: sha256CanonicalValue(changedContent),
      };
    });
    const changed = artifacts.find(
      ({ kind }) => kind === "AGREEMENT_CITATION",
    )!;
    const receiptWithoutHash = {
      ...bundle.receipt,
      artifactHashes: {
        ...bundle.receipt.artifactHashes,
        [changed.path]: changed.sha256,
      },
      artifactByteLengths: {
        ...bundle.receipt.artifactByteLengths,
        [changed.path]: changed.byteLength,
      },
    };
    const { manifestHash: _manifestHash, ...hashable } = receiptWithoutHash;
    const receipt = {
      ...receiptWithoutHash,
      manifestHash: sha256CanonicalValue(hashable),
    };
    const report = verifyEvidenceReceiptBundle({
      ...bundle,
      receipt,
      artifacts,
    });

    expect(report.status).toBe("INVALID");
    expect(report.issues.map(({ code }) => code)).toContain(
      "LINEAGE_CONTENT_MISMATCH",
    );
  });
});
