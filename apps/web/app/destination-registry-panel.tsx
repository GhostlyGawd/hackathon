"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

interface SoftwareRecord {
  readonly id: string;
  readonly name: string;
  readonly vendorName: string;
}

interface SoftwareInventoryItem {
  readonly software: SoftwareRecord;
}

interface AgreementPage {
  readonly pageNumber: number;
  readonly text: string;
}

interface AgreementVersion {
  readonly id: string;
  readonly version: number;
  readonly sourceFileName: string;
  readonly sourceSha256: string;
  readonly pageMap: readonly AgreementPage[];
}

interface DestinationClassification {
  readonly softwareId: string;
  readonly agreementVersionId: string;
  readonly status: "ALLOWED" | "PROHIBITED";
  readonly reviewedBy: { readonly actorId: string };
  readonly reviewedAt: string;
  readonly rationale: string;
}

interface DestinationVersion {
  readonly id: string;
  readonly recordId: string;
  readonly hostname: string;
  readonly version: number;
  readonly domainFacts: {
    readonly firstObservedAt: string;
    readonly lastObservedAt: string;
    readonly observationHashes: readonly string[];
  };
  readonly ownership:
    | { readonly status: "UNKNOWN" }
    | {
        readonly status: "CONFIRMED";
        readonly entityId: string;
        readonly entityName: string;
        readonly confirmedBy: { readonly actorId: string };
        readonly confirmedAt: string;
        readonly rationale: string;
      };
  readonly classifications: readonly DestinationClassification[];
  readonly sourceEvidence: readonly { readonly evidenceId: string; readonly role: string }[];
  readonly createdAt: string;
  readonly versionHash: string;
}

interface ApiErrorBody {
  readonly error?: { readonly code?: string; readonly message?: string };
}

class DestinationApiError extends Error {
  readonly code: string | undefined;

  constructor(response: Response, body: ApiErrorBody) {
    super(body.error?.message ?? `Destination request failed (${response.status}).`);
    this.name = "DestinationApiError";
    this.code = body.error?.code;
  }
}

async function destinationApi<T>(
  input: string,
  init?: RequestInit,
  signal?: AbortSignal,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(input, {
    ...init,
    ...(signal ? { signal } : {}),
    headers,
  });
  const body = (await response.json()) as T | ApiErrorBody;
  if (!response.ok) throw new DestinationApiError(response, body as ApiErrorBody);
  return body as T;
}

interface ReviewDraft {
  readonly entityId: string;
  readonly entityName: string;
  readonly classification: "ALLOWED" | "PROHIBITED";
  readonly mappingKind:
    | "DISTRICT_INVENTORY"
    | "SIGNED_AGREEMENT"
    | "VENDOR_ATTESTATION"
    | "VENDOR_CONTROLLED_DOCUMENT";
  readonly mappingTitle: string;
  readonly mappingLocator: string;
  readonly mappingSha256: string;
  readonly mappingExcerpt: string;
  readonly mappingPageNumber: string;
  readonly agreementQuote: string;
  readonly agreementPageNumber: string;
  readonly rationale: string;
}

const emptyReview: ReviewDraft = {
  entityId: "",
  entityName: "",
  classification: "ALLOWED",
  mappingKind: "SIGNED_AGREEMENT",
  mappingTitle: "",
  mappingLocator: "",
  mappingSha256: "",
  mappingExcerpt: "",
  mappingPageNumber: "1",
  agreementQuote: "",
  agreementPageNumber: "1",
  rationale: "",
};

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function classificationFor(
  destination: DestinationVersion,
  agreementVersionId: string,
): DestinationClassification | undefined {
  return destination.classifications.find(
    (classification) => classification.agreementVersionId === agreementVersionId,
  );
}

