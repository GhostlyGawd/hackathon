import { createHash } from "node:crypto";
import {
  applyRunEvent,
  confirmedRequirementSchema,
  runSchema,
  type Canary,
} from "../../packages/core/src/domain";
import { matchCanaryObservation } from "../../packages/core/src/canary-matcher";
import {
  buildRunExecutionScope,
  buildRunManifest,
  type RunCheckpointCoverage,
} from "../../packages/core/src/run-orchestration";
import {
  automationActor,
  domainIds,
  humanActor,
  makeQueuedRun,
} from "./domain-fixtures";

export const findingFixtureIds = Object.freeze({
  manifest: "10101010-1010-4010-8010-101010101010",
  sourceRequirement: "11111111-2222-4111-8111-111111111111",
  observation: domainIds.observation,
  canary: "12121212-1212-4212-8212-121212121212",
  persona: "13131313-1313-4313-8313-131313131313",
  destinationVersion: "14141414-1414-4414-8414-141414141414",
  priorFinding: "15151515-1515-4515-8515-151515151515",
});

export const findingAgreementQuote =
  "Student email is restricted to authorized service providers.";

const observedAt = "2026-07-21T17:00:30.000Z";
const running = runSchema.parse(
  applyRunEvent(makeQueuedRun(), {
    eventId: "16161616-1616-4616-8616-161616161616",
    eventType: "RUN_STARTED",
    workspaceId: domainIds.workspace,
    runId: domainIds.run,
    from: "QUEUED",
    to: "RUNNING",
    actor: automationActor,
    occurredAt: "2026-07-21T17:00:10.000Z",
  }),
);
const scope = buildRunExecutionScope({
  runId: running.id,
  workspaceId: running.workspaceId,
  softwareId: running.softwareId,
  requiredCheckpointIds: ["student-submit-request", "submission-complete"],
  modelIdentifier: "gpt-5.6-sol",
  createdAt: running.queuedAt,
  createdBy: automationActor,
});

export const findingObservation = Object.freeze({
  id: findingFixtureIds.observation,
  workspaceId: domainIds.workspace,
  runId: domainIds.run,
  source: "NETWORK" as const,
  recorderVersion: "pactwire-browser-cdp-recorder-v1",
  sequence: 1,
  observedAt,
  payloadHash: "b".repeat(64),
  facts: { kind: "NETWORK_REQUEST" },
});

const emailCanary: Canary = Object.freeze({
  id: findingFixtureIds.canary,
  workspaceId: domainIds.workspace,
  runId: domainIds.run,
  personaId: findingFixtureIds.persona,
  sourceField: "email",
  value: "pw-0123456789abcdef0123456789abcdef@canary.pactwire.invalid",
  generatedAt: "2026-07-21T16:59:00.000Z",
});

export const confirmedFindingRequirement = confirmedRequirementSchema.parse({
  id: domainIds.requirement,
  workspaceId: domainIds.workspace,
  agreementVersionId: domainIds.agreement,
  requirementKey: "student-email-recipient",
  version: 2,
  sourceVersionId: findingFixtureIds.sourceRequirement,
  status: "CONFIRMED",
  executable: true,
  plainLanguage:
    "Student email must not be sent to a destination prohibited by the confirmed agreement.",
  details: {
    plainLanguage:
      "Student email must not be sent to a destination prohibited by the confirmed agreement.",
    sourceText: findingAgreementQuote,
    pageNumber: 1,
    section: "Student data recipients",
    dataField: "email",
    action: "send",
    recipientRestriction: "Only agreement-authorized service providers",
    purposeRestriction: null,
    ambiguity: "CLEAR",
    ambiguityReason: null,
    suggestedObservableTest:
      "Submit the fictional student form and inspect recorded request fields and destinations.",
  },
  citation: {
    page: 1,
    startOffset: 120,
    endOffset: 120 + findingAgreementQuote.length,
    quotedTextSha256: createHash("sha256")
      .update(findingAgreementQuote)
      .digest("hex"),
  },
  predicate: {
    kind: "OBSERVABLE_DATA_FLOW",
    dataField: "email",
    action: "send",
    recipientRestriction: "Only agreement-authorized service providers",
    purposeRestriction: null,
    suggestedObservableTest:
      "Submit the fictional student form and inspect recorded request fields and destinations.",
  },
  confirmedBy: humanActor,
  confirmedAt: "2026-07-21T16:30:00.000Z",
  reviewRationale: "The stored agreement language is specific enough for this bounded test.",
  changes: [
    {
      field: "status",
      oldValue: '"PROPOSED"',
      newValue: '"CONFIRMED"',
    },
  ],
  createdAt: "2026-07-21T16:30:00.000Z",
});

