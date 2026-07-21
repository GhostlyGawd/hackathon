ALTER TABLE software_records
  DROP CONSTRAINT software_records_approval_owner_check;

ALTER TABLE software_records
  ADD CONSTRAINT software_records_approval_owner_check
    CHECK (approval_owner IN ('HUMAN', 'IMPORTED_SYSTEM', 'AUTOMATION', 'NONE')),
  ADD CONSTRAINT software_records_automated_hold_check
    CHECK (approval_owner <> 'AUTOMATION' OR approval_state = 'HOLD');

ALTER TABLE software_approval_origins
  DROP CONSTRAINT software_approval_origins_actor_kind_check,
  DROP CONSTRAINT software_approval_origins_recorded_by_check;

ALTER TABLE software_approval_origins
  ADD CONSTRAINT software_approval_origins_actor_kind_check
    CHECK (actor_kind IN ('HUMAN', 'IMPORTED_SYSTEM', 'AUTOMATION')),
  ADD CONSTRAINT software_approval_origins_recorded_by_check
    CHECK (recorded_by ->> 'kind' IN ('HUMAN', 'AUTOMATION')),
  ADD CONSTRAINT software_approval_origins_automated_hold_check
    CHECK (
      actor_kind <> 'AUTOMATION'
      OR (
        state = 'HOLD'
        AND reason IN ('WITNESSED_CONFLICT', 'REQUIRED_VISIBILITY_LOSS')
        AND source_reference IS NOT NULL
        AND recorded_by ->> 'kind' = 'AUTOMATION'
      )
    );

ALTER TABLE approval_events
  ADD COLUMN receipt_id uuid,
  ADD COLUMN idempotency_key text CHECK (
    idempotency_key IS NULL OR length(trim(idempotency_key)) > 0
  ),
  ADD CONSTRAINT approval_events_receipt_fk
    FOREIGN KEY (workspace_id, receipt_id)
    REFERENCES evidence_receipts(workspace_id, id);

CREATE UNIQUE INDEX approval_events_idempotency_unique
  ON approval_events(workspace_id, software_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE human_decisions
  ADD COLUMN receipt_id uuid,
  ADD COLUMN reviewed_finding_state text CHECK (
    reviewed_finding_state IS NULL
    OR reviewed_finding_state IN (
      'WITNESSED_CONFLICT',
      'NO_CONFLICT_OBSERVED_IN_NAMED_TESTS',
      'NOT_REOBSERVED_IN_NAMED_TESTS',
      'NOT_TESTED',
      'NOT_VISIBLE',
      'NEEDS_REVIEW'
    )
  ),
  ADD CONSTRAINT human_decisions_receipt_fk
    FOREIGN KEY (workspace_id, receipt_id)
    REFERENCES evidence_receipts(workspace_id, id);

CREATE TABLE approval_hold_receipts (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  software_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  finding_id uuid NOT NULL,
  finding_state text NOT NULL CHECK (
    finding_state IN ('WITNESSED_CONFLICT', 'NOT_VISIBLE')
  ),
  reason text NOT NULL CHECK (
    reason IN ('WITNESSED_CONFLICT', 'REQUIRED_VISIBILITY_LOSS')
  ),
  checkpoint_id text CHECK (
    checkpoint_id IS NULL OR length(trim(checkpoint_id)) > 0
  ),
  actor jsonb NOT NULL CHECK (actor ->> 'kind' = 'AUTOMATION'),
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, software_id, receipt_id),
  FOREIGN KEY (workspace_id, software_id)
    REFERENCES software_records(workspace_id, id),
  FOREIGN KEY (workspace_id, receipt_id)
    REFERENCES evidence_receipts(workspace_id, id),
  FOREIGN KEY (workspace_id, finding_id)
    REFERENCES findings(workspace_id, id),
  CHECK (
    (reason = 'WITNESSED_CONFLICT' AND finding_state = 'WITNESSED_CONFLICT' AND checkpoint_id IS NULL)
    OR (reason = 'REQUIRED_VISIBILITY_LOSS' AND finding_state = 'NOT_VISIBLE' AND checkpoint_id IS NOT NULL)
  )
);

CREATE TRIGGER approval_hold_receipts_immutable
BEFORE UPDATE OR DELETE ON approval_hold_receipts
FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
