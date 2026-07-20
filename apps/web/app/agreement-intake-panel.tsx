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

interface RequirementProposalDetails {
  readonly plainLanguage: string;
  readonly sourceText: string;
  readonly pageNumber: number | null;
  readonly section: string | null;
  readonly dataField: string;
  readonly action: string;
  readonly recipientRestriction: string;
  readonly purposeRestriction: string | null;
  readonly ambiguity: "CLEAR" | "AMBIGUOUS";
  readonly ambiguityReason: string | null;
  readonly suggestedObservableTest: string;
}

interface RequirementProposal {
  readonly id: string;
  readonly modelRunId: string;
  readonly version: number;
  readonly status: "PROPOSED";
  readonly executable: false;
  readonly details: RequirementProposalDetails;
  readonly citation: {
    readonly page: number;
    readonly startOffset: number;
    readonly endOffset: number;
    readonly quotedTextSha256: string;
  };
  readonly proposedBy:
    | { readonly kind: "MODEL"; readonly model: string }
    | { readonly kind: "AUTOMATION"; readonly component: string };
}

interface RequirementProposalRun {
  readonly id: string;
  readonly status:
    | "SUCCEEDED"
    | "REFUSED"
    | "INCOMPLETE"
    | "INVALID_OUTPUT"
    | "UNRELATED"
    | "MODEL_MISMATCH"
    | "PROVIDER_ERROR"
    | "CITATION_MISMATCH";
  readonly provider: "OPENAI" | "DETERMINISTIC_FIXTURE";
  readonly requestedModel: string;
  readonly returnedModel?: string;
  readonly attempts: readonly unknown[];
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalTokens: number;
  readonly totalEstimatedCostMicroUsd: number;
  readonly safeMessage?: string;
  readonly createdAt: string;
}

