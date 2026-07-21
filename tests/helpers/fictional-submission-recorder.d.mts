import type { DeterministicRecorderConfig } from "../../apps/runner/src/deterministic-recorder";

export const fictionalSubmissionRecorderCheckpointId: string;

export function createFictionalSubmissionRecorderConfig(input: {
  readonly workspaceId: string;
  readonly runId: string;
  readonly secrets: readonly string[];
}): DeterministicRecorderConfig;
