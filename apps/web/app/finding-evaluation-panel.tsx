"use client";

import { useEffect, useMemo, useState } from "react";
import { EvidenceReceiptPanel } from "./evidence-receipt-panel";

type FindingState =
  | "WITNESSED_CONFLICT"
  | "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS"
  | "NOT_REOBSERVED_IN_NAMED_TESTS"
  | "NOT_TESTED"
  | "NOT_VISIBLE"
  | "NEEDS_REVIEW";

interface BoundedFinding {
  readonly finding: {
    readonly id: string;
    readonly runId: string;
    readonly state: FindingState;
    readonly priorFindingId?: string;
    readonly checkpoints: readonly {
      readonly checkpointId: string;
      readonly required: boolean;
      readonly exercised: boolean;
      readonly visible: boolean;
    }[];
    readonly observationIds: readonly string[];
  };
  readonly reasonCodes: readonly string[];
  readonly scope: {
    readonly softwareVersion: string;
    readonly agreementVersionId: string;
    readonly role: "TEACHER" | "STUDENT";
    readonly journeyName: string;
    readonly fields: readonly string[];
    readonly observationWindow: {
      readonly startedAt: string;
      readonly endedAt: string;
    };
    readonly visiblePaths: readonly string[];
    readonly untestedPaths: readonly string[];
    readonly notVisiblePaths: readonly string[];
    readonly limitations: readonly string[];
  };
  readonly deterministicBasis: {
    readonly evaluatorVersion: string;
    readonly runManifestHash: string;
    readonly matchedObservationIds: readonly string[];
    readonly prohibitedDestinationVersionIds: readonly string[];
    readonly lineageComplete: boolean;
    readonly missingLineage: readonly string[];
    readonly modelNarrativeExcluded: true;
  };
  readonly display: {
    readonly label: string;
    readonly meaning: string;
    readonly internalState: FindingState;
  };
  readonly modelExplanation?: {
    readonly label: "Model explanation — not evidence";
    readonly model: string;
    readonly text: string;
    readonly confidence: number;
    readonly excludedFromDecision: true;
  };
}

interface FindingResponse {
  readonly evaluatorVersion: string;
  readonly decisionTable: readonly {
    readonly priority: number;
    readonly condition: string;
    readonly state: FindingState;
    readonly reasonCode: string;
  }[];
  readonly findings: readonly BoundedFinding[];
}

const stateOrder: readonly FindingState[] = [
  "WITNESSED_CONFLICT",
  "NEEDS_REVIEW",
  "NOT_VISIBLE",
  "NOT_TESTED",
  "NOT_REOBSERVED_IN_NAMED_TESTS",
  "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS",
];

