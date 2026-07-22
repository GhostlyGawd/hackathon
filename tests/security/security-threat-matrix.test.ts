import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  computerUseRunConfigSchema,
  evaluateComputerActionPolicy,
} from "../../apps/runner/src/computer-use";
import {
  evaluateBrowserRequestPolicy,
  isolatedBrowserSessionConfigSchema,
} from "../../apps/runner/src/isolated-browser";
import {
  EvidenceReceiptContentDeletedError,
  EvidenceReceiptService,
  InMemoryEvidenceObjectStore,
  InMemoryEvidenceReceiptRepository,
  WorkspaceBoundaryStore,
  buildSecurityThreatReport,
  evaluateBoundedFinding,
  evaluateEvidenceReleasePolicy,
  redactStructuredValueWithCount,
  resolveDestination,
  scanSyntheticPersona,
  verifyEvidenceReceiptBundle,
} from "../../packages/core/src/index";
import { makeEvidenceReceiptBundle } from "../helpers/evidence-receipt-fixtures";
import { makeFindingEvaluationInput } from "../helpers/finding-evaluation-fixtures";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

function computerPolicy() {
  return computerUseRunConfigSchema.parse({
    workspaceId,
    runId,
    model: "gpt-5.6-sol",
    reasoningEffort: "medium",
    authorizedGoal: "Use only the controlled fictional fixture.",
    startUrl: "https://classroom.pactwire.test/student",
    allowedOrigins: ["https://classroom.pactwire.test"],
    allowedComputerActions: ["screenshot", "click", "type", "wait"],
    trustedControls: [
      {
        dataTestId: "student-response",
        authorizationAction: "SUBMIT",
        disposition: "ALLOW",
      },
      {
        dataTestId: "risky-action",
        authorizationAction: "MESSAGE",
        disposition: "HUMAN_REQUIRED",
      },
      {
        dataTestId: "delete-account",
        authorizationAction: "DELETE",
        disposition: "PROHIBIT",
      },
    ],
    maxTurns: 8,
    maxActions: 32,
    maxTransportRetries: 1,
    requestTimeoutMs: 30_000,
  });
}

const target = {
  origin: "https://classroom.pactwire.test",
  dataTestIds: ["student-response"],
  tagName: "input",
  inputType: "text",
  href: null,
  formAction: "https://classroom.pactwire.test/student",
};

function browserPolicy() {
  return isolatedBrowserSessionConfigSchema.parse({
    workspaceId,
    runId,
    allowedNavigationOrigins: ["https://classroom.pactwire.test"],
    allowedNetworkHosts: [
      "classroom.pactwire.test",
      "classroom-service.pactwire.test",
    ],
    popupPolicy: "BLOCK_ALL",
    downloadPolicy: "ALLOW_ISOLATED",
    clipboardPolicy: "ISOLATED",
    viewport: { width: 1440, height: 1100 },
  });
}