type MatcherStatus =
  | "MATCHED"
  | "NO_MATCH"
  | "UNSUPPORTED_TRANSFORM"
  | "COLLISION";
type DestinationStatus = "ALLOWED" | "PROHIBITED" | "UNKNOWN";

export interface FindingFixtureOptions {
  readonly matcherStatus?: MatcherStatus;
  readonly destinationStatus?: DestinationStatus;
  readonly coverage?: readonly RunCheckpointCoverage[];
  readonly priorFindingId?: string | null;
  readonly modelNarrative?: Readonly<{
    model: string;
    text: string;
    confidence: number;
  }>;
  readonly scopeOverrides?: Readonly<Record<string, unknown>>;
}

function matcherOutcome(status: MatcherStatus) {
  const candidate =
    status === "MATCHED" || status === "COLLISION"
      ? {
          location: "BODY" as const,
          path: "student.email",
          value: emailCanary.value,
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
  const collidingCanary: Canary = {
    ...emailCanary,
    id: "12121212-1212-4212-8212-121212121213",
  };
  return matchCanaryObservation({
    observation: findingObservation,
    canaries:
      status === "COLLISION"
        ? [emailCanary, collidingCanary]
        : [emailCanary],
    candidates: [candidate],
  }).outcomes[0]!;
}

function destination(status: DestinationStatus) {
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
    entityId: status === "PROHIBITED" ? "fixture-analytics" : "classroom-service",
    entityName:
      status === "PROHIBITED"
        ? "Fixture Analytics (Fictional)"
        : "Classroom Service (Fictional)",
    softwareId: domainIds.software,
    agreementVersionId: domainIds.agreement,
    destinationVersionId: findingFixtureIds.destinationVersion,
    destinationVersionHash: "d".repeat(64),
    humanConfirmed: true as const,
  };
}

export function makeFindingEvaluationInput(
  options: FindingFixtureOptions = {},
) {
  const coverage = options.coverage ?? [
    { checkpointId: "student-submit-request", status: "VERIFIED" as const },
    { checkpointId: "submission-complete", status: "VERIFIED" as const },
  ];
  const terminalStatus = coverage.every(({ status }) => status === "VERIFIED")
    ? ("COMPLETED" as const)
    : coverage.some(({ status }) => status === "VERIFIED")
      ? ("PARTIAL" as const)
      : ("FAILED" as const);
  const manifest = buildRunManifest({
    id: findingFixtureIds.manifest,
    run: running,
    scope,
    terminalStatus,
    runnerVersion: "pactwire-runner-v1",
    terminalAt: "2026-07-21T17:01:00.000Z",
    observations: [
      {
        observationId: findingObservation.id,
        sequence: findingObservation.sequence,
        source: findingObservation.source,
        payloadHash: findingObservation.payloadHash,
      },
    ],
    coverage,
    limitations: [
      "Only the named fictional student submission journey was assessed.",
    ],
    finalizedBy: automationActor,
  });
  return {
    findingId: domainIds.finding,
    createdAt: "2026-07-21T17:01:01.000Z",
    requirement: confirmedFindingRequirement,
    runManifest: manifest,
    evidence: [
      {
        checkpointId: "student-submit-request",
        matcherOutcome: matcherOutcome(options.matcherStatus ?? "MATCHED"),
        destination: destination(options.destinationStatus ?? "ALLOWED"),
      },
    ],
    namedScope: {
      softwareVersion: "fictional-classroom-v1",
      role: "STUDENT" as const,
      journeyName: "Student submits fictional assignment",
      observationWindow: {
        startedAt: "2026-07-21T17:00:10.000Z",
        endedAt: "2026-07-21T17:01:00.000Z",
      },
      checkpointPaths: [
        {
          checkpointId: "student-submit-request",
          path: "Student submits the fictional response",
        },
        {
          checkpointId: "submission-complete",
          path: "Student sees the fictional submission complete",
        },
      ],
      ...options.scopeOverrides,
    },
    ...(options.priorFindingId === null || options.priorFindingId === undefined
      ? {}
      : { priorFindingId: options.priorFindingId }),
    ...(options.modelNarrative
      ? { modelNarrative: options.modelNarrative }
      : {}),
  };
}
