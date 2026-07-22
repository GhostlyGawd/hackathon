import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  Aes256GcmSecretCipher,
  AgreementIntakeService,
  ApprovalAuthorityService,
  DeterministicRequirementProposalAdapter,
  DestinationRegistryService,
  FetchOpenAIResponsesTransport,
  InMemoryAgreementIntakeRepository,
  InMemoryAgreementObjectStore,
  InMemoryApprovalAuthorityRepository,
  InMemoryDestinationRegistryRepository,
  InMemoryFindingEvaluationRepository,
  InMemoryEvidenceObjectStore,
  InMemoryEvidenceReceiptRepository,
  InMemoryJourneyAuthoringRepository,
  InMemoryRunOrchestrationRepository,
  InMemoryRequirementProposalRepository,
  InMemoryRequirementReviewRepository,
  InMemorySecretIsolationRepository,
  InMemorySyntheticDataRepository,
  InMemoryWorkspaceAuthorizationRepository,
  JourneyAuthoringService,
  confirmedRequirementSchema,
  agreementVersionSchema,
  evaluateBoundedFinding,
  createEvidenceReceiptBundle,
  matchCanaryObservation,
  InMemorySoftwareInventoryRepository,
  InMemoryTestAuthorizationRepository,
  OpenAIResponsesRequirementProposalAdapter,
  SecretIsolationService,
  RequirementProposalService,
  RequirementReviewService,
  RunOrchestrationService,
  EvidenceReceiptService,
  SyntheticDataService,
  SoftwareInventoryService,
  TestAuthorizationService,
  WorkspaceAuthorizationService,
  type RequirementProposalModelAdapter,
  type RunHistoryEntry,
  type RunManifest,
  type WorkspacePrincipal,
} from "@pactwire/core";
import { QualityTelemetryRuntime } from "./quality-telemetry-runtime";

export const fixtureWorkspaceIds = Object.freeze({
  cedarRidge: "11111111-1111-4111-8111-111111111111",
  harbor: "22222222-2222-4222-8222-222222222222",
});

export interface FixtureUser {
  readonly key: "officer" | "operator" | "reviewer" | "harbor-officer";
  readonly userId: string;
  readonly displayName: string;
  readonly activeWorkspaceId: string;
}

export const fixtureUsers: Readonly<Record<FixtureUser["key"], FixtureUser>> =
  Object.freeze({
    officer: Object.freeze({
      key: "officer",
      userId: "fictional-officer-a",
      displayName: "Morgan Vale (Fictional)",
      activeWorkspaceId: fixtureWorkspaceIds.cedarRidge,
    }),
    operator: Object.freeze({
      key: "operator",
      userId: "fictional-operator-a",
      displayName: "Riley Chen (Fictional)",
      activeWorkspaceId: fixtureWorkspaceIds.cedarRidge,
    }),
    reviewer: Object.freeze({
      key: "reviewer",
      userId: "fictional-reviewer-a",
      displayName: "Jordan Brooks (Fictional)",
      activeWorkspaceId: fixtureWorkspaceIds.cedarRidge,
    }),
    "harbor-officer": Object.freeze({
      key: "harbor-officer",
      userId: "fictional-officer-b",
      displayName: "Avery Stone (Fictional)",
      activeWorkspaceId: fixtureWorkspaceIds.harbor,
    }),
  });

export interface AccessRuntime {
  readonly repository: InMemoryWorkspaceAuthorizationRepository;
  readonly service: WorkspaceAuthorizationService;
  readonly inventoryRepository: InMemorySoftwareInventoryRepository;
  readonly inventoryService: SoftwareInventoryService;
  readonly agreementRepository: InMemoryAgreementIntakeRepository;
  readonly agreementObjectStore: InMemoryAgreementObjectStore;
  readonly agreementService: AgreementIntakeService;
  readonly requirementProposalRepository: InMemoryRequirementProposalRepository;
  readonly requirementProposalService: RequirementProposalService;
  readonly requirementReviewRepository: InMemoryRequirementReviewRepository;
  readonly requirementReviewService: RequirementReviewService;
  readonly testAuthorizationRepository: InMemoryTestAuthorizationRepository;
  readonly testAuthorizationService: TestAuthorizationService;
  readonly secretIsolationRepository: InMemorySecretIsolationRepository;
  readonly secretIsolationService: SecretIsolationService;
  readonly syntheticDataRepository: InMemorySyntheticDataRepository;
  readonly syntheticDataService: SyntheticDataService;
  readonly journeyAuthoringRepository: InMemoryJourneyAuthoringRepository;
  readonly journeyAuthoringService: JourneyAuthoringService;
  readonly destinationRegistryRepository: InMemoryDestinationRegistryRepository;
  readonly destinationRegistryService: DestinationRegistryService;
  readonly runOrchestrationRepository: InMemoryRunOrchestrationRepository;
  readonly runOrchestrationService: RunOrchestrationService;
  readonly liveRunReviews: ReadonlyMap<string, FixtureLiveRunReview>;
  readonly findingEvaluationRepository: InMemoryFindingEvaluationRepository;
  readonly evidenceReceiptRepository: InMemoryEvidenceReceiptRepository;
  readonly evidenceReceiptService: EvidenceReceiptService;
  readonly approvalAuthorityRepository: InMemoryApprovalAuthorityRepository;
  readonly approvalAuthorityService: ApprovalAuthorityService;
  readonly qualityTelemetry: QualityTelemetryRuntime;
}

