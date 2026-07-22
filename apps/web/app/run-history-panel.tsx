"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import controlledFixtureFrame from "../../../docs/evidence/FIX-01/fixture-baseline-desktop.png";

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
  readonly live?: {
    readonly journeyName: string;
    readonly role: "STUDENT";
    readonly preview: {
      readonly alt: string;
      readonly capturedAt: string;
    };
    readonly allowedScope: {
      readonly origins: readonly string[];
      readonly actions: readonly string[];
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
      readonly destinationHostname: string;
      readonly status: "MATCHED";
    }[];
  };
}

interface RunHistoryResponse {
  readonly runs: readonly RunHistoryEntry[];
}

interface StoppedRunResponse {
  readonly run: RunHistoryEntry["run"];
  readonly manifest: NonNullable<RunHistoryEntry["manifest"]>;
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

export function RunHistoryPanel({
  canExecuteRun,
  workspaceId,
}: {
  readonly canExecuteRun: boolean;
  readonly workspaceId: string;
}) {
  const [runs, setRuns] = useState<readonly RunHistoryEntry[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [stoppingRunId, setStoppingRunId] = useState<string>();
  const [stopFeedback, setStopFeedback] = useState<string>();

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load(showLoading: boolean): Promise<void> {
      if (showLoading) {
        setLoading(true);
        setError(undefined);
      }
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
    void load(true);
    const interval = window.setInterval(() => void load(false), 5_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [workspaceId]);

  async function stopRun(entry: RunHistoryEntry): Promise<void> {
    setStoppingRunId(entry.run.id);
    setStopFeedback(undefined);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/runs/${entry.run.id}/stop`,
        { method: "POST" },
      );
      const body = (await response.json()) as
        | StoppedRunResponse
        | { readonly error?: { readonly message?: string } };
      if (
        !response.ok ||
        !("run" in body) ||
        !("manifest" in body) ||
        !body.manifest
      ) {
        const message = "error" in body ? body.error?.message : undefined;
        throw new Error(message ?? "The active run could not be stopped.");
      }
      setRuns((current) =>
        current.map((candidate) => {
          if (candidate.run.id !== entry.run.id) return candidate;
          const { live: _live, ...stored } = candidate;
          return { ...stored, run: body.run, manifest: body.manifest };
        }),
      );
      setStopFeedback(
        "Run stopped. The terminal manifest preserves recorded evidence and names the unfinished checkpoint as not tested.",
      );
    } catch (caught) {
      setStopFeedback(
        caught instanceof Error
          ? caught.message
          : "The active run could not be stopped.",
      );
    } finally {
      setStoppingRunId(undefined);
    }
  }

  const byId = new Map(runs.map((entry) => [entry.run.id, entry]));
  const activeRuns = runs.filter(
    ({ run, live }) => run.state === "RUNNING" && Boolean(live),
  );
  const terminalRuns = runs.filter(({ run }) =>
    ["COMPLETED", "PARTIAL", "FAILED", "CANCELED"].includes(run.state),
  );
  const manifestCount = terminalRuns.filter(({ manifest }) => manifest).length;
  const missingCount = terminalRuns.reduce(
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
          <p className="eyebrow">Live run and immutable record / UX-03</p>
          <h2>Watch the recorder, stop the run, and see exactly what was tested.</h2>
          <p>
            The active view separates the model&apos;s action summary from facts
            recorded by instrumentation. Terminal rows keep exact checkpoint
            coverage and never turn a sampled run into a safety or compliance conclusion.
          </p>
        </div>
        <section className="run-history-summary" aria-label="Run history summary">
          <div>
            <strong>{activeRuns.length}</strong>
            <span>active runs</span>
          </div>
          <div>
            <strong>{terminalRuns.length}</strong>
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
        </section>
      </header>

      {loading ? (
        <p className="run-history-empty">Loading immutable run history…</p>
      ) : error ? (
        <div className="run-history-error" role="alert">
          <strong>Run history unavailable</strong>
          <span>{error}</span>
        </div>
      ) : (
        <>
          {activeRuns.map((entry) => {
            const live = entry.live;
            if (!live) return null;
            return (
              <article
                className="live-run-review"
                data-testid="live-run-review"
                key={entry.run.id}
              >
                <header className="live-run-header">
                  <div>
                    <span className="run-state-badge">RUNNING</span>
                    <h3>{live.journeyName}</h3>
                    <p>
                      Fictional {live.role.toLowerCase()} · isolated controlled browser
                    </p>
                  </div>
                  <div className="live-run-pulse" role="status">
                    <span aria-hidden="true" /> Recorder active
                  </div>
                </header>

                <div className="live-run-layout">
                  <figure
                    className="live-browser-preview"
                    data-testid="isolated-browser-preview"
                  >
                    <div>
                      <span>Latest isolated frame</span>
                      <code>classroom.pactwire.test</code>
                    </div>
                    <Image
                      alt={live.preview.alt}
                      height={1100}
                      priority
                      src={controlledFixtureFrame}
                      width={1440}
                    />
                    <figcaption>
                      Recorder frame captured {new Date(live.preview.capturedAt).toLocaleString()};
                      this image is evidence, not an interactive browser.
                    </figcaption>
                  </figure>

                  <div className="live-run-facts">
                    <section className="live-scope" data-testid="live-run-scope">
                      <div>
                        <span>Allowed origins</span>
                        {live.allowedScope.origins.map((origin) => (
                          <code key={origin}>{origin}</code>
                        ))}
                      </div>
                      <div>
                        <span>Allowed actions</span>
                        <strong>{live.allowedScope.actions.join(" · ")}</strong>
                      </div>
                    </section>

                    <div className="responsibility-lanes">
                      <section data-testid="model-action-summary">
                        <span>Model action summary</span>
                        <strong>{live.modelAction.summary}</strong>
                        <small>No chain-of-thought is shown or used as evidence.</small>
                      </section>
                      <section data-testid="recorder-event">
                        <span>Deterministic recorder event</span>
                        <strong>{live.recorderEvent.summary}</strong>
                        <small title={live.recorderEvent.payloadHash}>
                          {live.recorderEvent.source} · {shortHash(live.recorderEvent.payloadHash)}
                        </small>
                      </section>
                    </div>

                    <section className="live-checkpoints" data-testid="live-checkpoints">
                      <header>
                        <span>Current checkpoint coverage</span>
                        <strong>
                          {live.checkpointCoverage.filter(({ status }) => status === "VERIFIED").length}
                          {" of "}{live.checkpointCoverage.length} verified
                        </strong>
                      </header>
                      {live.checkpointCoverage.map((checkpoint) => (
                        <div data-checkpoint-status={checkpoint.status} key={checkpoint.checkpointId}>
                          <span>{checkpoint.label}</span>
                          <strong>{checkpoint.status}</strong>
                        </div>
                      ))}
                    </section>

                    <section className="live-canary" data-testid="live-canary-match">
                      <span>Detected synthetic canary match</span>
                      <strong>
                        {live.canaryMatches[0]?.field} · {live.canaryMatches[0]?.destinationHostname}
                      </strong>
                      <small>Exact generated value is redacted from this view.</small>
                    </section>

                    {canExecuteRun ? (
                      <button
                        className="stop-run-button"
                        data-testid="stop-active-run"
                        disabled={stoppingRunId === entry.run.id}
                        onClick={() => void stopRun(entry)}
                        type="button"
                      >
                        {stoppingRunId === entry.run.id
                          ? "Stopping and finalizing evidence…"
                          : "Stop run and finalize evidence"}
                      </button>
                    ) : (
                      <div className="stop-run-readonly" data-testid="stop-run-readonly">
                        <strong>Stop control unavailable for this role</strong>
                        <span>A privacy officer or test operator can stop an active run.</span>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}

          {stopFeedback ? (
            <p className="run-stop-feedback" data-testid="run-stop-feedback" role="status">
              {stopFeedback}
            </p>
          ) : null}

          <div className="terminal-history-heading">
            <div>
              <span>Immutable terminal history / RUN-05</span>
              <h3>Completed, partial, failed, canceled, and recovery records</h3>
            </div>
            <small>{terminalRuns.length} terminal runs</small>
          </div>

          <div className="run-history-list" data-testid="run-history-list">
          {terminalRuns.map((entry) => {
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
        </>
      )}
    </section>
  );
}
