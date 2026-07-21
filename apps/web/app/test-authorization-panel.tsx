"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

type AuthorizationAction =
  | "NAVIGATE"
  | "SUBMIT"
  | "DOWNLOAD"
  | "UPLOAD"
  | "MESSAGE"
  | "PURCHASE"
  | "DELETE"
  | "ADMINISTER";

type AttemptKind = "NAVIGATION" | "REDIRECT" | "POPUP" | "ACTION";
type EffectiveStatus =
  | "ACTIVE"
  | "NOT_YET_VALID"
  | "REVIEW_DUE"
  | "EXPIRED"
  | "REVOKED";

interface SoftwareItem {
  readonly software: {
    readonly id: string;
    readonly name: string;
    readonly authorizedTenantUrl: string;
  };
}

interface TestAuthorization {
  readonly id: string;
  readonly version: number;
  readonly status: "ACTIVE" | "EXPIRED" | "REVOKED";
  readonly effectiveStatus: EffectiveStatus;
  readonly validFrom: string;
  readonly reviewAt: string;
  readonly expiresAt: string;
  readonly authorityBasis: string;
  readonly allowedBaseUrl: string;
  readonly allowedDomains: readonly string[];
  readonly allowedActions: readonly AuthorizationAction[];
  readonly prohibitedActions: readonly AuthorizationAction[];
  readonly redirectPolicy: "ALLOW_LISTED_ONLY";
  readonly popupPolicy: "BLOCK_ALL" | "ALLOW_LISTED_ONLY";
  readonly attestation: {
    readonly authorityConfirmed: true;
    readonly syntheticAccountsOnlyConfirmed: true;
    readonly statement: string;
  };
  readonly attestedBy: {
    readonly kind: "HUMAN";
    readonly actorId: string;
  };
  readonly attestedAt: string;
}

interface PolicyDecision {
  readonly id: string;
  readonly allowed: boolean;
  readonly outcome: "ALLOW" | "DENY";
  readonly reason: string;
  readonly message: string;
  readonly attemptKind: string;
  readonly targetDomain?: string;
  readonly action?: AuthorizationAction;
  readonly recordedAt: string;
}

interface ApiErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly reason?: string;
    readonly auditRecorded?: boolean;
    readonly decision?: PolicyDecision;
  };
}

class AuthorizationApiError extends Error {
  readonly status: number;
  readonly reason: string | undefined;
  readonly auditRecorded: boolean;
  readonly decision: PolicyDecision | undefined;

  constructor(response: Response, body: ApiErrorBody) {
    super(body.error?.message ?? "Pactwire could not complete the request.");
    this.name = "AuthorizationApiError";
    this.status = response.status;
    this.reason = body.error?.reason;
    this.auditRecorded = body.error?.auditRecorded ?? false;
    this.decision = body.error?.decision;
  }
}

async function authorizationApi<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const body = (await response.json()) as T | ApiErrorBody;
  if (!response.ok) {
    throw new AuthorizationApiError(response, body as ApiErrorBody);
  }
  return body as T;
}

const actions = [
  "NAVIGATE",
  "SUBMIT",
  "DOWNLOAD",
  "UPLOAD",
  "MESSAGE",
  "PURCHASE",
  "DELETE",
  "ADMINISTER",
] as const satisfies readonly AuthorizationAction[];

const actionLabels: Readonly<Record<AuthorizationAction, string>> = {
  NAVIGATE: "Open pages",
  SUBMIT: "Submit fictional forms",
  DOWNLOAD: "Download files",
  UPLOAD: "Upload files",
  MESSAGE: "Send messages",
  PURCHASE: "Make purchases",
  DELETE: "Delete records",
  ADMINISTER: "Change permissions or settings",
};

const statusLabels: Readonly<Record<EffectiveStatus, string>> = {
  ACTIVE: "ACTIVE",
  NOT_YET_VALID: "NOT YET VALID",
  REVIEW_DUE: "REVIEW DUE",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
};

const utcFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function utcLabel(value: string): string {
  return utcFormatter.format(new Date(value));
}

function localInputToIso(value: string): string {
  return new Date(`${value}:00.000Z`).toISOString();
}

function decisionTitle(decision: PolicyDecision): string {
  return decision.allowed ? "Allowed by stored policy" : "Blocked by stored policy";
}

