"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type ApprovalState =
  | "UNKNOWN"
  | "APPROVED"
  | "HOLD"
  | "REJECTED"
  | "RETIRED";

interface SoftwareInventoryItem {
  readonly software: {
    readonly id: string;
    readonly name: string;
    readonly vendorName: string;
    readonly authorizedTenantUrl: string;
    readonly districtOwner: string;
    readonly knownVersion?: string;
    readonly approvalState: ApprovalState;
    readonly approvalOrigin: {
      readonly reason: string;
      readonly sourceReference?: string;
      readonly setBy: {
        readonly kind: "HUMAN" | "IMPORTED_SYSTEM";
        readonly actorId: string;
        readonly displayName: string;
      };
    };
  };
  readonly approvalDescription: {
    readonly heading: string;
    readonly detail: string;
    readonly isPactwireConclusion: false;
  };
  readonly latestRun: null | {
    readonly state: string;
    readonly occurredAt: string;
    readonly boundedSummary: string;
  };
  readonly findingCounts: {
    readonly witnessedConflicts: number;
    readonly needsReview: number;
    readonly notVisible: number;
    readonly notTested: number;
  };
  readonly agreementVersion: number | null;
  readonly authorizationReviewAt: string | null;
  readonly nextSafeAction: {
    readonly code: string;
    readonly label: string;
  };
}

interface ApiErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly auditRecorded?: boolean;
  };
}

class InventoryApiError extends Error {
  readonly status: number;
  readonly auditRecorded: boolean;

  constructor(response: Response, body: ApiErrorBody) {
    super(body.error?.message ?? "Pactwire could not complete the request.");
    this.status = response.status;
    this.auditRecorded = body.error?.auditRecorded ?? false;
  }
}

async function inventoryApi<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const body = (await response.json()) as T | ApiErrorBody;
  if (!response.ok) {
    throw new InventoryApiError(response, body as ApiErrorBody);
  }
  return body as T;
}

const approvalLabels: Readonly<Record<ApprovalState, string>> = {
  UNKNOWN: "Unknown",
  APPROVED: "Approved",
  HOLD: "Hold",
  REJECTED: "Rejected",
  RETIRED: "Retired",
};

interface SoftwareInventoryProps {
  readonly workspaceId: string;
  readonly principalUserId: string;
}

