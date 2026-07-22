-- SEC-01: artifact bytes belong only in the encrypted object store. This
-- one-time migration removes the duplicate payload field while preserving the
-- immutable receipt manifest, hashes, lengths, summaries, and artifact metadata.
DROP TRIGGER evidence_receipts_immutable ON evidence_receipts;

UPDATE evidence_receipts
SET bundle = jsonb_set(
  bundle,
  '{artifacts}',
  COALESCE(
    (
      SELECT jsonb_agg(artifact - 'contentBase64' ORDER BY ordinal)
      FROM jsonb_array_elements(COALESCE(bundle->'artifacts', '[]'::jsonb))
        WITH ORDINALITY AS stored_artifact(artifact, ordinal)
    ),
    '[]'::jsonb
  )
);

ALTER TABLE evidence_receipts
  RENAME COLUMN bundle TO bundle_metadata;

ALTER TABLE evidence_receipts
  ADD CONSTRAINT evidence_receipts_metadata_has_no_payload_check
    CHECK (bundle_metadata::text NOT LIKE '%"contentBase64"%');

CREATE TRIGGER evidence_receipts_immutable
BEFORE UPDATE OR DELETE ON evidence_receipts
FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();

CREATE TABLE evidence_retention_policies (
  workspace_id uuid NOT NULL,
  retention_days integer NOT NULL CHECK (retention_days >= 1 AND retention_days <= 365),
  basis text NOT NULL CHECK (basis IN ('PACTWIRE_PRODUCT_DEFAULT', 'HUMAN_CONFIGURED')),
  updated_at timestamptz NOT NULL,
  updated_by jsonb NOT NULL CHECK (updated_by->>'kind' = 'HUMAN'),
  PRIMARY KEY (workspace_id, updated_at),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX evidence_retention_policies_latest_idx
  ON evidence_retention_policies(workspace_id, updated_at DESC);

CREATE TABLE evidence_receipt_deletion_events (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('REQUESTED', 'COMPLETED')),
  trigger text NOT NULL CHECK (trigger IN ('MANUAL', 'RETENTION_EXPIRY')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  occurred_at timestamptz NOT NULL,
  requested_by jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id, status),
  UNIQUE (workspace_id, receipt_id, status),
  FOREIGN KEY (workspace_id, receipt_id)
    REFERENCES evidence_receipts(workspace_id, id),
  CHECK (
    (trigger = 'MANUAL' AND requested_by->>'kind' = 'HUMAN')
    OR (trigger = 'RETENTION_EXPIRY' AND requested_by->>'kind' = 'AUTOMATION')
  )
);

CREATE INDEX evidence_receipt_deletion_events_receipt_idx
  ON evidence_receipt_deletion_events(workspace_id, receipt_id, occurred_at, status);

CREATE TRIGGER evidence_retention_policies_immutable
BEFORE UPDATE OR DELETE ON evidence_retention_policies
FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();

CREATE TRIGGER evidence_receipt_deletion_events_immutable
BEFORE UPDATE OR DELETE ON evidence_receipt_deletion_events
FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