export function DestinationRegistryPanel({
  workspaceId,
}: {
  readonly workspaceId: string;
}) {
  const [destinations, setDestinations] = useState<readonly DestinationVersion[]>([]);
  const [history, setHistory] = useState<readonly DestinationVersion[]>([]);
  const [software, setSoftware] = useState<readonly SoftwareRecord[]>([]);
  const [agreements, setAgreements] = useState<readonly AgreementVersion[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState("");
  const [selectedAgreementId, setSelectedAgreementId] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [hostname, setHostname] = useState("");
  const [observationSha256, setObservationSha256] = useState("");
  const [observationLocator, setObservationLocator] = useState("");
  const [review, setReview] = useState<ReviewDraft>(emptyReview);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<
    { readonly tone: "info" | "success" | "danger"; readonly title: string; readonly message: string } | undefined
  >();

  const selectedDestination = useMemo(
    () => destinations.find((item) => item.recordId === selectedRecordId),
    [destinations, selectedRecordId],
  );
  const selectedAgreement = useMemo(
    () => agreements.find((agreement) => agreement.id === selectedAgreementId),
    [agreements, selectedAgreementId],
  );

  const loadHistory = useCallback(
    async (recordId: string, signal?: AbortSignal): Promise<void> => {
      if (!recordId) {
        setHistory([]);
        return;
      }
      const result = await destinationApi<{
        readonly history: readonly DestinationVersion[];
      }>(
        `/api/workspaces/${workspaceId}/destinations?recordId=${encodeURIComponent(recordId)}`,
        undefined,
        signal,
      );
      setHistory(result.history);
    },
    [workspaceId],
  );

  const loadAll = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setLoading(true);
      try {
        const [destinationResult, softwareResult] = await Promise.all([
          destinationApi<{ readonly destinations: readonly DestinationVersion[] }>(
            `/api/workspaces/${workspaceId}/destinations`,
            undefined,
            signal,
          ),
          destinationApi<{ readonly items: readonly SoftwareInventoryItem[] }>(
            `/api/workspaces/${workspaceId}/software`,
            undefined,
            signal,
          ),
        ]);
        setDestinations(destinationResult.destinations);
        const softwareItems = softwareResult.items.map((item) => item.software);
        setSoftware(softwareItems);
        const softwareId =
          softwareItems.find((item) => item.id === selectedSoftwareId)?.id ??
          softwareItems[0]?.id ??
          "";
        setSelectedSoftwareId(softwareId);
        if (softwareId) {
          const agreementResult = await destinationApi<{
            readonly agreements: readonly AgreementVersion[];
          }>(
            `/api/workspaces/${workspaceId}/software/${softwareId}/agreements`,
            undefined,
            signal,
          );
          setAgreements(agreementResult.agreements);
          setSelectedAgreementId((current) =>
            agreementResult.agreements.some((agreement) => agreement.id === current)
              ? current
              : (agreementResult.agreements[0]?.id ?? ""),
          );
        } else {
          setAgreements([]);
          setSelectedAgreementId("");
        }
        if (selectedRecordId) await loadHistory(selectedRecordId, signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNotice({
          tone: "danger",
          title: "Destination registry unavailable",
          message: error instanceof Error ? error.message : "The registry could not be loaded.",
        });
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    }, [loadHistory, selectedRecordId, selectedSoftwareId, workspaceId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadAll(controller.signal);
    return () => controller.abort();
  }, [loadAll]);

  async function changeSoftware(softwareId: string): Promise<void> {
    setSelectedSoftwareId(softwareId);
    setAgreements([]);
    setSelectedAgreementId("");
    if (!softwareId) return;
    try {
      const result = await destinationApi<{
        readonly agreements: readonly AgreementVersion[];
      }>(`/api/workspaces/${workspaceId}/software/${softwareId}/agreements`);
      setAgreements(result.agreements);
      setSelectedAgreementId(result.agreements[0]?.id ?? "");
    } catch (error) {
      setNotice({
        tone: "danger",
        title: "Agreement versions unavailable",
        message: error instanceof Error ? error.message : "Agreement versions could not be loaded.",
      });
    }
  }

  async function observeDestination(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setNotice(undefined);
    try {
      const version = await destinationApi<DestinationVersion>(
        `/api/workspaces/${workspaceId}/destinations`,
        {
          method: "POST",
          body: JSON.stringify({
            hostname,
            observationSha256,
            sourceTitle: "Deterministic recorder destination capture",
            sourceLocator: observationLocator,
          }),
        },
      );
      setDestinations((current) => [
        ...current.filter((item) => item.recordId !== version.recordId),
        version,
      ].sort((left, right) => left.hostname.localeCompare(right.hostname)));
      setSelectedRecordId(version.recordId);
      await loadHistory(version.recordId);
      setHostname("");
      setObservationSha256("");
      setObservationLocator("");
      setReview(emptyReview);
      setNotice({
        tone: "info",
        title: "Destination recorded as UNKNOWN",
        message:
          "Pactwire stored the observed hostname and capture evidence. It did not infer a company or agreement status.",
      });
    } catch (error) {
      setNotice({
        tone: "danger",
        title: "Destination not recorded",
        message: error instanceof Error ? error.message : "The observation could not be stored.",
      });
    } finally {
      setSaving(false);
    }
  }

  function selectDestination(destination: DestinationVersion): void {
    setSelectedRecordId(destination.recordId);
    setReview(emptyReview);
    void loadHistory(destination.recordId);
  }

  async function confirmDestination(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!selectedDestination || !selectedAgreementId || !selectedSoftwareId) return;
    setSaving(true);
    setNotice(undefined);
    try {
      const version = await destinationApi<DestinationVersion>(
        `/api/workspaces/${workspaceId}/destinations/${selectedDestination.recordId}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            sourceVersionId: selectedDestination.id,
            softwareId: selectedSoftwareId,
            agreementVersionId: selectedAgreementId,
            entityId: review.entityId,
            entityName: review.entityName,
            classification: review.classification,
            mappingEvidence: {
              kind: review.mappingKind,
              title: review.mappingTitle,
              locator: review.mappingLocator,
              sourceSha256: review.mappingSha256,
              excerpt: review.mappingExcerpt,
              pageNumber: review.mappingPageNumber
                ? Number(review.mappingPageNumber)
                : null,
            },
            agreementQuote: review.agreementQuote,
            agreementPageNumber: Number(review.agreementPageNumber),
            rationale: review.rationale,
          }),
        },
      );
      setDestinations((current) =>
        current.map((item) => (item.recordId === version.recordId ? version : item)),
      );
      await loadHistory(version.recordId);
      setNotice({
        tone: "success",
        title: `${review.classification} recorded by a person`,
        message:
          "The entity mapping and recipient status are tied to the cited source and exact agreement version.",
      });
    } catch (error) {
      setNotice({
        tone: "danger",
        title: "Destination review not saved",
        message: error instanceof Error ? error.message : "The review could not be saved.",
      });
    } finally {
      setSaving(false);
    }
  }

  function updateReview<K extends keyof ReviewDraft>(
    field: K,
    value: ReviewDraft[K],
  ): void {
    setReview((current) => ({ ...current, [field]: value }));
  }

  return (
    <section className="destination-panel" data-testid="destination-registry-panel">
      <div className="destination-heading">
        <div>
          <p className="eyebrow">Destination registry · human authority</p>
          <h2>Connect observed hostnames to real companies only with evidence.</h2>
          <p>
            A captured hostname starts as UNKNOWN. Pactwire assigns a company and an
            allowed or prohibited recipient status only after a person checks the
            source and the exact stored agreement version.
          </p>
        </div>
        <button
          className="destination-refresh"
          data-testid="destination-refresh"
          disabled={loading}
          onClick={() => void loadAll()}
          type="button"
        >
          {loading ? "Refreshing…" : "Refresh sources"}
        </button>
      </div>

      <div className="destination-boundary">
        <strong>Default: UNKNOWN</strong>
        <span>Recorder data proves a hostname was observed. It does not prove who owns it.</span>
      </div>

      {notice ? (
        <div className={`destination-notice ${notice.tone}`} data-testid="destination-notice" role="status">
          <strong>{notice.title}</strong>
          <span>{notice.message}</span>
        </div>
      ) : null}

      <form className="destination-observe" onSubmit={(event) => void observeDestination(event)}>
        <div className="destination-section-title">
          <span>01</span>
          <div>
            <h3>Import a recorder observation</h3>
            <p>Store the exact hostname, capture hash, and source locator. No entity is inferred.</p>
          </div>
        </div>
        <div className="destination-form-grid observation-grid">
          <label>
            Exact hostname
            <input
              data-testid="destination-hostname"
              onChange={(event) => setHostname(event.target.value)}
              placeholder="service.example.test"
              required
              value={hostname}
            />
          </label>
          <label>
            Capture SHA-256
            <input
              data-testid="destination-observation-hash"
              minLength={64}
              maxLength={64}
              onChange={(event) => setObservationSha256(event.target.value)}
              placeholder="64 lowercase hex characters"
              required
              value={observationSha256}
            />
          </label>
          <label>
            Capture locator
            <input
              data-testid="destination-observation-locator"
              onChange={(event) => setObservationLocator(event.target.value)}
              placeholder="run://…/observation/…"
              required
              value={observationLocator}
            />
          </label>
          <button data-testid="observe-destination" disabled={saving} type="submit">
            Record as UNKNOWN
          </button>
        </div>
      </form>

      <div className="destination-layout">
        <div className="destination-list" data-testid="destination-list">
          <div className="destination-list-heading">
            <div>
              <p className="eyebrow">Latest immutable versions</p>
              <h3>Observed destinations</h3>
            </div>
            <span>{destinations.length}</span>
          </div>
          {destinations.length === 0 ? (
            <div className="destination-empty">No recorder destination has been imported.</div>
          ) : (
            destinations.map((destination) => {
              const classification = classificationFor(destination, selectedAgreementId);
              const status =
                destination.ownership.status === "UNKNOWN"
                  ? "UNKNOWN"
                  : (classification?.status ?? "UNREVIEWED");
              return (
                <article
                  className={`destination-card ${selectedRecordId === destination.recordId ? "selected" : ""}`}
                  data-hostname={destination.hostname}
                  data-testid="destination-card"
                  key={destination.recordId}
                >
                  <div className="destination-card-topline">
                    <span className={`destination-status ${status.toLowerCase()}`} data-testid="destination-status">
                      {status}
                    </span>
                    <span className="mono">v{destination.version}</span>
                  </div>
                  <h4>{destination.hostname}</h4>
                  {destination.ownership.status === "UNKNOWN" ? (
                    <p data-testid="destination-unknown-copy">
                      No company or agreement status assigned. A person has not confirmed the entity mapping.
                    </p>
                  ) : (
                    <div className="destination-confirmed-copy">
                      <strong>{destination.ownership.entityName}</strong>
                      <span>Human-confirmed by {destination.ownership.confirmedBy.actorId}</span>
                      {classification ? (
                        <span>Exact agreement version: {classification.agreementVersionId}</span>
                      ) : (
                        <span>No review for the selected agreement version.</span>
                      )}
                    </div>
                  )}
                  <div className="destination-card-meta">
                    <span>{destination.domainFacts.observationHashes.length} recorder observation</span>
                    <span>{destination.sourceEvidence.length} retained source record</span>
                  </div>
                  <button
                    data-testid="select-destination"
                    onClick={() => selectDestination(destination)}
                    type="button"
                  >
                    {selectedRecordId === destination.recordId ? "Selected for review" : "Review evidence"}
                  </button>
                </article>
              );
            })
          )}
        </div>

        <div className="destination-review" data-testid="destination-review-panel">
          <div className="destination-section-title">
            <span>02</span>
            <div>
              <h3>Human evidence review</h3>
              <p>Confirm the entity mapping and classify it for one exact agreement version.</p>
            </div>
          </div>
          {!selectedDestination ? (
            <div className="destination-empty review-empty">Select an observed destination to review it.</div>
          ) : (
            <form onSubmit={(event) => void confirmDestination(event)}>
              <div className="destination-review-target">
                <span>Reviewing</span>
                <strong>{selectedDestination.hostname}</strong>
                <small>Source version {selectedDestination.version} · {selectedDestination.versionHash.slice(0, 16)}…</small>
              </div>
              <div className="destination-form-grid two-column">
                <label>
                  Software
                  <select
                    data-testid="destination-software-select"
                    onChange={(event) => void changeSoftware(event.target.value)}
                    required
                    value={selectedSoftwareId}
                  >
                    <option value="">Choose software</option>
                    {software.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label>
                  Exact agreement version
                  <select
                    data-testid="destination-agreement-select"
                    onChange={(event) => setSelectedAgreementId(event.target.value)}
                    required
                    value={selectedAgreementId}
                  >
                    <option value="">Choose agreement</option>
                    {agreements.map((agreement) => (
                      <option key={agreement.id} value={agreement.id}>
                        v{agreement.version} · {agreement.sourceFileName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Entity ID
                  <input data-testid="destination-entity-id" onChange={(event) => updateReview("entityId", event.target.value)} required value={review.entityId} />
                </label>
                <label>
                  Confirmed company or entity
                  <input data-testid="destination-entity-name" onChange={(event) => updateReview("entityName", event.target.value)} required value={review.entityName} />
                </label>
                <label>
                  Agreement recipient status
                  <select data-testid="destination-classification" onChange={(event) => updateReview("classification", event.target.value as ReviewDraft["classification"])} value={review.classification}>
                    <option value="ALLOWED">ALLOWED</option>
                    <option value="PROHIBITED">PROHIBITED</option>
                  </select>
                </label>
                <label>
                  Mapping source type
                  <select data-testid="destination-mapping-kind" onChange={(event) => updateReview("mappingKind", event.target.value as ReviewDraft["mappingKind"])} value={review.mappingKind}>
                    <option value="SIGNED_AGREEMENT">Signed agreement</option>
                    <option value="DISTRICT_INVENTORY">District inventory</option>
                    <option value="VENDOR_ATTESTATION">Vendor attestation</option>
                    <option value="VENDOR_CONTROLLED_DOCUMENT">Vendor-controlled document</option>
                  </select>
                </label>
                <label>
                  Mapping source title
                  <input data-testid="destination-mapping-title" onChange={(event) => updateReview("mappingTitle", event.target.value)} required value={review.mappingTitle} />
                </label>
                <label>
                  Mapping source locator
                  <input data-testid="destination-mapping-locator" onChange={(event) => updateReview("mappingLocator", event.target.value)} required value={review.mappingLocator} />
                </label>
                <label>
                  Mapping source SHA-256
                  <input data-testid="destination-mapping-hash" maxLength={64} minLength={64} onChange={(event) => updateReview("mappingSha256", event.target.value)} required value={review.mappingSha256} />
                </label>
                <label>
                  Mapping source page
                  <input data-testid="destination-mapping-page" min="1" onChange={(event) => updateReview("mappingPageNumber", event.target.value)} required type="number" value={review.mappingPageNumber} />
                </label>
              </div>
              <label className="destination-wide-field">
                Exact excerpt connecting hostname to entity
                <textarea data-testid="destination-mapping-excerpt" onChange={(event) => updateReview("mappingExcerpt", event.target.value)} required value={review.mappingExcerpt} />
              </label>
              <div className="destination-form-grid agreement-quote-grid">
                <label>
                  Exact agreement quote for recipient status
                  <textarea data-testid="destination-agreement-quote" onChange={(event) => updateReview("agreementQuote", event.target.value)} required value={review.agreementQuote} />
                </label>
                <label>
                  Agreement page
                  <input data-testid="destination-agreement-page" min="1" onChange={(event) => updateReview("agreementPageNumber", event.target.value)} required type="number" value={review.agreementPageNumber} />
                </label>
              </div>
              <label className="destination-wide-field">
                Human review rationale
                <textarea data-testid="destination-review-rationale" onChange={(event) => updateReview("rationale", event.target.value)} required value={review.rationale} />
              </label>
              <div className="destination-source-preview">
                <strong>Selected source</strong>
                {selectedAgreement ? (
                  <>
                    <span>{selectedAgreement.sourceFileName} · v{selectedAgreement.version}</span>
                    <code>{selectedAgreement.sourceSha256}</code>
                    <p>{selectedAgreement.pageMap[0]?.text ?? "No readable page text."}</p>
                  </>
                ) : (
                  <span>Choose an agreement version before confirming.</span>
                )}
              </div>
              <button className="destination-confirm" data-testid="confirm-destination" disabled={saving || !selectedAgreementId} type="submit">
                Confirm entity and recipient status
              </button>
            </form>
          )}
        </div>
      </div>

      {selectedDestination ? (
        <div className="destination-history" data-testid="destination-version-history">
          <div>
            <p className="eyebrow">Append-only evidence</p>
            <h3>Version history for {selectedDestination.hostname}</h3>
          </div>
          <div className="destination-history-list">
            {history.map((version) => (
              <article data-testid="destination-history-version" key={version.id}>
                <span className="mono">v{version.version}</span>
                <strong>{version.ownership.status}</strong>
                <span>{displayDate(version.createdAt)}</span>
                <code>{version.versionHash.slice(0, 20)}…</code>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
