"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { SecretIsolationPanel } from "./secret-isolation-panel";
import { AgreementIntakePanel } from "./agreement-intake-panel";
import { JourneyAuthoringPanel } from "./journey-authoring-panel";
import { DestinationRegistryPanel } from "./destination-registry-panel";
import { RunHistoryPanel } from "./run-history-panel";
import { SoftwareInventory } from "./software-inventory";
import { SyntheticDataPanel } from "./synthetic-data-panel";
import { TestAuthorizationPanel } from "./test-authorization-panel";
import { SetupWorkflow } from "./setup-workflow";

type WorkspaceRole =
  | "PRIVACY_OFFICER"
  | "TEST_OPERATOR"
  | "REVIEWER"
  | "APPLICATION_APPROVER"
  | "SECURITY_REVIEWER";

interface Principal {
  readonly userId: string;
  readonly displayName: string;
  readonly activeWorkspaceId: string;
}

interface WorkspaceRecord {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

interface RoleAssignment {
  readonly id: string;
  readonly role: WorkspaceRole;
  readonly userId: string;
}

interface AuditEvent {
  readonly eventId: string;
  readonly action: string;
  readonly occurredAt: string;
  readonly actor: { readonly actorId: string };
  readonly details: Readonly<Record<string, unknown>>;
}

interface Feedback {
  readonly tone: "success" | "danger" | "neutral";
  readonly title: string;
  readonly message: string;
  readonly auditRecorded?: boolean;
}

interface ApiErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly auditRecorded?: boolean;
  };
}

class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly auditRecorded: boolean;

  constructor(response: Response, body: ApiErrorBody) {
    super(body.error?.message ?? "Pactwire could not complete the request.");
    this.name = "ApiError";
    this.status = response.status;
    this.code = body.error?.code ?? "REQUEST_FAILED";
    this.auditRecorded = body.error?.auditRecorded ?? false;
  }
}

async function api<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = (await response.json()) as T | ApiErrorBody;
  if (!response.ok) {
    throw new ApiError(response, body as ApiErrorBody);
  }
  return body as T;
}

const visibleFixtureUsers = [
  {
    key: "officer",
    name: "Morgan Vale (Fictional)",
    role: "Privacy officer",
  },
  {
    key: "operator",
    name: "Riley Chen (Fictional)",
    role: "Test operator",
  },
  {
    key: "reviewer",
    name: "Jordan Brooks (Fictional)",
    role: "Reviewer",
  },
] as const;

const roleLabels: Readonly<Record<WorkspaceRole, string>> = {
  PRIVACY_OFFICER: "Privacy officer",
  TEST_OPERATOR: "Test operator",
  REVIEWER: "Reviewer",
  APPLICATION_APPROVER: "Application approver",
  SECURITY_REVIEWER: "Security reviewer",
};

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.8 20 6v5.4c0 4.9-3.1 8.4-8 10.2-4.9-1.8-8-5.3-8-10.2V6l8-3.2Z" />
      <path d="m8.7 12 2.1 2.1 4.7-5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h8M17 12v3M20 12v2" />
    </svg>
  );
}

function AuditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h10v4H7zM5 5H4v16h16V5h-1M8 12h8M8 16h5" />
    </svg>
  );
}

function formatAction(action: string): string {
  const labels: Readonly<Record<string, string>> = {
    "workspace.created": "Workspace created",
    "workspace.role_assigned": "Role assigned",
    "workspace.access_allowed": "Access allowed",
    "workspace.access_denied": "Access denied",
    "test_authorization.created": "Test authorization created",
    "test_authorization.policy_allowed": "Policy attempt allowed",
    "test_authorization.policy_denied": "Policy attempt blocked",
    "test_authorization.revoked": "Test authorization revoked",
    "persona.likely_real_data_blocked": "Likely real data blocked",
    "persona.created": "Fictional user created",
    "canaries.generated": "Run canaries generated",
  };
  return labels[action] ?? action;
}

function detailText(event: AuditEvent): string {
  const role = event.details["role"];
  const target = event.details["targetUserId"];
  const permission = event.details["permission"];
  const reason = event.details["reason"];
  if (typeof role === "string" && typeof target === "string") {
    return `${roleLabels[role as WorkspaceRole] ?? role} → ${target}`;
  }
  if (typeof permission === "string" && typeof reason === "string") {
    return `${permission} · ${reason}`;
  }
  return "Human-authenticated workspace event";
}

