CREATE TABLE run_execution_scopes (
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  software_id uuid NOT NULL,
  scope_hash text NOT NULL CHECK (scope_hash ~ '^[a-f0-9]{64}$'),
  model_identifier text NOT NULL CHECK (length(trim(model_identifier)) > 0),
  required_checkpoint_ids jsonb NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  created_by jsonb NOT NULL,
  PRIMARY KEY (workspace_id, run_id),
  FOREIGN KEY (workspace_id, run_id, software_id)
    REFERENCES runs(workspace_id, id, software_id)
);

CREATE TABLE run_worker_leases (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  run_id uuid NOT NULL,
  worker_id text NOT NULL CHECK (length(trim(worker_id)) > 0),
  token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  lease_hash text NOT NULL CHECK (lease_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL,
  acquired_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > acquired_at),
  claimed_by jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, run_id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id)
);

CREATE TABLE run_manifests (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  run_id uuid NOT NULL,
  software_id uuid NOT NULL,
  terminal_status text NOT NULL CHECK (
    terminal_status IN ('COMPLETED', 'PARTIAL', 'FAILED', 'CANCELED')
  ),
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL,
  finalized_at timestamptz NOT NULL,
  finalized_by jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, run_id),
  FOREIGN KEY (workspace_id, run_id, software_id)
    REFERENCES runs(workspace_id, id, software_id)
);

CREATE TABLE run_orchestration_commands (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  command_type text NOT NULL CHECK (
    command_type IN (
      'QUEUE_RUN',
      'CLAIM_NEXT',
      'FINALIZE_RUN',
      'CANCEL_RUN',
      'FAIL_EXPIRED_LEASE',
      'FAIL_RUN_INTEGRITY',
      'RETRY_RUN'
    )
  ),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  run_id uuid,
  result_payload jsonb,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id)
);

CREATE FUNCTION pactwire_validate_run_execution_scope()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  run_record runs%ROWTYPE;
  journey_payload jsonb;
  expected_checkpoint_ids jsonb;
BEGIN
  IF NEW.payload->>'schemaVersion' IS DISTINCT FROM '1.0.0'
    OR NEW.payload->>'runId' IS DISTINCT FROM NEW.run_id::text
    OR NEW.payload->>'workspaceId' IS DISTINCT FROM NEW.workspace_id::text
    OR NEW.payload->>'softwareId' IS DISTINCT FROM NEW.software_id::text
    OR NEW.payload->>'scopeHash' IS DISTINCT FROM NEW.scope_hash
    OR NEW.payload->>'modelIdentifier' IS DISTINCT FROM NEW.model_identifier
    OR NEW.payload->'requiredCheckpointIds'
      IS DISTINCT FROM NEW.required_checkpoint_ids
    OR (NEW.payload->>'createdAt')::timestamptz
      IS DISTINCT FROM NEW.created_at
    OR NEW.payload->'createdBy' IS DISTINCT FROM NEW.created_by THEN
    RAISE EXCEPTION 'Run execution scope columns must match the immutable payload';
  END IF;
  IF NEW.created_by->>'kind' NOT IN ('HUMAN', 'IMPORTED_SYSTEM', 'AUTOMATION')
    OR length(trim(COALESCE(NEW.created_by->>'actorId', ''))) = 0 THEN
    RAISE EXCEPTION 'A model cannot create a run execution scope';
  END IF;
  IF jsonb_typeof(NEW.required_checkpoint_ids) IS DISTINCT FROM 'array'
    OR jsonb_array_length(NEW.required_checkpoint_ids) = 0
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(NEW.required_checkpoint_ids) checkpoint(id)
      GROUP BY checkpoint.id
      HAVING count(*) > 1
    ) THEN
    RAISE EXCEPTION 'Run execution scope requires unique checkpoint IDs';
  END IF;

  SELECT * INTO run_record
    FROM runs
    WHERE workspace_id = NEW.workspace_id AND id = NEW.run_id;
  SELECT payload INTO journey_payload
    FROM journey_versions
    WHERE workspace_id = NEW.workspace_id
      AND id = run_record.journey_version_id;
  SELECT COALESCE(jsonb_agg(checkpoint.value->>'checkpointId' ORDER BY checkpoint.position), '[]'::jsonb)
    INTO expected_checkpoint_ids
    FROM jsonb_array_elements(journey_payload->'checkpoints')
      WITH ORDINALITY AS checkpoint(value, position)
    WHERE COALESCE((checkpoint.value->>'required')::boolean, false);
  IF run_record.id IS NULL
    OR run_record.software_id IS DISTINCT FROM NEW.software_id
    OR expected_checkpoint_ids IS DISTINCT FROM NEW.required_checkpoint_ids THEN
    RAISE EXCEPTION 'Run execution scope must match the frozen journey checkpoints';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION pactwire_validate_run_worker_lease()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  run_state text;
