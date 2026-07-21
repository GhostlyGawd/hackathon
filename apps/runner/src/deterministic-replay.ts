import { createHash } from "node:crypto";
import { z } from "zod";
import {
  deterministicReplayVersionSchema,
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
