CREATE TABLE journey_repair_drafts (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  software_id uuid NOT NULL,
  journey_version_id uuid NOT NULL,
  authorization_id uuid NOT NULL,
  source_replay_version_id uuid NOT NULL,
  status text NOT NULL CHECK (
    status IN ('BOUNDED_DRAFT', 'HUMAN_REVIEW_REQUIRED', 'UNRESOLVED')
  ),
  repair_hash text NOT NULL CHECK (repair_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  proposed_by jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, software_id)
    REFERENCES software_records(workspace_id, id),
  FOREIGN KEY (workspace_id, journey_version_id, authorization_id)
    REFERENCES journey_versions(workspace_id, id, authorization_id),
  FOREIGN KEY (workspace_id, source_replay_version_id)
    REFERENCES deterministic_replay_versions(workspace_id, id)
);

CREATE INDEX journey_repair_drafts_history_idx
  ON journey_repair_drafts(
    workspace_id,
    software_id,
    journey_version_id,
    created_at DESC
  );

CREATE TABLE journey_repair_verifications (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  repair_id uuid NOT NULL,
  source_replay_version_id uuid NOT NULL,
  status text NOT NULL CHECK (
    status IN ('VERIFIED_DRAFT', 'PARTIAL', 'NOT_TESTED')
  ),
  repair_hash text NOT NULL CHECK (repair_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL,
  verified_at timestamptz NOT NULL,
  verified_by jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, repair_id),
  FOREIGN KEY (workspace_id, repair_id)
    REFERENCES journey_repair_drafts(workspace_id, id),
  FOREIGN KEY (workspace_id, source_replay_version_id)
    REFERENCES deterministic_replay_versions(workspace_id, id)
);

CREATE TABLE journey_repair_promotions (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  repair_id uuid NOT NULL,
  verification_id uuid NOT NULL,
  promoted_replay_version_id uuid NOT NULL,
  repair_hash text NOT NULL CHECK (repair_hash ~ '^[a-f0-9]{64}$'),
  rationale text NOT NULL CHECK (length(trim(rationale)) > 0),
  payload jsonb NOT NULL,
  reviewed_at timestamptz NOT NULL,
  reviewed_by jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, repair_id),
  FOREIGN KEY (workspace_id, repair_id)
    REFERENCES journey_repair_drafts(workspace_id, id),
  FOREIGN KEY (workspace_id, verification_id)
    REFERENCES journey_repair_verifications(workspace_id, id),
  FOREIGN KEY (workspace_id, promoted_replay_version_id)
    REFERENCES deterministic_replay_versions(workspace_id, id)
);