export function SoftwareInventory({
  workspaceId,
  principalUserId,
}: SoftwareInventoryProps) {
  const [items, setItems] = useState<readonly SoftwareInventoryItem[]>([]);
  const [approvalFilter, setApprovalFilter] = useState<"ALL" | ApprovalState>(
    "ALL",
  );
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    readonly tone: "success" | "danger";
    readonly title: string;
    readonly message: string;
    readonly auditRecorded: boolean;
  }>();
  const [name, setName] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [tenantUrl, setTenantUrl] = useState("");
  const [districtOwner, setDistrictOwner] = useState("");
  const [knownVersion, setKnownVersion] = useState("");
  const [approvalState, setApprovalState] =
    useState<ApprovalState>("UNKNOWN");
  const [setterKind, setSetterKind] = useState<
    "HUMAN" | "IMPORTED_SYSTEM"
  >("IMPORTED_SYSTEM");
  const [setterId, setSetterId] = useState("");
  const [setterName, setSetterName] = useState("");
  const [source, setSource] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [reason, setReason] = useState("");

  const fetchInventory = useCallback(
    async (): Promise<readonly SoftwareInventoryItem[]> => {
      const parameters = new URLSearchParams();
      if (approvalFilter !== "ALL") {
        parameters.set("approvalState", approvalFilter);
      }
      if (query.trim()) parameters.set("query", query.trim());
      const suffix = parameters.size > 0 ? `?${parameters.toString()}` : "";
      const result = await inventoryApi<{
        readonly items: readonly SoftwareInventoryItem[];
      }>(`/api/workspaces/${workspaceId}/software${suffix}`);
      return result.items;
    },
    [approvalFilter, query, workspaceId],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(undefined);
    void fetchInventory()
      .then((nextItems) => {
        if (active) setItems(nextItems);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Pactwire could not load this inventory.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchInventory, principalUserId]);

  function clearForm(): void {
    setName("");
    setVendorName("");
    setTenantUrl("");
    setDistrictOwner("");
    setKnownVersion("");
    setApprovalState("UNKNOWN");
    setSetterKind("IMPORTED_SYSTEM");
    setSetterId("");
    setSetterName("");
    setSource("");
    setSourceReference("");
    setReason("");
  }

  async function submitSoftware(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(undefined);
    try {
      const setBy =
        setterKind === "IMPORTED_SYSTEM"
          ? {
              kind: setterKind,
              actorId: setterId,
              displayName: setterName,
              source,
            }
          : {
              kind: setterKind,
              actorId: setterId,
              displayName: setterName,
            };
      await inventoryApi<{ readonly item: SoftwareInventoryItem }>(
        `/api/workspaces/${workspaceId}/software`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            vendorName,
            authorizedTenantUrl: tenantUrl,
            districtOwner,
            ...(knownVersion.trim() ? { knownVersion } : {}),
            approval: {
              state: approvalState,
              setBy,
              reason,
              ...(sourceReference.trim() ? { sourceReference } : {}),
            },
          }),
        },
      );
      setFeedback({
        tone: "success",
        title: "Software added",
        message:
          "The district status and its original source were recorded separately.",
        auditRecorded: true,
      });
      setShowForm(false);
      clearForm();
      setItems(await fetchInventory());
    } catch (error) {
      const requestError =
        error instanceof InventoryApiError ? error : undefined;
      setFeedback({
        tone: "danger",
        title:
          requestError?.status === 403
            ? "Software creation denied"
            : "Software could not be added",
        message:
          requestError?.message ??
          "Check the software and district-status fields, then try again.",
        auditRecorded: requestError?.auditRecorded ?? false,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="inventory-panel"
      data-testid="software-inventory"
      id="inventory"
      aria-labelledby="inventory-heading"
    >
      <div className="inventory-heading">
        <div>
          <p className="eyebrow">Software inventory / AUT-02</p>
          <h2 id="inventory-heading">School software and district status</h2>
          <p>
            Every status names the person or district system that set it.
            Pactwire does not treat an imported status as its own conclusion.
          </p>
        </div>
        <button
          className="primary-button"
          data-testid="open-software-form"
          type="button"
          onClick={() => setShowForm((current) => !current)}
        >
          {showForm ? "Close form" : "Add school software"}
        </button>
      </div>

      {feedback ? (
        <div
          className={`inventory-feedback ${feedback.tone}`}
          data-testid="inventory-feedback"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true">{feedback.tone === "success" ? "✓" : "!"}</span>
          <div>
            <strong>{feedback.title}</strong>
            <p>{feedback.message}</p>
            {feedback.auditRecorded ? (
              <small>Recorded in the active workspace audit.</small>
            ) : null}
          </div>
        </div>
      ) : null}

      {showForm ? (
        <form
          className="software-form"
          data-testid="software-form"
          onSubmit={(event) => {
            void submitSoftware(event);
          }}
        >
          <div className="form-section-heading">
            <div>
              <span className="step-index">01</span>
              <div>
                <strong>Software and tenant</strong>
                <p>Record the exact district tenant under review.</p>
              </div>
            </div>
            <span className="permission-tag mono">SOFTWARE_CREATE</span>
          </div>
          <div className="software-form-grid">
            <label htmlFor="software-name">
              Software name
              <input
                id="software-name"
                data-testid="software-name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label htmlFor="software-vendor">
              Vendor
              <input
                id="software-vendor"
                data-testid="software-vendor"
                required
                value={vendorName}
                onChange={(event) => setVendorName(event.target.value)}
              />
            </label>
            <label className="wide-field" htmlFor="software-tenant">
              Authorized tenant URL
              <input
                id="software-tenant"
                data-testid="software-tenant"
                placeholder="https://district.product.example"
                required
                type="url"
                value={tenantUrl}
                onChange={(event) => setTenantUrl(event.target.value)}
              />
            </label>
            <label htmlFor="software-owner">
              District owner
              <input
                id="software-owner"
                data-testid="software-owner"
                required
                value={districtOwner}
                onChange={(event) => setDistrictOwner(event.target.value)}
              />
            </label>
            <label htmlFor="software-version">
              Known version <span className="optional-label">Optional</span>
              <input
                id="software-version"
                data-testid="software-version"
                value={knownVersion}
                onChange={(event) => setKnownVersion(event.target.value)}
              />
            </label>
          </div>

          <div className="form-divider" />
          <div className="form-section-heading">
            <div>
              <span className="step-index">02</span>
              <div>
                <strong>Existing district status</strong>
                <p>Name who or what set it. Pactwire cannot be the source.</p>
              </div>
            </div>
          </div>
          <div className="software-form-grid">
            <label htmlFor="approval-state">
              Current district status
              <select
                id="approval-state"
                data-testid="approval-state"
                value={approvalState}
                onChange={(event) => {
                  const nextState = event.target.value as ApprovalState;
                  setApprovalState(nextState);
                  if (nextState === "HOLD" || nextState === "RETIRED") {
                    setSetterKind("HUMAN");
                  }
                }}
              >
                {Object.entries(approvalLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="setter-kind">
              Status source type
              <select
                id="setter-kind"
                data-testid="setter-kind"
                value={setterKind}
                onChange={(event) =>
                  setSetterKind(
                    event.target.value as "HUMAN" | "IMPORTED_SYSTEM",
                  )
                }
              >
                <option
                  disabled={approvalState === "HOLD" || approvalState === "RETIRED"}
                  value="IMPORTED_SYSTEM"
                >
                  Imported district system
                </option>
                <option value="HUMAN">Named person</option>
              </select>
            </label>
            <label htmlFor="setter-name">
              {setterKind === "IMPORTED_SYSTEM" ? "System name" : "Person name"}
              <input
                id="setter-name"
                data-testid="setter-name"
                required
                value={setterName}
                onChange={(event) => setSetterName(event.target.value)}
              />
            </label>
            <label htmlFor="setter-id">
              Source ID
              <input
                className="mono"
                id="setter-id"
                data-testid="setter-id"
                required
                value={setterId}
                onChange={(event) => setSetterId(event.target.value)}
              />
            </label>
            {setterKind === "IMPORTED_SYSTEM" ? (
              <label htmlFor="setter-source">
                Import source
                <input
                  id="setter-source"
                  data-testid="setter-source"
                  required
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                />
              </label>
            ) : null}
            <label htmlFor="source-reference">
              District record ID <span className="optional-label">Optional</span>
              <input
                className="mono"
                id="source-reference"
                data-testid="source-reference"
                value={sourceReference}
                onChange={(event) => setSourceReference(event.target.value)}
              />
            </label>
            <label className="wide-field" htmlFor="approval-reason">
              Recorded reason
              <input
                id="approval-reason"
                data-testid="approval-reason"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <p>
              The server checks your stored workspace role before saving this
              district record.
            </p>
            <button
              className="primary-button"
              data-testid="submit-software"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "Recording…" : "Record software and source"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="inventory-toolbar">
        <label htmlFor="inventory-query">
          Search inventory
          <input
            id="inventory-query"
            data-testid="inventory-query"
            placeholder="Software, vendor, tenant, or owner"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label htmlFor="inventory-status-filter">
          District status
          <select
            id="inventory-status-filter"
            data-testid="inventory-status-filter"
            value={approvalFilter}
            onChange={(event) =>
              setApprovalFilter(event.target.value as "ALL" | ApprovalState)
            }
          >
            <option value="ALL">All statuses</option>
            {Object.entries(approvalLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span className="inventory-count mono" data-testid="inventory-count">
          {loading ? "LOADING" : `${items.length} RECORD${items.length === 1 ? "" : "S"}`}
        </span>
      </div>

      {loadError ? (
        <div className="inventory-empty danger" role="alert">
          <strong>Inventory unavailable</strong>
          <p>{loadError}</p>
        </div>
      ) : loading ? (
        <div className="inventory-empty" aria-live="polite">
          <span className="inventory-loader" aria-hidden="true" />
          <strong>Loading district records</strong>
        </div>
      ) : items.length === 0 ? (
        <div className="inventory-empty" data-testid="inventory-empty">
          <strong>No software matches this view</strong>
          <p>
            Add a school product or change the search and district-status
            filters.
          </p>
        </div>
      ) : (
        <div className="software-list" data-testid="software-list">
          {items.map((item) => (
            <article
              className="software-card"
              data-testid="software-card"
              key={item.software.id}
            >
              <div className="software-card-topline">
                <div>
                  <p className="card-kicker">School software</p>
                  <h3>{item.software.name}</h3>
                  <p>
                    {item.software.vendorName}
                    {item.software.knownVersion
                      ? ` · ${item.software.knownVersion}`
                      : " · Version not recorded"}
                  </p>
                </div>
                <span
                  className={`approval-badge ${item.software.approvalState.toLocaleLowerCase()}`}
                  data-testid="approval-badge"
                >
                  District status · {approvalLabels[item.software.approvalState]}
                </span>
              </div>

              <a
                className="tenant-link mono"
                href={item.software.authorizedTenantUrl}
                rel="noreferrer"
                target="_blank"
              >
                {item.software.authorizedTenantUrl}
              </a>

              <div className="software-facts">
                <div>
                  <span>District owner</span>
                  <strong>{item.software.districtOwner}</strong>
                </div>
                <div className="source-fact" data-testid="approval-source">
                  <span>Status source</span>
                  <strong>{item.approvalDescription.heading}</strong>
                  <small>{item.approvalDescription.detail}</small>
                  <em>District record · not a Pactwire conclusion</em>
                </div>
                <div>
                  <span>Agreement</span>
                  <strong>
                    {item.agreementVersion
                      ? `Version ${item.agreementVersion}`
                      : "Not added"}
                  </strong>
                  <small>No agreement is implied by this status.</small>
                </div>
                <div data-testid="latest-run">
                  <span>Latest named run</span>
                  <strong>
                    {item.latestRun
                      ? item.latestRun.boundedSummary
                      : "No named test has run"}
                  </strong>
                  <small>
                    {item.latestRun
                      ? `Recorded ${new Date(item.latestRun.occurredAt).toLocaleString()}`
                      : "No sampled behavior has been evaluated."}
                  </small>
                </div>
              </div>

              <div className="finding-strip" aria-label="Finding counts">
                <span>
                  <strong>{item.findingCounts.witnessedConflicts}</strong>
                  witnessed conflicts
                </span>
                <span>
                  <strong>{item.findingCounts.needsReview}</strong>
                  needs review
                </span>
                <span>
                  <strong>{item.findingCounts.notVisible}</strong>
                  not visible
                </span>
                <span>
                  <strong>{item.findingCounts.notTested}</strong>
                  not tested
                </span>
              </div>

              <div className="next-action-row">
                <div>
                  <span>Authorization review</span>
                  <strong>
                    {item.authorizationReviewAt
                      ? new Date(item.authorizationReviewAt).toLocaleDateString()
                      : "Not set"}
                  </strong>
                </div>
                <div>
                  <span>Next safe action</span>
                  <strong>{item.nextSafeAction.label}</strong>
                </div>
                <span className="mono">{item.nextSafeAction.code}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