export interface FixtureLiveRunReview {
  readonly runId: string;
  readonly journeyName: string;
  readonly role: "STUDENT";
  readonly preview: {
    readonly alt: string;
    readonly capturedAt: string;
  };
  readonly allowedScope: {
    readonly origins: readonly ["https://classroom.pactwire.test"];
    readonly actions: readonly ["NAVIGATE", "CLICK", "TYPE"];
  };
  readonly modelAction: {
    readonly summary: string;
    readonly isChainOfThought: false;
    readonly occurredAt: string;
  };
  readonly recorderEvent: {
    readonly source: "NETWORK";
    readonly summary: string;
    readonly occurredAt: string;
    readonly payloadHash: string;
  };
  readonly checkpointCoverage: readonly {
    readonly checkpointId: string;
    readonly label: string;
    readonly status: "VERIFIED" | "PENDING";
  }[];
  readonly canaryMatches: readonly {
    readonly field: "email";
    readonly destinationHostname: "classroom.pactwire.test";
    readonly status: "MATCHED";
  }[];
}

export function isFixtureMode(): boolean {
  if (process.env.PACTWIRE_FIXTURE_MODE === "1") {
    return true;
  }
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.PACTWIRE_FIXTURE_MODE !== "0"
  );
}

type RequirementProposalEnvironment = Readonly<
  Record<string, string | undefined>
>;

export function createRequirementProposalAdapterFromEnvironment(
  environment: RequirementProposalEnvironment = process.env,
): RequirementProposalModelAdapter {
  const mode = environment.PACTWIRE_REQUIREMENT_PROPOSAL_ADAPTER ?? "fixture";
  if (mode === "fixture") {
    return new DeterministicRequirementProposalAdapter();
  }
  if (mode === "openai") {
    const apiKey = environment.OPENAI_API_KEY;
    if (!apiKey?.trim()) {
      throw new Error(
        "OPENAI_API_KEY is required when PACTWIRE_REQUIREMENT_PROPOSAL_ADAPTER=openai",
      );
    }
    return new OpenAIResponsesRequirementProposalAdapter(
      new FetchOpenAIResponsesTransport(apiKey),
      { model: "gpt-5.6-sol" },
    );
  }
  throw new Error(
    "PACTWIRE_REQUIREMENT_PROPOSAL_ADAPTER must be fixture or openai",
  );
}

function fixtureIdFactory(): () => string {
  const firstIds = [
    fixtureWorkspaceIds.cedarRidge,
    "31313131-3131-4131-8131-313131313131",
    "32323232-3232-4232-8232-323232323232",
    "33333333-3333-4333-8333-333333333334",
    fixtureWorkspaceIds.harbor,
    "34343434-3434-4434-8434-343434343434",
    "35353535-3535-4535-8535-353535353535",
    "36363636-3636-4636-8636-363636363636",
    "37373737-3737-4737-8737-373737373737",
    "38383838-3838-4838-8838-383838383838",
    "39393939-3939-4939-8939-393939393939",
    "40404040-4040-4040-8040-404040404040",
    "41414141-4141-4141-8141-414141414141",
    "42424242-4242-4242-8242-424242424242",
  ];
  return () => firstIds.shift() ?? randomUUID();
}

function fixtureClock(): () => string {
  let offset = 0;
  return () => {
    const current = new Date(Date.UTC(2026, 6, 19, 20, 30, offset));
    offset += 1;
    return current.toISOString();
  };
}

export const fixtureRunHistorySoftwareId =
  "56565656-5656-4565-8565-565656565656";

function runHistoryFixtureOptions(): {
  readonly advance: (milliseconds: number) => void;
  readonly idFactory: () => string;
  readonly now: () => string;
} {
  let current = Date.parse("2026-07-22T14:00:00.000Z");
  let identifier = 1;
  return {
    advance: (milliseconds: number) => {
      current += milliseconds;
    },
    idFactory: () =>
      `57575757-5757-4757-8757-${String(identifier++).padStart(12, "0")}`,
    now: () => {
      const observed = new Date(current).toISOString();
      current += 1_000;
      return observed;
    },
  };
}

