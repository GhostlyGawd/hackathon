import { createHash } from "node:crypto";
import { z } from "zod";
import {
  deterministicReplayVersionSchema,
  journeyRepairDraftSchema,
  journeyRepairMatchesFrozenSource,
  runSnapshotSchema,
  type DeterministicReplayOperation,
  type DeterministicReplayVersion,
  type RunSnapshot,
} from "@pactwire/core";

type BindingOperation = Extract<
  DeterministicReplayOperation,
  { kind: "FILL" | "ASSERT_VALUE" }
>;

export type MaterializedReplayOperation =
  | Exclude<DeterministicReplayOperation, BindingOperation>
  | (BindingOperation & { readonly value: string });

export type ReplayAdapterResult =
  | { readonly status: "COMPLETED" }
  | {
      readonly status: "DRIFTED";
      readonly reasonCode: string;
    }
  | {
      readonly status: "FAILED";
      readonly reasonCode: string;
    };

export interface DeterministicReplayAdapter {
  execute(
    operation: MaterializedReplayOperation,
    context: { readonly baseUrl: string },
  ): Promise<ReplayAdapterResult>;
}

export interface DeterministicReplayOperationEvidence {
  readonly sequence: number;
  readonly operationId: string;
  readonly operationKind: DeterministicReplayOperation["kind"];
  readonly outcome: ReplayAdapterResult["status"];
}

export interface DeterministicReplayEvidenceSink {
  recordOperation(
    evidence: DeterministicReplayOperationEvidence,
  ): Promise<void>;
}

function recorderActionKind(
  operationKind: DeterministicReplayOperation["kind"],
): "NAVIGATE" | "CLICK" | "FILL" | "CHECKPOINT" {
  switch (operationKind) {
    case "NAVIGATE":
      return "NAVIGATE";
    case "CLICK":
      return "CLICK";
    case "FILL":
      return "FILL";
    case "ASSERT_VALUE":
    case "ASSERT_TEXT":
    case "CHECKPOINT":
      return "CHECKPOINT";
  }
}

export function createDeterministicRecorderReplayEvidenceSink(recorder: {
  readonly recordAction: (candidate: unknown) => Promise<void>;
}): DeterministicReplayEvidenceSink {
  return Object.freeze({
    recordOperation(evidence: DeterministicReplayOperationEvidence) {
      return recorder.recordAction({
        actionId: `deterministic-replay-${evidence.sequence
          .toString()
          .padStart(4, "0")}`,
        actor: "DETERMINISTIC",
        kind: recorderActionKind(evidence.operationKind),
        summary: `${evidence.outcome}: ${evidence.operationKind} ${evidence.operationId}`,
      });
    },
  });
}

const traceEventSchema = z
  .object({
    sequence: z.number().int().positive(),
    operationId: z.string().min(1),
    kind: z.string().min(1),
    status: z.enum(["COMPLETED", "DRIFTED", "FAILED"]),
    observedAt: z.string().datetime({ offset: true }),
    valueHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
    reasonCode: z.string().min(1).optional(),
  })
  .strict();

const replayOutcomeSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    replayVersionId: z.string().uuid(),
    replayHash: z.string().regex(/^[a-f0-9]{64}$/u),
    snapshot: runSnapshotSchema,
    arm: z.literal("HUMAN_AUTHORED_DETERMINISTIC"),
    modelInvocationCount: z.literal(0),
    state: z.enum(["COMPLETED", "DRIFTED", "FAILED"]),
    startedAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }),
    trace: z.array(traceEventSchema),
    checkpoints: z.array(
      z
        .object({
          checkpointId: z.string().min(1),
          required: z.literal(true),
          status: z.enum(["VERIFIED", "MISSING", "NOT_REACHED"]),
        })
        .strict(),
    ),
    limitations: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type DeterministicReplayOutcome = z.infer<typeof replayOutcomeSchema>;

export class FrozenReplayScopeError extends Error {
  readonly code = "FROZEN_REPLAY_SCOPE_MISMATCH";

  constructor() {
    super("The replay request does not match its frozen execution snapshot.");
    this.name = "FrozenReplayScopeError";
  }
}

function immutableClone<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Object.isFrozen(candidate)
    ) {
      return;
    }
    for (const nested of Object.values(candidate)) freeze(nested);
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
}

function valueHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function materialize(
  operation: DeterministicReplayOperation,
  values: Readonly<Record<string, string>>,
): MaterializedReplayOperation {
  if (operation.kind !== "FILL" && operation.kind !== "ASSERT_VALUE") {
    return operation;
  }
  const value = values[operation.bindingId];
  if (!value) {
    throw new Error(`Missing run-specific replay binding: ${operation.bindingId}`);
  }
  return { ...operation, value };
}

function sameSnapshot(left: RunSnapshot, right: RunSnapshot): boolean {
  return (
    left.agreementVersionId === right.agreementVersionId &&
    left.journeyVersionId === right.journeyVersionId &&
    left.authorizationId === right.authorizationId &&
    left.runnerConfigVersion === right.runnerConfigVersion &&
    left.snapshotHash === right.snapshotHash
  );
}