interface RequirementProposalHistory {
  readonly runs: readonly RequirementProposalRun[];
  readonly proposals: readonly RequirementProposal[];
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
  const [proposalHistory, setProposalHistory] =
    useState<RequirementProposalHistory>({ runs: [], proposals: [] });
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalSubmitting, setProposalSubmitting] = useState(false);
  const [proposalNotice, setProposalNotice] = useState<{
    readonly tone: "success" | "danger";
    readonly title: string;
    readonly message: string;
    readonly auditRecorded: boolean;
  }>();
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

  const loadProposalHistory = useCallback(
    async (agreementVersionId: string): Promise<RequirementProposalHistory> => {
      if (!softwareId || !agreementVersionId) {
        const empty = { runs: [], proposals: [] } as const;
        setProposalHistory(empty);
        return empty;
      }
      const result = await jsonApi<RequirementProposalHistory>(
        `/api/workspaces/${workspaceId}/software/${softwareId}/agreements/${agreementVersionId}/proposals`,
      );
      setProposalHistory(result);
      return result;
    },
    [softwareId, workspaceId],
  );

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

  useEffect(() => {
    let active = true;
    if (!selectedAgreementId) {
      setProposalHistory({ runs: [], proposals: [] });
      setProposalNotice(undefined);
      return () => {
        active = false;
      };
    }
    setProposalLoading(true);
    setProposalNotice(undefined);
    void loadProposalHistory(selectedAgreementId)
      .catch((error: unknown) => {
        if (active) {
          setProposalNotice({
            tone: "danger",
            title: "Proposal history unavailable",
            message:
              error instanceof Error
                ? error.message
                : "Proposal history could not be loaded.",
            auditRecorded: false,
          });
        }
      })
      .finally(() => {
        if (active) setProposalLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadProposalHistory, selectedAgreementId]);

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

  async function generateRequirementProposals(): Promise<void> {
    if (!selectedAgreement) return;
    setProposalSubmitting(true);
    setProposalNotice(undefined);
    const path = `/api/workspaces/${workspaceId}/software/${softwareId}/agreements/${selectedAgreement.id}/proposals`;
    try {
      const result = await jsonApi<{
        readonly run: RequirementProposalRun;
        readonly proposals: readonly RequirementProposal[];
      }>(path, { method: "POST" });
      await loadProposalHistory(selectedAgreement.id);
      setProposalNotice({
        tone: "success",
        title: `${result.proposals.length} requirement ${result.proposals.length === 1 ? "proposal" : "proposals"} ready for review`,
        message:
          "Every quote matched one exact stored source span. These drafts cannot run a test or change approval.",
        auditRecorded: true,
      });
    } catch (error) {
      const requestError = error instanceof AgreementApiError ? error : undefined;
      await loadProposalHistory(selectedAgreement.id).catch(() => undefined);
      setProposalNotice({
        tone: "danger",
        title:
          requestError?.code === "REQUIREMENT_PROPOSAL_REFUSED"
            ? "Model did not return a proposal"
            : requestError?.status === 403
              ? "Proposal generation denied"
              : "No usable proposal was created",
        message:
          requestError?.message ??
          "Review the stored agreement manually or try the model again.",
        auditRecorded: requestError?.auditRecorded ?? false,
      });
    } finally {
      setProposalSubmitting(false);
    }
  }

  const latestProposalRun = proposalHistory.runs[0];
  const currentProposals = latestProposalRun
    ? proposalHistory.proposals.filter(
        (proposal) => proposal.modelRunId === latestProposalRun.id,
      )
    : [];

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
              <section className="proposal-workbench" data-testid="requirement-proposal-panel" aria-labelledby="proposal-heading">
                <div className="proposal-workbench-heading">
                  <div>
                    <p className="eyebrow">Requirement proposals / AGR-02</p>
                    <h4 id="proposal-heading">Turn agreement terms into testable drafts</h4>
                    <p>
                      GPT-5.6 can suggest what data action to test and quote the agreement. Pactwire accepts a draft only when deterministic code finds that quote in one exact stored source span.
                    </p>
                  </div>
                  <button
                    className="primary-button"
                    data-testid="generate-requirement-proposals"
                    type="button"
                    disabled={proposalSubmitting || proposalLoading}
                    onClick={() => void generateRequirementProposals()}
                  >
                    {proposalSubmitting ? "Generating proposals…" : "Generate requirement proposals"}
                  </button>
                </div>

                <div className="proposal-authority-boundary">
                  <span aria-hidden="true">!</span>
                  <div>
                    <strong>Draft only — not an agreement rule</strong>
                    <p>A proposal cannot run a test, create a finding, or change software approval. A person must review it in the next stage.</p>
                  </div>
                </div>

                {proposalNotice ? (
                  <div className={`proposal-notice ${proposalNotice.tone}`} data-testid="proposal-notice" role="status" aria-live="polite">
                    <span aria-hidden="true">{proposalNotice.tone === "success" ? "✓" : "!"}</span>
                    <div>
                      <strong>{proposalNotice.title}</strong>
                      <p>{proposalNotice.message}</p>
                      {proposalNotice.auditRecorded ? <small>Recorded in the active workspace audit.</small> : null}
                    </div>
                  </div>
                ) : null}

                {latestProposalRun ? (
                  <article className={`proposal-run ${latestProposalRun.status === "SUCCEEDED" ? "success" : "failure"}`} data-testid="proposal-run">
                    <div className="proposal-run-heading">
                      <div>
                        <span className="proposal-run-status">{latestProposalRun.status === "SUCCEEDED" ? "Structured output accepted" : "No proposal accepted"}</span>
                        <strong>{latestProposalRun.provider === "OPENAI" ? (latestProposalRun.returnedModel ?? latestProposalRun.requestedModel) : "Deterministic test adapter"}</strong>
                      </div>
                      <span>{dateTimeLabel(latestProposalRun.createdAt)} UTC</span>
                    </div>
                    <dl className="proposal-run-metrics">
                      <div><dt>Adapter</dt><dd data-testid="proposal-adapter">{latestProposalRun.provider === "OPENAI" ? "OpenAI Responses API" : "Fixture replay — not a live GPT-5.6 result"}</dd></div>
                      <div><dt>Attempts</dt><dd>{latestProposalRun.attempts.length}</dd></div>
                      <div><dt>Tokens</dt><dd>{latestProposalRun.totalTokens}</dd></div>
                      <div><dt>Estimated API cost</dt><dd data-testid="proposal-cost">${(latestProposalRun.totalEstimatedCostMicroUsd / 1_000_000).toFixed(6)}</dd></div>
                    </dl>
                    {latestProposalRun.safeMessage ? <p className="proposal-run-error">{latestProposalRun.safeMessage}</p> : null}
                  </article>
                ) : (
                  <div className="proposal-empty" data-testid="proposal-empty">
                    {proposalLoading ? "Loading proposal history…" : "No proposal run yet. The stored agreement remains available for manual review."}
                  </div>
                )}

                {currentProposals.length > 0 ? (
                  <div className="proposal-list" data-testid="requirement-proposal-list">
                    {currentProposals.map((proposal) => (
                      <article className="proposal-card" data-testid="requirement-proposal" key={proposal.id}>
                        <div className="proposal-card-heading">
                          <div>
                            <span className="proposal-draft-badge">Non-executable draft</span>
                            <h5>{proposal.details.plainLanguage}</h5>
                          </div>
                          <span>Page {proposal.citation.page} · offsets {proposal.citation.startOffset}–{proposal.citation.endOffset}</span>
                        </div>
                        <blockquote data-testid="proposal-source-quote">“{proposal.details.sourceText}”</blockquote>
                        <dl className="proposal-fields">
                          <div><dt>Data field</dt><dd>{proposal.details.dataField}</dd></div>
                          <div><dt>Action</dt><dd>{proposal.details.action}</dd></div>
                          <div><dt>Recipient restriction</dt><dd>{proposal.details.recipientRestriction}</dd></div>
                          <div><dt>Purpose restriction</dt><dd>{proposal.details.purposeRestriction ?? "Not stated in this proposal"}</dd></div>
                          <div><dt>Ambiguity</dt><dd>{proposal.details.ambiguity === "CLEAR" ? "No ambiguity identified" : proposal.details.ambiguityReason}</dd></div>
                          <div className="proposal-test"><dt>Suggested observable test</dt><dd>{proposal.details.suggestedObservableTest}</dd></div>
                        </dl>
                        <footer>
                          <span>Exact quote SHA-256</span>
                          <code>{proposal.citation.quotedTextSha256}</code>
                        </footer>
                      </article>
                    ))}
                  </div>
                ) : latestProposalRun ? (
                  <div className="proposal-empty" data-testid="requirement-proposal-list">
                    No requirement proposal was stored from this run. The stored source remains available for manual review.
                  </div>
                ) : null}
              </section>
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
