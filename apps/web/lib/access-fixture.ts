import { randomBytes, randomUUID } from "node:crypto";
import {
  Aes256GcmSecretCipher,
  AgreementIntakeService,
  DeterministicRequirementProposalAdapter,
  DestinationRegistryService,
  FetchOpenAIResponsesTransport,
  InMemoryAgreementIntakeRepository,
  InMemoryAgreementObjectStore,
  InMemoryDestinationRegistryRepository,
  InMemoryFindingEvaluationRepository,
  InMemoryJourneyAuthoringRepository,
  InMemoryRunOrchestrationRepository,
  InMemoryRequirementProposalRepository,
  InMemoryRequirementReviewRepository,
  InMemorySecretIsolationRepository,
  InMemorySyntheticDataRepository,
  InMemoryWorkspaceAuthorizationRepository,
  JourneyAuthoringService,
  confirmedRequirementSchema,
  evaluateBoundedFinding,
  matchCanaryObservation,
  InMemorySoftwareInventoryRepository,
  InMemoryTestAuthorizationRepository,
  OpenAIResponsesRequirementProposalAdapter,
  SecretIsolationService,
  RequirementProposalService,
  RequirementReviewService,
  RunOrchestrationService,
  SyntheticDataService,
  SoftwareInventoryService,
  TestAuthorizationService,
  WorkspaceAuthorizationService,
  type RequirementProposalModelAdapter,
  type RunHistoryEntry,
  type RunManifest,
  type WorkspacePrincipal,
} from "@pactwire/core";

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
  readonly findingEvaluationRepository: InMemoryFindingEvaluationRepository;
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
): Promise<void> {
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

  const history = await repository.listHistory(
    fixtureWorkspaceIds.cedarRidge,
    fixtureRunHistorySoftwareId,
  );
  if (history.length !== 5) {
    throw new Error("The controlled run-history fixture is incomplete");
  }
}

const fixtureFindingIds = Object.freeze({
  clean: "71717171-7171-4171-8171-717171710001",
  conflict: "71717171-7171-4171-8171-717171710002",
  repaired: "71717171-7171-4171-8171-717171710003",
  ambiguity: "71717171-7171-4171-8171-717171710004",
  notVisible: "71717171-7171-4171-8171-717171710005",
  notTested: "71717171-7171-4171-8171-717171710006",
});

const fixtureFindingRequirementId =
  "72727272-7272-4272-8272-727272727272";

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
      sourceText:
        "Student email is restricted to agreement-authorized service providers.",
      pageNumber: 4,
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
      page: 4,
      startOffset: 120,
      endOffset: 182,
      quotedTextSha256: "c".repeat(64),
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
    ({ run }) => run.state === "PARTIAL",
    "partial manifest",
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
    fixtureFindingInput(failed, fixtureFindingIds.notTested),
  ];
  for (const input of inputs) {
    await findingRepository.append(evaluateBoundedFinding(input));
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
  await seedRunHistory(
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
    findingEvaluationRepository,
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
