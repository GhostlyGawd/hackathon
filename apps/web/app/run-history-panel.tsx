"use client";

import { useEffect, useState } from "react";

interface RunHistoryEntry {
  readonly run: {
    readonly id: string;
    readonly state:
      | "QUEUED"
      | "RUNNING"
      | "COMPLETED"
      | "PARTIAL"
      | "FAILED"
      | "CANCELED";
    readonly retryOfRunId?: string;
    readonly queuedAt: string;
    readonly terminalAt?: string;
    readonly snapshot: {
      readonly agreementVersionId: string;
      readonly journeyVersionId: string;
      readonly authorizationId: string;
      readonly runnerConfigVersion: string;
      readonly snapshotHash: string;
    };
    readonly integrityFailure?: {
      readonly code: string;
      readonly message: string;
    };
  };
  readonly scope: {
    readonly scopeHash: string;
    readonly modelIdentifier: string;
    readonly requiredCheckpointIds: readonly string[];
  };
  readonly manifest?: {
    readonly manifestHash: string;
    readonly runnerVersion: string;
    readonly terminalStatus: string;
    readonly observationHashes: readonly unknown[];
    readonly checkpointCoverage: readonly {
      readonly checkpointId: string;
      readonly status: "VERIFIED" | "NOT_TESTED" | "NOT_VISIBLE";
      readonly reason?: string;
    }[];
    readonly missingCoverage: readonly {
      readonly checkpointId: string;
      readonly status: "NOT_TESTED" | "NOT_VISIBLE";
      readonly reason: string;
    }[];
  };
}

interface RunHistoryResponse {
  readonly runs: readonly RunHistoryEntry[];
}