async function seedRunHistory(
  repository: InMemoryRunOrchestrationRepository,
  service: RunOrchestrationService,
  advance: (milliseconds: number) => void,
): Promise<ReadonlyMap<string, FixtureLiveRunReview>> {
  const human = {
    kind: "HUMAN" as const,
    actorId: fixtureUsers.officer.userId,
  };
  const automation = {
    kind: "AUTOMATION" as const,
    actorId: "pactwire-fixture-worker",
    component: "run-orchestrator",
  };
  const requiredCheckpointIds = [
    "submission-request",
    "completion-visible",
  ] as const;
  const snapshot = {
    agreementVersionId: "58585858-5858-4858-8858-585858585858",
    journeyVersionId: "59595959-5959-4959-8959-595959595959",
    authorizationId: "60606060-6060-4060-8060-606060606060",
    runnerConfigVersion: "controlled-runner-v1",
    snapshotHash: "a".repeat(64),
  };
  const observation = (ordinal: number, source: "BROWSER" | "NETWORK") => ({
    observationId: `61616161-6161-4161-8161-${String(ordinal).padStart(12, "0")}`,
    sequence: ordinal,
    source,
    payloadHash: ordinal.toString(16).padStart(64, "0"),
  });
  const queue = (label: string) =>
    service.queueRun({
      workspaceId: fixtureWorkspaceIds.cedarRidge,
      softwareId: fixtureRunHistorySoftwareId,
      snapshot,
      requiredCheckpointIds,
      modelIdentifier: "gpt-5.6-sol",
      queuedBy: human,
      idempotencyKey: `fixture-${label}-queue`,
    });
  const claim = (label: string) =>
    service.claimNext({
      workspaceId: fixtureWorkspaceIds.cedarRidge,
      workerId: `fixture-${label}-worker`,
      leaseToken: `${label}-${"fictional-lease-token".repeat(2)}`,
      actor: automation,
      idempotencyKey: `fixture-${label}-claim`,
    });
  const verifiedCoverage = requiredCheckpointIds.map((checkpointId) => ({
    checkpointId,
    status: "VERIFIED" as const,
  }));

  const completed = await queue("completed");
  const completedClaim = await claim("completed");
  if (!completedClaim) throw new Error("Completed fixture run was not claimed");
  await service.finalizeRun({
    workspaceId: completed.workspaceId,
    runId: completed.id,
    leaseToken: completedClaim.leaseToken,
    terminalStatus: "COMPLETED",
    runnerVersion: "pactwire-runner-v1",
    observations: [observation(1, "NETWORK"), observation(2, "BROWSER")],
    coverage: verifiedCoverage,
    limitations: ["Only the controlled fictional student journey was exercised."],
    actor: automation,
    idempotencyKey: "fixture-completed-finalize",
  });

  const partial = await queue("partial");
  const partialClaim = await claim("partial");
  if (!partialClaim) throw new Error("Partial fixture run was not claimed");
  await service.finalizeRun({
    workspaceId: partial.workspaceId,
    runId: partial.id,
    leaseToken: partialClaim.leaseToken,
    terminalStatus: "PARTIAL",
    runnerVersion: "pactwire-runner-v1",
    observations: [observation(3, "NETWORK")],
    coverage: [
      { checkpointId: requiredCheckpointIds[0], status: "VERIFIED" },
      {
        checkpointId: requiredCheckpointIds[1],
        status: "NOT_VISIBLE",
        reason: "The completion signal was outside recorder visibility.",
      },
    ],
    limitations: ["One required checkpoint was not visible to the recorder."],
    actor: automation,
    idempotencyKey: "fixture-partial-finalize",
  });

  const visibilityRetry = await service.retryRun({
    workspaceId: partial.workspaceId,
    sourceRunId: partial.id,
    requestedBy: human,
    idempotencyKey: "fixture-partial-visibility-retry",
  });
  const visibilityRetryClaim = await claim("visibility-retry");
  if (
    !visibilityRetryClaim ||
    visibilityRetryClaim.run.id !== visibilityRetry.run.id
  ) {
    throw new Error("Visibility retry fixture run was not claimed");
  }
  await service.finalizeRun({
    workspaceId: visibilityRetry.run.workspaceId,
    runId: visibilityRetry.run.id,
    leaseToken: visibilityRetryClaim.leaseToken,
    terminalStatus: "PARTIAL",
    runnerVersion: "pactwire-runner-v1",
    observations: [observation(6, "NETWORK")],
    coverage: [
      { checkpointId: requiredCheckpointIds[0], status: "VERIFIED" },
      {
        checkpointId: requiredCheckpointIds[1],
        status: "NOT_VISIBLE",
        reason:
          "The completion signal remained outside recorder visibility on the exact frozen retry.",
      },
    ],
    limitations: [
      "The exact frozen retry still could not observe one required checkpoint.",
    ],
    actor: automation,
    idempotencyKey: "fixture-partial-visibility-retry-finalize",
  });

  const failed = await queue("failed");
  const failedClaim = await claim("failed");
  if (!failedClaim) throw new Error("Failed fixture run was not claimed");
  await service.finalizeRun({
    workspaceId: failed.workspaceId,
    runId: failed.id,
    leaseToken: failedClaim.leaseToken,
    terminalStatus: "FAILED",
    runnerVersion: "pactwire-runner-v1",
    observations: [],
    coverage: requiredCheckpointIds.map((checkpointId) => ({
      checkpointId,
      status: "NOT_TESTED" as const,
      reason: "Execution stopped before this checkpoint.",
    })),
    limitations: ["No required checkpoint completed."],
    actor: automation,
    idempotencyKey: "fixture-failed-finalize",
  });

  const crashed = await queue("crashed");
  const crashedClaim = await claim("crashed");
  if (!crashedClaim) throw new Error("Crash fixture run was not claimed");
  advance(300_001);
  await service.failExpiredLease({
    workspaceId: crashed.workspaceId,
    runId: crashed.id,
    actor: automation,
    idempotencyKey: "fixture-crashed-expire",
  });
  const retry = await service.retryRun({
    workspaceId: crashed.workspaceId,
    sourceRunId: crashed.id,
    requestedBy: human,
    idempotencyKey: "fixture-crashed-retry",
  });
  const retryClaim = await claim("retry");
  if (!retryClaim || retryClaim.run.id !== retry.run.id) {
    throw new Error("Retry fixture run was not claimed");
  }
  await service.finalizeRun({
    workspaceId: retry.run.workspaceId,
    runId: retry.run.id,
    leaseToken: retryClaim.leaseToken,
    terminalStatus: "COMPLETED",
    runnerVersion: "pactwire-runner-v1",
    observations: [observation(4, "NETWORK"), observation(5, "BROWSER")],
    coverage: verifiedCoverage,
    limitations: ["This retry repeated only the exact frozen configuration."],
    actor: automation,
    idempotencyKey: "fixture-retry-finalize",
  });

  const live = await queue("live");
  const liveClaim = await claim("live");
  if (!liveClaim || liveClaim.run.id !== live.id) {
    throw new Error("Live fixture run was not claimed");
  }
  const liveReview: FixtureLiveRunReview = {
    runId: live.id,
    journeyName: "Student submits fictional assignment",
    role: "STUDENT",
    preview: {
      alt: "Latest recorded frame from the controlled fictional classroom journey after the saved student response was submitted.",
      capturedAt: "2026-07-21T02:30:01.694Z",
    },
    allowedScope: {
      origins: ["https://classroom.pactwire.test"],
      actions: ["NAVIGATE", "CLICK", "TYPE"],
    },
    modelAction: {
      summary: "Submit the fictional student's saved response.",
      isChainOfThought: false,
      occurredAt: "2026-07-22T14:09:01.000Z",
    },
    recorderEvent: {
      source: "NETWORK",
      summary:
        "Observed POST /api/submissions to classroom.pactwire.test.",
      occurredAt: "2026-07-22T14:09:02.000Z",
      payloadHash: "7".repeat(64),
    },
    checkpointCoverage: [
      {
        checkpointId: requiredCheckpointIds[0],
        label: "Submission request recorded",
        status: "VERIFIED",
      },
      {
        checkpointId: requiredCheckpointIds[1],
        label: "Completion visible to the student",
        status: "PENDING",
      },
    ],
    canaryMatches: [
      {
        field: "email",
        destinationHostname: "classroom.pactwire.test",
        status: "MATCHED",
      },
    ],
  };

  const history = await repository.listHistory(
    fixtureWorkspaceIds.cedarRidge,
    fixtureRunHistorySoftwareId,
  );
  if (history.length !== 7) {
    throw new Error("The controlled run-history fixture is incomplete");
  }
  return new Map([[live.id, Object.freeze(liveReview)]]);
}

