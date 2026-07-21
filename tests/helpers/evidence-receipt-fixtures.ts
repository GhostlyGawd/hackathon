import { createHash } from "node:crypto";
import { evaluateBoundedFinding } from "../../packages/core/src/finding-evaluation";
import { agreementVersionSchema } from "../../packages/core/src/domain";
import {
  createEvidenceReceiptBundle,
  type EvidenceReceiptArtifactInput,
  type EvidenceReceiptBundle,
} from "../../packages/core/src/evidence-receipt";
import { domainIds, humanActor } from "./domain-fixtures";
import {
  findingFixtureIds,
  findingAgreementQuote,
  makeFindingEvaluationInput,
} from "./finding-evaluation-fixtures";

export const receiptFixtureIds = Object.freeze({
  receipt: domainIds.receipt,
  correctionReceipt: "29292929-2929-4929-8929-292929292929",
  correctionFinding: "28282828-2828-4828-8828-282828282828",
});

export const rawCanaryValue =
  "pw-0123456789abcdef0123456789abcdef@canary.pactwire.invalid";

export function makeReceiptAgreementVersion() {
  const normalizedText = `${"Controlled fictional agreement. ".padEnd(120, " ")}${findingAgreementQuote}`;
  const sourceSha256 = createHash("sha256")
    .update(normalizedText, "utf8")
    .digest("hex");
  return agreementVersionSchema.parse({
    id: domainIds.agreement,
    workspaceId: domainIds.workspace,
    softwareId: domainIds.software,
    version: 1,
    sourceObjectKey: `agreements/sha256/${sourceSha256}.txt`,
    sourceSha256,
    sourceMimeType: "text/plain",
    sourceFileName: "Controlled Fictional Agreement.txt",
    sourceByteLength: Buffer.byteLength(normalizedText, "utf8"),
    normalizedText,
    pageMap: [
      {
        pageNumber: 1,
        startOffset: 0,
        endOffset: normalizedText.length,
        text: normalizedText,
        textSha256: createHash("sha256")
          .update(normalizedText, "utf8")
          .digest("hex"),
      },
    ],
    createdAt: "2026-07-21T16:00:00.000Z",
    createdBy: humanActor,
  });
}

export function makeReceiptArtifacts(
  overrides: Partial<Record<EvidenceReceiptArtifactInput["kind"], unknown>> = {},
): readonly EvidenceReceiptArtifactInput[] {
  return [
    {
      kind: "OBSERVED_EVENT",
      path: "observations/request-0001.json",
      mediaType: "application/json",
      content:
        overrides.OBSERVED_EVENT ??
        {
          eventType: "NETWORK_REQUEST",
          method: "POST",
          hostname: "fixture-analytics.pactwire.test",
          path: "/collect",
          recordedFields: ["email"],
          payloadSha256: "b".repeat(64),
        },
    },
    {
      kind: "CANARY_MATCH",
      path: "matches/email-canary.json",
      mediaType: "application/json",
      content:
        overrides.CANARY_MATCH ??
        {
          observationId: findingFixtureIds.observation,
          canaryId: findingFixtureIds.canary,
          sourceField: "email",
          matchKind: "EXACT",
          matchedValueSha256: "6".repeat(64),
        },
    },
    {
      kind: "DESTINATION_RECORD",
      path: "destinations/fixture-analytics-v1.json",
      mediaType: "application/json",
      content:
        overrides.DESTINATION_RECORD ??
        {
          destinationVersionId: findingFixtureIds.destinationVersion,
          hostname: "fixture-analytics.pactwire.test",
          entityName: "Fixture Analytics (Fictional)",
          classification: "PROHIBITED",
          humanConfirmed: true,
          destinationVersionHash: "d".repeat(64),
        },
    },
    {
      kind: "SCREENSHOT",
      path: "screenshots/fictional-submission.png",
      mediaType: "image/png",
      content:
        overrides.SCREENSHOT ??
        new Uint8Array([
          137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
        ]),
    },
    {
      kind: "ACTION_TRACE",
      path: "actions/trace.json",
      mediaType: "application/json",
      content:
        overrides.ACTION_TRACE ??
        {
          actions: [
            { sequence: 1, action: "NAVIGATE", result: "COMPLETED" },
            { sequence: 2, action: "SUBMIT", result: "COMPLETED" },
          ],
        },
    },
  ];
}

export function makeEvidenceReceiptBundle(
  options: {
    readonly receiptId?: string;
    readonly artifacts?: readonly EvidenceReceiptArtifactInput[];
    readonly correction?: boolean;
  } = {},
): EvidenceReceiptBundle {
  const correction = options.correction ?? false;
  const input = makeFindingEvaluationInput({
    destinationStatus: correction ? "ALLOWED" : "PROHIBITED",
    matcherStatus: correction ? "NO_MATCH" : "MATCHED",
    ...(correction ? { priorFindingId: domainIds.finding } : {}),
  });
  const findingInput = correction
    ? { ...input, findingId: receiptFixtureIds.correctionFinding }
    : input;
  const evaluation = evaluateBoundedFinding(findingInput);
  return createEvidenceReceiptBundle({
    receiptId:
      options.receiptId ??
      (correction
        ? receiptFixtureIds.correctionReceipt
        : receiptFixtureIds.receipt),
    findingEvaluation: evaluation,
    runManifest: findingInput.runManifest,
    requirement: findingInput.requirement,
    agreementVersion: makeReceiptAgreementVersion(),
    artifacts: options.artifacts ?? makeReceiptArtifacts(),
    secretValues: [rawCanaryValue, "fixture-api-secret-value-123456"],
    createdAt: correction
      ? "2026-07-21T17:05:00.000Z"
      : "2026-07-21T17:02:00.000Z",
    createdBy: {
      kind: "AUTOMATION",
      actorId: "pactwire-receipt-builder",
      component: "pactwire-evidence-receipt-v1",
    },
    ...(correction
      ? {
          supersedes: {
            receiptId: receiptFixtureIds.receipt,
            findingId: domainIds.finding,
          },
        }
      : {}),
  });
}