function canReadAudit(roles: readonly RoleAssignment[]): boolean {
  return roles.some((assignment) =>
    [
      "PRIVACY_OFFICER",
      "REVIEWER",
      "APPLICATION_APPROVER",
      "SECURITY_REVIEWER",
    ].includes(assignment.role),
  );
}

export function AccessConsole() {
  const [selectedUser, setSelectedUser] = useState("officer");
  const [principal, setPrincipal] = useState<Principal>();
  const [workspace, setWorkspace] = useState<WorkspaceRecord>();
  const [roles, setRoles] = useState<readonly RoleAssignment[]>([]);
  const [audits, setAudits] = useState<readonly AuditEvent[]>([]);
  const [targetUserId, setTargetUserId] = useState("fictional-new-reviewer");
  const [targetRole, setTargetRole] = useState<WorkspaceRole>("REVIEWER");
  const [lookupId, setLookupId] = useState("");
  const [feedback, setFeedback] = useState<Feedback>();
  const [busy, setBusy] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [setupSoftwareId, setSetupSoftwareId] = useState<string>();
  const [setupStepId, setSetupStepId] = useState<string>();

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    setSetupSoftwareId(parameters.get("setup") ?? undefined);
    setSetupStepId(parameters.get("step") ?? undefined);
  }, []);

  const loadAudit = useCallback(
    async (
      currentPrincipal: Principal,
      currentRoles: readonly RoleAssignment[],
    ): Promise<void> => {
      if (!canReadAudit(currentRoles)) {
        setAudits([]);
        return;
      }
      const result = await api<{ readonly auditEvents: readonly AuditEvent[] }>(
        `/api/workspaces/${currentPrincipal.activeWorkspaceId}/audit`,
      );
      setAudits(result.auditEvents.slice(-24).reverse());
    },
    [],
  );

  const loadWorkspace = useCallback(
    async (currentPrincipal: Principal): Promise<void> => {
      const result = await api<{
        readonly workspace: WorkspaceRecord;
        readonly roleAssignments: readonly RoleAssignment[];
      }>(`/api/workspaces/${currentPrincipal.activeWorkspaceId}`);
      setWorkspace(result.workspace);
      setRoles(result.roleAssignments);
      setLookupId(currentPrincipal.activeWorkspaceId);
      await loadAudit(currentPrincipal, result.roleAssignments);
    },
    [loadAudit],
  );

  useEffect(() => {
    let active = true;
    async function restore(): Promise<void> {
      try {
        const result = await api<{ readonly principal: Principal }>(
          "/api/demo/session",
        );
        if (!active) return;
        setPrincipal(result.principal);
        await loadWorkspace(result.principal);
      } catch {
        if (active) {
          setPrincipal(undefined);
        }
      } finally {
        if (active) {
          setSessionReady(true);
        }
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, [loadWorkspace]);

  async function startSession(): Promise<void> {
    if (!sessionReady) return;
    setBusy(true);
    setFeedback(undefined);
    try {
      const result = await api<{ readonly principal: Principal }>(
        "/api/demo/session",
        {
          body: JSON.stringify({ userKey: selectedUser }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      setPrincipal(result.principal);
      await loadWorkspace(result.principal);
      setFeedback({
        tone: "neutral",
        title: "Signed session active",
        message: "The server will load this user's roles for every request.",
      });
    } catch (error) {
      setFeedback({
        tone: "danger",
        title: "Session unavailable",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function signOut(): Promise<void> {
    await fetch("/api/demo/session", { method: "DELETE" });
    setPrincipal(undefined);
    setWorkspace(undefined);
    setRoles([]);
    setAudits([]);
    setFeedback(undefined);
  }

  async function assignRole(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!principal) return;
    setBusy(true);
    try {
      const result = await api<{ readonly assignment: RoleAssignment }>(
        `/api/workspaces/${principal.activeWorkspaceId}/roles`,
        {
          body: JSON.stringify({ targetUserId, role: targetRole }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      setFeedback({
        tone: "success",
        title: "Role assigned",
        message: `${roleLabels[result.assignment.role]} was assigned to ${result.assignment.userId}.`,
        auditRecorded: true,
      });
      await loadAudit(principal, roles);
    } catch (error) {
      const requestError = error instanceof ApiError ? error : undefined;
      setFeedback({
        tone: "danger",
        title: requestError?.status === 403 ? "Action denied" : "Action failed",
        message: requestError?.message ?? "Pactwire could not assign the role.",
        ...(requestError
          ? { auditRecorded: requestError.auditRecorded }
          : {}),
      });
      await loadAudit(principal, roles).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function lookupWorkspace(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!lookupId.trim()) return;
    setBusy(true);
    try {
      const result = await api<{ readonly workspace: WorkspaceRecord }>(
        `/api/workspaces/${encodeURIComponent(lookupId.trim())}`,
      );
      setFeedback({
        tone: "success",
        title: "Workspace available",
        message: `${result.workspace.name} is inside your active workspace boundary.`,
        auditRecorded: true,
      });
    } catch (error) {
      const requestError = error instanceof ApiError ? error : undefined;
      setFeedback({
        tone: "danger",
        title:
          requestError?.status === 404
            ? "Workspace unavailable"
            : "Lookup failed",
        message:
          requestError?.message ?? "Pactwire could not complete the lookup.",
        ...(requestError
          ? { auditRecorded: requestError.auditRecorded }
          : {}),
      });
      if (principal) {
        await loadAudit(principal, roles).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#main" aria-label="Pactwire home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>Pactwire</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#inventory">Inventory</a>
          {setupSoftwareId ? (
            <a href="#setup" aria-current="location">Setup</a>
          ) : null}
          <a href="#authorization">Authorization</a>
          <a href="#agreements">Agreement</a>
          <a href="#credentials">Credentials</a>
          <a href="#synthetic-data">Test data</a>
          <a href="#journeys">Journeys</a>
          <a href="#run-history">Runs</a>
        </nav>
        <span className="environment-badge">
          <span aria-hidden="true" /> Controlled fixture
        </span>
      </header>

      <main id="main">
        <section className="hero" id="overview">
          <div className="hero-copy">
            <p className="eyebrow">Agreement-to-behavior checks</p>
            <h1>
              Check whether school software sends student information beyond
              what the district allowed.
            </h1>
            <p className="lede">
              Pactwire runs authorized tests with fictional student and teacher
              accounts, records where test data goes, and compares those
              observations with rules a person confirmed from the district&apos;s
              agreement.
            </p>
            <div className="principle-row">
              <span>
                <ShieldIcon /> Human-confirmed agreement rules
              </span>
              <span>
                <AuditIcon /> Recorded browser evidence
              </span>
            </div>
          </div>
          <div className="decision-flow" aria-label="Pactwire test evidence flow">
            <p className="flow-label">What Pactwire connects</p>
            <div className="flow-step">
              <span className="step-index">01</span>
              <div>
                <strong>Confirm what the agreement allows</strong>
                <span>A person checks every executable rule against cited text</span>
              </div>
            </div>
            <ArrowIcon />
            <div className="flow-step">
              <span className="step-index">02</span>
              <div>
                <strong>Replay an authorized fictional activity</strong>
                <span>The runner stays inside the named tenant and action scope</span>
              </div>
            </div>
            <ArrowIcon />
            <div className="flow-step emphasized">
              <span className="step-index">03</span>
              <div>
                <strong>Review the recorded data flow</strong>
                <span>Observed conflicts stay tied to one rule and named test</span>
              </div>
            </div>
          </div>
        </section>

        <section className="console" id="authority">
          <div className="console-heading">
            <div>
              <p className="eyebrow">Live authority check</p>
              <h2>Use a fictional district role</h2>
            </div>
            {principal ? (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  void signOut();
                }}
              >
                End session
              </button>
            ) : null}
          </div>

          <div className="session-strip">
            <div className="session-icon">
              <KeyIcon />
            </div>
            <label htmlFor="fixture-user">
              Fictional user
              <select
                id="fixture-user"
                data-testid="session-select"
                value={selectedUser}
                onChange={(event) => setSelectedUser(event.target.value)}
              >
                {visibleFixtureUsers.map((user) => (
                  <option key={user.key} value={user.key}>
                    {user.name} — {user.role}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary-button"
              data-testid="start-session"
              disabled={busy || !sessionReady}
              type="button"
              onClick={() => {
                void startSession();
              }}
            >
              {!sessionReady
                ? "Restoring session…"
                : busy
                  ? "Checking…"
                  : principal
                    ? "Switch user"
                    : "Start session"}
            </button>
            <p>
              Fixture sessions are signed, HTTP-only, and contain no permission
              claims.
            </p>
          </div>

          {feedback ? (
            <div
              className={`feedback ${feedback.tone}`}
              data-testid="feedback"
              role="status"
              aria-live="polite"
            >
              <span className="feedback-icon" aria-hidden="true">
                {feedback.tone === "success" ? "✓" : feedback.tone === "danger" ? "!" : "i"}
              </span>
              <div>
                <strong>{feedback.title}</strong>
                <p>{feedback.message}</p>
                {feedback.auditRecorded ? (
                  <small>Recorded in the active workspace audit.</small>
                ) : null}
              </div>
            </div>
          ) : null}

          {!principal || !workspace ? (
            <div className="signed-out-state">
              <div className="empty-shield">
                <ShieldIcon />
              </div>
              <h3>No active workspace session</h3>
              <p>
                Choose a fictional user above. Pactwire will verify the signed
                identity, then load that person&apos;s roles from the server.
              </p>
            </div>
          ) : (
            <>
              <SoftwareInventory
                workspaceId={principal.activeWorkspaceId}
                principalUserId={principal.userId}
                onContinueSetup={(softwareId) => {
                  setSetupSoftwareId(softwareId);
                  setSetupStepId(undefined);
                }}
              />
              {setupSoftwareId ? (
                <SetupWorkflow
                  key={`setup:${principal.activeWorkspaceId}:${setupSoftwareId}`}
                  workspaceId={principal.activeWorkspaceId}
                  softwareId={setupSoftwareId}
                  {...(setupStepId ? { initialStepId: setupStepId } : {})}
                  onClose={() => {
                    setSetupSoftwareId(undefined);
                    setSetupStepId(undefined);
                  }}
                />
              ) : null}
              <TestAuthorizationPanel
                workspaceId={principal.activeWorkspaceId}
                principalUserId={principal.userId}
              />
              <AgreementIntakePanel
                key={`agreement:${principal.activeWorkspaceId}:${principal.userId}`}
                workspaceId={principal.activeWorkspaceId}
                principalUserId={principal.userId}
              />
              <SyntheticDataPanel
                key={`synthetic:${principal.activeWorkspaceId}:${principal.userId}`}
                workspaceId={principal.activeWorkspaceId}
                principalUserId={principal.userId}
              />
              <JourneyAuthoringPanel
                key={`journey:${principal.activeWorkspaceId}:${principal.userId}`}
                workspaceId={principal.activeWorkspaceId}
              />
              <SecretIsolationPanel
                key={`${principal.activeWorkspaceId}:${principal.userId}`}
                workspaceId={principal.activeWorkspaceId}
                principalUserId={principal.userId}
              />
              <DestinationRegistryPanel
                key={`destinations:${principal.activeWorkspaceId}:${principal.userId}`}
                workspaceId={principal.activeWorkspaceId}
              />
              <RunHistoryPanel workspaceId={principal.activeWorkspaceId} />
              <div className="workspace-grid">
              <div className="workspace-column">
                <article className="workspace-card">
                  <div className="card-kicker">
                    <span className="status-dot" /> Active workspace
                  </div>
                  <h3 data-testid="workspace-title">{workspace.name}</h3>
                  <p className="mono workspace-id">{workspace.id}</p>
                  <div className="identity-row">
                    <div className="avatar" aria-hidden="true">
                      {principal.displayName
                        .split(" ")
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")}
                    </div>
                    <div>
                      <strong>{principal.displayName}</strong>
                      <span className="mono">{principal.userId}</span>
                    </div>
                  </div>
                  <div className="role-list" data-testid="active-roles">
                    {roles.map((assignment) => (
                      <span key={assignment.id} className="role-chip">
                        <ShieldIcon /> {roleLabels[assignment.role]}
                      </span>
                    ))}
                  </div>
                </article>

                <article className="action-card">
                  <div className="card-title-row">
                    <div>
                      <p className="card-kicker">Restricted action</p>
                      <h3>Assign a workspace role</h3>
                    </div>
                    <span className="permission-tag mono">ROLE_ASSIGN</span>
                  </div>
                  <p className="card-description">
                    Only a privacy officer can complete this request. The server
                    ignores any permission claim sent by the browser.
                  </p>
                  <form
                    className="role-form"
                    onSubmit={(event) => {
                      void assignRole(event);
                    }}
                  >
                    <label htmlFor="target-user">
                      Target user ID
                      <input
                        id="target-user"
                        data-testid="target-user"
                        value={targetUserId}
                        onChange={(event) => setTargetUserId(event.target.value)}
                      />
                    </label>
                    <label htmlFor="target-role">
                      Role
                      <select
                        id="target-role"
                        data-testid="target-role"
                        value={targetRole}
                        onChange={(event) =>
                          setTargetRole(event.target.value as WorkspaceRole)
                        }
                      >
                        <option value="PRIVACY_OFFICER">Privacy officer</option>
                        <option value="TEST_OPERATOR">Test operator</option>
                        <option value="REVIEWER">Reviewer</option>
                      </select>
                    </label>
                    <button
                      className="primary-button"
                      data-testid="assign-role"
                      disabled={busy || targetUserId.trim().length === 0}
                      type="submit"
                    >
                      Request assignment
                    </button>
                  </form>
                </article>

                <article className="action-card compact">
                  <div className="card-title-row">
                    <div>
                      <p className="card-kicker">Tenant boundary</p>
                      <h3>Open a workspace by ID</h3>
                    </div>
                    <span className="permission-tag mono">WORKSPACE_READ</span>
                  </div>
                  <p className="card-description">
                    IDs outside the active workspace always return the same
                    unavailable response. No target name or membership is exposed.
                  </p>
                  <form
                    className="lookup-form"
                    onSubmit={(event) => {
                      void lookupWorkspace(event);
                    }}
                  >
                    <label htmlFor="lookup-id">
                      Workspace ID
                      <input
                        className="mono"
                        id="lookup-id"
                        data-testid="lookup-id"
                        value={lookupId}
                        onChange={(event) => setLookupId(event.target.value)}
                      />
                    </label>
                    <button
                      className="secondary-button"
                      data-testid="lookup-workspace"
                      disabled={busy}
                      type="submit"
                    >
                      Check access
                    </button>
                  </form>
                </article>
              </div>

              <aside className="audit-card" aria-labelledby="audit-heading">
                <div className="card-title-row">
                  <div>
                    <p className="card-kicker">Append-only history</p>
                    <h3 id="audit-heading">Recent authority events</h3>
                  </div>
                  <AuditIcon />
                </div>
                {canReadAudit(roles) ? (
                  <ol className="audit-list" data-testid="audit-list">
                    {audits.map((event) => (
                      <li key={event.eventId}>
                        <span
                          className={`timeline-mark ${
                            event.action.endsWith("denied") ? "denied" : ""
                          }`}
                          aria-hidden="true"
                        />
                        <div>
                          <div className="audit-title-row">
                            <strong>{formatAction(event.action)}</strong>
                            <time className="mono" dateTime={event.occurredAt}>
                              {new Date(event.occurredAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </time>
                          </div>
                          <p>{detailText(event)}</p>
                          <span className="mono">{event.actor.actorId}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="audit-locked">
                    <KeyIcon />
                    <strong>Audit details require a review role</strong>
                    <p>
                      Denials are still recorded. This user cannot read the audit
                      log.
                    </p>
                  </div>
                )}
                <div className="audit-footer">
                  <span className="status-dot" /> Authorization events are
                  append-only
                </div>
              </aside>
              </div>
            </>
          )}
        </section>
      </main>

      <footer>
        <span>Pactwire controlled fixture · no real student data</span>
        <span className="mono">SECRET_ISOLATION_BOUNDARY / v1</span>
      </footer>
    </div>
  );
}