export const fixtureFindingIds = Object.freeze({
  clean: "71717171-7171-4171-8171-717171710001",
  conflict: "71717171-7171-4171-8171-717171710002",
  repaired: "71717171-7171-4171-8171-717171710003",
  ambiguity: "71717171-7171-4171-8171-717171710004",
  notVisible: "71717171-7171-4171-8171-717171710005",
  notTested: "71717171-7171-4171-8171-717171710006",
  visibilityRetry: "71717171-7171-4171-8171-717171710007",
});

const fixtureFindingRequirementId =
  "72727272-7272-4272-8272-727272727272";
const fixtureAgreementQuote =
  "Student email is restricted to agreement-authorized service providers.";

function requiredManifest(
  history: readonly RunHistoryEntry[],
  predicate: (entry: RunHistoryEntry) => boolean,
  description: string,
): RunManifest {
  const manifest = history.find(predicate)?.manifest;
  if (!manifest) {
    throw new Error(`Finding fixture is missing ${description}`);
  }
  return manifest;
}

function fixtureRequirement(manifest: RunManifest) {
  return confirmedRequirementSchema.parse({
    id: fixtureFindingRequirementId,
    workspaceId: manifest.workspaceId,
    agreementVersionId: manifest.snapshot.agreementVersionId,
    requirementKey: "student-email-recipient",
    version: 1,
    sourceVersionId: "73737373-7373-4373-8373-737373737373",
    status: "CONFIRMED",
    executable: true,
    plainLanguage:
      "Student email must not be sent to a destination prohibited by the confirmed agreement.",
    details: {
      plainLanguage:
        "Student email must not be sent to a destination prohibited by the confirmed agreement.",
      sourceText: fixtureAgreementQuote,
      pageNumber: 1,
      section: "Student data recipients",
      dataField: "email",
      action: "send",
      recipientRestriction: "Only agreement-authorized service providers",
      purposeRestriction: null,
      ambiguity: "CLEAR",
      ambiguityReason: null,
      suggestedObservableTest:
        "Submit the fictional student form and inspect recorded request destinations.",
    },
    citation: {
      page: 1,
      startOffset: 120,
      endOffset: 120 + fixtureAgreementQuote.length,
      quotedTextSha256: createHash("sha256")
        .update(fixtureAgreementQuote)
        .digest("hex"),
    },
    predicate: {
      kind: "OBSERVABLE_DATA_FLOW",
      dataField: "email",
      action: "send",
      recipientRestriction: "Only agreement-authorized service providers",
      purposeRestriction: null,
      suggestedObservableTest:
        "Submit the fictional student form and inspect recorded request destinations.",
    },
    confirmedBy: {
      kind: "HUMAN",
      actorId: fixtureUsers.officer.userId,
    },
    confirmedAt: "2026-07-22T13:45:00.000Z",
    reviewRationale:
      "The stored fictional agreement language names a testable recipient rule.",
    changes: [
      {
        field: "status",
        oldValue: '"PROPOSED"',
        newValue: '"CONFIRMED"',
      },
    ],
    createdAt: "2026-07-22T13:45:00.000Z",
  });
}

