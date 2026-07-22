import {
  AuthenticationRequiredError,
  RunOrchestrationConflictError,
} from "@pactwire/core";
import { type NextRequest, NextResponse } from "next/server";
import { getAccessRuntime } from "../../../../../../../lib/access-fixture";
import { authorizationErrorResponse } from "../../../../../../../lib/route-response";
import { principalFromRequest } from "../../../../../../../lib/session";

interface RouteContext {
  readonly params: Promise<{ workspaceId: string; runId: string }>;
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const principal = principalFromRequest(request);
    if (!principal) throw new AuthenticationRequiredError();
    const { workspaceId, runId } = await context.params;
    const runtime = await getAccessRuntime();
    await runtime.service.checkPermission({
      principal,
      workspaceId,
      permission: "RUN_EXECUTE",
    });
    const entry = await runtime.runOrchestrationRepository.getHistoryEntry(
      workspaceId,
      runId,
    );
    const live = runtime.liveRunReviews.get(runId);
    if (!entry || !live || entry.run.state !== "RUNNING") {
      throw new RunOrchestrationConflictError(
        "The selected run is not an active controlled run",
      );
    }

    const result = await runtime.runOrchestrationService.cancelRun({
      workspaceId,
      runId,
      runnerVersion: "pactwire-runner-v1",
      observations: [
        {
          observationId: "61616161-6161-4161-8161-000000000007",
          sequence: 7,
          source: live.recorderEvent.source,
          payloadHash: live.recorderEvent.payloadHash,
        },
      ],
      coverage: live.checkpointCoverage.map((checkpoint) =>
        checkpoint.status === "VERIFIED"
          ? {
              checkpointId: checkpoint.checkpointId,
              status: "VERIFIED" as const,
            }
          : {
              checkpointId: checkpoint.checkpointId,
              status: "NOT_TESTED" as const,
              reason: "An authorized operator stopped the run before this checkpoint.",
            },
      ),
      limitations: [
        "The authorized operator stopped this controlled run before every required checkpoint completed.",
      ],
      requestedBy: { kind: "HUMAN", actorId: principal.userId },
      finalizedBy: {
        kind: "AUTOMATION",
        actorId: "pactwire-controlled-run-recorder",
        component: "run-recorder-v1",
      },
      idempotencyKey: `ui-stop:${runId}`,
    });
    const correlationId = runtime.qualityTelemetry.newCorrelationId();
    runtime.qualityTelemetry.recordEvent({
      workspaceId,
      correlationId,
      name: "RUN_TERMINAL",
      artifact: { kind: "RUN", id: runId },
      actor: { kind: "HUMAN", id: principal.userId },
      dimensions: { terminalState: "CANCELED" },
    });
    runtime.qualityTelemetry.recordLog({
      workspaceId,
      correlationId,
      lane: "HARNESS",
      code: "HARNESS_ACTION",
      artifact: { kind: "RUN", id: runId },
      actor: { kind: "HUMAN", id: principal.userId },
      dimensions: { terminalState: "CANCELED" },
    });
    runtime.qualityTelemetry.recordLog({
      workspaceId,
      correlationId,
      lane: "RECORDER",
      code: "RECORDER_EVENT",
      artifact: { kind: "RUN", id: runId },
      actor: {
        kind: "AUTOMATION",
        id: "pactwire-controlled-run-recorder",
      },
      dimensions: { terminalState: "CANCELED" },
    });

    return NextResponse.json(result, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
