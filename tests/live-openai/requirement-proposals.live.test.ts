import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  extractAgreementSource,
  hashAgreementBytes,
} from "../../packages/core/src/agreement-intake";
import {
  FetchOpenAIResponsesTransport,
  OpenAIResponsesRequirementProposalAdapter,
  validateRequirementProposalAttempt,
} from "../../packages/core/src/requirement-proposals";
import type { AgreementVersion } from "../../packages/core/src/domain";

async function fictionalDpaPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  document.addPage().drawText(
    "Fictional Cedar Ridge DPA - Purpose: classroom instruction only.",
    { font, size: 11 },
  );
  document.addPage().drawText(
    "Recipients: district-authorized subprocessors only.",
    { font, size: 11 },
  );
  return document.save({ useObjectStreams: false });
}

describe("AGR-02 live GPT-5.6 Sol requirement proposal contract", () => {
  it("returns at least one structured proposal with an exact fictional PDF citation", async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required for the opt-in AGR-02 live contract; this gate is never skipped or replaced by the deterministic adapter.",
      );
    }
    const bytes = await fictionalDpaPdf();
    const extracted = await extractAgreementSource({
      mimeType: "application/pdf",
      bytes,
    });
    const sourceSha256 = hashAgreementBytes(bytes);
    const agreement: AgreementVersion = {
      id: "33333333-3333-4333-8333-333333333333",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      softwareId: "22222222-2222-4222-8222-222222222222",
      version: 1,
      sourceObjectKey: `agreements/sha256/${sourceSha256}.pdf`,
      sourceSha256,
      sourceMimeType: "application/pdf",
      sourceFileName: "Pactwire-fictional-live-contract-DPA.pdf",
      sourceByteLength: bytes.length,
      normalizedText: extracted.normalizedText,
      pageMap: extracted.pageMap.map((page) => ({ ...page })),
      createdAt: "2026-07-19T21:30:00.000Z",
      createdBy: {
        kind: "HUMAN",
        actorId: "fictional-live-contract-officer",
      },
    };
    const adapter = new OpenAIResponsesRequirementProposalAdapter(
      new FetchOpenAIResponsesTransport(apiKey),
      { model: "gpt-5.6-sol", timeoutMs: 120_000 },
    );

    const attempt = await adapter.propose({ agreement, bytes });
    const validation = validateRequirementProposalAttempt(agreement, attempt);

    expect(attempt).toMatchObject({
      provider: "OPENAI",
      outcome: "COMPLETED",
      requestedModel: "gpt-5.6-sol",
    });
    expect(attempt.returnedModel).toMatch(/^gpt-5\.6-sol(?:-|$)/u);
    expect(validation.status).toBe("SUCCEEDED");
    expect(validation.proposals.length).toBeGreaterThan(0);
    for (const proposal of validation.proposals) {
      expect(
        agreement.normalizedText.slice(
          proposal.citation.startOffset,
          proposal.citation.endOffset,
        ),
      ).toBe(proposal.candidate.sourceText);
    }

    const manifest = {
      taskId: "AGR-02",
      fixture: "controlled-fictional-dpa-pdf",
      sourceSha256,
      requestedModel: attempt.requestedModel,
      returnedModel: attempt.returnedModel,
      responseIdSha256: attempt.responseId
        ? createHash("sha256").update(attempt.responseId).digest("hex")
        : null,
      usage: attempt.usage,
      latencyMs: attempt.latencyMs,
      proposalCount: validation.proposals.length,
      citations: validation.proposals.map((proposal) => ({
        page: proposal.citation.page,
        startOffset: proposal.citation.startOffset,
        endOffset: proposal.citation.endOffset,
        quotedTextSha256: proposal.citation.quotedTextSha256,
      })),
      sourceTextIncluded: false,
      apiKeyIncluded: false,
      passed: true,
    };
    const outputDirectory = path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "AGR-02",
    );
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      path.join(outputDirectory, "live-openai-contract.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  }, 150_000);
});