function fixtureReceiptAgreementVersion(manifest: RunManifest) {
  const normalizedText = `${"Controlled fictional agreement. ".padEnd(120, " ")}${fixtureAgreementQuote}`;
  const sourceSha256 = createHash("sha256")
    .update(normalizedText, "utf8")
    .digest("hex");
  return agreementVersionSchema.parse({
    id: manifest.snapshot.agreementVersionId,
    workspaceId: manifest.workspaceId,
    softwareId: manifest.softwareId,
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
    createdAt: "2026-07-22T13:30:00.000Z",
    createdBy: {
      kind: "HUMAN",
      actorId: fixtureUsers.officer.userId,
    },
  });
}

function fixtureMatcherOutcome(
  manifest: RunManifest,
  status: "MATCHED" | "NO_MATCH" | "UNSUPPORTED_TRANSFORM",
) {
  const captured = manifest.observationHashes[0];
  if (!captured) {
    throw new Error("Finding fixture matcher needs a captured observation");
  }
  const canaryValue =
    "pw-0123456789abcdef0123456789abcdef@canary.pactwire.invalid";
  const canary = {
    id: "74747474-7474-4474-8474-747474747474",
    workspaceId: manifest.workspaceId,
    runId: manifest.runId,
    personaId: "75757575-7575-4575-8575-757575757575",
    sourceField: "email",
    value: canaryValue,
    generatedAt: manifest.queuedAt,
  };
  const candidate =
    status === "MATCHED"
      ? {
          location: "BODY" as const,
          path: "student.email",
          value: canaryValue,
        }
      : status === "UNSUPPORTED_TRANSFORM"
        ? {
            location: "BODY" as const,
            path: "student.email",
            value: "opaque-fictional-reference",
            requestedTransform: "OPAQUE_REFERENCE",
          }
        : {
            location: "BODY" as const,
            path: "student.email",
            value: "aggregate-completion-event",
          };
  return matchCanaryObservation({
    observation: {
      id: captured.observationId,
      workspaceId: manifest.workspaceId,
      runId: manifest.runId,
      source: captured.source,
      recorderVersion: "pactwire-browser-cdp-recorder-v1",
      sequence: captured.sequence,
      observedAt: manifest.terminalAt,
      payloadHash: captured.payloadHash,
      facts: { kind: "NETWORK_REQUEST" },
    },
    canaries: [canary],
    candidates: [candidate],
  }).outcomes[0]!;
}

function fixtureDestination(
  manifest: RunManifest,
  status: "ALLOWED" | "PROHIBITED" | "UNKNOWN",
) {
  if (status === "UNKNOWN") {
    return {
      status,
      hostname: "unknown-destination.pactwire.test",
      reason: "ENTITY_NOT_CONFIRMED" as const,
    };
  }
  return {
    status,
    hostname:
      status === "PROHIBITED"
        ? "fixture-analytics.pactwire.test"
        : "classroom-service.pactwire.test",
    entityId:
      status === "PROHIBITED" ? "fixture-analytics" : "classroom-service",
    entityName:
      status === "PROHIBITED"
        ? "Fixture Analytics (Fictional)"
        : "Classroom Service (Fictional)",
    softwareId: manifest.softwareId,
    agreementVersionId: manifest.snapshot.agreementVersionId,
    destinationVersionId:
      status === "PROHIBITED"
        ? "76767676-7676-4676-8676-767676760002"
        : "76767676-7676-4676-8676-767676760001",
    destinationVersionHash: status === "PROHIBITED" ? "d".repeat(64) : "e".repeat(64),
    humanConfirmed: true as const,
  };
}

function fixtureFindingInput(
  manifest: RunManifest,
  findingId: string,
  options: {
    readonly matcherStatus?:
      | "MATCHED"
      | "NO_MATCH"
      | "UNSUPPORTED_TRANSFORM";
    readonly destinationStatus?: "ALLOWED" | "PROHIBITED" | "UNKNOWN";
    readonly priorFindingId?: string;
    readonly modelNarrative?: boolean;
  } = {},
) {
  const matcherStatus = options.matcherStatus ?? "MATCHED";
  const destinationStatus = options.destinationStatus ?? "ALLOWED";
  const hasObservation = manifest.observationHashes.length > 0;
  return {
    findingId,
    createdAt: new Date(Date.parse(manifest.terminalAt) + 1_000).toISOString(),
    requirement: fixtureRequirement(manifest),
    runManifest: manifest,
    evidence: hasObservation
      ? [
          {
            checkpointId: "submission-request",
            matcherOutcome: fixtureMatcherOutcome(manifest, matcherStatus),
            destination: fixtureDestination(manifest, destinationStatus),
          },
        ]
      : [],
    namedScope: {
      softwareVersion: "fictional-classroom-v1",
      role: "STUDENT" as const,
      journeyName: "Student submits fictional assignment",
      observationWindow: {
        startedAt: manifest.startedAt ?? manifest.queuedAt,
        endedAt: manifest.terminalAt,
      },
      checkpointPaths: [
        {
          checkpointId: "submission-request",
          path: "Student submits the fictional response",
        },
        {
          checkpointId: "completion-visible",
          path: "Student sees the fictional submission complete",
        },
      ],
    },
    ...(options.priorFindingId
      ? { priorFindingId: options.priorFindingId }
      : {}),
    ...(options.modelNarrative
      ? {
          modelNarrative: {
            model: "gpt-5.6-sol",
            text:
              "The recorded fictional student email appears in a request to the confirmed prohibited fixture destination.",
            confidence: 0.93,
          },
        }
      : {}),
  };
}

