import { createHash } from "node:crypto";
import type {
  AgreementVersion,
  RequirementProposalCandidate,
  RequirementProposalModelAttempt,
} from "../../packages/core/src/index";

const encoder = new TextEncoder();

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export const proposalFixtureIds = Object.freeze({
  workspace: "11111111-1111-4111-8111-111111111111",
  software: "22222222-2222-4222-8222-222222222222",
  agreement: "33333333-3333-4333-8333-333333333333",
});

export const proposalSource = Object.freeze({
  pageOne:
    "Fictional Cedar Ridge DPA\nPurpose: classroom instruction only.",
  pageTwo:
    "Fictional Cedar Ridge DPA\nRecipients: district-authorized subprocessors only.",
});

export function makeProposalAgreement(): AgreementVersion {
  const separator = "\n\f\n";
  const normalizedText = `${proposalSource.pageOne}${separator}${proposalSource.pageTwo}`;
  const pageTwoStart = proposalSource.pageOne.length + separator.length;
  return {
    id: proposalFixtureIds.agreement,
    workspaceId: proposalFixtureIds.workspace,
    softwareId: proposalFixtureIds.software,
    version: 1,
    sourceObjectKey: `agreements/sha256/${"a".repeat(64)}.txt`,
    sourceSha256: "a".repeat(64),
    sourceMimeType: "text/plain",
    sourceFileName: "Northstar-DPA-fictional.txt",
    sourceByteLength: encoder.encode(
      `${proposalSource.pageOne}\f${proposalSource.pageTwo}`,
    ).length,
    normalizedText,
    pageMap: [
      {
        pageNumber: 1,
        startOffset: 0,
        endOffset: proposalSource.pageOne.length,
        text: proposalSource.pageOne,
        textSha256: sha256(proposalSource.pageOne),
      },
      {
        pageNumber: 2,
        startOffset: pageTwoStart,
        endOffset: pageTwoStart + proposalSource.pageTwo.length,
        text: proposalSource.pageTwo,
        textSha256: sha256(proposalSource.pageTwo),
      },
    ],
    createdAt: "2026-07-19T20:30:00.000Z",
    createdBy: { kind: "HUMAN", actorId: "fictional-officer-a" },
  };
}

export function makeProposalCandidate(
  overrides: Partial<RequirementProposalCandidate> = {},
): RequirementProposalCandidate {
  return {
    plainLanguage:
      "Use fictional student information only for classroom instruction.",
    sourceText: "Purpose: classroom instruction only.",
    pageNumber: 1,
    section: "Purpose",
    dataField: "Fictional student account and classroom activity data",
    action: "Collect and use",
    recipientRestriction: "District-authorized service providers only",
    purposeRestriction: "Classroom instruction only",
    ambiguity: "CLEAR",
    ambiguityReason: null,
    suggestedObservableTest:
      "Submit a unique fictional classroom value and record every request carrying it.",
    ...overrides,
  };
}

export function makeCompletedAttempt(
  overrides: Partial<RequirementProposalModelAttempt> = {},
): RequirementProposalModelAttempt {
  return {
    provider: "DETERMINISTIC_FIXTURE",
    outcome: "COMPLETED",
    responseId: "fixture-response-1",
    requestedModel: "fixture-requirement-proposer-v1",
    returnedModel: "fixture-requirement-proposer-v1",
    usage: {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      estimatedCostMicroUsd: 0,
      pricingSnapshot: "fixture-zero-cost-v1",
    },
    latencyMs: 4,
    retryable: false,
    candidates: [makeProposalCandidate()],
    ...overrides,
  };
}
