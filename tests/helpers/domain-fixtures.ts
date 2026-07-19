export const domainIds = Object.freeze({
  workspace: "11111111-1111-4111-8111-111111111111",
  software: "22222222-2222-4222-8222-222222222222",
  agreement: "33333333-3333-4333-8333-333333333333",
  authorization: "44444444-4444-4444-8444-444444444444",
  journey: "55555555-5555-4555-8555-555555555555",
  journeyVersion: "66666666-6666-4666-8666-666666666666",
  run: "77777777-7777-4777-8777-777777777777",
  requirement: "88888888-8888-4888-8888-888888888888",
  observation: "99999999-9999-4999-8999-999999999999",
  finding: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  receipt: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
});

export const humanActor = Object.freeze({
  kind: "HUMAN" as const,
  actorId: "fictional-privacy-officer",
});

export const automationActor = Object.freeze({
  kind: "AUTOMATION" as const,
  actorId: "pactwire-runner",
  component: "run-orchestrator",
});

export const modelActor = Object.freeze({
  kind: "MODEL" as const,
  actorId: "requirement-proposer",
  model: "gpt-5.6",
});

export function makeQueuedRun(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: domainIds.run,
    workspaceId: domainIds.workspace,
    softwareId: domainIds.software,
    state: "QUEUED",
    snapshot: {
      agreementVersionId: domainIds.agreement,
      journeyVersionId: domainIds.journeyVersion,
      authorizationId: domainIds.authorization,
      runnerConfigVersion: "runner-v1",
      snapshotHash: "a".repeat(64),
    },
    events: [],
    queuedAt: "2026-07-19T18:30:00.000Z",
    ...overrides,
  };
}

export function makeTerminalRun(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  const stateValue = overrides["state"];
  const state = typeof stateValue === "string" ? stateValue : "FAILED";
  const terminalAtValue = overrides["terminalAt"];
  const terminalAt =
    typeof terminalAtValue === "string"
      ? terminalAtValue
      : "2026-07-19T18:31:00.000Z";
  const manifestHash = overrides["manifestHash"];
  const integrityFailure = Object.hasOwn(overrides, "integrityFailure")
    ? overrides["integrityFailure"]
    : {
        code: "RECORDER_CRASH",
        message: "The fictional recorder stopped before finalization.",
      };
  const eventType =
    state === "COMPLETED"
      ? "RUN_COMPLETED"
      : state === "PARTIAL"
        ? "RUN_PARTIAL"
        : state === "CANCELED"
          ? "RUN_CANCELED"
          : "RUN_FAILED";

  return makeQueuedRun({
    state,
    terminalAt,
    ...(manifestHash ? { manifestHash } : {}),
    ...(integrityFailure ? { integrityFailure } : {}),
    events: [
      {
        eventId: "37373737-3737-4737-8737-373737373737",
        eventType: "RUN_STARTED",
        workspaceId: domainIds.workspace,
        runId: domainIds.run,
        from: "QUEUED",
        to: "RUNNING",
        actor: automationActor,
        occurredAt: "2026-07-19T18:30:30.000Z",
      },
      {
        eventId: "38383838-3838-4838-8838-383838383838",
        eventType,
        workspaceId: domainIds.workspace,
        runId: domainIds.run,
        from: "RUNNING",
        to: state,
        actor: automationActor,
        occurredAt: terminalAt,
        ...(manifestHash ? { manifestHash } : {}),
        ...(integrityFailure ? { integrityFailure } : {}),
      },
    ],
    ...overrides,
    integrityFailure,
    ...(manifestHash ? { manifestHash } : {}),
  });
}