async function seedFindingEvaluations(
  runRepository: InMemoryRunOrchestrationRepository,
  findingRepository: InMemoryFindingEvaluationRepository,
): Promise<void> {
  const history = await runRepository.listHistory(
    fixtureWorkspaceIds.cedarRidge,
    fixtureRunHistorySoftwareId,
  );
  const completed = requiredManifest(
    history,
    ({ run }) => run.state === "COMPLETED" && !run.retryOfRunId,
    "completed manifest",
  );
  const repaired = requiredManifest(
    history,
    ({ run }) => run.state === "COMPLETED" && Boolean(run.retryOfRunId),
    "repaired rerun manifest",
  );
  const partial = requiredManifest(
    history,
    ({ run }) => run.state === "PARTIAL" && !run.retryOfRunId,
    "partial manifest",
  );
  const visibilityRetry = requiredManifest(
    history,
    ({ run }) => run.state === "PARTIAL" && Boolean(run.retryOfRunId),
    "visibility retry manifest",
  );
  const failed = requiredManifest(
    history,
    ({ run, manifest }) => run.state === "FAILED" && Boolean(manifest),
    "failed manifest",
  );
  const inputs = [
    fixtureFindingInput(completed, fixtureFindingIds.clean),
    fixtureFindingInput(completed, fixtureFindingIds.conflict, {
      destinationStatus: "PROHIBITED",
      modelNarrative: true,
    }),
    fixtureFindingInput(repaired, fixtureFindingIds.repaired, {
      matcherStatus: "NO_MATCH",
      priorFindingId: fixtureFindingIds.conflict,
    }),
    fixtureFindingInput(completed, fixtureFindingIds.ambiguity, {
      matcherStatus: "UNSUPPORTED_TRANSFORM",
      destinationStatus: "UNKNOWN",
    }),
    fixtureFindingInput(partial, fixtureFindingIds.notVisible),
    fixtureFindingInput(visibilityRetry, fixtureFindingIds.visibilityRetry),
    fixtureFindingInput(failed, fixtureFindingIds.notTested),
  ];
  for (const input of inputs) {
    await findingRepository.append(evaluateBoundedFinding(input));
  }
}

async function seedEvidenceReceipts(
  runRepository: InMemoryRunOrchestrationRepository,
  findingRepository: InMemoryFindingEvaluationRepository,
  receiptService: EvidenceReceiptService,
): Promise<void> {
  const history = await runRepository.listHistory(
    fixtureWorkspaceIds.cedarRidge,
    fixtureRunHistorySoftwareId,
  );
  const screenshot = await readFile(
    new URL("../../../docs/evidence/FIX-01/fixture-regression-desktop.png", import.meta.url),
  );
  const receipts = [
    {
      findingId: fixtureFindingIds.conflict,
      receiptId: "79797979-7979-4979-8979-797979797979",
      destinationStatus: "PROHIBITED" as const,
      createdAt: "2026-07-22T14:05:00.000Z",
    },
    {
      findingId: fixtureFindingIds.visibilityRetry,
      receiptId: "80808080-8080-4080-8080-808080808080",
      destinationStatus: "ALLOWED" as const,
      createdAt: "2026-07-22T14:06:00.000Z",
    },
  ] as const;
  for (const receiptFixture of receipts) {
    const finding = await findingRepository.get(
      fixtureWorkspaceIds.cedarRidge,
      receiptFixture.findingId,
    );
    if (!finding) {
      throw new Error("Receipt fixture is missing its exact finding");
    }
    const manifest = history.find(
      ({ run }) => run.id === finding.finding.runId,
    )?.manifest;
    if (!manifest) {
      throw new Error("Receipt fixture is missing its exact run manifest");
    }
    const match = fixtureMatcherOutcome(manifest, "MATCHED");
    const destination = fixtureDestination(
      manifest,
      receiptFixture.destinationStatus,
    );
    const bundle = createEvidenceReceiptBundle({
      receiptId: receiptFixture.receiptId,
      findingEvaluation: finding,
      runManifest: manifest,
      requirement: fixtureRequirement(manifest),
      agreementVersion: fixtureReceiptAgreementVersion(manifest),
      artifacts: [
        {
          kind: "OBSERVED_EVENT",
          path: "observations/submission-request.json",
          mediaType: "application/json",
          content: {
            eventType: "NETWORK_REQUEST",
            method: "POST",
            hostname: destination.hostname,
            path: "/collect",
            recordedFields: ["email"],
            observationId: match.observationId,
            payloadSha256: manifest.observationHashes[0]?.payloadHash,
          },
        },
        {
          kind: "CANARY_MATCH",
          path: "matches/email-canary.json",
          mediaType: "application/json",
          content: {
            status: match.status,
            observationId: match.observationId,
            canaryId: match.status === "MATCHED" ? match.canaryId : undefined,
            sourceField:
              match.status === "MATCHED" ? match.canarySourceField : "email",
            matchKind:
              match.status === "MATCHED" ? match.transform : "EXACT",
            matchedValueSha256: "6".repeat(64),
          },
        },
        {
          kind: "DESTINATION_RECORD",
          path: `destinations/${receiptFixture.destinationStatus.toLowerCase()}-destination-v1.json`,
          mediaType: "application/json",
          content: destination,
        },
        {
          kind: "SCREENSHOT",
          path: "screenshots/fixture-regression-desktop.png",
          mediaType: "image/png",
          content: new Uint8Array(screenshot),
        },
        {
          kind: "ACTION_TRACE",
          path: "actions/fictional-submission.json",
          mediaType: "application/json",
          content: {
            actions: [
              {
                sequence: 1,
                action: "NAVIGATE",
                target: "https://classroom.pactwire.test",
                result: "COMPLETED",
              },
              {
                sequence: 2,
                action: "SUBMIT",
                target: "fictional student submission",
                result: "COMPLETED",
              },
            ],
          },
        },
      ],
      secretValues: [
        "pw-0123456789abcdef0123456789abcdef@canary.pactwire.invalid",
      ],
      createdAt: receiptFixture.createdAt,
      createdBy: {
        kind: "AUTOMATION",
        actorId: "pactwire-receipt-builder",
        component: "pactwire-evidence-receipt-v1",
      },
    });
    await receiptService.append(bundle);
  }
}

