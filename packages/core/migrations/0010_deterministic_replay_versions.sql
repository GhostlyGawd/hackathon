CREATE TABLE deterministic_replay_versions (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  software_id uuid NOT NULL,
  agreement_version_id uuid NOT NULL,
  journey_version_id uuid NOT NULL,
  authorization_id uuid NOT NULL,
  replay_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  source_replay_version_id uuid,
  replay_hash text NOT NULL CHECK (replay_hash ~ '^[a-f0-9]{64}$'),
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  created_by jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, replay_id, version),
  FOREIGN KEY (workspace_id, software_id)
    REFERENCES software_records(workspace_id, id),
  FOREIGN KEY (workspace_id, agreement_version_id, software_id)
    REFERENCES agreement_versions(workspace_id, id, software_id),
  FOREIGN KEY (workspace_id, journey_version_id, authorization_id)
    REFERENCES journey_versions(workspace_id, id, authorization_id),
  FOREIGN KEY (workspace_id, authorization_id, software_id)
    REFERENCES authorizations(workspace_id, id, software_id),
  FOREIGN KEY (workspace_id, source_replay_version_id)
    REFERENCES deterministic_replay_versions(workspace_id, id),
  CHECK (
    (version = 1 AND source_replay_version_id IS NULL)
    OR (version > 1 AND source_replay_version_id IS NOT NULL)
  )
);

CREATE INDEX deterministic_replay_versions_current_idx
  ON deterministic_replay_versions(
    workspace_id,
    software_id,
    journey_version_id,
    replay_id,
    version DESC
  );

CREATE FUNCTION pactwire_validate_deterministic_replay_version()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  journey_record journey_versions%ROWTYPE;
  source_record deterministic_replay_versions%ROWTYPE;
  replay_checkpoints text[];
  payload_checkpoints text[];
  journey_checkpoints text[];
  replay_fields text[];
  journey_fields text[];