CREATE FUNCTION pactwire_validate_journey_repair_draft()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  source_record deterministic_replay_versions%ROWTYPE;
BEGIN
  IF NEW.payload->>'schemaVersion' IS DISTINCT FROM '1.0.0'
    OR NEW.payload->>'id' IS DISTINCT FROM NEW.id::text
    OR NEW.payload->>'workspaceId' IS DISTINCT FROM NEW.workspace_id::text
    OR NEW.payload->>'softwareId' IS DISTINCT FROM NEW.software_id::text
    OR NEW.payload->>'journeyVersionId'
      IS DISTINCT FROM NEW.journey_version_id::text
    OR NEW.payload->>'authorizationId'
      IS DISTINCT FROM NEW.authorization_id::text
    OR NEW.payload->>'sourceReplayVersionId'
      IS DISTINCT FROM NEW.source_replay_version_id::text
    OR NEW.payload->>'status' IS DISTINCT FROM NEW.status
    OR NEW.payload->>'repairHash' IS DISTINCT FROM NEW.repair_hash
    OR (NEW.payload->>'createdAt')::timestamptz
      IS DISTINCT FROM NEW.created_at
    OR NEW.payload->'proposedBy' IS DISTINCT FROM NEW.proposed_by THEN
    RAISE EXCEPTION 'Repair draft columns must match the immutable payload';
  END IF;

  IF NEW.proposed_by->>'kind' IS DISTINCT FROM 'MODEL'
    OR NEW.proposed_by->>'model' IS DISTINCT FROM 'gpt-5.6-sol'
    OR length(trim(COALESCE(NEW.proposed_by->>'actorId', ''))) = 0 THEN
    RAISE EXCEPTION 'A repair draft must preserve its GPT-5.6 Sol provenance';
  END IF;

  SELECT * INTO source_record
    FROM deterministic_replay_versions
    WHERE workspace_id = NEW.workspace_id
      AND id = NEW.source_replay_version_id;
  IF NOT FOUND
    OR source_record.software_id IS DISTINCT FROM NEW.software_id
    OR source_record.journey_version_id IS DISTINCT FROM NEW.journey_version_id
    OR source_record.authorization_id IS DISTINCT FROM NEW.authorization_id
    OR NEW.payload->>'sourceReplayHash'
      IS DISTINCT FROM source_record.replay_hash
    OR NEW.payload->>'sourceSnapshotHash'
      IS DISTINCT FROM source_record.snapshot_hash
    OR NEW.payload->'requiredCheckpointIds'
      IS DISTINCT FROM source_record.payload->'requiredCheckpointIds' THEN
    RAISE EXCEPTION 'Repair draft scope must match the frozen source replay';
  END IF;

  IF NEW.status = 'BOUNDED_DRAFT' THEN
    IF NEW.payload->'candidate' IS NULL
      OR jsonb_typeof(NEW.payload->'candidate') IS DISTINCT FROM 'object'
      OR NEW.payload->'candidate'->'bindings'
        IS DISTINCT FROM source_record.payload->'bindings'
      OR jsonb_array_length(NEW.payload->'candidate'->'operations')
        IS DISTINCT FROM jsonb_array_length(source_record.payload->'operations')
      OR jsonb_array_length(NEW.payload->'changes') = 0
      OR jsonb_array_length(NEW.payload->'violations') <> 0 THEN
      RAISE EXCEPTION 'A bounded repair must retain bindings and contain a scoped diff';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(source_record.payload->'operations')
        WITH ORDINALITY AS source_operation(value, position)
      JOIN jsonb_array_elements(NEW.payload->'candidate'->'operations')
        WITH ORDINALITY AS candidate_operation(value, position)
        USING (position)
      WHERE source_operation.value->>'operationId'
          IS DISTINCT FROM candidate_operation.value->>'operationId'
        OR source_operation.value->>'kind'
          IS DISTINCT FROM candidate_operation.value->>'kind'
        OR CASE source_operation.value->>'kind'
          WHEN 'NAVIGATE' THEN
            (source_operation.value - 'path')
              IS DISTINCT FROM (candidate_operation.value - 'path')
          WHEN 'ASSERT_VALUE' THEN
            (source_operation.value - 'locator')
              IS DISTINCT FROM (candidate_operation.value - 'locator')
          WHEN 'FILL' THEN
            (source_operation.value - 'locator')
              IS DISTINCT FROM (candidate_operation.value - 'locator')
          WHEN 'CLICK' THEN
            (source_operation.value - 'locator')
              IS DISTINCT FROM (candidate_operation.value - 'locator')
          WHEN 'ASSERT_TEXT' THEN
            (source_operation.value - 'locator')
              IS DISTINCT FROM (candidate_operation.value - 'locator')
          ELSE source_operation.value
            IS DISTINCT FROM candidate_operation.value
        END
    ) THEN
      RAISE EXCEPTION 'Bounded repair may change only relative paths and selectors';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION pactwire_validate_journey_repair_verification()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  repair_record journey_repair_drafts%ROWTYPE;
  source_record deterministic_replay_versions%ROWTYPE;
