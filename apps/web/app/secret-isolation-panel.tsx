"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

interface SoftwareItem {
  readonly id: string;
  readonly name: string;
  readonly vendorName: string;
}

interface SoftwareInventoryItem {
  readonly software: SoftwareItem;
}

interface SecretMetadata {
  readonly id: string;
  readonly label: string;
  readonly kind: "PASSWORD" | "API_TOKEN" | "SESSION_COOKIE";
  readonly status: "ACTIVE" | "REVOKED";
  readonly keyVersion: string;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly revokedAt?: string;
}

interface RedactionPreview {
  readonly before: {
    readonly configuredRepresentationCount: number;
    readonly detected: true;
  };
  readonly after: unknown;
  readonly redactionCount: number;
  readonly marker: string;
  readonly screenshotMaskSelectors: readonly string[];
}

interface ErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly auditRecorded?: boolean;
  };
}

class SecretApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly auditRecorded: boolean;

  constructor(response: Response, body: ErrorBody) {
    super(body.error?.message ?? "Pactwire could not complete the request.");
    this.status = response.status;
    this.code = body.error?.code ?? "REQUEST_FAILED";
    this.auditRecorded = body.error?.auditRecorded ?? false;
  }
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = (await response.json()) as T | ErrorBody;
  if (!response.ok) throw new SecretApiError(response, body as ErrorBody);
  return body as T;
}