describe("SEC-01 executable PRD threat matrix", () => {
  it("executes the real deterministic control for all 11 threats", async () => {
    const results: {
      threatId:
        | "REAL_DATA_ENTRY"
        | "PROMPT_INJECTION"
        | "CREDENTIAL_LEAKAGE"
        | "OUT_OF_SCOPE_EGRESS"
        | "HARMFUL_AUTHORIZED_ACTION"
        | "CROSS_WORKSPACE_LEAKAGE"
        | "EVIDENCE_TAMPERING"
        | "FALSE_DESTINATION_ATTRIBUTION"
        | "INCOMPLETE_CAPTURE_ASSURANCE"
        | "UNAUTHORIZED_PUBLICATION"
        | "EXCESSIVE_EVIDENCE_RETENTION";
      status: "PASS";
      evidence: string[];
    }[] = [];

    const realDraft = {
      role: "STUDENT",
      displayName: "Taylor Morgan",
      email: "taylor@real-school.edu",
      fields: { studentId: "123456789" },
    };
    const personaScan = scanSyntheticPersona(realDraft);
    expect(personaScan.outcome).toBe("BLOCKED");
    expect(JSON.stringify(personaScan)).not.toContain(realDraft.email);
    results.push({
      threatId: "REAL_DATA_ENTRY",
      status: "PASS",
      evidence: ["scanSyntheticPersona:BLOCKED_WITHOUT_ECHO"],
    });

    const injectedControl = evaluateComputerActionPolicy(computerPolicy(), {
      action: { type: "click", x: 1, y: 1, button: "left" },
      target: { ...target, dataTestIds: ["page-instruction-control"] },
      secretValues: [],
    });
    expect(injectedControl).toMatchObject({
      allowed: false,
      reason: "UNTRUSTED_CONTROL",
    });
    results.push({
      threatId: "PROMPT_INJECTION",
      status: "PASS",
      evidence: ["evaluateComputerActionPolicy:UNTRUSTED_CONTROL"],
    });

    const secret = "FICTIONAL-SEC01-SECRET-9wZ!";
    const secretRepresentation = Buffer.from(secret).toString("base64");
    const redacted = redactStructuredValueWithCount(
      { authorization: secret, encoded: secretRepresentation },
      [secret],
    );
    const blockedSecret = evaluateComputerActionPolicy(computerPolicy(), {
      action: { type: "type", text: secretRepresentation },
      target,
      secretValues: [secret],
    });
    expect(JSON.stringify(redacted.value)).not.toContain(secret);
    expect(JSON.stringify(redacted.value)).not.toContain(secretRepresentation);
    expect(blockedSecret).toMatchObject({
      allowed: false,
      reason: "SECRET_REPRESENTATION_BLOCKED",
    });
    results.push({
      threatId: "CREDENTIAL_LEAKAGE",
      status: "PASS",
      evidence: ["redaction:ALL_CONFIGURED_REPRESENTATIONS", "computer-use:SECRET_BLOCKED"],
    });

    expect(
      evaluateBrowserRequestPolicy(browserPolicy(), {
        url: "https://outside.invalid/collect",
        navigation: false,
      }),
    ).toEqual({ allowed: false, reason: "NETWORK_HOST_BLOCKED" });
    results.push({
      threatId: "OUT_OF_SCOPE_EGRESS",
      status: "PASS",
      evidence: ["evaluateBrowserRequestPolicy:NETWORK_HOST_BLOCKED"],
    });

    const riskyAction = evaluateComputerActionPolicy(computerPolicy(), {
      action: { type: "click", x: 1, y: 1, button: "left" },
      target: { ...target, dataTestIds: ["risky-action"] },
      secretValues: [],
    });
    const destructiveAction = evaluateComputerActionPolicy(computerPolicy(), {
      action: { type: "click", x: 1, y: 1, button: "left" },
      target: { ...target, dataTestIds: ["delete-account"] },
      secretValues: [],
    });
    expect(riskyAction).toMatchObject({
      allowed: false,
      outcome: "HUMAN_REQUIRED",
    });
    expect(destructiveAction).toMatchObject({
      allowed: false,
      reason: "PROHIBITED_ACTION",
    });
    results.push({
      threatId: "HARMFUL_AUTHORIZED_ACTION",
      status: "PASS",
      evidence: ["computer-use:MESSAGE_HUMAN_REQUIRED", "computer-use:DELETE_PROHIBITED"],
    });

    const store = new WorkspaceBoundaryStore<{
      readonly id: string;
      readonly workspaceId: string;
      readonly value: string;
    }>();
    const workspaceB = "33333333-3333-4333-8333-333333333333";
    const record = {
      id: "44444444-4444-4444-8444-444444444444",
      workspaceId,
      value: "workspace-a-only",
    };
    store.insert(workspaceId, record);
    expect(store.read(workspaceB, record.id)).toBeUndefined();
    expect(store.exportWorkspace(workspaceB)).toEqual([]);
    expect(() => store.mutate(workspaceB, record.id, (value) => value)).toThrow();
    results.push({
      threatId: "CROSS_WORKSPACE_LEAKAGE",
      status: "PASS",
      evidence: ["WorkspaceBoundaryStore:CROSS_WORKSPACE_CONCEALED"],
    });

    const validBundle = makeEvidenceReceiptBundle();
    const corruptedBundle = structuredClone(validBundle);
    const bytes = Buffer.from(corruptedBundle.artifacts[0]!.contentBase64, "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    corruptedBundle.artifacts[0]!.contentBase64 = bytes.toString("base64");
    expect(verifyEvidenceReceiptBundle(validBundle).status).toBe("VALID");
    const corruptedReport = verifyEvidenceReceiptBundle(corruptedBundle);
    expect(corruptedReport.status).toBe("INVALID");
    expect(
      corruptedReport.issues.some(
        ({ code }) => code === "ARTIFACT_HASH_MISMATCH",
      ),
    ).toBe(true);
    results.push({
      threatId: "EVIDENCE_TAMPERING",
      status: "PASS",
      evidence: ["verifyEvidenceReceiptBundle:ONE_BYTE_MUTATION_INVALID"],
    });

    expect(
      resolveDestination({
        hostname: "unseen-destination.pactwire.test",
        agreementVersionId: "55555555-5555-4555-8555-555555555555",
      }),
    ).toMatchObject({ status: "UNKNOWN", reason: "DESTINATION_UNSEEN" });
    results.push({
      threatId: "FALSE_DESTINATION_ATTRIBUTION",
      status: "PASS",
      evidence: ["resolveDestination:UNKNOWN_UNTIL_HUMAN_CONFIRMED"],
    });

    const incomplete = evaluateBoundedFinding(
      makeFindingEvaluationInput({
        coverage: [
          { checkpointId: "student-submit-request", status: "VERIFIED" },
          {
            checkpointId: "submission-complete",
            status: "NOT_VISIBLE",
            reason: "Synthetic recorder loss",
          },
        ],
      }),
    );
    expect(incomplete.finding.state).toBe("NOT_VISIBLE");
    results.push({
      threatId: "INCOMPLETE_CAPTURE_ASSURANCE",
      status: "PASS",
      evidence: ["evaluateBoundedFinding:NOT_VISIBLE"],
    });

    expect(
      evaluateEvidenceReleasePolicy({
        actorKind: "HUMAN",
        delivery: "EXTERNAL_PUBLIC",
        sanitized: true,
        permissions: ["WORKSPACE_EXPORT", "EVIDENCE_REVIEW"],
      }),
    ).toEqual({ decision: "DENY", reason: "PUBLICATION_NOT_SUPPORTED" });
    results.push({
      threatId: "UNAUTHORIZED_PUBLICATION",
      status: "PASS",
      evidence: ["evaluateEvidenceReleasePolicy:PUBLICATION_NOT_SUPPORTED"],
    });

    const receiptRepository = new InMemoryEvidenceReceiptRepository();
    const objectStore = new InMemoryEvidenceObjectStore();
    const receiptService = new EvidenceReceiptService(
      receiptRepository,
      objectStore,
      { idFactory: () => "66666666-6666-4666-8666-666666666666" },
    );
    await receiptService.append(validBundle);
    expect(JSON.stringify(await receiptRepository.get(workspaceId, validBundle.receipt.id))).not.toContain(
      "contentBase64",
    );
    await receiptService.deleteRetainedContent({
      workspaceId,
      receiptId: validBundle.receipt.id,
      confirmation: `DELETE ${validBundle.receipt.id}`,
      reason: "SEC-01 controlled deletion",
      requestedAt: "2026-08-22T04:00:00.000Z",
      requestedBy: { kind: "HUMAN", actorId: "fictional-privacy-officer" },
    });
    await expect(
      receiptService.get(workspaceId, validBundle.receipt.id),
    ).rejects.toBeInstanceOf(EvidenceReceiptContentDeletedError);
    results.push({
      threatId: "EXCESSIVE_EVIDENCE_RETENTION",
      status: "PASS",
      evidence: ["EvidenceReceiptService:METADATA_ONLY_AND_TOMBSTONED_DELETION"],
    });

    const report = buildSecurityThreatReport({
      generatedAt: "2026-07-22T04:00:00.000Z",
      results,
    });
    expect(report.status).toBe("PASS");
    expect(report.threats).toHaveLength(11);

    if (process.env.PACTWIRE_WRITE_SEC01_REPORTS === "1") {
      const reportRoot = path.join(
        process.cwd(),
        "artifacts",
        "verification",
        "SEC-01",
        "reports",
      );
      await mkdir(reportRoot, { recursive: true });
      await writeFile(
        path.join(reportRoot, "threat-matrix.json"),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8",
      );
    }
  });
});