async function createFixtureRuntime(): Promise<AccessRuntime> {
  if (!isFixtureMode()) {
    throw new Error("The local access fixture is disabled");
  }
  const repository = new InMemoryWorkspaceAuthorizationRepository();
  const idFactory = fixtureIdFactory();
  const now = fixtureClock();
  const service = new WorkspaceAuthorizationService(repository, {
    idFactory,
    now,
  });
  await service.createWorkspace({
    principal: principalForFixtureUser(fixtureUsers.officer),
    name: "Fictional Cedar Ridge School District",
  });
  await service.createWorkspace({
    principal: principalForFixtureUser(fixtureUsers["harbor-officer"]),
    name: "Fictional Harbor School District",
  });
  await service.assignRole({
    principal: principalForFixtureUser(fixtureUsers.officer),
    workspaceId: fixtureWorkspaceIds.cedarRidge,
    targetUserId: fixtureUsers.operator.userId,
    role: "TEST_OPERATOR",
  });
  await service.assignRole({
    principal: principalForFixtureUser(fixtureUsers.officer),
    workspaceId: fixtureWorkspaceIds.cedarRidge,
    targetUserId: fixtureUsers.reviewer.userId,
    role: "REVIEWER",
  });
  const inventoryRepository = new InMemorySoftwareInventoryRepository(
    repository,
  );
  const inventoryService = new SoftwareInventoryService(
    inventoryRepository,
    service,
    { idFactory, now },
  );
  const agreementRepository = new InMemoryAgreementIntakeRepository(repository);
  const agreementObjectStore = new InMemoryAgreementObjectStore();
  const agreementService = new AgreementIntakeService(
    agreementRepository,
    agreementObjectStore,
    service,
    inventoryRepository,
    { idFactory, now },
  );
  const requirementProposalRepository =
    new InMemoryRequirementProposalRepository(repository);
  const requirementProposalService = new RequirementProposalService(
    requirementProposalRepository,
    agreementService,
    service,
    createRequirementProposalAdapterFromEnvironment(),
    { idFactory, now, maxAttempts: 2 },
  );
  const requirementReviewRepository =
    new InMemoryRequirementReviewRepository(
      requirementProposalRepository,
      repository,
    );
  const requirementReviewService = new RequirementReviewService(
    requirementReviewRepository,
    agreementService,
    service,
    { idFactory, now },
  );
  const testAuthorizationRepository = new InMemoryTestAuthorizationRepository(
    repository,
  );
  const testAuthorizationService = new TestAuthorizationService(
    testAuthorizationRepository,
    service,
    inventoryRepository,
    { idFactory, now },
  );
  const secretIsolationRepository = new InMemorySecretIsolationRepository(
    repository,
  );
  const secretIsolationService = new SecretIsolationService(
    secretIsolationRepository,
    service,
    inventoryRepository,
    new Aes256GcmSecretCipher(randomBytes(32), "fixture-ephemeral-v1"),
    { idFactory, now },
  );
  let syntheticToken = 0n;
  const syntheticDataRepository = new InMemorySyntheticDataRepository(
    repository,
  );
  const syntheticDataService = new SyntheticDataService(
    syntheticDataRepository,
    service,
    {
      idFactory,
      now,
      tokenFactory: () =>
        (++syntheticToken).toString(16).padStart(32, "0"),
    },
  );
  const journeyAuthoringRepository = new InMemoryJourneyAuthoringRepository(
    repository,
  );
  const journeyAuthoringService = new JourneyAuthoringService(
    journeyAuthoringRepository,
    {
      requirements: requirementReviewRepository,
      authorizations: testAuthorizationRepository,
      personas: syntheticDataRepository,
    },
    service,
    { idFactory, now },
  );
  const destinationRegistryRepository =
    new InMemoryDestinationRegistryRepository(repository);
  const destinationRegistryService = new DestinationRegistryService(
    destinationRegistryRepository,
    service,
    agreementService,
    { idFactory, now },
  );
  const runHistoryOptions = runHistoryFixtureOptions();
  const runOrchestrationRepository =
    new InMemoryRunOrchestrationRepository();
  const runOrchestrationService = new RunOrchestrationService(
    runOrchestrationRepository,
    {
      idFactory: runHistoryOptions.idFactory,
      now: runHistoryOptions.now,
      leaseDurationMs: 300_000,
    },
  );
  const liveRunReviews = await seedRunHistory(
    runOrchestrationRepository,
    runOrchestrationService,
    runHistoryOptions.advance,
  );
  const findingEvaluationRepository =
    new InMemoryFindingEvaluationRepository();
  await seedFindingEvaluations(
    runOrchestrationRepository,
    findingEvaluationRepository,
  );
  const evidenceReceiptRepository = new InMemoryEvidenceReceiptRepository();
  const evidenceReceiptService = new EvidenceReceiptService(
    evidenceReceiptRepository,
    new InMemoryEvidenceObjectStore(),
  );
  await seedEvidenceReceipts(
    runOrchestrationRepository,
    findingEvaluationRepository,
    evidenceReceiptService,
  );
  const approvalAuthorityRepository =
    new InMemoryApprovalAuthorityRepository();
  await approvalAuthorityRepository.initialize({
    workspaceId: fixtureWorkspaceIds.cedarRidge,
    softwareId: fixtureRunHistorySoftwareId,
    softwareName: "Northstar Classroom (Fictional)",
    state: "APPROVED",
    approvalOrigin: {
      id: "81818181-8181-4181-8181-818181818181",
      workspaceId: fixtureWorkspaceIds.cedarRidge,
      softwareId: fixtureRunHistorySoftwareId,
      state: "APPROVED",
      setBy: {
        kind: "IMPORTED_SYSTEM",
        actorId: "fictional-district-registry",
        displayName: "Fictional Cedar Ridge App Registry",
        source: "district inventory export",
      },
      reason: "Imported existing district approval record.",
      sourceReference: "AP-2042",
      recordedBy: {
        kind: "HUMAN",
        actorId: fixtureUsers.officer.userId,
      },
      recordedAt: "2026-07-22T13:00:00.000Z",
    },
  });
  let approvalIdentifier = 1;
  let approvalClockOffset = 0;
  const approvalAuthorityService = new ApprovalAuthorityService(
    approvalAuthorityRepository,
    service,
    {
      idFactory: () =>
        `82828282-8282-4282-8282-${String(approvalIdentifier++).padStart(12, "0")}`,
      now: () => {
        const current = new Date(
          Date.UTC(2026, 6, 22, 15, 0, approvalClockOffset),
        ).toISOString();
        approvalClockOffset += 1;
        return current;
      },
    },
  );
  const qualityTelemetry = new QualityTelemetryRuntime();
  return Object.freeze({
    repository,
    service,
    inventoryRepository,
    inventoryService,
    agreementRepository,
    agreementObjectStore,
    agreementService,
    requirementProposalRepository,
    requirementProposalService,
    requirementReviewRepository,
    requirementReviewService,
    testAuthorizationRepository,
    testAuthorizationService,
    secretIsolationRepository,
    secretIsolationService,
    syntheticDataRepository,
    syntheticDataService,
    journeyAuthoringRepository,
    journeyAuthoringService,
    destinationRegistryRepository,
    destinationRegistryService,
    runOrchestrationRepository,
    runOrchestrationService,
    liveRunReviews,
    findingEvaluationRepository,
    evidenceReceiptRepository,
    evidenceReceiptService,
    approvalAuthorityRepository,
    approvalAuthorityService,
    qualityTelemetry,
  });
}

let fixtureRuntime: Promise<AccessRuntime> | undefined;

export function getAccessRuntime(): Promise<AccessRuntime> {
  fixtureRuntime ??= createFixtureRuntime();
  return fixtureRuntime;
}

export function resetAccessRuntime(): void {
  fixtureRuntime = undefined;
}

export function fixtureUserByKey(key: string): FixtureUser | undefined {
  return fixtureUsers[key as FixtureUser["key"]];
}

export function fixtureUserById(userId: string): FixtureUser | undefined {
  return Object.values(fixtureUsers).find((user) => user.userId === userId);
}

export function principalForFixtureUser(user: FixtureUser): WorkspacePrincipal {
  return {
    userId: user.userId,
    displayName: user.displayName,
    activeWorkspaceId: user.activeWorkspaceId,
  };
}