BEGIN
  IF NEW.payload->>'schemaVersion' IS DISTINCT FROM '1.0.0'
    OR NEW.payload->>'id' IS DISTINCT FROM NEW.id::text
    OR NEW.payload->>'workspaceId' IS DISTINCT FROM NEW.workspace_id::text
    OR NEW.payload->>'runId' IS DISTINCT FROM NEW.run_id::text
    OR NEW.payload->>'workerId' IS DISTINCT FROM NEW.worker_id
    OR NEW.payload->>'tokenHash' IS DISTINCT FROM NEW.token_hash
    OR NEW.payload->>'leaseHash' IS DISTINCT FROM NEW.lease_hash
    OR (NEW.payload->>'acquiredAt')::timestamptz
      IS DISTINCT FROM NEW.acquired_at
    OR (NEW.payload->>'expiresAt')::timestamptz
      IS DISTINCT FROM NEW.expires_at
    OR NEW.payload->'claimedBy' IS DISTINCT FROM NEW.claimed_by THEN
    RAISE EXCEPTION 'Run worker lease columns must match the immutable payload';
  END IF;
  IF NEW.claimed_by->>'kind' IS DISTINCT FROM 'AUTOMATION'
    OR length(trim(COALESCE(NEW.claimed_by->>'actorId', ''))) = 0
    OR length(trim(COALESCE(NEW.claimed_by->>'component', ''))) = 0 THEN
    RAISE EXCEPTION 'Deterministic automation must own a worker lease';
  END IF;
  SELECT state INTO run_state FROM runs
    WHERE workspace_id = NEW.workspace_id AND id = NEW.run_id;
  IF run_state IS DISTINCT FROM 'RUNNING' THEN
    RAISE EXCEPTION 'A worker lease requires a running run';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION pactwire_validate_run_manifest()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  run_record runs%ROWTYPE;
  scope_record run_execution_scopes%ROWTYPE;
  missing_count integer;
  verified_count integer;
