"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

interface SoftwareOption {
  readonly software: { readonly id: string; readonly name: string };
}

interface AgreementPage {
  readonly pageNumber: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly text: string;
  readonly textSha256: string;
}

interface AgreementVersion {
  readonly id: string;
  readonly version: number;
  readonly sourceFileName: string;
  readonly sourceByteLength: number;
  readonly sourceSha256: string;
  readonly sourceMimeType: "application/pdf" | "text/plain";
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
  readonly createdAt: string;
  readonly createdBy: { readonly kind: "HUMAN"; readonly actorId: string };
  readonly pageMap: readonly AgreementPage[];
}

interface ApiErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly auditRecorded?: boolean;
  };
}

class AgreementApiError extends Error {
  readonly code: string | undefined;
  readonly status: number;
  readonly auditRecorded: boolean;

  constructor(response: Response, body: ApiErrorBody) {
    super(body.error?.message ?? "Pactwire could not complete the request.");
    this.code = body.error?.code;
    this.status = response.status;
    this.auditRecorded = body.error?.auditRecorded ?? false;
  }
}

async function jsonApi<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = (await response.json()) as T | ApiErrorBody;
  if (!response.ok) throw new AgreementApiError(response, body as ApiErrorBody);
  return body as T;
}

function byteLabel(value: number): string {
  return `${new Intl.NumberFormat("en-US").format(value)} bytes`;
}

function dateTimeLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

interface AgreementIntakePanelProps {
  readonly workspaceId: string;
  readonly principalUserId: string;
}

