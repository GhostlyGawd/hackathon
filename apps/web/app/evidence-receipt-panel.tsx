"use client";

import { useEffect, useState } from "react";
import { deriveFindingReviewGate } from "../lib/run-review-policy";

interface ReceiptArtifact {
  readonly kind: string;
  readonly path: string;
  readonly mediaType: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly sanitized: true;
  readonly redactionCount: number;
}

interface ReceiptSummary {
  readonly receipt: {
    readonly id: string;
    readonly findingId: string;
    readonly findingState: string;
    readonly manifestHash: string;
    readonly contentHash: string;
    readonly runManifestHash: string;
    readonly createdAt: string;
    readonly artifactHashes: Readonly<Record<string, string>>;
    readonly supersedesReceiptId?: string;
  };
  readonly content: {
    readonly finding: {
      readonly state: string;
      readonly label: string;
      readonly meaning: string;
      readonly reasonCodes: readonly string[];
    };
    readonly observedFlow: {
      readonly eventType: string;
      readonly fictionalField: string;
      readonly action: string;
      readonly destinationHostname: string;
      readonly destinationName: string;
      readonly destinationStatus: "ALLOWED" | "PROHIBITED" | "UNKNOWN";
    };
    readonly scope: {
      readonly softwareVersion: string;
      readonly role: "TEACHER" | "STUDENT";
      readonly journeyName: string;
      readonly observationWindow: {
        readonly startedAt: string;
        readonly endedAt: string;
      };
      readonly visiblePaths: readonly string[];
      readonly untestedPaths: readonly string[];
      readonly notVisiblePaths: readonly string[];
      readonly limitations: readonly string[];
    };
    readonly agreementRule: {
      readonly plainLanguage: string;
      readonly citation: {
        readonly page?: number;
        readonly startOffset: number;
        readonly endOffset: number;
      };
      readonly confirmedBy: { readonly kind: "HUMAN"; readonly actorId: string };
      readonly confirmedAt: string;
    };
    readonly nextHumanDecision: string;
  };
  readonly artifacts: readonly ReceiptArtifact[];
  readonly verification: {
    readonly status: "VALID" | "INVALID";
    readonly verifiedArtifactCount: number;
    readonly verifiedHashCount: number;
    readonly issues: readonly { readonly code: string; readonly message: string }[];
  };
}

interface ReceiptResponse {
  readonly receiptVersion: string;
  readonly receipts: readonly ReceiptSummary[];
}

function shortHash(value: string): string {
  return `${value.slice(0, 16)}…${value.slice(-8)}`;
}

