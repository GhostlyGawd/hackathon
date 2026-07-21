"use client";

import { useEffect, useState, type FormEvent } from "react";

type ApprovalState =
  | "UNKNOWN"
  | "APPROVED"
  | "HOLD"
  | "REJECTED"
  | "RETIRED";

interface ApprovalSnapshot {
  readonly workspaceId: string;
  readonly softwareId: string;
  readonly softwareName: string;
  readonly state: ApprovalState;
  readonly approvalOrigin: {
    readonly reason: string;
    readonly sourceReference?: string;
    readonly recordedAt: string;
    readonly setBy: {
      readonly kind: "HUMAN" | "IMPORTED_SYSTEM" | "AUTOMATION";
      readonly actorId: string;
      readonly displayName: string;
    };
  };
  readonly events: readonly {
    readonly eventId: string;
    readonly from: ApprovalState;
    readonly to: ApprovalState;
    readonly reason: string;
    readonly receiptId?: string;
    readonly actor: {
      readonly kind: "HUMAN" | "IMPORTED_SYSTEM" | "AUTOMATION";
      readonly actorId: string;
    };
    readonly occurredAt: string;
  }[];
  readonly decisions: readonly {
    readonly id: string;
    readonly outcome: string;
    readonly rationale: string;
    readonly namedScopeAcknowledged: true;
    readonly receiptId: string;
    readonly actor: { readonly kind: "HUMAN"; readonly actorId: string };
    readonly signedAt: string;
    readonly reviewedRun?: {
      readonly runId: string;
      readonly findingState: string;
    };
  }[];
  readonly holdReceipts: readonly {
    readonly id: string;
    readonly receiptId: string;
    readonly findingId: string;
    readonly findingState: "WITNESSED_CONFLICT" | "NOT_VISIBLE";
    readonly reason: "WITNESSED_CONFLICT" | "REQUIRED_VISIBILITY_LOSS";
    readonly checkpointId?: string;
    readonly occurredAt: string;
  }[];
}

interface ControlledFixtureActions {
  readonly conflictFindingId: string;
  readonly repairedFindingId: string;
  readonly visibilityRetryFindingId: string;
}

interface ApprovalResponse {
  readonly approval: ApprovalSnapshot;
  readonly controlledFixture?: ControlledFixtureActions;
}