BEGIN
  IF NEW.payload->>'schemaVersion' IS DISTINCT FROM '1.0.0'
    OR NEW.payload->>'id' IS DISTINCT FROM NEW.id::text
    OR NEW.payload->>'workspaceId' IS DISTINCT FROM NEW.workspace_id::text
    OR NEW.payload->>'softwareId' IS DISTINCT FROM NEW.software_id::text
    OR NEW.payload->>'agreementVersionId'
      IS DISTINCT FROM NEW.agreement_version_id::text
    OR NEW.payload->>'journeyVersionId'
      IS DISTINCT FROM NEW.journey_version_id::text
    OR NEW.payload->>'authorizationId'
      IS DISTINCT FROM NEW.authorization_id::text
    OR NEW.payload->>'replayId' IS DISTINCT FROM NEW.replay_id::text
    OR (NEW.payload->>'version')::integer IS DISTINCT FROM NEW.version
    OR COALESCE(NEW.payload->>'sourceVersionId', '')
      IS DISTINCT FROM COALESCE(NEW.source_replay_version_id::text, '')
    OR NEW.payload->>'replayHash' IS DISTINCT FROM NEW.replay_hash
    OR NEW.payload->'snapshot'->>'snapshotHash'
      IS DISTINCT FROM NEW.snapshot_hash
    OR (NEW.payload->>'createdAt')::timestamptz
      IS DISTINCT FROM NEW.created_at
    OR NEW.payload->'createdBy' IS DISTINCT FROM NEW.created_by THEN
    RAISE EXCEPTION 'Replay columns must match the immutable payload';
  END IF;

  IF NEW.created_by->>'kind' IS DISTINCT FROM 'HUMAN'
    OR length(trim(COALESCE(NEW.created_by->>'actorId', ''))) = 0 THEN
    RAISE EXCEPTION 'Only a named human can save the non-model replay baseline';
  END IF;
  IF NEW.payload->>'arm' IS DISTINCT FROM 'HUMAN_AUTHORED_DETERMINISTIC'
    OR (NEW.payload->>'modelInvocationCount')::integer IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'The deterministic baseline cannot contain a model invocation';
  END IF;
  IF NEW.payload->'snapshot'->>'agreementVersionId'
      IS DISTINCT FROM NEW.agreement_version_id::text
    OR NEW.payload->'snapshot'->>'journeyVersionId'
      IS DISTINCT FROM NEW.journey_version_id::text
    OR NEW.payload->'snapshot'->>'authorizationId'
      IS DISTINCT FROM NEW.authorization_id::text THEN
    RAISE EXCEPTION 'Replay snapshot scope must match the saved replay';
  END IF;

  SELECT * INTO journey_record
    FROM journey_versions
    WHERE workspace_id = NEW.workspace_id
      AND id = NEW.journey_version_id
      AND authorization_id = NEW.authorization_id;
  IF NOT FOUND
    OR journey_record.software_id IS DISTINCT FROM NEW.software_id
    OR journey_record.agreement_version_id
      IS DISTINCT FROM NEW.agreement_version_id THEN
    RAISE EXCEPTION 'Replay must reference one scoped immutable journey';
  END IF;

  IF jsonb_typeof(NEW.payload->'allowedActions') IS DISTINCT FROM 'array'
    OR NOT (
      ((NEW.payload->'allowedActions') @>
        (journey_record.payload->'allowedActions'))
      AND ((NEW.payload->'allowedActions') <@
        (journey_record.payload->'allowedActions'))
    ) THEN
    RAISE EXCEPTION 'Replay action scope must equal the frozen journey action scope';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.payload->'operations') AS operation(value)
    WHERE operation.value ? 'authorizedAction'
      AND NOT (
        (NEW.payload->'allowedActions') ?
          (operation.value->>'authorizedAction')
      )
  ) THEN
    RAISE EXCEPTION 'Replay operation exceeds the frozen journey action scope';
  END IF;

  SELECT array_agg(value ORDER BY value) INTO payload_checkpoints
    FROM jsonb_array_elements_text(
      NEW.payload->'requiredCheckpointIds'
    ) AS checkpoint(value);
  SELECT array_agg(
      checkpoint.value->>'checkpointId'
      ORDER BY checkpoint.value->>'checkpointId'
    ) INTO replay_checkpoints
    FROM jsonb_array_elements(NEW.payload->'operations') AS checkpoint(value)
    WHERE checkpoint.value->>'kind' = 'CHECKPOINT';
  SELECT array_agg(
      checkpoint.value->>'checkpointId'
      ORDER BY checkpoint.value->>'checkpointId'
    ) INTO journey_checkpoints
    FROM jsonb_array_elements(
      journey_record.payload->'checkpoints'
    ) AS checkpoint(value)
    WHERE (checkpoint.value->>'required')::boolean;
  IF payload_checkpoints IS DISTINCT FROM journey_checkpoints
    OR replay_checkpoints IS DISTINCT FROM journey_checkpoints THEN
    RAISE EXCEPTION 'Replay must assert every required journey checkpoint exactly once';
  END IF;

  SELECT array_agg(
      binding.value->>'journeyFieldId'
      ORDER BY binding.value->>'journeyFieldId'
    ) INTO replay_fields
    FROM jsonb_array_elements(NEW.payload->'bindings') AS binding(value);
  SELECT array_agg(
      field.value->>'fieldId'
      ORDER BY field.value->>'fieldId'
    ) INTO journey_fields
    FROM jsonb_array_elements(
      journey_record.payload->'testFields'
    ) AS field(value);
  IF replay_fields IS DISTINCT FROM journey_fields THEN
    RAISE EXCEPTION 'Replay bindings must cover every fictional journey field';
  END IF;

  IF NEW.version = 1 THEN
    IF NEW.source_replay_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'The first replay version cannot identify a source';
    END IF;
  ELSE
    SELECT * INTO source_record
      FROM deterministic_replay_versions
      WHERE workspace_id = NEW.workspace_id
        AND id = NEW.source_replay_version_id;
    IF NOT FOUND
      OR source_record.software_id <> NEW.software_id
      OR source_record.journey_version_id <> NEW.journey_version_id
      OR source_record.replay_id <> NEW.replay_id
      OR NEW.version <> source_record.version + 1 THEN
      RAISE EXCEPTION 'A replay version must append directly to its scoped source';
    END IF;
    IF EXISTS (
      SELECT 1 FROM deterministic_replay_versions current_version
      WHERE current_version.workspace_id = NEW.workspace_id
        AND current_version.replay_id = NEW.replay_id
        AND current_version.version > source_record.version
    ) THEN
      RAISE EXCEPTION 'A replay version must append to the current version';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER deterministic_replay_version_guard
BEFORE INSERT ON deterministic_replay_versions
FOR EACH ROW EXECUTE FUNCTION pactwire_validate_deterministic_replay_version();

CREATE TRIGGER deterministic_replay_versions_immutable
BEFORE UPDATE OR DELETE ON deterministic_replay_versions
FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