function checkpointState(
  replay: DeterministicReplayVersion,
): Map<string, "VERIFIED" | "MISSING" | "NOT_REACHED"> {
  return new Map(
    replay.requiredCheckpointIds.map((checkpointId) => [
      checkpointId,
      "NOT_REACHED" as const,
    ]),
  );
}

export async function executeDeterministicReplay(input: {
  readonly replay: DeterministicReplayVersion;
  readonly snapshot: RunSnapshot;
  readonly baseUrl: string;
  readonly bindingValues: Readonly<Record<string, string>>;
  readonly adapter: DeterministicReplayAdapter;
  readonly evidence?: DeterministicReplayEvidenceSink;
  readonly now?: () => string;
}): Promise<DeterministicReplayOutcome> {
  const replay = deterministicReplayVersionSchema.parse(input.replay);
  const snapshot = runSnapshotSchema.parse(input.snapshot);
  if (!sameSnapshot(replay.snapshot, snapshot)) {
    throw new FrozenReplayScopeError();
  }
  const baseUrl = new URL(input.baseUrl);
  if (!['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error("Replay base URL must use HTTP or HTTPS");
  }
  const expectedBindings = replay.bindings.map((binding) => binding.bindingId);
  const suppliedBindings = Object.keys(input.bindingValues);
  if (
    expectedBindings.length !== suppliedBindings.length ||
    expectedBindings.some(
      (bindingId) =>
        !suppliedBindings.includes(bindingId) || !input.bindingValues[bindingId],
    )
  ) {
    throw new Error("Replay values must match the frozen binding set exactly");
  }

  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = new Date(now()).toISOString();
  const trace: z.infer<typeof traceEventSchema>[] = [];
  const checkpoints = checkpointState(replay);
  let state: "COMPLETED" | "DRIFTED" | "FAILED" = "COMPLETED";

  for (const operation of replay.operations) {
    const materialized = materialize(operation, input.bindingValues);
    const result = await input.adapter.execute(materialized, {
      baseUrl: baseUrl.toString(),
    });
    await input.evidence?.recordOperation({
      sequence: trace.length + 1,
      operationId: operation.operationId,
      operationKind: operation.kind,
      outcome: result.status,
    });
    const bindingValue =
      materialized.kind === "FILL" || materialized.kind === "ASSERT_VALUE"
        ? materialized.value
        : undefined;
    trace.push({
      sequence: trace.length + 1,
      operationId: operation.operationId,
      kind: operation.kind,
      status: result.status,
      observedAt: new Date(now()).toISOString(),
      ...(bindingValue ? { valueHash: valueHash(bindingValue) } : {}),
      ...(result.status === "COMPLETED"
        ? {}
        : { reasonCode: result.reasonCode }),
    });
    if (result.status !== "COMPLETED") {
      state = result.status;
      if (operation.kind === "CHECKPOINT") {
        checkpoints.set(operation.checkpointId, "MISSING");
      }
      break;
    }
    if (operation.kind === "CHECKPOINT") {
      checkpoints.set(operation.checkpointId, "VERIFIED");
    }
  }

  if (
    state === "COMPLETED" &&
    [...checkpoints.values()].some((status) => status !== "VERIFIED")
  ) {
    state = "DRIFTED";
  }

  const outcome = replayOutcomeSchema.parse({
    schemaVersion: "1.0.0",
    replayVersionId: replay.id,
    replayHash: replay.replayHash,
    snapshot,
    arm: replay.arm,
    modelInvocationCount: 0,
    state,
    startedAt,
    completedAt: new Date(now()).toISOString(),
    trace,
    checkpoints: replay.requiredCheckpointIds.map((checkpointId) => ({
      checkpointId,
      required: true,
      status: checkpoints.get(checkpointId) ?? "NOT_REACHED",
    })),
    limitations: [
      "Execution checkpoints control replay outcome; RUN-02 owns independent observed browser and network evidence.",
    ],
  });
  return immutableClone(outcome);
}

const journeyRepairCandidateOutcomeSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    repairId: z.string().uuid(),
    repairHash: z.string().regex(/^[a-f0-9]{64}$/u),
    sourceReplayVersionId: z.string().uuid(),
    sourceSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/u),
    arm: z.literal("MODEL_ASSISTED_REPAIR_VERIFICATION"),
    proposalModelInvocationCount: z.number().int().positive(),
    verificationModelInvocationCount: z.literal(0),
    state: z.enum(["COMPLETED", "DRIFTED", "FAILED"]),
    startedAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }),
    trace: z.array(traceEventSchema),
    checkpoints: z.array(
      z
        .object({
          checkpointId: z.string().min(1),
          status: z.enum(["VERIFIED", "MISSING", "NOT_REACHED"]),
        })
        .strict(),
    ),
    limitations: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type JourneyRepairCandidateOutcome = z.infer<
  typeof journeyRepairCandidateOutcomeSchema
>;

export class FrozenRepairScopeError extends Error {
  readonly code = "FROZEN_REPAIR_SCOPE_MISMATCH";