interface Feedback {
  readonly tone: "success" | "neutral" | "danger";
  readonly message: string;
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function displayTime(value: string): string {
  return new Intl.DateTimeFormat([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function reasonLabel(reason: string): string {
  const labels: Readonly<Record<string, string>> = {
    WITNESSED_CONFLICT: "Witnessed conflict",
    REQUIRED_VISIBILITY_LOSS: "Required visibility loss",
    HUMAN_DECISION: "Human restoration",
    HUMAN_REJECTION: "Human rejection",
    HUMAN_RETIREMENT: "Human retirement",
  };
  return labels[reason] ?? reason.replaceAll("_", " ").toLowerCase();
}

async function responseMessage(response: Response): Promise<string> {
  const body = (await response.json()) as {
    readonly error?: { readonly message?: string };
  };
  return body.error?.message ?? "The approval request could not be completed.";
}

export function ApprovalAuthorityPanel({
  canRestoreApproval,
  softwareId,
  workspaceId,
}: {
  readonly canRestoreApproval: boolean;
  readonly softwareId: string;
  readonly workspaceId: string;
}) {
  const [approval, setApproval] = useState<ApprovalSnapshot>();
  const [controlledFixture, setControlledFixture] =
    useState<ControlledFixtureActions>();
  const [feedback, setFeedback] = useState<Feedback>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string>();
  const [rationale, setRationale] = useState("");
  const [namedScopeAcknowledged, setNamedScopeAcknowledged] = useState(false);

  const endpoint = `/api/workspaces/${workspaceId}/software/${softwareId}/approval`;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load(): Promise<void> {
      const response = await fetch(endpoint, { signal: controller.signal });
      if (!response.ok) throw new Error(await responseMessage(response));
      const body = (await response.json()) as ApprovalResponse;
      if (!active) return;
      setApproval(body.approval);
      setControlledFixture(body.controlledFixture);
    }
    setLoading(true);
    setError(undefined);
    load()
      .catch((caught) => {
        if (active && !controller.signal.aborted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Approval history could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [endpoint]);

  async function applyFinding(
    findingId: string | undefined,
    action: "conflict" | "repair" | "visibility",
  ): Promise<void> {
    if (!findingId) return;
    setBusyAction(action);
    setFeedback(undefined);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ findingId }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const body = (await response.json()) as {
        readonly outcome: string;
        readonly reason?: string;
        readonly approval: ApprovalSnapshot;
      };
      setApproval(body.approval);
      const messages: Readonly<Record<typeof action, string>> = {
        conflict:
          body.outcome === "HOLD_APPLIED"
            ? "The exact witnessed-conflict receipt placed the existing approval on hold."
            : "That witnessed-conflict receipt was already recorded.",
        repair:
          "The repaired named rerun was recorded. Approval remains on hold until an authorized person decides otherwise.",
        visibility:
          body.outcome === "HOLD_APPLIED"
            ? "Prior visibility and two matching NOT_VISIBLE attempts placed the existing approval on hold."
            : "The stored runs did not satisfy the visibility-loss hold rule.",
      };
      setFeedback({
        tone: body.outcome === "HOLD_APPLIED" ? "success" : "neutral",
        message: messages[action],
      });
    } catch (caught) {
      setFeedback({
        tone: "danger",
        message:
          caught instanceof Error
            ? caught.message
            : "The stored finding could not be applied.",
      });
    } finally {
      setBusyAction(undefined);
    }
  }

  async function restoreApproval(event: FormEvent): Promise<void> {
    event.preventDefault();
    const receiptId = approval?.holdReceipts[0]?.receiptId;
    const reviewedFindingId = controlledFixture?.repairedFindingId;
    if (!receiptId || !reviewedFindingId) return;
    setBusyAction("restore");
    setFeedback(undefined);
    try {
      const response = await fetch(`${endpoint}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outcome: "RESTORE_APPROVED",
          rationale,
          namedScopeAcknowledged,
          receiptId,
          reviewedFindingId,
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const body = (await response.json()) as {
        readonly approval: ApprovalSnapshot;
      };
      setApproval(body.approval);
      setFeedback({
        tone: "success",
        message:
          "The signed human decision restored the district approval for the acknowledged named-test scope.",
      });
      setRationale("");
      setNamedScopeAcknowledged(false);
    } catch (caught) {
      setFeedback({
        tone: "danger",
        message:
          caught instanceof Error
            ? caught.message
            : "Approval could not be restored.",
      });
    } finally {
      setBusyAction(undefined);
    }
  }

  return (
    <section
      className="approval-authority-panel"
      data-approval-state={approval?.state}
      data-testid="approval-authority-panel"
      id="approval"
    >
      <header className="approval-authority-heading">
        <div>
          <p className="eyebrow">Approval authority / DET-05</p>
          <h2>
            A witnessed conflict can pause an existing approval. Only a person
            can restore it.
          </h2>
          <p>
            Pactwire links each automated hold to exact stored evidence. A
            clean rerun does not approve software, and a sampled run is not a
            safety or compliance conclusion.
          </p>
        </div>
        <div className="approval-authority-rule">
          <span>Authority boundary</span>
          <strong>Automation: APPROVED → HOLD only</strong>
          <small>Human decision required to restore approval.</small>
        </div>
      </header>

      {loading ? (
        <p className="approval-authority-empty">Loading approval history…</p>
      ) : error ? (
        <div className="approval-authority-error" role="alert">
          <strong>Approval history unavailable</strong>
          <span>{error}</span>
        </div>
      ) : approval ? (
        <>
          <div className="approval-status-card">
            <div>
              <span>Current district status</span>
              <strong
                className={`approval-state approval-state-${approval.state.toLowerCase()}`}
                data-testid="approval-state"
              >
                {approval.state}
              </strong>
            </div>
            <div>
              <span>Software</span>
              <strong>{approval.softwareName}</strong>
              <small>{shortId(approval.softwareId)}</small>
            </div>
            <div>
              <span>Current source</span>
              <strong>{approval.approvalOrigin.setBy.displayName}</strong>
              <small>{approval.approvalOrigin.reason}</small>
            </div>
          </div>

          {feedback ? (
            <div
              className={`approval-feedback tone-${feedback.tone}`}
              data-testid="approval-feedback"
              role="status"
            >
              {feedback.message}
            </div>
          ) : null}

          <div className="approval-authority-layout">
            <div className="approval-authority-main">
              <section className="approval-control-card">
                <div className="approval-section-title">
                  <div>
                    <span>Controlled fixture actions</span>
                    <h3>Apply stored deterministic results</h3>
                  </div>
                  <small>No live vendor or student data</small>
                </div>
                <p>
                  These buttons replay already stored fictional findings. The
                  server loads the finding, receipt, run lineage, and visibility
                  history; the browser cannot supply those facts.
                </p>
                <div className="approval-fixture-actions">
                  <button
                    className="secondary-button"
                    data-testid="apply-approval-conflict"
                    disabled={Boolean(busyAction)}
                    onClick={() =>
                      void applyFinding(
                        controlledFixture?.conflictFindingId,
                        "conflict",
                      )
                    }
                    type="button"
                  >
                    Apply witnessed conflict
                  </button>
                  <button
                    className="secondary-button"
                    data-testid="apply-approval-repair"
                    disabled={Boolean(busyAction)}
                    onClick={() =>
                      void applyFinding(
                        controlledFixture?.repairedFindingId,
                        "repair",
                      )
                    }
                    type="button"
                  >
                    Apply repaired rerun
                  </button>
                  <button
                    className="secondary-button"
                    data-testid="apply-approval-visibility"
                    disabled={Boolean(busyAction)}
                    onClick={() =>
                      void applyFinding(
                        controlledFixture?.visibilityRetryFindingId,
                        "visibility",
                      )
                    }
                    type="button"
                  >
                    Apply frozen visibility retry
                  </button>
                </div>
              </section>

              <section className="approval-contribution-card">
                <div className="approval-section-title">
                  <div>
                    <span>Exact evidence links</span>
                    <h3>Receipts contributing to this hold</h3>
                  </div>
                  <small>{approval.holdReceipts.length} recorded</small>
                </div>
                {approval.holdReceipts.length > 0 ? (
                  <ol
                    className="approval-contribution-list"
                    data-testid="approval-hold-contributions"
                  >
                    {approval.holdReceipts.map((contribution) => (
                      <li
                        data-hold-reason={contribution.reason}
                        key={contribution.id}
                      >
                        <div>
                          <strong>{reasonLabel(contribution.reason)}</strong>
                          <time dateTime={contribution.occurredAt}>
                            {displayTime(contribution.occurredAt)}
                          </time>
                        </div>
                        <p>
                          Finding {shortId(contribution.findingId)} · receipt{" "}
                          {shortId(contribution.receiptId)}
                        </p>
                        {contribution.checkpointId ? (
                          <small>
                            Required checkpoint: {contribution.checkpointId}
                          </small>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="approval-authority-empty">
                    No deterministic receipt has placed this approval on hold.
                  </p>
                )}
              </section>
            </div>

            <aside className="approval-decision-card">
              <div className="approval-section-title">
                <div>
                  <span>Human authority</span>
                  <h3>Restore approval</h3>
                </div>
              </div>
              {approval.state !== "HOLD" ? (
                <p>
                  Restoration is unavailable because the current status is not
                  HOLD.
                </p>
              ) : canRestoreApproval ? (
                <form
                  data-testid="approval-restoration-form"
                  onSubmit={(event) => void restoreApproval(event)}
                >
                  <p>
                    Review the named repaired rerun, write the reason for your
                    decision, and acknowledge its limited scope.
                  </p>
                  <label htmlFor="approval-rationale">
                    Signed decision reason
                    <textarea
                      data-testid="approval-rationale"
                      id="approval-rationale"
                      onChange={(event) => setRationale(event.target.value)}
                      required
                      rows={5}
                      value={rationale}
                    />
                  </label>
                  <label className="approval-acknowledgement">
                    <input
                      checked={namedScopeAcknowledged}
                      data-testid="approval-named-scope"
                      onChange={(event) =>
                        setNamedScopeAcknowledged(event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span>
                      I reviewed the named rerun and understand it says nothing
                      about untested roles, journeys, fields, or time periods.
                    </span>
                  </label>
                  <button
                    className="primary-button"
                    data-testid="restore-approval"
                    disabled={
                      Boolean(busyAction) ||
                      rationale.trim().length === 0 ||
                      !namedScopeAcknowledged
                    }
                    type="submit"
                  >
                    Record decision and restore approval
                  </button>
                </form>
              ) : (
                <div
                  className="approval-readonly"
                  data-testid="approval-restoration-readonly"
                >
                  <strong>Restoration is read-only for this role</strong>
                  <p>
                    Only a privacy officer or application approver can sign a
                    decision that restores APPROVED.
                  </p>
                </div>
              )}
              <div className="approval-automation-boundary">
                <strong>Automation cannot restore approval.</strong>
                <p>
                  A repaired or clean rerun leaves HOLD unchanged until an
                  authorized human signs a new decision.
                </p>
              </div>
            </aside>
          </div>

          <section className="approval-history-card">
            <div className="approval-section-title">
              <div>
                <span>Append-only record</span>
                <h3>Approval state and decision history</h3>
              </div>
              <small>
                {approval.events.length} transitions · {approval.decisions.length}{" "}
                decisions
              </small>
            </div>
            {approval.events.length > 0 ? (
              <ol
                className="approval-history-list"
                data-testid="approval-history"
              >
                {approval.events.map((event) => (
                  <li key={event.eventId}>
                    <div>
                      <strong>
                        {event.from} → {event.to}
                      </strong>
                      <time dateTime={event.occurredAt}>
                        {displayTime(event.occurredAt)}
                      </time>
                    </div>
                    <p>
                      {reasonLabel(event.reason)} · {event.actor.kind.toLowerCase()}{" "}
                      {event.actor.actorId}
                    </p>
                    {event.receiptId ? (
                      <small>Receipt {shortId(event.receiptId)}</small>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="approval-authority-empty">
                No approval transition has been recorded.
              </p>
            )}
            {approval.decisions.map((decision) => (
              <article
                className="approval-signed-decision"
                data-testid="approval-signed-decision"
                key={decision.id}
              >
                <div>
                  <strong>{decision.outcome.replaceAll("_", " ")}</strong>
                  <time dateTime={decision.signedAt}>
                    {displayTime(decision.signedAt)}
                  </time>
                </div>
                <p>{decision.rationale}</p>
                <small>
                  Signed by {decision.actor.actorId} · named scope acknowledged
                </small>
              </article>
            ))}
          </section>
        </>
      ) : null}
    </section>
  );
}
