# SEC-01 evidence retention and release decision

## Decision

Pactwire P0 uses a 30-day evidence-retention default. A privacy officer may
configure an integer period from 1 through 365 days for one workspace. Thirty
days is a Pactwire product default, not a statement of legal sufficiency or a
requirement imposed by an external standard.

Raw artifact payloads exist only in the encrypted, content-addressed evidence
object store. Immutable receipt rows retain hashes, byte lengths, bounded
sanitized summaries, and artifact metadata, but never duplicate
`contentBase64` payloads.

Manual deletion requires all of the following:

- a signed principal in the exact workspace;
- the `EVIDENCE_RETENTION_MANAGE` permission, assigned only to the privacy
  officer in P0;
- a reason; and
- an exact `DELETE <receipt-id>` confirmation.

Deletion appends `REQUESTED` before touching the object store and appends
`COMPLETED` after the idempotent purge. A request tombstone immediately makes
the artifact content unavailable, so an interrupted purge fails closed and can
be retried. Shared content-addressed bytes remain until no retained receipt
references them. Expiry deletion uses the same two-stage path and can be
invoked only by the retention worker after the configured period.

The immutable receipt metadata and deletion tombstone remain for audit. The
artifact payload is no longer viewable or exportable and the HTTP boundary
returns `410 EVIDENCE_RECEIPT_CONTENT_DELETED`.

P0 exports are limited to a sanitized download for authorized private review.
An explicit external-public delivery request is denied beneath the UI. Pactwire
does not publish evidence, contact a vendor, or make a public accusation.

## Why

The prior receipt repository stored each artifact twice: once in encrypted
object storage and again as base64 inside immutable receipt JSON. Deleting only
the object-store copy therefore would not have deleted the retained payload.
The metadata-only repository removes that contradiction while preserving
independent verification when content is retained.

A bounded configurable default gives P0 an executable minimization rule without
pretending one duration fits every district, agreement, jurisdiction, backup,
or incident-response requirement. Disabling public delivery keeps a witnessed
conflict inside the district-owned review process until a separate governed
release workflow exists.

## Boundaries and follow-up

- Production deployment must validate deletion in backups, replicas, caches,
  and the selected object-store/key provider before claiming infrastructure-wide
  erasure.
- A human can copy a private export after download; the response is labeled
  `private-review-only`, but Pactwire cannot control later out-of-band handling.
- Receipt integrity proves included bytes match their hashes. It does not prove
  that capture was complete, that a product is safe or compliant, or that an
  accusation is justified.
- The default may be revised only through a reviewed product decision and new
  retention/deletion evidence; it must not be described as legal advice.