export function AgreementIntakePanel({
  workspaceId,
  principalUserId,
}: AgreementIntakePanelProps) {
  const [software, setSoftware] = useState<readonly SoftwareOption[]>([]);
  const [softwareId, setSoftwareId] = useState("");
  const [agreements, setAgreements] = useState<readonly AgreementVersion[]>([]);
  const [selectedAgreementId, setSelectedAgreementId] = useState("");
  const [file, setFile] = useState<File>();
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{
    readonly tone: "success" | "danger";
    readonly title: string;
    readonly message: string;
    readonly auditRecorded: boolean;
  }>();

  const loadSoftware = useCallback(async () => {
    const result = await jsonApi<{ readonly items: readonly SoftwareOption[] }>(
      `/api/workspaces/${workspaceId}/software`,
    );
    setSoftware(result.items);
    setSoftwareId((current) =>
      current && result.items.some((item) => item.software.id === current)
        ? current
        : (result.items[0]?.software.id ?? ""),
    );
  }, [workspaceId]);

  const loadAgreements = useCallback(async () => {
    if (!softwareId) {
      setAgreements([]);
      setSelectedAgreementId("");
      return [];
    }
    const result = await jsonApi<{ readonly agreements: readonly AgreementVersion[] }>(
      `/api/workspaces/${workspaceId}/software/${softwareId}/agreements`,
    );
    setAgreements(result.agreements);
    setSelectedAgreementId((current) =>
      current && result.agreements.some((agreement) => agreement.id === current)
        ? current
        : (result.agreements[0]?.id ?? ""),
    );
    return result.agreements;
  }, [softwareId, workspaceId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadSoftware()
      .catch((error: unknown) => {
        if (active) {
          setNotice({
            tone: "danger",
            title: "Agreement intake unavailable",
            message: error instanceof Error ? error.message : "Software could not be loaded.",
            auditRecorded: false,
          });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const inventoryChanged = () => {
      void loadSoftware().catch(() => {
        setNotice({
          tone: "danger",
          title: "Agreement intake unavailable",
          message: "The updated software list could not be loaded.",
          auditRecorded: false,
        });
      });
    };
    window.addEventListener("pactwire:inventory-changed", inventoryChanged);
    return () => {
      active = false;
      window.removeEventListener("pactwire:inventory-changed", inventoryChanged);
    };
  }, [loadSoftware, principalUserId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadAgreements()
      .catch((error: unknown) => {
        if (active) {
          setNotice({
            tone: "danger",
            title: "Agreement versions unavailable",
            message: error instanceof Error ? error.message : "Versions could not be loaded.",
            auditRecorded: false,
          });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAgreements]);

  const selectedAgreement = agreements.find(
    (agreement) => agreement.id === selectedAgreementId,
  );

  async function submitAgreement(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!file || !softwareId) return;
    setSubmitting(true);
    setNotice(undefined);
    try {
      const form = new FormData();
      form.set("file", file);
      if (effectiveFrom) form.set("effectiveFrom", effectiveFrom);
      if (effectiveUntil) form.set("effectiveUntil", effectiveUntil);
      const result = await jsonApi<{
        readonly agreement: AgreementVersion;
        readonly duplicate: boolean;
      }>(`/api/workspaces/${workspaceId}/software/${softwareId}/agreements`, {
        method: "POST",
        body: form,
      });
      await loadAgreements();
      setSelectedAgreementId(result.agreement.id);
      setNotice({
        tone: "success",
        title: result.duplicate ? "Existing version reused" : `Agreement version ${result.agreement.version} stored`,
        message: result.duplicate
          ? "These exact bytes already exist, so Pactwire reused the existing immutable version."
          : "Pactwire stored the exact original bytes and a page map for independent source checks.",
        auditRecorded: true,
      });
    } catch (error) {
      const requestError = error instanceof AgreementApiError ? error : undefined;
      setNotice({
        tone: "danger",
        title:
          requestError?.code === "AGREEMENT_CORRUPT"
            ? "Invalid PDF blocked"
            : requestError?.status === 403
              ? "Agreement upload denied"
              : "Agreement could not be stored",
        message: requestError?.message ?? "Check the file and effective dates, then try again.",
        auditRecorded: requestError?.auditRecorded ?? false,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="agreement-panel" data-testid="agreement-panel" id="agreements" aria-labelledby="agreement-heading">
      <div className="agreement-heading">
        <div>
          <p className="eyebrow">Agreement source / AGR-01</p>
          <h2 id="agreement-heading">Store the exact agreement used for every rule</h2>
          <p>
            Upload a district agreement as PDF or plain text. Pactwire keeps its original bytes, SHA-256 hash, version, uploader, dates, and page text so a reviewer can check later citations against the same document.
          </p>
        </div>
        <span className="agreement-boundary-badge">Human-uploaded source</span>
      </div>

      {notice ? (
        <div className={`agreement-notice ${notice.tone}`} data-testid="agreement-notice" role="status" aria-live="polite">
          <span aria-hidden="true">{notice.tone === "success" ? "✓" : "!"}</span>
          <div>
            <strong>{notice.title}</strong>
            <p>{notice.message}</p>
            {notice.auditRecorded ? <small>Recorded in the active workspace audit.</small> : null}
          </div>
        </div>
      ) : null}

      <div className="agreement-workspace">
        <form className="agreement-upload" data-testid="agreement-upload-form" onSubmit={(event) => void submitAgreement(event)}>
          <div className="agreement-form-heading">
            <div>
              <strong>Upload an agreement</strong>
              <p>A changed byte creates a new version. Exact duplicates reuse the existing version.</p>
            </div>
            <span>PDF or TXT · 10 MB max</span>
          </div>
          <div className="agreement-form-grid">
            <label className="wide-field">
              School software
              <select data-testid="agreement-software-select" value={softwareId} onChange={(event) => setSoftwareId(event.target.value)} disabled={software.length === 0}>
                {software.length === 0 ? <option value="">Add school software first</option> : null}
                {software.map((item) => <option key={item.software.id} value={item.software.id}>{item.software.name}</option>)}
              </select>
            </label>
            <label className="agreement-file-field wide-field">
              Agreement file
              <input data-testid="agreement-file" type="file" accept="application/pdf,text/plain,.pdf,.txt" required onChange={(event) => setFile(event.target.files?.[0])} />
              <small>{file ? `${file.name} · ${byteLabel(file.size)}` : "Choose the exact document reviewed by the district."}</small>
            </label>
            <label>
              Effective from <span className="optional-label">optional</span>
              <input data-testid="agreement-effective-from" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
            </label>
            <label>
              Effective until <span className="optional-label">optional</span>
              <input data-testid="agreement-effective-until" type="date" value={effectiveUntil} onChange={(event) => setEffectiveUntil(event.target.value)} />
            </label>
          </div>
          <div className="agreement-form-actions">
            <p>The signed session supplies the uploader identity. Browser-supplied actor claims are ignored.</p>
            <button className="primary-button" data-testid="submit-agreement" type="submit" disabled={submitting || !file || !softwareId}>
              {submitting ? "Verifying bytes…" : "Store immutable version"}
            </button>
          </div>
        </form>

        <div className="agreement-records" data-testid="agreement-version-list">
          <div className="agreement-records-heading">
            <div>
              <strong>Immutable versions</strong>
              <p>{agreements.length} {agreements.length === 1 ? "version" : "versions"} stored for this software</p>
            </div>
            {loading ? <span className="agreement-loading">Loading…</span> : null}
          </div>
          {agreements.length === 0 ? (
            <div className="agreement-empty">No agreement version stored.</div>
          ) : (
            <div className="agreement-version-tabs">
              {agreements.map((agreement) => (
                <button key={agreement.id} type="button" className={agreement.id === selectedAgreementId ? "selected" : ""} data-testid={`agreement-version-${agreement.version}`} onClick={() => setSelectedAgreementId(agreement.id)}>
                  <span>Version {agreement.version}</span>
                  <small>{agreement.sourceFileName}</small>
                </button>
              ))}
            </div>
          )}

          {selectedAgreement ? (
            <article className="agreement-record" data-testid="agreement-current-version">
              <div className="agreement-record-title">
                <div>
                  <p className="eyebrow">Version {selectedAgreement.version} · immutable</p>
                  <h3>{selectedAgreement.sourceFileName}</h3>
                </div>
                <a className="secondary-button agreement-download" data-testid="download-agreement-source" href={`/api/workspaces/${workspaceId}/software/${softwareId}/agreements/${selectedAgreement.id}/source`} download={selectedAgreement.sourceFileName}>Download original</a>
              </div>
              <dl className="agreement-metadata">
                <div><dt>Original size</dt><dd>{byteLabel(selectedAgreement.sourceByteLength)}</dd></div>
                <div><dt>Uploaded by</dt><dd>{selectedAgreement.createdBy.actorId}</dd></div>
                <div><dt>Stored at</dt><dd>{dateTimeLabel(selectedAgreement.createdAt)} UTC</dd></div>
                <div><dt>Effective dates</dt><dd>{selectedAgreement.effectiveFrom ?? "Not provided"} → {selectedAgreement.effectiveUntil ?? "No end date"}</dd></div>
                <div className="agreement-hash"><dt>Original SHA-256</dt><dd data-testid={`agreement-source-hash-${selectedAgreement.version}`}>{selectedAgreement.sourceSha256}</dd></div>
              </dl>
              <div className="source-viewer" data-testid="agreement-source-viewer">
                <div className="source-viewer-heading">
                  <div><strong>Extracted source pages</strong><p>Each page hash covers the displayed page text. The original-file hash above covers the uploaded bytes.</p></div>
                  <span>{selectedAgreement.pageMap.length} {selectedAgreement.pageMap.length === 1 ? "page" : "pages"}</span>
                </div>
                <div className="source-pages">
                  {selectedAgreement.pageMap.map((page) => (
                    <article key={page.pageNumber} data-testid={`agreement-page-${page.pageNumber}`}>
                      <header><strong>Page {page.pageNumber}</strong><span>Offsets {page.startOffset}–{page.endOffset}</span></header>
                      <pre>{page.text}</pre>
                      <footer><span>Page text SHA-256</span><code>{page.textSha256}</code></footer>
                    </article>
                  ))}
                </div>
              </div>
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}
