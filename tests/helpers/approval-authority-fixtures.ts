import { evaluateBoundedFinding } from "../../packages/core/src/finding-evaluation";
import { createEvidenceReceiptBundle } from "../../packages/core/src/evidence-receipt";
import { domainIds, automationActor } from "./domain-fixtures";
import {
  makeEvidenceReceiptBundle,
  makeReceiptAgreementVersion,
  makeReceiptArtifacts,
} from "./evidence-receipt-fixtures";
import { makeFindingEvaluationInput } from "./finding-evaluation-fixtures";

export const approvalAuthorityIds = Object.freeze({
  contribution: "30303030-3030-4030-8030-303030303030",
  event: "31313131-3131-4131-8131-313131313131",
  decision: "32323232-3232-4232-8232-323232323232",
  firstVisibilityFinding: "33333333-3333-4333-8333-333333333334",
  firstVisibilityRun: "34343434-3434-4434-8434-343434343434",
  visibilityReceipt: "35353535-3535-4535-8535-353535353535",
  priorVisibleRun: "40404040-4040-4040-8040-404040404040",
});

export const approvalSoftwareFixture = Object.freeze({
  workspaceId: domainIds.workspace,
  softwareId: domainIds.software,
  softwareName: "Northstar Classroom (Fictional)",
  state: "APPROVED" as const,
  approvalOrigin: {
    id: "36363636-3636-4636-8636-363636363636",
    workspaceId: domainIds.workspace,
    softwareId: domainIds.software,
    state: "APPROVED" as const,
    setBy: {
      kind: "IMPORTED_SYSTEM" as const,
      actorId: "fictional-district-registry",
      displayName: "Fictional Cedar Ridge App Registry",
      source: "district inventory export",
    },
    reason: "Imported existing district approval record.",
    sourceReference: "AP-2042",
    recordedBy: { kind: "HUMAN" as const, actorId: "fictional-officer-a" },
    recordedAt: "2026-07-22T13:00:00.000Z",
  },
});

export function conflictSignal() {
  const bundle = makeEvidenceReceiptBundle();
  const findingEvaluation = evaluateBoundedFinding(
    makeFindingEvaluationInput({ destinationStatus: "PROHIBITED" }),
  );
  return {
    workspaceId: domainIds.workspace,
    softwareId: domainIds.software,
    findingEvaluation,
    receiptBundle: bundle,
    actor: automationActor,
    idempotencyKey: `receipt:${bundle.receipt.id}`,
  };
}

export function repairedSignal() {
  const findingEvaluation = evaluateBoundedFinding(
    makeFindingEvaluationInput({
      matcherStatus: "NO_MATCH",
      priorFindingId: domainIds.finding,
    }),
  );
  return {
    workspaceId: domainIds.workspace,
    softwareId: domainIds.software,
    findingEvaluation,
    actor: automationActor,
    idempotencyKey: `finding:${findingEvaluation.finding.id}`,
  };
}

export function visibilitySignal(options: {
  readonly frozenRetry?: boolean;
  readonly previouslyVisible?: boolean;
} = {}) {
  const findingInput = makeFindingEvaluationInput({
    coverage: [
      {
        checkpointId: "student-submit-request",
        status: "NOT_VISIBLE",
        reason: "The required request was outside recorder visibility.",
      },
      {
        checkpointId: "submission-complete",
        status: "VERIFIED",
      },
    ],
  });
  const findingEvaluation = evaluateBoundedFinding(findingInput);
  const receiptBundle = createEvidenceReceiptBundle({
    receiptId: approvalAuthorityIds.visibilityReceipt,
    findingEvaluation,
    runManifest: findingInput.runManifest,
    requirement: findingInput.requirement,
    agreementVersion: makeReceiptAgreementVersion(),
    artifacts: makeReceiptArtifacts(),
    createdAt: "2026-07-22T14:30:00.000Z",
    createdBy: {
      kind: "AUTOMATION",
      actorId: "pactwire-receipt-builder",
      component: "pactwire-evidence-receipt-v1",
    },
  });
  const receipt = receiptBundle.receipt;
  const snapshotHash = findingInput.runManifest.snapshot.snapshotHash;
  return {
    workspaceId: domainIds.workspace,
    softwareId: domainIds.software,
    findingEvaluation,
    receiptBundle,
    actor: automationActor,
    idempotencyKey: `visibility:${receipt.id}`,
    visibilityLossProof: {
      checkpointId: "student-submit-request",
      ...(options.previouslyVisible === false
        ? {}
        : {
            priorVisibleAttempt: {
              runId: approvalAuthorityIds.priorVisibleRun,
              state: "VERIFIED" as const,
              snapshotHash,
            },
          }),
      firstAttempt: {
        findingId: approvalAuthorityIds.firstVisibilityFinding,
        runId: approvalAuthorityIds.firstVisibilityRun,
        state: "NOT_VISIBLE" as const,
        snapshotHash,
      },
      retryAttempt: {
        findingId: findingEvaluation.finding.id,
        runId: findingEvaluation.finding.runId,
        retryOfRunId: approvalAuthorityIds.firstVisibilityRun,
        state: "NOT_VISIBLE" as const,
        snapshotHash: options.frozenRetry === false ? "f".repeat(64) : snapshotHash,
      },
    },
  };
}

export function idFactory(): () => string {
  const ids = [
    approvalAuthorityIds.contribution,
    approvalAuthorityIds.event,
    approvalAuthorityIds.decision,
    "37373737-3737-4737-8737-373737373737",
    "38383838-3838-4838-8838-383838383838",
    "39393939-3939-4939-8939-393939393939",
  ];
  return () => ids.shift() ?? crypto.randomUUID();
}