BEGIN
  IF NEW.payload->>'schemaVersion' IS DISTINCT FROM '1.0.0'
    OR NEW.payload->>'id' IS DISTINCT FROM NEW.id::text
    OR NEW.payload->>'workspaceId' IS DISTINCT FROM NEW.workspace_id::text
    OR NEW.payload->>'runId' IS DISTINCT FROM NEW.run_id::text
    OR NEW.payload->>'softwareId' IS DISTINCT FROM NEW.software_id::text
    OR NEW.payload->>'terminalStatus' IS DISTINCT FROM NEW.terminal_status
    OR NEW.payload->>'manifestHash' IS DISTINCT FROM NEW.manifest_hash
    OR (NEW.payload->>'terminalAt')::timestamptz
      IS DISTINCT FROM NEW.finalized_at
    OR NEW.payload->'finalizedBy' IS DISTINCT FROM NEW.finalized_by THEN
    RAISE EXCEPTION 'Run manifest columns must match the immutable payload';
  END IF;
  IF NEW.finalized_by->>'kind' IS DISTINCT FROM 'AUTOMATION'
    OR length(trim(COALESCE(NEW.finalized_by->>'actorId', ''))) = 0
    OR length(trim(COALESCE(NEW.finalized_by->>'component', ''))) = 0 THEN
    RAISE EXCEPTION 'Deterministic automation must finalize a run manifest';
  END IF;

  SELECT * INTO run_record FROM runs
    WHERE workspace_id = NEW.workspace_id AND id = NEW.run_id;
  SELECT * INTO scope_record FROM run_execution_scopes
    WHERE workspace_id = NEW.workspace_id AND run_id = NEW.run_id;
  IF run_record.id IS NULL
    OR scope_record.run_id IS NULL
    OR run_record.software_id IS DISTINCT FROM NEW.software_id
    OR NEW.payload->'snapshot'->>'agreementVersionId'
      IS DISTINCT FROM run_record.agreement_version_id::text
    OR NEW.payload->'snapshot'->>'journeyVersionId'
      IS DISTINCT FROM run_record.journey_version_id::text
    OR NEW.payload->'snapshot'->>'authorizationId'
      IS DISTINCT FROM run_record.authorization_id::text
    OR NEW.payload->'snapshot'->>'runnerConfigVersion'
      IS DISTINCT FROM run_record.runner_config_version
    OR NEW.payload->'snapshot'->>'snapshotHash'
      IS DISTINCT FROM run_record.snapshot_hash
    OR NEW.payload->>'executionScopeHash' IS DISTINCT FROM scope_record.scope_hash
    OR NEW.payload->>'modelIdentifier'
      IS DISTINCT FROM scope_record.model_identifier
    OR NEW.payload->'requiredCheckpointIds'
      IS DISTINCT FROM scope_record.required_checkpoint_ids
    OR NEW.payload->>'runnerConfigVersion'
      IS DISTINCT FROM run_record.runner_config_version
    OR (NEW.payload->>'queuedAt')::timestamptz
      IS DISTINCT FROM run_record.queued_at
    OR NEW.payload->>'retryOfRunId'
      IS DISTINCT FROM (
        CASE
          WHEN run_record.retry_of_run_id IS NULL THEN NULL
          ELSE run_record.retry_of_run_id::text
        END
      ) THEN
    RAISE EXCEPTION 'Run manifest must match its frozen run and execution scope';
  END IF;
  IF (NEW.terminal_status = 'CANCELED' AND run_record.state NOT IN ('QUEUED', 'RUNNING'))
    OR (NEW.terminal_status <> 'CANCELED' AND run_record.state <> 'RUNNING') THEN
    RAISE EXCEPTION 'Run manifest terminal status does not match active run state';
  END IF;
  IF jsonb_array_length(NEW.payload->'checkpointCoverage')
      IS DISTINCT FROM jsonb_array_length(scope_record.required_checkpoint_ids)
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(scope_record.required_checkpoint_ids)
        WITH ORDINALITY AS required(value, position)
      LEFT JOIN jsonb_array_elements(NEW.payload->'checkpointCoverage')
        WITH ORDINALITY AS coverage(value, position)
        USING (position)
      WHERE required.value #>> '{}'
        IS DISTINCT FROM coverage.value->>'checkpointId'
    ) THEN
    RAISE EXCEPTION 'Run manifest coverage must match every frozen checkpoint';
  END IF;
  SELECT count(*) FILTER (WHERE coverage.value->>'status' <> 'VERIFIED'),
         count(*) FILTER (WHERE coverage.value->>'status' = 'VERIFIED')
    INTO missing_count, verified_count
    FROM jsonb_array_elements(NEW.payload->'checkpointCoverage') coverage(value);
  IF jsonb_array_length(NEW.payload->'missingCoverage') <> missing_count
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(NEW.payload->'missingCoverage') missing(value)
      WHERE missing.value->>'status' NOT IN ('NOT_TESTED', 'NOT_VISIBLE')
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(NEW.payload->'checkpointCoverage') coverage(value)
          WHERE coverage.value IS NOT DISTINCT FROM missing.value
        )
    )
    OR (NEW.terminal_status = 'COMPLETED' AND missing_count <> 0)
    OR (NEW.terminal_status = 'PARTIAL' AND (missing_count = 0 OR verified_count = 0))
    OR (NEW.terminal_status = 'FAILED' AND missing_count = 0) THEN
    RAISE EXCEPTION 'Run manifest terminal state must derive from exact coverage';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER run_execution_scope_guard
BEFORE INSERT ON run_execution_scopes
FOR EACH ROW EXECUTE FUNCTION pactwire_validate_run_execution_scope();

CREATE TRIGGER run_worker_lease_guard
BEFORE INSERT ON run_worker_leases
FOR EACH ROW EXECUTE FUNCTION pactwire_validate_run_worker_lease();

CREATE TRIGGER run_manifest_guard
BEFORE INSERT ON run_manifests
FOR EACH ROW EXECUTE FUNCTION pactwire_validate_run_manifest();

CREATE TRIGGER run_execution_scopes_immutable
BEFORE UPDATE OR DELETE ON run_execution_scopes
FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();

CREATE TRIGGER run_worker_leases_immutable
BEFORE UPDATE OR DELETE ON run_worker_leases
FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();

CREATE TRIGGER run_manifests_immutable
BEFORE UPDATE OR DELETE ON run_manifests
FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();

CREATE TRIGGER run_orchestration_commands_immutable
BEFORE UPDATE OR DELETE ON run_orchestration_commands
FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