interface TestAuthorizationPanelProps {
  readonly workspaceId: string;
  readonly principalUserId: string;
}

export function TestAuthorizationPanel({
  workspaceId,
  principalUserId,
}: TestAuthorizationPanelProps) {
  const [software, setSoftware] = useState<readonly SoftwareItem[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState("");
  const [authorizations, setAuthorizations] = useState<
    readonly TestAuthorization[]
  >([]);
  const [decisions, setDecisions] = useState<readonly PolicyDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [showForm, setShowForm] = useState(true);
  const [latestDecision, setLatestDecision] = useState<PolicyDecision>();

  const [authorityBasis, setAuthorityBasis] = useState(
    "District-owned fictional training tenant.",
  );
  const [validFrom, setValidFrom] = useState("2026-07-19T20:00");
  const [reviewAt, setReviewAt] = useState("2026-07-20T20:00");
  const [expiresAt, setExpiresAt] = useState("2026-07-21T20:00");
  const [baseUrl, setBaseUrl] = useState("");
  const [supportingDomains, setSupportingDomains] = useState(
    "assets.northstar.invalid",
  );
  const [allowedActions, setAllowedActions] = useState<
    readonly AuthorizationAction[]
  >(["NAVIGATE", "SUBMIT"]);
  const [prohibitedActions, setProhibitedActions] = useState<
    readonly AuthorizationAction[]
  >(["DOWNLOAD", "UPLOAD", "MESSAGE", "PURCHASE", "DELETE", "ADMINISTER"]);
  const [popupPolicy, setPopupPolicy] = useState<
    "BLOCK_ALL" | "ALLOW_LISTED_ONLY"
  >("BLOCK_ALL");
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);
  const [syntheticConfirmed, setSyntheticConfirmed] = useState(false);
  const [attestationStatement, setAttestationStatement] = useState(
    "I confirm the fictional district controls or may test this tenant.",
  );
  const selectedSoftwareIdRef = useRef("");

  const [attemptKind, setAttemptKind] = useState<AttemptKind>("REDIRECT");
  const [attemptUrl, setAttemptUrl] = useState(
    "https://tracker.outside.invalid/collect",
  );
  const [attemptAction, setAttemptAction] =
    useState<AuthorizationAction>("DELETE");
  const [revokeReason, setRevokeReason] = useState(
    "Fictional district test access was withdrawn.",
  );

  const selectedSoftware = useMemo(
    () => software.find((item) => item.software.id === selectedSoftwareId),
    [selectedSoftwareId, software],
  );
  const currentAuthorization = authorizations.at(-1);

  const fetchDecisions = useCallback(
    async (
      softwareId: string,
      authorizationId: string,
    ): Promise<readonly PolicyDecision[]> => {
      const result = await authorizationApi<{
        readonly decisions: readonly PolicyDecision[];
      }>(
        `/api/workspaces/${workspaceId}/software/${softwareId}/authorizations/${authorizationId}/decisions`,
      );
      return result.decisions.slice().reverse();
    },
    [workspaceId],
  );

  const fetchAuthorizationState = useCallback(
    async (softwareId: string) => {
      const result = await authorizationApi<{
        readonly authorizations: readonly TestAuthorization[];
      }>(
        `/api/workspaces/${workspaceId}/software/${softwareId}/authorizations`,
      );
      const latest = result.authorizations.at(-1);
      const nextDecisions = latest
        ? await fetchDecisions(softwareId, latest.id)
        : [];
      return {
        authorizations: result.authorizations,
        decisions: nextDecisions,
      } as const;
    },
    [fetchDecisions, workspaceId],
  );

  const refreshAuthorizationState = useCallback(
    async (softwareId: string): Promise<void> => {
      const next = await fetchAuthorizationState(softwareId);
      setAuthorizations(next.authorizations);
      setDecisions(next.decisions);
      setShowForm(next.authorizations.length === 0);
    },
    [fetchAuthorizationState],
  );

  const refreshDecisions = useCallback(
    async (softwareId: string, authorizationId: string): Promise<void> => {
      setDecisions(await fetchDecisions(softwareId, authorizationId));
    },
    [fetchDecisions],
  );

  const loadSoftware = useCallback(
    async (preferredSoftwareId?: string): Promise<void> => {
      const result = await authorizationApi<{
        readonly items: readonly SoftwareItem[];
      }>(`/api/workspaces/${workspaceId}/software`);
      setSoftware(result.items);
      const requestedSoftwareId =
        preferredSoftwareId ?? selectedSoftwareIdRef.current;
      const selected =
        result.items.find(
          (item) => item.software.id === requestedSoftwareId,
        ) ?? result.items[0];
      selectedSoftwareIdRef.current = selected?.software.id ?? "";
      setSelectedSoftwareId(selected?.software.id ?? "");
      setBaseUrl(selected?.software.authorizedTenantUrl ?? "");
    },
    [workspaceId],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    void loadSoftware()
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Pactwire could not load software for authorization.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadSoftware, principalUserId]);

  useEffect(() => {
    const inventoryChanged = () => {
      void loadSoftware().catch(() => undefined);
    };
    const setupSelected = (event: Event) => {
      const softwareId = (event as CustomEvent<{ softwareId?: unknown }>).detail
        ?.softwareId;
      void loadSoftware(
        typeof softwareId === "string" ? softwareId : undefined,
      ).catch(() => undefined);
    };
    window.addEventListener("pactwire:inventory-changed", inventoryChanged);
    window.addEventListener("pactwire:setup-software-selected", setupSelected);
    return () => {
      window.removeEventListener("pactwire:inventory-changed", inventoryChanged);
      window.removeEventListener(
        "pactwire:setup-software-selected",
        setupSelected,
      );
    };
  }, [loadSoftware]);

  useEffect(() => {
    if (!selectedSoftwareId) {
      setAuthorizations([]);
      setDecisions([]);
      return;
    }
    let active = true;
    setLoading(true);
    setError(undefined);
    void fetchAuthorizationState(selectedSoftwareId)
      .then((next) => {
        if (!active) return;
        setAuthorizations(next.authorizations);
        setDecisions(next.decisions);
        setShowForm(next.authorizations.length === 0);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Pactwire could not load test authorization.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchAuthorizationState, selectedSoftwareId]);

  function selectSoftware(softwareId: string): void {
    selectedSoftwareIdRef.current = softwareId;
    setSelectedSoftwareId(softwareId);
    const next = software.find((item) => item.software.id === softwareId);
    setBaseUrl(next?.software.authorizedTenantUrl ?? "");
    setAuthorizations([]);
    setDecisions([]);
    setLatestDecision(undefined);
  }

  function toggleAction(
    action: AuthorizationAction,
    destination: "allowed" | "prohibited",
  ): void {
    if (destination === "allowed") {
      setAllowedActions((current) =>
        current.includes(action)
          ? current.filter((candidate) => candidate !== action)
          : [...current, action],
      );
      setProhibitedActions((current) =>
        current.filter((candidate) => candidate !== action),
      );
      return;
    }
    setProhibitedActions((current) =>
      current.includes(action)
        ? current.filter((candidate) => candidate !== action)
        : [...current, action],
    );
    setAllowedActions((current) =>
      current.filter((candidate) => candidate !== action),
    );
  }

  async function submitAuthorization(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!selectedSoftwareId) return;
    setBusy(true);
    setError(undefined);
    setLatestDecision(undefined);
    try {
      await authorizationApi<{ readonly authorization: TestAuthorization }>(
        `/api/workspaces/${workspaceId}/software/${selectedSoftwareId}/authorizations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            authorityBasis,
            validFrom: localInputToIso(validFrom),
            reviewAt: localInputToIso(reviewAt),
            expiresAt: localInputToIso(expiresAt),
            allowedBaseUrl: baseUrl,
            allowedSupportingDomains: supportingDomains
              .split(/[\n,]/u)
              .map((domain) => domain.trim().toLowerCase())
              .filter(Boolean),
            allowedActions,
            prohibitedActions,
            redirectPolicy: "ALLOW_LISTED_ONLY",
            popupPolicy,
            attestation: {
              authorityConfirmed,
              syntheticAccountsOnlyConfirmed: syntheticConfirmed,
              statement: attestationStatement,
            },
          }),
        },
      );
      await refreshAuthorizationState(selectedSoftwareId);
      setShowForm(false);
      window.dispatchEvent(new Event("pactwire:setup-progress-changed"));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Pactwire could not save the authorization.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function checkQueue(): Promise<void> {
    if (!selectedSoftwareId || !currentAuthorization) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await authorizationApi<{ readonly decision: PolicyDecision }>(
        `/api/workspaces/${workspaceId}/software/${selectedSoftwareId}/authorizations/${currentAuthorization.id}/queue-check`,
        { method: "POST" },
      );
      setLatestDecision(result.decision);
    } catch (caught) {
      if (caught instanceof AuthorizationApiError && caught.decision) {
        setLatestDecision(caught.decision);
      } else {
        setError(caught instanceof Error ? caught.message : "Queue check failed.");
      }
    } finally {
      await refreshDecisions(selectedSoftwareId, currentAuthorization.id).catch(
        () => undefined,
      );
      setBusy(false);
    }
  }

  async function checkAttempt(): Promise<void> {
    if (!selectedSoftwareId || !currentAuthorization) return;
    setBusy(true);
    setError(undefined);
    try {
      const attempt =
        attemptKind === "ACTION"
          ? { kind: "ACTION", action: attemptAction }
          : { kind: attemptKind, targetUrl: attemptUrl };
      const result = await authorizationApi<{ readonly decision: PolicyDecision }>(
        `/api/workspaces/${workspaceId}/software/${selectedSoftwareId}/authorizations/${currentAuthorization.id}/decisions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ attempt }),
        },
      );
      setLatestDecision(result.decision);
      await refreshDecisions(selectedSoftwareId, currentAuthorization.id);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Policy check failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke(): Promise<void> {
    if (!selectedSoftwareId || !currentAuthorization) return;
    setBusy(true);
    setError(undefined);
    try {
      await authorizationApi(
        `/api/workspaces/${workspaceId}/software/${selectedSoftwareId}/authorizations/${currentAuthorization.id}/revoke`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: revokeReason }),
        },
      );
      await refreshAuthorizationState(selectedSoftwareId);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Revocation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="authorization-panel"
      id="authorization"
      data-testid="authorization-panel"
      aria-labelledby="authorization-heading"
    >
      <div className="authorization-heading">
        <div>
          <p className="eyebrow">Test authorization / AUT-03</p>
          <h2 id="authorization-heading">
            Define where automated tests may go and what they may do.
          </h2>
          <p>
            A signed district user sets this boundary. The runner checks the
            stored policy before every queued run, redirect, popup, and action.
          </p>
        </div>
        {currentAuthorization ? (
          <button
            className="secondary-button"
            data-testid="new-authorization"
            type="button"
            onClick={() => setShowForm((current) => !current)}
          >
            {showForm ? "Close form" : "Create new version"}
          </button>
        ) : null}
      </div>

      <div className="authorization-boundary-note">
        <strong>This authorizes testing.</strong>
        <span>
          It does not approve the software and it does not report a test result.
        </span>
      </div>

      {software.length > 0 ? (
        <label className="authorization-software-select" htmlFor="authorization-software">
          Software and exact tenant
          <select
            id="authorization-software"
            data-testid="authorization-software-select"
            value={selectedSoftwareId}
            onChange={(event) => selectSoftware(event.target.value)}
          >
            {software.map((item) => (
              <option key={item.software.id} value={item.software.id}>
                {item.software.name} — {item.software.authorizedTenantUrl}
              </option>
            ))}
          </select>
        </label>
      ) : loading ? (
        <div className="authorization-empty">Loading software…</div>
      ) : (
        <div className="authorization-empty">
          <strong>Add software before defining test authorization.</strong>
          <span>The authorization must point to one exact district tenant.</span>
        </div>
      )}

      {error ? (
        <div className="authorization-error" role="alert" data-testid="authorization-error">
          <strong>Authorization request failed</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {selectedSoftwareId && showForm ? (
        <form
          className="authorization-form"
          data-testid="authorization-form"
          onSubmit={(event) => {
            void submitAuthorization(event);
          }}
        >
          <div className="authorization-form-title">
            <div>
              <span className="step-number">01</span>
              <div>
                <h3>State the district&apos;s authority</h3>
                <p>Record why this district may test this exact tenant.</p>
              </div>
            </div>
            <span className="permission-tag mono">AUTHORIZATION_MANAGE</span>
          </div>
          <div className="authorization-fields two-column">
            <label className="full-field" htmlFor="authority-basis">
              Authority basis
              <textarea
                id="authority-basis"
                data-testid="authority-basis"
                rows={2}
                value={authorityBasis}
                onChange={(event) => setAuthorityBasis(event.target.value)}
                required
              />
            </label>
            <label htmlFor="valid-from">
              Valid from (UTC)
              <input
                id="valid-from"
                data-testid="authorization-valid-from"
                type="datetime-local"
                value={validFrom}
                onChange={(event) => setValidFrom(event.target.value)}
                required
              />
            </label>
            <label htmlFor="review-at">
              Review by (UTC)
              <input
                id="review-at"
                data-testid="authorization-review-at"
                type="datetime-local"
                value={reviewAt}
                onChange={(event) => setReviewAt(event.target.value)}
                required
              />
            </label>
            <label htmlFor="expires-at">
              Expires (UTC)
              <input
                id="expires-at"
                data-testid="authorization-expires-at"
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                required
              />
            </label>
          </div>

          <div className="authorization-form-title section-divider">
            <div>
              <span className="step-number">02</span>
              <div>
                <h3>Set exact destinations and actions</h3>
                <p>Anything not listed is blocked by deterministic code.</p>
              </div>
            </div>
          </div>
          <div className="authorization-fields two-column">
            <label className="full-field" htmlFor="authorized-base-url">
              Allowed base URL
              <input
                id="authorized-base-url"
                className="mono"
                data-testid="authorization-base-url"
                type="url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                required
              />
              <small>
                Paths on this hostname must stay under this exact base path.
              </small>
            </label>
            <label className="full-field" htmlFor="supporting-domains">
              Other allowed hostnames
              <textarea
                id="supporting-domains"
                className="mono"
                data-testid="authorization-supporting-domains"
                rows={2}
                value={supportingDomains}
                onChange={(event) => setSupportingDomains(event.target.value)}
              />
              <small>Exact hostnames only. Wildcards are not accepted.</small>
            </label>
          </div>
          <div className="action-policy-grid">
            <fieldset>
              <legend>Allowed actions</legend>
              {actions.map((action) => (
                <label key={`allowed-${action}`}>
                  <input
                    data-testid={`allow-${action}`}
                    type="checkbox"
                    checked={allowedActions.includes(action)}
                    onChange={() => toggleAction(action, "allowed")}
                  />
                  <span>
                    <strong>{action}</strong>
                    {actionLabels[action]}
                  </span>
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Prohibited actions</legend>
              {actions.map((action) => (
                <label key={`prohibited-${action}`}>
                  <input
                    data-testid={`prohibit-${action}`}
                    type="checkbox"
                    checked={prohibitedActions.includes(action)}
                    onChange={() => toggleAction(action, "prohibited")}
                  />
                  <span>
                    <strong>{action}</strong>
                    {actionLabels[action]}
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
          <div className="authorization-fields two-column policy-selects">
            <label htmlFor="redirect-policy">
              Redirect policy
              <select id="redirect-policy" value="ALLOW_LISTED_ONLY" disabled>
                <option value="ALLOW_LISTED_ONLY">
                  Allow listed destinations only
                </option>
              </select>
            </label>
            <label htmlFor="popup-policy">
              Popup policy
              <select
                id="popup-policy"
                data-testid="popup-policy"
                value={popupPolicy}
                onChange={(event) =>
                  setPopupPolicy(
                    event.target.value as
                      | "BLOCK_ALL"
                      | "ALLOW_LISTED_ONLY",
                  )
                }
              >
                <option value="BLOCK_ALL">Block every popup</option>
                <option value="ALLOW_LISTED_ONLY">
                  Allow listed destinations only
                </option>
              </select>
            </label>
          </div>

          <div className="authorization-form-title section-divider">
            <div>
              <span className="step-number">03</span>
              <div>
                <h3>Attest as the signed district user</h3>
                <p>The server records your identity, not a browser-supplied actor.</p>
              </div>
            </div>
          </div>
          <div className="attestation-box">
            <label>
              <input
                data-testid="authority-confirmed"
                type="checkbox"
                checked={authorityConfirmed}
                onChange={(event) => setAuthorityConfirmed(event.target.checked)}
                required
              />
              <span>
                I confirm the district controls this tenant or is authorized to
                test it.
              </span>
            </label>
            <label>
              <input
                data-testid="synthetic-confirmed"
                type="checkbox"
                checked={syntheticConfirmed}
                onChange={(event) => setSyntheticConfirmed(event.target.checked)}
                required
              />
              <span>I confirm the test will use fictional accounts only.</span>
            </label>
            <label htmlFor="attestation-statement">
              Recorded statement
              <textarea
                id="attestation-statement"
                data-testid="attestation-statement"
                rows={2}
                value={attestationStatement}
                onChange={(event) => setAttestationStatement(event.target.value)}
                required
              />
            </label>
          </div>
          <div className="authorization-form-actions">
            <span>
              Saving creates an immutable policy version and audit event.
            </span>
            <button
              className="primary-button"
              data-testid="save-authorization"
              disabled={
                busy ||
                !authorityConfirmed ||
                !syntheticConfirmed ||
                allowedActions.length === 0 ||
                prohibitedActions.length === 0
              }
              type="submit"
            >
              {busy ? "Saving…" : "Save authorization"}
            </button>
          </div>
        </form>
      ) : null}

      {currentAuthorization && selectedSoftware ? (
        <div className="authorization-current" data-testid="authorization-current">
          <div className="authorization-status-row">
            <div>
              <span
                className={`authorization-status ${currentAuthorization.effectiveStatus.toLowerCase().replaceAll("_", "-")}`}
                data-testid="authorization-status"
              >
                {statusLabels[currentAuthorization.effectiveStatus]}
              </span>
              <span className="mono">POLICY VERSION {currentAuthorization.version}</span>
            </div>
            <p>
              {selectedSoftware.software.name} · signed by{" "}
              <span className="mono">{currentAuthorization.attestedBy.actorId}</span>
            </p>
          </div>

          <div className="authorization-summary-grid">
            <div className="authorization-summary-main">
              <p className="card-kicker">Human authority basis</p>
              <h3>{currentAuthorization.authorityBasis}</h3>
              <div className="attestation-proof" data-testid="attestation-proof">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>Human attestation recorded</strong>
                  <p>{currentAuthorization.attestation.statement}</p>
                  <small className="mono">
                    {currentAuthorization.attestedBy.actorId} ·{" "}
                    {utcLabel(currentAuthorization.attestedAt)} UTC
                  </small>
                </div>
              </div>
            </div>
            <dl className="authorization-dates" data-testid="authorization-dates">
              <div>
                <dt>Valid from</dt>
                <dd>{utcLabel(currentAuthorization.validFrom)} UTC</dd>
              </div>
              <div>
                <dt>Review by</dt>
                <dd>{utcLabel(currentAuthorization.reviewAt)} UTC</dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd>{utcLabel(currentAuthorization.expiresAt)} UTC</dd>
              </div>
            </dl>
          </div>

          <div className="authorization-scope" data-testid="authorization-scope">
            <div className="scope-block base-scope">
              <p className="card-kicker">Allowed base URL</p>
              <strong className="mono">{currentAuthorization.allowedBaseUrl}</strong>
              <p>{currentAuthorization.allowedDomains.length} exact hostname(s)</p>
              <ul>
                {currentAuthorization.allowedDomains.map((domain) => (
                  <li className="mono" key={domain}>
                    {domain}
                  </li>
                ))}
              </ul>
            </div>
            <div className="scope-block">
              <p className="card-kicker">Allowed actions</p>
              <div className="scope-chips allowed">
                {currentAuthorization.allowedActions.map((action) => (
                  <span key={action}>{action}</span>
                ))}
              </div>
            </div>
            <div className="scope-block">
              <p className="card-kicker">Prohibited actions</p>
              <div className="scope-chips prohibited">
                {currentAuthorization.prohibitedActions.map((action) => (
                  <span key={action}>{action}</span>
                ))}
              </div>
            </div>
            <div className="scope-block policy-scope">
              <p className="card-kicker">Browser policy</p>
              <strong>Redirects: listed destinations only</strong>
              <strong>
                Popups:{" "}
                {currentAuthorization.popupPolicy === "BLOCK_ALL"
                  ? "block every popup"
                  : "listed destinations only"}
              </strong>
            </div>
          </div>

          <div className="policy-checker" data-testid="policy-checker">
            <div className="policy-checker-heading">
              <div>
                <p className="card-kicker">Deterministic gate</p>
                <h3>Check the stored policy before execution</h3>
                <p>
                  The page, model, and client cannot change the decision rules.
                </p>
              </div>
              <button
                className="secondary-button"
                data-testid="queue-check"
                disabled={busy}
                type="button"
                onClick={() => {
                  void checkQueue();
                }}
              >
                Check run queue
              </button>
            </div>
            <div className="policy-attempt-form">
              <label htmlFor="attempt-kind">
                Attempt type
                <select
                  id="attempt-kind"
                  data-testid="attempt-kind"
                  value={attemptKind}
                  onChange={(event) =>
                    setAttemptKind(event.target.value as AttemptKind)
                  }
                >
                  <option value="NAVIGATION">Navigation</option>
                  <option value="REDIRECT">Redirect</option>
                  <option value="POPUP">Popup</option>
                  <option value="ACTION">Action</option>
                </select>
              </label>
              {attemptKind === "ACTION" ? (
                <label htmlFor="attempt-action">
                  Action
                  <select
                    id="attempt-action"
                    data-testid="attempt-action"
                    value={attemptAction}
                    onChange={(event) =>
                      setAttemptAction(event.target.value as AuthorizationAction)
                    }
                  >
                    {actions.map((action) => (
                      <option key={action} value={action}>
                        {action} — {actionLabels[action]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="attempt-url" htmlFor="attempt-url">
                  Target URL
                  <input
                    id="attempt-url"
                    className="mono"
                    data-testid="attempt-url"
                    type="url"
                    value={attemptUrl}
                    onChange={(event) => setAttemptUrl(event.target.value)}
                  />
                </label>
              )}
              <button
                className="primary-button"
                data-testid="check-policy-attempt"
                disabled={busy}
                type="button"
                onClick={() => {
                  void checkAttempt();
                }}
              >
                Check attempt
              </button>
            </div>

            {latestDecision ? (
              <div
                className={`policy-result ${latestDecision.allowed ? "allowed" : "blocked"}`}
                data-testid="policy-result"
                role="status"
              >
                <span className="policy-result-mark" aria-hidden="true">
                  {latestDecision.allowed ? "✓" : "×"}
                </span>
                <div>
                  <strong>{decisionTitle(latestDecision)}</strong>
                  <p>{latestDecision.message}</p>
                  <small className="mono">
                    {latestDecision.reason}
                    {latestDecision.targetDomain
                      ? ` · ${latestDecision.targetDomain}`
                      : ""}
                    {latestDecision.action ? ` · ${latestDecision.action}` : ""}
                  </small>
                  {!latestDecision.allowed ? (
                    <span className="recorded-label">Blocked attempt recorded</span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="decision-history">
            <div>
              <p className="card-kicker">Append-only policy history</p>
              <h3>Recorded decisions</h3>
            </div>
            {decisions.length > 0 ? (
              <ol data-testid="policy-decisions">
                {decisions.slice(0, 8).map((decision) => (
                  <li key={decision.id}>
                    <span className={decision.allowed ? "allowed" : "blocked"}>
                      {decision.outcome}
                    </span>
                    <div>
                      <strong>{decision.message}</strong>
                      <small className="mono">
                        {decision.reason}
                        {decision.targetDomain ? ` · ${decision.targetDomain}` : ""}
                        {decision.action ? ` · ${decision.action}` : ""}
                      </small>
                    </div>
                    <time dateTime={decision.recordedAt}>
                      {utcLabel(decision.recordedAt)} UTC
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="decision-empty">No policy attempt has been checked.</p>
            )}
          </div>

          <details className="revoke-authorization">
            <summary>Revoke this authorization</summary>
            <div>
              <label htmlFor="revoke-reason">
                Human reason
                <input
                  id="revoke-reason"
                  data-testid="revoke-reason"
                  value={revokeReason}
                  onChange={(event) => setRevokeReason(event.target.value)}
                />
              </label>
              <button
                className="danger-button"
                data-testid="revoke-authorization"
                disabled={busy || currentAuthorization.status === "REVOKED"}
                type="button"
                onClick={() => {
                  void revoke();
                }}
              >
                Revoke authorization
              </button>
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