BEGIN
  IF NEW.payload->>'schemaVersion' IS DISTINCT FROM '1.0.0'
    OR NEW.payload->>'id' IS DISTINCT FROM NEW.id::text
    OR NEW.payload->>'workspaceId' IS DISTINCT FROM NEW.workspace_id::text
    OR NEW.payload->>'repairId' IS DISTINCT FROM NEW.repair_id::text
    OR NEW.payload->>'sourceReplayVersionId'
      IS DISTINCT FROM NEW.source_replay_version_id::text
    OR NEW.payload->>'status' IS DISTINCT FROM NEW.status
    OR NEW.payload->>'repairHash' IS DISTINCT FROM NEW.repair_hash
    OR (NEW.payload->>'verifiedAt')::timestamptz
      IS DISTINCT FROM NEW.verified_at
    OR NEW.payload->'verifiedBy' IS DISTINCT FROM NEW.verified_by THEN
    RAISE EXCEPTION 'Repair verification columns must match the immutable payload';
  END IF;
  IF NEW.verified_by->>'kind' IS DISTINCT FROM 'AUTOMATION'
    OR length(trim(COALESCE(NEW.verified_by->>'actorId', ''))) = 0
    OR length(trim(COALESCE(NEW.verified_by->>'component', ''))) = 0 THEN
    RAISE EXCEPTION 'Deterministic automation must own repair verification';
  END IF;

  SELECT * INTO repair_record
    FROM journey_repair_drafts
    WHERE workspace_id = NEW.workspace_id AND id = NEW.repair_id;
  SELECT * INTO source_record
    FROM deterministic_replay_versions
    WHERE workspace_id = NEW.workspace_id
      AND id = NEW.source_replay_version_id;
  IF repair_record.id IS NULL
    OR source_record.id IS NULL
    OR repair_record.source_replay_version_id
      IS DISTINCT FROM NEW.source_replay_version_id
    OR repair_record.repair_hash IS DISTINCT FROM NEW.repair_hash THEN
    RAISE EXCEPTION 'Repair verification must link to its exact frozen draft';
  END IF;

  IF NEW.status = 'VERIFIED_DRAFT' AND (
    repair_record.status IS DISTINCT FROM 'BOUNDED_DRAFT'
    OR NEW.payload->>'executionState' IS DISTINCT FROM 'COMPLETED'
    OR NEW.payload->>'recorderVisibility' IS DISTINCT FROM 'VISIBLE'
    OR NEW.payload->'verifiedCheckpointIds'
      IS DISTINCT FROM source_record.payload->'requiredCheckpointIds'
    OR jsonb_array_length(NEW.payload->'checkpoints')
      IS DISTINCT FROM jsonb_array_length(
        source_record.payload->'requiredCheckpointIds'
      )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        source_record.payload->'requiredCheckpointIds'
      ) required_checkpoint(value)
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(NEW.payload->'checkpoints') checkpoint(value)
        WHERE checkpoint.value->>'checkpointId'
            IS NOT DISTINCT FROM required_checkpoint.value #>> '{}'
          AND checkpoint.value->>'status' = 'VERIFIED'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(NEW.payload->'checkpoints') checkpoint(value)
      WHERE checkpoint.value->>'status' IS DISTINCT FROM 'VERIFIED'
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            source_record.payload->'requiredCheckpointIds'
          ) required_checkpoint(value)
          WHERE required_checkpoint.value #>> '{}'
            IS NOT DISTINCT FROM checkpoint.value->>'checkpointId'
        )
    )
  ) THEN
    RAISE EXCEPTION 'Verified repair must prove every frozen checkpoint';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION pactwire_validate_journey_repair_promotion()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  repair_record journey_repair_drafts%ROWTYPE;
  verification_record journey_repair_verifications%ROWTYPE;
  replay_record deterministic_replay_versions%ROWTYPE;