function shortHash(value: string): string {
  return `${value.slice(0, 12)}…`;
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function stateMeaning(entry: RunHistoryEntry): string {
  if (entry.run.integrityFailure) {
    return "The worker stopped before a terminal manifest could be finalized.";
  }
  switch (entry.run.state) {
    case "COMPLETED":
      return "Every required checkpoint was finalized for this named run.";
    case "PARTIAL":
      return "Some required coverage completed and some remains missing.";
    case "FAILED":
      return "The run ended without completing a required checkpoint.";
    case "CANCELED":
      return "An authorized person stopped this run.";
    case "QUEUED":
      return "The frozen configuration is waiting for a worker.";
    case "RUNNING":
      return "The isolated runner and recorder are active.";
  }
}

function runKind(entry: RunHistoryEntry): string {
  if (entry.run.retryOfRunId) return "retry";
  if (entry.run.integrityFailure) return "crashed";
  return entry.run.state.toLowerCase();
}

function runTitle(entry: RunHistoryEntry): string {
  if (entry.run.retryOfRunId) {
    return `${entry.run.state[0]}${entry.run.state.slice(1).toLowerCase()} retry`;
  }
  if (entry.run.integrityFailure) return "Worker failure";
  return `${entry.run.state[0]}${entry.run.state.slice(1).toLowerCase()} run`;
}

function sameFrozenConfiguration(
  entry: RunHistoryEntry,
  source: RunHistoryEntry | undefined,
): boolean {
  return Boolean(
    source &&
      entry.run.snapshot.snapshotHash === source.run.snapshot.snapshotHash &&
      entry.run.snapshot.agreementVersionId ===
        source.run.snapshot.agreementVersionId &&
      entry.run.snapshot.journeyVersionId ===
        source.run.snapshot.journeyVersionId &&
      entry.run.snapshot.authorizationId ===
        source.run.snapshot.authorizationId &&
      entry.run.snapshot.runnerConfigVersion ===
        source.run.snapshot.runnerConfigVersion &&
      entry.scope.modelIdentifier === source.scope.modelIdentifier &&
      JSON.stringify(entry.scope.requiredCheckpointIds) ===
        JSON.stringify(source.scope.requiredCheckpointIds),
  );
}

export function RunHistoryPanel({ workspaceId }: { readonly workspaceId: string }) {
  const [runs, setRuns] = useState<readonly RunHistoryEntry[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load(): Promise<void> {
      setLoading(true);
      setError(undefined);
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/runs`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as
          | RunHistoryResponse
          | { readonly error?: { readonly message?: string } };
        if (!response.ok || !("runs" in body)) {
          const message = "error" in body ? body.error?.message : undefined;
          throw new Error(message ?? "Run history could not be loaded.");
        }
        if (active) setRuns(body.runs);
      } catch (caught) {
        if (active && !controller.signal.aborted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Run history could not be loaded.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [workspaceId]);

  const byId = new Map(runs.map((entry) => [entry.run.id, entry]));
  const manifestCount = runs.filter(({ manifest }) => manifest).length;
  const missingCount = runs.reduce(
    (total, { manifest }) => total + (manifest?.missingCoverage.length ?? 0),
    0,
  );

  return (
    <section
      className="run-history-panel"
      data-testid="run-history-panel"
      id="run-history"
    >
      <header className="run-history-heading">
        <div>
          <p className="eyebrow">Immutable execution record / RUN-05</p>
          <h2>See what each run completed and what it missed.</h2>
          <p>
            Every row keeps the exact configuration, checkpoint coverage, and
            terminal reason. A completed row describes only that named run; it
            is not a safety or compliance conclusion.
          </p>
        </div>
        <div className="run-history-summary" aria-label="Run history summary">
          <div>
            <strong>{runs.length}</strong>
            <span>terminal runs</span>
          </div>
          <div>
            <strong>{manifestCount}</strong>
            <span>manifests</span>
          </div>
          <div>
            <strong>{missingCount}</strong>
            <span>missing checkpoints</span>
          </div>
        </div>
      </header>

      {loading ? (
        <p className="run-history-empty">Loading immutable run history…</p>
      ) : error ? (
        <div className="run-history-error" role="alert">
          <strong>Run history unavailable</strong>
          <span>{error}</span>
        </div>
      ) : (
        <div className="run-history-list" data-testid="run-history-list">
          {runs.map((entry) => {
            const source = entry.run.retryOfRunId
              ? byId.get(entry.run.retryOfRunId)
              : undefined;
            const verified =
              entry.manifest?.checkpointCoverage.filter(
                ({ status }) => status === "VERIFIED",
              ).length ?? 0;
            return (
              <article
                className={`run-history-card state-${entry.run.state.toLowerCase()}`}
                data-run-kind={runKind(entry)}
                data-run-state={entry.run.state}
                data-testid="run-history-card"
                key={entry.run.id}
              >
                <div className="run-history-card-head">
                  <div>
                    <span className="run-state-badge">{entry.run.state}</span>
                    <h3>{runTitle(entry)}</h3>
                    <p>{stateMeaning(entry)}</p>
                  </div>
                  <time dateTime={entry.run.terminalAt ?? entry.run.queuedAt}>
                    {new Date(
                      entry.run.terminalAt ?? entry.run.queuedAt,
                    ).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>

                <dl className="run-config-grid">
                  <div>
                    <dt>Run</dt>
                    <dd title={entry.run.id}>{shortId(entry.run.id)}</dd>
                  </div>
                  <div>
                    <dt>Runner config</dt>
                    <dd>{entry.run.snapshot.runnerConfigVersion}</dd>
                  </div>
                  <div>
                    <dt>Model</dt>
                    <dd>{entry.scope.modelIdentifier}</dd>
                  </div>
                  <div>
                    <dt>Frozen snapshot</dt>
                    <dd title={entry.run.snapshot.snapshotHash}>
                      {shortHash(entry.run.snapshot.snapshotHash)}
                    </dd>
                  </div>
                </dl>

                {entry.run.retryOfRunId ? (
                  <div
                    className="retry-lineage"
                    data-lineage-exact={sameFrozenConfiguration(entry, source)}
                    data-testid="retry-lineage"
                  >
                    <span>Retry of {shortId(entry.run.retryOfRunId)}</span>
                    <strong>
                      {sameFrozenConfiguration(entry, source)
                        ? "Exact frozen configuration verified"
                        : "Frozen configuration mismatch"}
                    </strong>
                  </div>
                ) : null}

                {entry.manifest ? (
                  <div className="manifest-summary" data-testid="manifest-summary">
                    <div className="manifest-summary-head">
                      <div>
                        <span>Terminal manifest</span>
                        <strong title={entry.manifest.manifestHash}>
                          {shortHash(entry.manifest.manifestHash)}
                        </strong>
                      </div>
                      <span className="coverage-count">
                        {verified} of {entry.manifest.checkpointCoverage.length} required
                        checkpoints recorded
                      </span>
                    </div>
                    <div className="checkpoint-list">
                      {entry.manifest.checkpointCoverage.map((checkpoint) => (
                        <div
                          className={`checkpoint-row checkpoint-${checkpoint.status.toLowerCase().replace("_", "-")}`}
                          key={checkpoint.checkpointId}
                        >
                          <span>{checkpoint.checkpointId}</span>
                          <strong>{checkpoint.status.replace("_", " ")}</strong>
                          {checkpoint.reason ? <small>{checkpoint.reason}</small> : null}
                        </div>
                      ))}
                    </div>
                    <footer>
                      {entry.manifest.observationHashes.length} observation hashes ·{" "}
                      {entry.manifest.missingCoverage.length} missing checkpoints ·{" "}
                      {entry.manifest.runnerVersion}
                    </footer>
                  </div>
                ) : entry.run.integrityFailure ? (
                  <div className="integrity-failure" data-testid="integrity-failure">
                    <span>Explicit integrity failure</span>
                    <strong>{entry.run.integrityFailure.code}</strong>
                    <p>{entry.run.integrityFailure.message}</p>
                    <small>
                      No manifest exists for this run. The failure is preserved
                      instead of labeling the run completed.
                    </small>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