function shortId(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function shortHash(value: string): string {
  return `${value.slice(0, 14)}…${value.slice(-6)}`;
}

function displayWindow(startedAt: string, endedAt: string): string {
  const format = new Intl.DateTimeFormat([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${format.format(new Date(startedAt))} – ${format.format(new Date(endedAt))}`;
}

function coverageSummary(finding: BoundedFinding): string {
  const required = finding.finding.checkpoints.filter(
    ({ required }) => required,
  );
  const complete = required.filter(
    ({ exercised, visible }) => exercised && visible,
  ).length;
  return `${complete} of ${required.length} required paths fully observed`;
}

function PathList({
  empty,
  label,
  paths,
  tone,
  testId,
}: {
  readonly empty: string;
  readonly label: string;
  readonly paths: readonly string[];
  readonly tone: "visible" | "untested" | "invisible";
  readonly testId?: string;
}) {
  return (
    <div className={`finding-path-group path-${tone}`} data-testid={testId}>
      <div>
        <strong>{label}</strong>
        <span>{paths.length}</span>
      </div>
      {paths.length > 0 ? (
        <ul>
          {paths.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}

export function FindingEvaluationPanel({
  workspaceId,
}: {
  readonly workspaceId: string;
}) {
  const [response, setResponse] = useState<FindingResponse>();
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load(): Promise<void> {
      setLoading(true);
      setError(undefined);
      try {
        const request = await fetch(
          `/api/workspaces/${workspaceId}/findings`,
          { signal: controller.signal },
        );
        const body = (await request.json()) as
          | FindingResponse
          | { readonly error?: { readonly message?: string } };
        if (!request.ok || !("findings" in body)) {
          const message = "error" in body ? body.error?.message : undefined;
          throw new Error(message ?? "Findings could not be loaded.");
        }
        if (!active) return;
        setResponse(body);
        setSelectedId(
          body.findings.find(
            ({ finding }) => finding.state === "WITNESSED_CONFLICT",
          )?.finding.id ?? body.findings[0]?.finding.id,
        );
      } catch (caught) {
        if (active && !controller.signal.aborted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Findings could not be loaded.",
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

  const findings = useMemo(() => {
    const byState = new Map(
      response?.findings.map((finding) => [finding.finding.state, finding]),
    );
    return stateOrder.flatMap((state) => {
      const finding = byState.get(state);
      return finding ? [finding] : [];
    });
  }, [response]);
  const selected =
    findings.find(({ finding }) => finding.id === selectedId) ?? findings[0];

  return (
    <section
      className="finding-panel"
      data-testid="finding-evaluation-panel"
      id="findings"
    >
      <header className="finding-heading">
        <div>
          <p className="eyebrow">Deterministic finding evaluator / DET-03</p>
          <h2>See what the test found—and what it could not determine.</h2>
          <p>
            Every result is limited to a named journey, role, field, time
            window, and recorded path. Pactwire does not turn a test result
            into an approval or compliance decision.
          </p>
        </div>
        <div className="finding-boundary" aria-label="Decision boundary">
          <span>Decision owner</span>
          <strong>Deterministic evidence</strong>
          <small>Model prose never changes the state.</small>
        </div>
      </header>

      {loading ? (
        <p className="finding-empty">Loading bounded findings…</p>
      ) : error ? (
        <div className="finding-error" role="alert">
          <strong>Findings unavailable</strong>
          <span>{error}</span>
        </div>
      ) : findings.length === 0 ? (
        <p className="finding-empty">No finalized finding evaluations.</p>
      ) : selected ? (
        <>
          <div className="finding-layout">
            <div>
              <div className="finding-section-heading">
                <div>
                  <span>Bounded state matrix</span>
                  <h3>Six results, each with a different meaning</h3>
                </div>
                <small>{response?.evaluatorVersion}</small>
              </div>
              <div className="finding-state-grid" data-testid="finding-state-matrix">
                {findings.map((evaluation) => {
                  const state = evaluation.finding.state;
                  const selectedState = evaluation.finding.id === selected.finding.id;
                  return (
                    <button
                      aria-pressed={selectedState}
                      className={`finding-state-card state-${state.toLowerCase().replaceAll("_", "-")}${selectedState ? " selected" : ""}`}
                      data-finding-state={state}
                      key={evaluation.finding.id}
                      onClick={() => setSelectedId(evaluation.finding.id)}
                      type="button"
                    >
                      <span className="finding-state-token">{state}</span>
                      <strong>{evaluation.display.label}</strong>
                      <p>{evaluation.display.meaning}</p>
                      <small>{coverageSummary(evaluation)}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            <article
              className="finding-detail"
              data-selected-state={selected.finding.state}
              data-testid="finding-detail"
            >
              <header>
                <span className="finding-detail-kicker">Selected finding</span>
                <h3>{selected.display.label}</h3>
                <p>{selected.display.meaning}</p>
                <code>{selected.finding.state}</code>
              </header>

              {selected.finding.priorFindingId ? (
                <div className="finding-prior" data-testid="finding-prior">
                  <span>Prior finding</span>
                  <strong title={selected.finding.priorFindingId}>
                    {shortId(selected.finding.priorFindingId)}
                  </strong>
                </div>
              ) : null}

              <section className="finding-scope" aria-labelledby="finding-scope-title">
                <div className="finding-detail-title">
                  <span>01</span>
                  <div>
                    <h4 id="finding-scope-title">Named test scope</h4>
                    <p>These are the only boundaries this result describes.</p>
                  </div>
                </div>
                <dl className="finding-scope-grid">
                  <div>
                    <dt>Software version</dt>
                    <dd>{selected.scope.softwareVersion}</dd>
                  </div>
                  <div>
                    <dt>Agreement version</dt>
                    <dd title={selected.scope.agreementVersionId}>
                      {shortId(selected.scope.agreementVersionId)}
                    </dd>
                  </div>
                  <div>
                    <dt>Role</dt>
                    <dd>{selected.scope.role.toLowerCase()}</dd>
                  </div>
                  <div>
                    <dt>Fields</dt>
                    <dd>{selected.scope.fields.join(", ")}</dd>
                  </div>
                  <div className="finding-scope-wide">
                    <dt>Journey</dt>
                    <dd>{selected.scope.journeyName}</dd>
                  </div>
                  <div className="finding-scope-wide">
                    <dt>Observation window</dt>
                    <dd>
                      {displayWindow(
                        selected.scope.observationWindow.startedAt,
                        selected.scope.observationWindow.endedAt,
                      )}
                    </dd>
                  </div>
                </dl>
                <div className="finding-paths">
                  <PathList
                    empty="No path had complete visible evidence."
                    label="Visible paths"
                    paths={selected.scope.visiblePaths}
                    tone="visible"
                  />
                  <PathList
                    empty="No required path was left untested."
                    label="Not tested"
                    paths={selected.scope.untestedPaths}
                    testId="finding-untested-paths"
                    tone="untested"
                  />
                  <PathList
                    empty="No required evidence was outside recorder visibility."
                    label="Not visible"
                    paths={selected.scope.notVisiblePaths}
                    testId="finding-not-visible-paths"
                    tone="invisible"
                  />
                </div>
              </section>

              <section
                className="finding-basis"
                aria-labelledby="finding-basis-title"
                data-testid="deterministic-basis"
              >
                <div className="finding-detail-title">
                  <span>02</span>
                  <div>
                    <h4 id="finding-basis-title">Deterministic evidence</h4>
                    <p>This evidence controls the selected state.</p>
                  </div>
                </div>
                <dl className="finding-basis-list">
                  <div>
                    <dt>Run manifest</dt>
                    <dd title={selected.deterministicBasis.runManifestHash}>
                      {shortHash(selected.deterministicBasis.runManifestHash)}
                    </dd>
                  </div>
                  <div>
                    <dt>Evidence lineage</dt>
                    <dd>
                      {selected.deterministicBasis.lineageComplete
                        ? "Complete"
                        : "Incomplete"}
                    </dd>
                  </div>
                  <div>
                    <dt>Matched observations</dt>
                    <dd>
                      {selected.deterministicBasis.matchedObservationIds.length > 0
                        ? selected.deterministicBasis.matchedObservationIds
                            .map(shortId)
                            .join(", ")
                        : "None"}
                    </dd>
                  </div>
                  <div>
                    <dt>Prohibited destination versions</dt>
                    <dd>
                      {selected.deterministicBasis.prohibitedDestinationVersionIds
                        .length > 0
                        ? selected.deterministicBasis.prohibitedDestinationVersionIds
                            .map(shortId)
                            .join(", ")
                        : "None"}
                    </dd>
                  </div>
                </dl>
                <div className="finding-reasons" data-testid="finding-reason-codes">
                  <span>Reason codes</span>
                  <div>
                    {selected.reasonCodes.map((reason) => (
                      <code key={reason}>{reason}</code>
                    ))}
                  </div>
                </div>
              </section>

              <section
                className="finding-model"
                aria-labelledby="finding-model-title"
                data-testid="model-explanation"
              >
                <div className="finding-detail-title">
                  <span>03</span>
                  <div>
                    <h4 id="finding-model-title">
                      Model explanation — not evidence
                    </h4>
                    <p>Excluded from the deterministic decision.</p>
                  </div>
                </div>
                {selected.modelExplanation ? (
                  <>
                    <p>{selected.modelExplanation.text}</p>
                    <footer>
                      <span>{selected.modelExplanation.model}</span>
                      <strong>Excluded from decision</strong>
                    </footer>
                  </>
                ) : (
                  <p>
                    No model explanation is stored for this finding. Model
                    prose is never required to reproduce its state.
                  </p>
                )}
              </section>

              <section className="finding-limitations" aria-labelledby="finding-limit-title">
                <div className="finding-detail-title">
                  <span>04</span>
                  <div>
                    <h4 id="finding-limit-title">Limits of this result</h4>
                    <p>What a reviewer must keep in view.</p>
                  </div>
                </div>
                <ul>
                  {selected.scope.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </section>
            </article>
          </div>

          <EvidenceReceiptPanel
            findingId={selected.finding.id}
            workspaceId={workspaceId}
          />

          <details className="finding-decision-table">
            <summary>View the deterministic decision order</summary>
            <ol>
              {response?.decisionTable.map((row) => (
                <li key={row.priority}>
                  <span>{row.priority}</span>
                  <p>{row.condition}</p>
                  <code>{row.state}</code>
                </li>
              ))}
            </ol>
          </details>
        </>
      ) : null}
    </section>
  );
}
