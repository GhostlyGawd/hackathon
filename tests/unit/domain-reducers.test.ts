import { describe, expect, it } from "vitest";
import {
  appendAuditEvent,
  applyApprovalEvent,
  applyRunEvent,
  assertRetrySnapshot,
  createRetryRun,
  deserializeDomainEvent,
  runSchema,
  serializeDomainEvent,
  WorkspaceBoundaryStore,
} from "../../packages/core/src/domain";
import {
  automationActor,
  domainIds,
  humanActor,
  makeQueuedRun,
  makeTerminalRun,
  modelActor,
} from "../helpers/domain-fixtures";

const occurredAt = "2026-07-19T18:31:00.000Z";

describe("domain reducers and boundaries", () => {
  it("applies only the narrow automated APPROVED to HOLD transition without mutating history", () => {
    const initial = {
      workspaceId: domainIds.workspace,
      softwareId: domainIds.software,
      state: "APPROVED" as const,
      events: [],
    };
    const before = structuredClone(initial);
    const next = applyApprovalEvent(initial, {
      eventId: "18181818-1818-4818-8818-181818181818",
      workspaceId: domainIds.workspace,
      softwareId: domainIds.software,
      from: "APPROVED",
      to: "HOLD",
      reason: "WITNESSED_CONFLICT",
      actor: automationActor,
      occurredAt,
    });

    expect(initial).toEqual(before);
    expect(next.state).toBe("HOLD");
    expect(next.events).toHaveLength(1);
    expect(next.events[0]?.actor.kind).toBe("AUTOMATION");
  });

  it("allows a human restoration and rejects a model transition", () => {
    const hold = {
      workspaceId: domainIds.workspace,
      softwareId: domainIds.software,
      state: "HOLD" as const,
      events: [],
    };
    const restored = applyApprovalEvent(hold, {
      eventId: "19191919-1919-4919-8919-191919191919",
      workspaceId: domainIds.workspace,
      softwareId: domainIds.software,
      from: "HOLD",
      to: "APPROVED",
      reason: "HUMAN_DECISION",
      humanDecisionId: "16161616-1616-4616-8616-161616161616",
      actor: humanActor,
      occurredAt,
    });

    expect(restored.state).toBe("APPROVED");
    expect(() =>
      applyApprovalEvent(hold, {
        eventId: "20202020-2020-4020-8020-202020202020",
        workspaceId: domainIds.workspace,
        softwareId: domainIds.software,
        from: "HOLD",
        to: "APPROVED",
        reason: "HUMAN_DECISION",
        actor: modelActor,
        occurredAt,
      }),
    ).toThrow();
  });

  it("requires a manifest to complete a run and preserves retry configuration", () => {
    const queued = makeQueuedRun();
    const running = applyRunEvent(queued, {
      eventId: "21212121-2121-4121-8121-212121212121",
      eventType: "RUN_STARTED",
      workspaceId: domainIds.workspace,
      runId: domainIds.run,
      from: "QUEUED",
      to: "RUNNING",
      actor: automationActor,
      occurredAt,
    });
    const completed = applyRunEvent(running, {
      eventId: "22222222-2222-4222-8222-222222222223",
      eventType: "RUN_COMPLETED",
      workspaceId: domainIds.workspace,
      runId: domainIds.run,
      from: "RUNNING",
      to: "COMPLETED",
      actor: automationActor,
      occurredAt: "2026-07-19T18:32:00.000Z",
      manifestHash: "b".repeat(64),
    });
    const retry = createRetryRun(completed, {
      id: "23232323-2323-4323-8323-232323232323",
      eventId: "24242424-2424-4424-8424-242424242424",
      queuedAt: "2026-07-19T18:33:00.000Z",
      actor: humanActor,
    });

    expect(completed.state).toBe("COMPLETED");
    expect(retry.state).toBe("QUEUED");
    expect(retry.retryOfRunId).toBe(completed.id);
    expect(retry.snapshot).toEqual(completed.snapshot);
    expect(() =>
      assertRetrySnapshot(completed.snapshot, {
        ...retry.snapshot,
        runnerConfigVersion: "runner-v2",
      }),
    ).toThrow("frozen configuration");
  });

  it("round-trips domain events without semantic loss and appends audit provenance", () => {
    const audit = {
      eventId: "25252525-2525-4525-8525-252525252525",
      eventType: "AUDIT_RECORDED" as const,
      workspaceId: domainIds.workspace,
      subjectType: "software",
      subjectId: domainIds.software,
      action: "reviewed",
      actor: humanActor,
      occurredAt,
      details: { fixture: true },
    };
    const serialized = serializeDomainEvent(audit);
    const history: readonly typeof audit[] = [];
    const appended = appendAuditEvent(history, audit);

    expect(deserializeDomainEvent(serialized)).toEqual(audit);
    expect(history).toEqual([]);
    expect(appended).toEqual([audit]);
    expect(appended[0]?.actor).toEqual(humanActor);
  });

  it("prevents cross-workspace reads, mutations, references, and exports", () => {
    const store = new WorkspaceBoundaryStore<{
      readonly id: string;
      readonly workspaceId: string;
      readonly name: string;
    }>();
    const workspaceA = domainIds.workspace;
    const workspaceB = "26262626-2626-4626-8626-262626262626";
    const recordA = {
      id: "27272727-2727-4727-8727-272727272727",
      workspaceId: workspaceA,
      name: "Workspace A record",
    };
    store.insert(workspaceA, recordA);

    expect(store.read(workspaceB, recordA.id)).toBeUndefined();
    expect(() =>
      store.mutate(workspaceB, recordA.id, (record) => record),
    ).toThrow();
    expect(() =>
      store.insert(
        workspaceB,
        {
          id: "28282828-2828-4828-8828-282828282828",
          workspaceId: workspaceB,
          name: "Workspace B record",
        },
        [recordA.id],
      ),
    ).toThrow("not accessible");
    expect(store.exportWorkspace(workspaceB)).toEqual([]);
    expect(store.exportWorkspace(workspaceA)).toEqual([recordA]);
  });

  it("does not allow terminal runs to transition again", () => {
    expect(() =>
      applyRunEvent(makeTerminalRun(), {
        eventId: "29292929-2929-4929-8929-292929292929",
        eventType: "RUN_STARTED",
        workspaceId: domainIds.workspace,
        runId: domainIds.run,
        from: "FAILED",
        to: "RUNNING",
        actor: automationActor,
        occurredAt,
      }),
    ).toThrow();
  });

  it("rejects retry history appended to the terminal source run", () => {
    const terminal = makeTerminalRun();
    const sourceEvents = terminal["events"] as readonly unknown[];
    const invalid = makeQueuedRun({
      retryOfRunId: domainIds.run,
      events: [
        ...sourceEvents,
        {
          eventId: "30303030-3030-4030-8030-303030303030",
          eventType: "RETRY_QUEUED",
          workspaceId: domainIds.workspace,
          runId: domainIds.run,
          sourceRunId: domainIds.run,
          from: "FAILED",
          to: "QUEUED",
          actor: humanActor,
          occurredAt: "2026-07-19T18:33:00.000Z",
        },
      ],
    });

    expect(runSchema.safeParse(invalid).success).toBe(false);
  });
});