const kindLabels = Object.freeze({
  PASSWORD: "Password",
  API_TOKEN: "API token",
  SESSION_COOKIE: "Session cookie",
});

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SecretIsolationPanel({
  workspaceId,
  principalUserId,
}: {
  readonly workspaceId: string;
  readonly principalUserId: string;
}) {
  const [software, setSoftware] = useState<readonly SoftwareItem[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState("");
  const [secrets, setSecrets] = useState<readonly SecretMetadata[]>([]);
  const [label, setLabel] = useState("Fictional test login");
  const [kind, setKind] = useState<SecretMetadata["kind"]>("PASSWORD");
  const [value, setValue] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [preview, setPreview] = useState<RedactionPreview>();
  const [notice, setNotice] = useState<{
    readonly tone: "safe" | "denied" | "neutral";
    readonly title: string;
    readonly message: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadSecrets = useCallback(
    async (softwareId: string): Promise<readonly SecretMetadata[]> => {
      if (!softwareId) return [];
      const result = await request<{ readonly secrets: readonly SecretMetadata[] }>(
        `/api/workspaces/${workspaceId}/software/${softwareId}/secrets`,
      );
      return result.secrets;
    },
    [principalUserId, workspaceId],
  );

  useEffect(() => {
    let active = true;
    async function load(): Promise<void> {
      setSoftware([]);
      setSelectedSoftwareId("");
      setSecrets([]);
      setPreview(undefined);
      setNotice(undefined);
      setLoading(true);
      try {
        const result = await request<{
          readonly items: readonly SoftwareInventoryItem[];
        }>(
          `/api/workspaces/${workspaceId}/software`,
        );
        if (!active) return;
        const softwareItems = result.items.map((item) => item.software);
        setSoftware(softwareItems);
        setSelectedSoftwareId((current) =>
          softwareItems.some((item) => item.id === current)
            ? current
            : (softwareItems[0]?.id ?? ""),
        );
      } catch (error) {
        if (!active) return;
        setNotice({
          tone: "denied",
          title: "Credential controls unavailable",
          message: error instanceof Error ? error.message : "Please try again.",
        });
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [principalUserId, workspaceId]);

  useEffect(() => {
    let active = true;
    setPreview(undefined);
    setNotice(undefined);
    setSecrets([]);
    void loadSecrets(selectedSoftwareId)
      .then((nextSecrets) => {
        if (active) setSecrets(nextSecrets);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setNotice({
          tone: "denied",
          title: "Saved credential metadata unavailable",
          message: error instanceof Error ? error.message : "Please try again.",
        });
      });
    return () => {
      active = false;
    };
  }, [loadSecrets, selectedSoftwareId]);

  async function saveSecret(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!selectedSoftwareId || value.length < 12) return;
    setBusy(true);
    setPreview(undefined);
    try {
      await request<{ readonly secret: SecretMetadata }>(
        `/api/workspaces/${workspaceId}/software/${selectedSoftwareId}/secrets`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            label,
            kind,
            value,
            ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
          }),
        },
      );
      setValue("");
      setNotice({
        tone: "safe",
        title: "Credential encrypted",
        message:
          "The page keeps metadata only. Pactwire can release the value only to one authorized browser harness context.",
      });
      setSecrets(await loadSecrets(selectedSoftwareId));
    } catch (error) {
      setValue("");
      setNotice({
        tone: "denied",
        title: "Credential not saved",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function tryRawAccess(secretId: string): Promise<void> {
    setBusy(true);
    setPreview(undefined);
    try {
      await request(
        `/api/workspaces/${workspaceId}/software/${selectedSoftwareId}/secrets/${secretId}/raw-access`,
        { method: "POST" },
      );
      setNotice({
        tone: "denied",
        title: "Unexpected response",
        message: "The raw credential boundary did not return the expected denial.",
      });
    } catch (error) {
      const denial = error instanceof SecretApiError ? error : undefined;
      setNotice({
        tone: "denied",
        title: denial?.status === 403 ? "Raw access blocked" : "Request failed",
        message:
          denial?.status === 403
            ? `Pages, people, and model prompts cannot read saved values. ${
                denial.auditRecorded ? "The denied attempt was recorded." : ""
              }`
            : (denial?.message ?? "Please try again."),
      });
    } finally {
      setBusy(false);
    }
  }

  async function previewRedaction(secretId: string): Promise<void> {
    setBusy(true);
    try {
      const result = await request<{ readonly preview: RedactionPreview }>(
        `/api/workspaces/${workspaceId}/software/${selectedSoftwareId}/secrets/${secretId}/preview`,
        { method: "POST" },
      );
      setPreview(result.preview);
      setNotice({
        tone: "safe",
        title: "Normal outputs are redacted",
        message: `${result.preview.redactionCount} appearances were replaced before prompt, log, screenshot, or export use.`,
      });
    } catch (error) {
      setNotice({
        tone: "denied",
        title: "Preview unavailable",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(secretId: string): Promise<void> {
    setBusy(true);
    try {
      await request(
        `/api/workspaces/${workspaceId}/software/${selectedSoftwareId}/secrets/${secretId}/revoke`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "Removed from the fictional test fixture" }),
        },
      );
      setPreview(undefined);
      setNotice({
        tone: "neutral",
        title: "Credential revoked",
        message: "The browser harness can no longer request a lease for this credential.",
      });
      setSecrets(await loadSecrets(selectedSoftwareId));
    } catch (error) {
      setNotice({
        tone: "denied",
        title: "Revocation failed",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  const activeSecret = secrets.find((secret) => secret.status === "ACTIVE");

  return (
    <section
      className="secret-panel"
      id="credentials"
      data-testid="secret-panel"
      aria-labelledby="secret-heading"
    >
      <div className="secret-heading">
        <div>
          <p className="eyebrow">Credential isolation / AUT-04</p>
          <h2 id="secret-heading">
            Keep test credentials out of pages, model prompts, logs, screenshots,
            and exports.
          </h2>
          <p>
            Pactwire encrypts each saved value. A person can see its label and
            status, while only one short-lived authorized browser harness context
            can use the value.
          </p>
        </div>
        <div className="secret-boundary-badge">
          <span className="status-dot" /> Raw values: harness only
        </div>
      </div>

      {software.length === 0 && !loading ? (
        <div className="secret-empty">
          <strong>Add approved software first</strong>
          <span>A credential must belong to a software record in this workspace.</span>
        </div>
      ) : (
        <>
          <label className="secret-software-select" htmlFor="secret-software">
            Software
            <select
              id="secret-software"
              data-testid="secret-software-select"
              value={selectedSoftwareId}
              onChange={(event) => setSelectedSoftwareId(event.target.value)}
            >
              {software.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {item.vendorName}
                </option>
              ))}
            </select>
          </label>

          <div className="secret-layout">
            <form
              className="secret-form"
              data-testid="secret-form"
              onSubmit={(event) => void saveSecret(event)}
            >
              <div className="secret-card-title">
                <span className="step-number">01</span>
                <div>
                  <h3>Encrypt a fictional test credential</h3>
                  <p>The value is write-only from this management page.</p>
                </div>
              </div>
              <div className="secret-form-grid">
                <label htmlFor="secret-label">
                  Label
                  <input
                    id="secret-label"
                    data-testid="secret-label"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                </label>
                <label htmlFor="secret-kind">
                  Type
                  <select
                    id="secret-kind"
                    data-testid="secret-kind"
                    value={kind}
                    onChange={(event) =>
                      setKind(event.target.value as SecretMetadata["kind"])
                    }
                  >
                    <option value="PASSWORD">Password</option>
                    <option value="API_TOKEN">API token</option>
                    <option value="SESSION_COOKIE">Session cookie</option>
                  </select>
                </label>
                <label className="secret-value-field" htmlFor="secret-value">
                  Fictional value
                  <input
                    id="secret-value"
                    type="password"
                    autoComplete="new-password"
                    data-secret="true"
                    data-testid="secret-value"
                    minLength={12}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                  />
                  <small>At least 12 characters. Never use a real password.</small>
                </label>
                <label htmlFor="secret-expiry">
                  Optional expiry
                  <input
                    id="secret-expiry"
                    data-testid="secret-expiry"
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                  />
                </label>
              </div>
              <button
                className="primary-button"
                data-testid="store-secret"
                disabled={busy || value.length < 12 || !selectedSoftwareId}
                type="submit"
              >
                Encrypt credential
              </button>
            </form>

            <div className="secret-records">
              <div className="secret-card-title">
                <span className="step-number">02</span>
                <div>
                  <h3>Verify what normal users can see</h3>
                  <p>Only metadata crosses this API boundary.</p>
                </div>
              </div>
              <div className="secret-list" data-testid="secret-list">
                {secrets.length === 0 ? (
                  <div className="secret-empty compact">
                    <strong>No credentials saved</strong>
                    <span>Use the form to create a fictional credential.</span>
                  </div>
                ) : (
                  secrets.map((secret) => (
                    <article
                      className="secret-record"
                      data-testid="secret-record"
                      key={secret.id}
                    >
                      <div className="secret-record-topline">
                        <div>
                          <span className={`secret-state ${secret.status.toLowerCase()}`}>
                            {secret.status}
                          </span>
                          <h4>{secret.label}</h4>
                        </div>
                        <span className="mono">{kindLabels[secret.kind]}</span>
                      </div>
                      <dl>
                        <div>
                          <dt>Created</dt>
                          <dd>{formatDate(secret.createdAt)}</dd>
                        </div>
                        <div>
                          <dt>Key version</dt>
                          <dd className="mono">{secret.keyVersion}</dd>
                        </div>
                      </dl>
                      {secret.status === "ACTIVE" ? (
                        <div className="secret-actions">
                          <button
                            className="secondary-button"
                            data-testid="raw-secret-access"
                            disabled={busy}
                            type="button"
                            onClick={() => void tryRawAccess(secret.id)}
                          >
                            Try raw access
                          </button>
                          <button
                            className="secondary-button"
                            data-testid="preview-secret-redaction"
                            disabled={busy}
                            type="button"
                            onClick={() => void previewRedaction(secret.id)}
                          >
                            Preview redaction
                          </button>
                          <button
                            className="text-button"
                            data-testid="revoke-secret"
                            disabled={busy}
                            type="button"
                            onClick={() => void revoke(secret.id)}
                          >
                            Revoke
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {notice ? (
        <div
          className={`secret-notice ${notice.tone}`}
          data-testid="secret-notice"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true">{notice.tone === "denied" ? "!" : "✓"}</span>
          <div>
            <strong>{notice.title}</strong>
            <p>{notice.message}</p>
          </div>
        </div>
      ) : null}

      {preview && activeSecret ? (
        <div className="redaction-proof" data-testid="redaction-preview">
          <div className="redaction-proof-heading">
            <div>
              <p className="eyebrow">Safe output preview</p>
              <h3>Every configured representation was replaced</h3>
            </div>
            <span className="redaction-count">
              {preview.redactionCount} replacements
            </span>
          </div>
          <div className="redaction-proof-grid">
            <div>
              <span>Before redaction</span>
              <strong>{preview.before.configuredRepresentationCount} forms detected</strong>
              <p>Raw and encoded forms were present. Their bytes are not returned here.</p>
            </div>
            <div className="redacted-output">
              <span>After redaction</span>
              <pre>{JSON.stringify(preview.after, null, 2)}</pre>
            </div>
          </div>
          <p className="redaction-footnote mono">
            {preview.marker} · {preview.screenshotMaskSelectors.length} screenshot mask rules
          </p>
        </div>
      ) : null}
    </section>
  );
}