function displayTime(value: string): string {
  return new Intl.DateTimeFormat([], {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function ReceiptStep({
  number,
  title,
  children,
}: {
  readonly number: string;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="receipt-step">
      <header>
        <span>{number}</span>
        <h4>{title}</h4>
      </header>
      <div>{children}</div>
    </section>
  );
}

export function EvidenceReceiptPanel({
  canRestoreApproval,
  workspaceId,
  findingId,
}: {
  readonly canRestoreApproval: boolean;
  readonly workspaceId: string;
  readonly findingId: string;
}) {
  const [response, setResponse] = useState<ReceiptResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load(): Promise<void> {
      setLoading(true);
      setError(undefined);
      try {
        const request = await fetch(
          `/api/workspaces/${workspaceId}/receipts?findingId=${encodeURIComponent(findingId)}`,
          { signal: controller.signal },
        );
        const body = (await request.json()) as
          | ReceiptResponse
          | { readonly error?: { readonly message?: string } };
        if (!request.ok || !("receipts" in body)) {
          throw new Error(
            ("error" in body ? body.error?.message : undefined) ??
              "Evidence receipt could not be loaded.",
          );
        }
        if (active) setResponse(body);
      } catch (caught) {
        if (active && !controller.signal.aborted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Evidence receipt could not be loaded.",
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
  }, [findingId, workspaceId]);

  if (loading) {
    return <p className="receipt-empty">Loading this finding&apos;s receipt…</p>;
  }
  if (error) {
    return (
      <div className="receipt-error" role="alert">
        <strong>Receipt unavailable</strong>
        <span>{error}</span>
      </div>
    );
  }
  const summary = response?.receipts.at(-1);
  if (!summary) {
    return (
      <p className="receipt-empty">
        No evidence receipt has been finalized for this finding.
      </p>
    );
  }

  const { receipt, content, artifacts, verification } = summary;
  const pathsTested = content.scope.visiblePaths.length;
  const pathsNotTested = content.scope.untestedPaths.length;
  const pathsNotVisible = content.scope.notVisiblePaths.length;
  const reviewGate = deriveFindingReviewGate({
    findingState: content.finding.state as Parameters<
      typeof deriveFindingReviewGate
    >[0]["findingState"],
    receiptStatus: verification.status,
    hasNamedScope:
      content.scope.journeyName.trim().length > 0 &&
      pathsTested + pathsNotTested + pathsNotVisible > 0,
    nextHumanDecision: content.nextHumanDecision,
    canRestoreApproval,
  });

  return (
    <article className="receipt-detail" data-testid="evidence-receipt-detail">
      <header className="receipt-header">
        <div>
          <p className="eyebrow">Verifiable evidence receipt / DET-04</p>
          <h3>The records behind this finding can be checked independently.</h3>
          <p>
            Download one sanitized bundle and recompute every hash without
            trusting Pactwire or a model.
          </p>
        </div>
        <div
          className={`receipt-verification ${verification.status.toLowerCase()}`}
          data-testid="receipt-verification"
        >
          <span>Independent verification</span>
          <strong>{verification.status}</strong>
          <small>
            {verification.verifiedArtifactCount} artifacts · {verification.verifiedHashCount} hashes
          </small>
        </div>
      </header>

      <div className="receipt-toolbar">
        <dl>
          <div>
            <dt>Receipt</dt>
            <dd title={receipt.id}>{receipt.id}</dd>
          </div>
          <div>
            <dt>Manifest SHA-256</dt>
            <dd title={receipt.manifestHash}>{shortHash(receipt.manifestHash)}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{displayTime(receipt.createdAt)}</dd>
          </div>
        </dl>
        <a
          data-testid="download-receipt"
          download={`pactwire-receipt-${receipt.id}.json`}
          href={`/api/workspaces/${workspaceId}/receipts/${receipt.id}/export`}
        >
          Download receipt bundle
        </a>
      </div>

      <aside
        className={`receipt-review-gate ${reviewGate.ready ? "ready" : "blocked"}`}
        data-review-action={reviewGate.action}
        data-review-ready={reviewGate.ready}
        data-testid="receipt-review-gate"
      >
        <div>
          <span>Human decision readiness</span>
          <strong>
            {reviewGate.ready
              ? "Evidence ready for bounded review"
              : "Decision blocked by missing evidence"}
          </strong>
        </div>
        <p>{reviewGate.message}</p>
        <small>Next: {content.nextHumanDecision}</small>
      </aside>

      <div className="receipt-story" data-testid="receipt-story">
        <ReceiptStep number="01" title="What Pactwire recorded">
          <strong>{content.finding.label}</strong>
          <p>{content.finding.meaning}</p>
          <code>{content.observedFlow.eventType}</code>
        </ReceiptStep>

        <ReceiptStep number="02" title="Fictional data field">
          <strong>{content.observedFlow.fictionalField}</strong>
          <p>Generated for this controlled test; no real student record was used.</p>
        </ReceiptStep>

        <ReceiptStep number="03" title="Recorded action">
          <strong>{content.observedFlow.action}</strong>
          <p>The recorder observed this action in the named journey.</p>
        </ReceiptStep>

        <ReceiptStep number="04" title="Where it was sent or collected">
          <strong>{content.observedFlow.destinationName}</strong>
          <p className="mono">{content.observedFlow.destinationHostname}</p>
          <code>{content.observedFlow.destinationStatus}</code>
        </ReceiptStep>

        <ReceiptStep number="05" title="Confirmed agreement rule">
          <strong>{content.agreementRule.plainLanguage}</strong>
          <p>
            Confirmed by {content.agreementRule.confirmedBy.actorId} · page {content.agreementRule.citation.page ?? "not numbered"}, offsets {content.agreementRule.citation.startOffset}–{content.agreementRule.citation.endOffset}
          </p>
        </ReceiptStep>

        <ReceiptStep number="06" title="What was and was not tested">
          <strong>{content.scope.journeyName}</strong>
          <p>
            {content.scope.role.toLowerCase()} · {pathsTested} visible · {pathsNotTested} not tested · {pathsNotVisible} not visible
          </p>
          <small>
            {displayTime(content.scope.observationWindow.startedAt)} – {displayTime(content.scope.observationWindow.endedAt)}
          </small>
        </ReceiptStep>

        <ReceiptStep number="07" title="Effect on approval status">
          <strong>No approval state was changed by this receipt.</strong>
          <p>{content.finding.reasonCodes.join(" · ")}</p>
        </ReceiptStep>

        <ReceiptStep number="08" title="What a person decides next">
          <strong>{content.nextHumanDecision}</strong>
          <p>A model cannot approve, restore, or make this decision.</p>
        </ReceiptStep>
      </div>

      <section className="receipt-lineage" aria-labelledby="receipt-lineage-title">
        <header>
          <div>
            <span>Content-addressed lineage</span>
            <h4 id="receipt-lineage-title">Every included artifact and hash</h4>
          </div>
          <small>{response?.receiptVersion}</small>
        </header>
        <div>
          {artifacts.map((artifact) => (
            <article key={artifact.path}>
              <span>{artifact.kind.replaceAll("_", " ")}</span>
              <strong title={artifact.path}>{artifact.path}</strong>
              <code title={artifact.sha256}>{shortHash(artifact.sha256)}</code>
              <small>
                {artifact.byteLength.toLocaleString()} bytes · sanitized
                {artifact.redactionCount > 0
                  ? ` · ${artifact.redactionCount} redactions`
                  : ""}
              </small>
            </article>
          ))}
        </div>
      </section>

      <footer className="receipt-boundary">
        <strong>A valid receipt proves these files have not changed.</strong>
        <span>It does not prove the software is safe, compliant, or approved.</span>
      </footer>
    </article>
  );
}