BEGIN
  IF NEW.payload->>'schemaVersion' IS DISTINCT FROM '1.0.0'
    OR NEW.payload->>'id' IS DISTINCT FROM NEW.id::text
    OR NEW.payload->>'workspaceId' IS DISTINCT FROM NEW.workspace_id::text
    OR NEW.payload->>'repairId' IS DISTINCT FROM NEW.repair_id::text
    OR NEW.payload->>'verificationId' IS DISTINCT FROM NEW.verification_id::text
    OR NEW.payload->>'promotedReplayVersionId'
      IS DISTINCT FROM NEW.promoted_replay_version_id::text
    OR NEW.payload->>'repairHash' IS DISTINCT FROM NEW.repair_hash
    OR NEW.payload->>'rationale' IS DISTINCT FROM NEW.rationale
    OR (NEW.payload->>'reviewedAt')::timestamptz
      IS DISTINCT FROM NEW.reviewed_at
    OR NEW.payload->'reviewedBy' IS DISTINCT FROM NEW.reviewed_by THEN
    RAISE EXCEPTION 'Repair promotion columns must match the immutable payload';
  END IF;
  IF NEW.reviewed_by->>'kind' IS DISTINCT FROM 'HUMAN'
    OR length(trim(COALESCE(NEW.reviewed_by->>'actorId', ''))) = 0 THEN
    RAISE EXCEPTION 'Only a named human can promote a repair';
  END IF;

  SELECT * INTO repair_record FROM journey_repair_drafts
    WHERE workspace_id = NEW.workspace_id AND id = NEW.repair_id;
  SELECT * INTO verification_record FROM journey_repair_verifications
    WHERE workspace_id = NEW.workspace_id AND id = NEW.verification_id;
  SELECT * INTO replay_record FROM deterministic_replay_versions
    WHERE workspace_id = NEW.workspace_id
      AND id = NEW.promoted_replay_version_id;
  IF repair_record.id IS NULL
    OR verification_record.id IS NULL
    OR replay_record.id IS NULL
    OR repair_record.status IS DISTINCT FROM 'BOUNDED_DRAFT'
    OR verification_record.status IS DISTINCT FROM 'VERIFIED_DRAFT'
    OR verification_record.repair_id IS DISTINCT FROM repair_record.id
    OR repair_record.repair_hash IS DISTINCT FROM NEW.repair_hash
    OR verification_record.repair_hash IS DISTINCT FROM NEW.repair_hash
    OR verification_record.source_replay_version_id
      IS DISTINCT FROM repair_record.source_replay_version_id
    OR replay_record.source_replay_version_id
      IS DISTINCT FROM repair_record.source_replay_version_id
    OR replay_record.payload->'bindings'
      IS DISTINCT FROM repair_record.payload->'candidate'->'bindings'
    OR replay_record.payload->'operations'
      IS DISTINCT FROM repair_record.payload->'candidate'->'operations'
    OR replay_record.created_by->>'kind' IS DISTINCT FROM 'HUMAN'
    OR replay_record.created_by->>'actorId'
      IS DISTINCT FROM NEW.reviewed_by->>'actorId' THEN
    RAISE EXCEPTION 'Promotion requires the exact verified draft and human replay';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER journey_repair_draft_guard
BEFORE INSERT ON journey_repair_drafts
FOR EACH ROW EXECUTE FUNCTION pactwire_validate_journey_repair_draft();

CREATE TRIGGER journey_repair_verification_guard
BEFORE INSERT ON journey_repair_verifications
FOR EACH ROW EXECUTE FUNCTION pactwire_validate_journey_repair_verification();

CREATE TRIGGER journey_repair_promotion_guard
BEFORE INSERT ON journey_repair_promotions
FOR EACH ROW EXECUTE FUNCTION pactwire_validate_journey_repair_promotion();

CREATE TRIGGER journey_repair_drafts_immutable
BEFORE UPDATE OR DELETE ON journey_repair_drafts
FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();

CREATE TRIGGER journey_repair_verifications_immutable
BEFORE UPDATE OR DELETE ON journey_repair_verifications
FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();

CREATE TRIGGER journey_repair_promotions_immutable
BEFORE UPDATE OR DELETE ON journey_repair_promotions
FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
