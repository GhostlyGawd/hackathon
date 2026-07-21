ALTER TABLE evidence_receipts
  ADD COLUMN receipt_version text NOT NULL DEFAULT 'pactwire-evidence-receipt-v1'
    CHECK (receipt_version = 'pactwire-evidence-receipt-v1'),
  ADD COLUMN finding_state text NOT NULL DEFAULT 'NEEDS_REVIEW'
    CHECK (finding_state IN ('WITNESSED_CONFLICT', 'NO_CONFLICT_OBSERVED_IN_NAMED_TESTS', 'NOT_REOBSERVED_IN_NAMED_TESTS', 'NOT_TESTED', 'NOT_VISIBLE', 'NEEDS_REVIEW')),
  ADD COLUMN run_manifest_hash text NOT NULL DEFAULT repeat('0', 64)
    CHECK (run_manifest_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN artifact_byte_lengths jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN supersedes_finding_id uuid,
  ADD COLUMN bundle jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT evidence_receipts_superseded_finding_fk
    FOREIGN KEY (workspace_id, supersedes_finding_id)
    REFERENCES findings(workspace_id, id),
  ADD CONSTRAINT evidence_receipts_correction_pair_check
    CHECK ((supersedes_receipt_id IS NULL) = (supersedes_finding_id IS NULL));

CREATE INDEX evidence_receipts_finding_lineage_idx
  ON evidence_receipts(workspace_id, finding_id, supersedes_finding_id, created_at);