  constructor() {
    super("The repair candidate does not match its frozen source replay.");
    this.name = "FrozenRepairScopeError";
  }
}

export async function executeJourneyRepairCandidate(input: {
  readonly repair: unknown;
  readonly sourceReplay: DeterministicReplayVersion;
  readonly snapshot: RunSnapshot;
  readonly baseUrl: string;
  readonly bindingValues: Readonly<Record<string, string>>;
  readonly adapter: DeterministicReplayAdapter;
  readonly evidence?: DeterministicReplayEvidenceSink;
  readonly now?: () => string;
}): Promise<JourneyRepairCandidateOutcome> {
  const repair = journeyRepairDraftSchema.parse(input.repair);
  const sourceReplay = deterministicReplayVersionSchema.parse(input.sourceReplay);
  const snapshot = runSnapshotSchema.parse(input.snapshot);
  if (
    repair.status !== "BOUNDED_DRAFT" ||
    repair.candidate === null ||
    repair.workspaceId !== sourceReplay.workspaceId ||
    repair.softwareId !== sourceReplay.softwareId ||
    repair.journeyVersionId !== sourceReplay.journeyVersionId ||
    repair.authorizationId !== sourceReplay.authorizationId ||
    repair.sourceReplayVersionId !== sourceReplay.id ||
    repair.sourceReplayHash !== sourceReplay.replayHash ||
    repair.sourceSnapshotHash !== sourceReplay.snapshot.snapshotHash ||
    !journeyRepairMatchesFrozenSource(repair, sourceReplay) ||
    !sameSnapshot(sourceReplay.snapshot, snapshot)
  ) {
    throw new FrozenRepairScopeError();
  }
  const baseUrl = new URL(input.baseUrl);
  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new Error("Repair replay base URL must use HTTP or HTTPS");
  }
  const expectedBindings = sourceReplay.bindings.map(
    (binding) => binding.bindingId,
  );
  const suppliedBindings = Object.keys(input.bindingValues);
  if (
    expectedBindings.length !== suppliedBindings.length ||
    expectedBindings.some(
      (bindingId) =>
        !suppliedBindings.includes(bindingId) || !input.bindingValues[bindingId],
    )
  ) {
    throw new Error("Repair values must match the frozen binding set exactly");
  }

  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = new Date(now()).toISOString();
  const trace: z.infer<typeof traceEventSchema>[] = [];
  const checkpoints = new Map<
    string,
    "VERIFIED" | "MISSING" | "NOT_REACHED"
  >(
    sourceReplay.requiredCheckpointIds.map((checkpointId) => [
      checkpointId,
      "NOT_REACHED" as const,
    ]),
  );
  let state: "COMPLETED" | "DRIFTED" | "FAILED" = "COMPLETED";

  for (const operation of repair.candidate.operations) {
    const materialized = materialize(operation, input.bindingValues);
    const result = await input.adapter.execute(materialized, {
      baseUrl: baseUrl.toString(),
    });
    await input.evidence?.recordOperation({
      sequence: trace.length + 1,
      operationId: operation.operationId,
      operationKind: operation.kind,
      outcome: result.status,
    });
    const bindingValue =
      materialized.kind === "FILL" || materialized.kind === "ASSERT_VALUE"
        ? materialized.value
        : undefined;
    trace.push({
      sequence: trace.length + 1,
      operationId: operation.operationId,
      kind: operation.kind,
      status: result.status,
      observedAt: new Date(now()).toISOString(),
      ...(bindingValue ? { valueHash: valueHash(bindingValue) } : {}),
      ...(result.status === "COMPLETED"
        ? {}
        : { reasonCode: result.reasonCode }),
    });
    if (result.status !== "COMPLETED") {
      state = result.status;
      if (operation.kind === "CHECKPOINT") {
        checkpoints.set(operation.checkpointId, "MISSING");
      }
      break;
    }
    if (operation.kind === "CHECKPOINT") {
      checkpoints.set(operation.checkpointId, "VERIFIED");
    }
  }
  if (
    state === "COMPLETED" &&
    [...checkpoints.values()].some((status) => status !== "VERIFIED")
  ) {
    state = "DRIFTED";
  }

  return immutableClone(
    journeyRepairCandidateOutcomeSchema.parse({
      schemaVersion: "1.0.0",
      repairId: repair.id,
      repairHash: repair.repairHash,
      sourceReplayVersionId: sourceReplay.id,
      sourceSnapshotHash: sourceReplay.snapshot.snapshotHash,
      arm: "MODEL_ASSISTED_REPAIR_VERIFICATION",
      proposalModelInvocationCount: repair.modelInvocationCount,
      verificationModelInvocationCount: 0,
      state,
      startedAt,
      completedAt: new Date(now()).toISOString(),
      trace,
      checkpoints: sourceReplay.requiredCheckpointIds.map((checkpointId) => ({
        checkpointId,
        status: checkpoints.get(checkpointId) ?? "NOT_REACHED",
      })),
      limitations: [
        "This verifies the frozen checkpoint in a controlled named test; it does not establish safety or compliance.",
      ],
    }),
  );
}
