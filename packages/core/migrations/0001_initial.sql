CREATE TABLE workspaces (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  created_at timestamptz NOT NULL,
  created_by jsonb NOT NULL
);

CREATE TABLE user_roles (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  id uuid NOT NULL,
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('PRIVACY_OFFICER', 'TEST_OPERATOR', 'REVIEWER', 'APPLICATION_APPROVER', 'SECURITY_REVIEWER')),
  assigned_at timestamptz NOT NULL,
  assigned_by jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, user_id, role)
);

CREATE TABLE software_records (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  id uuid NOT NULL,
  name text NOT NULL,
  vendor_name text NOT NULL,
  approval_state text NOT NULL CHECK (approval_state IN ('UNKNOWN', 'APPROVED', 'HOLD', 'REJECTED', 'RETIRED')),
  approval_owner text NOT NULL CHECK (approval_owner IN ('HUMAN', 'IMPORTED_SYSTEM', 'NONE')),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (approval_state <> 'APPROVED' OR approval_owner <> 'NONE')
);

CREATE TABLE authorizations (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  software_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
  valid_from timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  scope jsonb NOT NULL,
  attested_by jsonb NOT NULL,
  attested_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, id, software_id),
  UNIQUE (workspace_id, software_id, version),
  FOREIGN KEY (workspace_id, software_id) REFERENCES software_records(workspace_id, id),
  CHECK (expires_at > valid_from)
);

CREATE TABLE agreement_versions (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  software_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  source_object_key text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_mime_type text NOT NULL,
  created_at timestamptz NOT NULL,
  created_by jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, id, software_id),
  UNIQUE (workspace_id, software_id, version),
  FOREIGN KEY (workspace_id, software_id) REFERENCES software_records(workspace_id, id)
);

CREATE TABLE requirement_versions (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  agreement_version_id uuid NOT NULL,
  requirement_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('PROPOSED', 'CONFIRMED', 'REJECTED', 'AMBIGUOUS')),
  executable boolean NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, agreement_version_id, requirement_key, version),
  FOREIGN KEY (workspace_id, agreement_version_id) REFERENCES agreement_versions(workspace_id, id),
  CHECK (status <> 'PROPOSED' OR executable = false),
  CHECK (status NOT IN ('REJECTED', 'AMBIGUOUS') OR executable = false),
  CHECK (status <> 'CONFIRMED' OR payload ? 'confirmedBy')
);

CREATE TABLE destination_records (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  id uuid NOT NULL,
  hostname text NOT NULL,
  ownership text NOT NULL CHECK (ownership IN ('UNKNOWN', 'CONFIRMED')),
  classification text NOT NULL CHECK (classification IN ('ALLOWED', 'PROHIBITED', 'UNREVIEWED')),
  payload jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, hostname),
  CHECK (ownership <> 'UNKNOWN' OR classification = 'UNREVIEWED')
);

CREATE TABLE personas (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('TEACHER', 'STUDENT')),
  fictional boolean NOT NULL CHECK (fictional = true),
  display_name text NOT NULL,
  email text NOT NULL CHECK (email LIKE '%.invalid'),
  fields jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  created_by jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, email)
);

CREATE TABLE journey_versions (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  id uuid NOT NULL,
  journey_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  authorization_id uuid NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  created_by jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, id, authorization_id),
  UNIQUE (workspace_id, journey_id, version),
  FOREIGN KEY (workspace_id, authorization_id) REFERENCES authorizations(workspace_id, id)
);

CREATE TABLE runs (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  software_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELED')),
  agreement_version_id uuid NOT NULL,
  journey_version_id uuid NOT NULL,
  authorization_id uuid NOT NULL,
  runner_config_version text NOT NULL,
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  retry_of_run_id uuid,
  queued_at timestamptz NOT NULL,
  terminal_at timestamptz,
  manifest_hash text CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  integrity_failure jsonb,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, id, software_id),
  FOREIGN KEY (workspace_id, software_id) REFERENCES software_records(workspace_id, id),
  FOREIGN KEY (workspace_id, agreement_version_id, software_id) REFERENCES agreement_versions(workspace_id, id, software_id),
  FOREIGN KEY (workspace_id, journey_version_id, authorization_id) REFERENCES journey_versions(workspace_id, id, authorization_id),
  FOREIGN KEY (workspace_id, authorization_id, software_id) REFERENCES authorizations(workspace_id, id, software_id),
  FOREIGN KEY (workspace_id, retry_of_run_id) REFERENCES runs(workspace_id, id),
  CHECK (retry_of_run_id IS NULL OR retry_of_run_id <> id),
  CHECK (
    (state IN ('QUEUED', 'RUNNING') AND terminal_at IS NULL AND manifest_hash IS NULL AND integrity_failure IS NULL)
    OR
    (state = 'COMPLETED' AND terminal_at IS NOT NULL AND manifest_hash IS NOT NULL AND integrity_failure IS NULL)
    OR
    (state IN ('PARTIAL', 'FAILED', 'CANCELED') AND terminal_at IS NOT NULL AND ((manifest_hash IS NOT NULL) <> (integrity_failure IS NOT NULL)))
  )
);

CREATE TABLE canaries (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  run_id uuid NOT NULL,
  source_field text NOT NULL,
  value text NOT NULL,
  generated_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, id, run_id),
  UNIQUE (workspace_id, run_id, value),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id)
);

CREATE TABLE run_events (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  run_id uuid NOT NULL,
  source_run_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('RETRY_QUEUED', 'RUN_STARTED', 'RUN_COMPLETED', 'RUN_PARTIAL', 'RUN_FAILED', 'RUN_CANCELED')),
  previous_state text NOT NULL CHECK (previous_state IN ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELED')),
  next_state text NOT NULL CHECK (next_state IN ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELED')),
  actor_kind text NOT NULL CHECK (actor_kind IN ('HUMAN', 'IMPORTED_SYSTEM', 'AUTOMATION')),
  actor jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  manifest_hash text CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  integrity_failure jsonb,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id),
  FOREIGN KEY (workspace_id, source_run_id) REFERENCES runs(workspace_id, id),
  CHECK (previous_state <> next_state),
  CHECK (
    (event_type = 'RUN_STARTED' AND previous_state = 'QUEUED' AND next_state = 'RUNNING')
    OR (event_type = 'RUN_COMPLETED' AND previous_state = 'RUNNING' AND next_state = 'COMPLETED')
    OR (event_type = 'RUN_PARTIAL' AND previous_state = 'RUNNING' AND next_state = 'PARTIAL')
    OR (event_type = 'RUN_FAILED' AND previous_state = 'RUNNING' AND next_state = 'FAILED')
    OR (event_type = 'RUN_CANCELED' AND previous_state IN ('QUEUED', 'RUNNING') AND next_state = 'CANCELED')
    OR (event_type = 'RETRY_QUEUED' AND previous_state IN ('COMPLETED', 'PARTIAL', 'FAILED', 'CANCELED') AND next_state = 'QUEUED')
  ),
  CHECK ((event_type = 'RETRY_QUEUED') = (source_run_id IS NOT NULL)),
  CHECK (source_run_id IS NULL OR source_run_id <> run_id),
  CHECK (event_type <> 'RUN_COMPLETED' OR (manifest_hash IS NOT NULL AND integrity_failure IS NULL)),
  CHECK (event_type NOT IN ('RUN_PARTIAL', 'RUN_FAILED', 'RUN_CANCELED') OR ((manifest_hash IS NOT NULL) <> (integrity_failure IS NOT NULL))),
  CHECK (event_type NOT IN ('RETRY_QUEUED', 'RUN_STARTED') OR (manifest_hash IS NULL AND integrity_failure IS NULL))
);

CREATE TABLE observations (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  run_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('BROWSER', 'NETWORK', 'STORAGE', 'RECORDER')),
  recorder_version text NOT NULL,
  sequence integer NOT NULL CHECK (sequence >= 0),
  observed_at timestamptz NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  facts jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, id, run_id),
  UNIQUE (workspace_id, run_id, sequence),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id)
);

CREATE TABLE canary_matches (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  run_id uuid NOT NULL,
  canary_id uuid NOT NULL,
  observation_id uuid NOT NULL,
  transform text NOT NULL CHECK (transform IN ('EXACT', 'URL_ENCODED', 'BASE64')),
  matched_value_hash text NOT NULL CHECK (matched_value_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id),
  FOREIGN KEY (workspace_id, canary_id, run_id) REFERENCES canaries(workspace_id, id, run_id),
  FOREIGN KEY (workspace_id, observation_id, run_id) REFERENCES observations(workspace_id, id, run_id)
);

CREATE TABLE findings (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  run_id uuid NOT NULL,
  requirement_version_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('WITNESSED_CONFLICT', 'NO_CONFLICT_OBSERVED_IN_NAMED_TESTS', 'NOT_REOBSERVED_IN_NAMED_TESTS', 'NOT_TESTED', 'NOT_VISIBLE', 'NEEDS_REVIEW')),
  all_required_exercised boolean NOT NULL,
  all_required_visible boolean NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, id, run_id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id),
  FOREIGN KEY (workspace_id, requirement_version_id) REFERENCES requirement_versions(workspace_id, id),
  CHECK (state NOT IN ('NO_CONFLICT_OBSERVED_IN_NAMED_TESTS', 'NOT_REOBSERVED_IN_NAMED_TESTS') OR (all_required_exercised AND all_required_visible))
);

CREATE TABLE evidence_receipts (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  run_id uuid NOT NULL,
  finding_id uuid NOT NULL,
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  artifact_hashes jsonb NOT NULL,
  supersedes_receipt_id uuid,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id),
  FOREIGN KEY (workspace_id, finding_id, run_id) REFERENCES findings(workspace_id, id, run_id),
  FOREIGN KEY (workspace_id, supersedes_receipt_id) REFERENCES evidence_receipts(workspace_id, id)
);

CREATE TABLE approval_events (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  software_id uuid NOT NULL,
  previous_state text NOT NULL CHECK (previous_state IN ('UNKNOWN', 'APPROVED', 'HOLD', 'REJECTED', 'RETIRED')),
  next_state text NOT NULL CHECK (next_state IN ('UNKNOWN', 'APPROVED', 'HOLD', 'REJECTED', 'RETIRED')),
  reason text NOT NULL,
  human_decision_id uuid,
  actor_kind text NOT NULL CHECK (actor_kind IN ('HUMAN', 'IMPORTED_SYSTEM', 'AUTOMATION')),
  actor jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, software_id) REFERENCES software_records(workspace_id, id),
  CHECK (previous_state <> next_state),
  CHECK (previous_state <> 'RETIRED'),
  CHECK (actor_kind <> 'AUTOMATION' OR (previous_state = 'APPROVED' AND next_state = 'HOLD' AND reason IN ('WITNESSED_CONFLICT', 'REQUIRED_VISIBILITY_LOSS'))),
  CHECK (actor_kind <> 'IMPORTED_SYSTEM' OR reason = 'IMPORTED_DECISION'),
  CHECK (
    actor_kind <> 'HUMAN'
    OR (next_state = 'UNKNOWN' AND reason = 'HUMAN_DECISION' AND human_decision_id IS NULL)
    OR (next_state = 'APPROVED' AND reason = 'HUMAN_DECISION' AND human_decision_id IS NOT NULL)
    OR (next_state = 'HOLD' AND reason = 'HUMAN_HOLD' AND human_decision_id IS NULL)
    OR (next_state = 'REJECTED' AND reason = 'HUMAN_REJECTION' AND human_decision_id IS NULL)
    OR (next_state = 'RETIRED' AND reason = 'HUMAN_RETIREMENT' AND human_decision_id IS NULL)
  ),
  CHECK (next_state <> 'RETIRED' OR (actor_kind = 'HUMAN' AND reason = 'HUMAN_RETIREMENT')),
  CHECK (human_decision_id IS NULL OR (actor_kind = 'HUMAN' AND next_state = 'APPROVED' AND reason = 'HUMAN_DECISION'))
);

CREATE TABLE human_decisions (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  software_id uuid NOT NULL,
  run_id uuid,
  outcome text NOT NULL CHECK (outcome IN ('KEEP_HOLD', 'RESTORE_APPROVED', 'REJECT', 'RETIRE')),
  rationale text NOT NULL,
  named_scope_acknowledged boolean NOT NULL CHECK (named_scope_acknowledged = true),
  actor jsonb NOT NULL,
  signed_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, software_id) REFERENCES software_records(workspace_id, id),
  FOREIGN KEY (workspace_id, run_id, software_id) REFERENCES runs(workspace_id, id, software_id)
);

CREATE TABLE audit_events (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  id uuid NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  action text NOT NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('HUMAN', 'IMPORTED_SYSTEM', 'AUTOMATION', 'MODEL')),
  actor jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  details jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

ALTER TABLE approval_events
  ADD CONSTRAINT approval_events_human_decision_fk
  FOREIGN KEY (workspace_id, human_decision_id)
  REFERENCES human_decisions(workspace_id, id);

CREATE FUNCTION pactwire_validate_approval_decision() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  decision_outcome text;
  decision_software_id uuid;
BEGIN
  IF NEW.actor_kind = 'HUMAN' AND NEW.next_state = 'APPROVED' THEN
    SELECT outcome, software_id
      INTO decision_outcome, decision_software_id
      FROM human_decisions
      WHERE workspace_id = NEW.workspace_id AND id = NEW.human_decision_id;
    IF NOT FOUND OR decision_outcome <> 'RESTORE_APPROVED' OR decision_software_id <> NEW.software_id THEN
      RAISE EXCEPTION 'Human approval requires a RESTORE_APPROVED decision for the same software';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER approval_events_decision_guard
BEFORE INSERT ON approval_events
FOR EACH ROW EXECUTE FUNCTION pactwire_validate_approval_decision();

CREATE FUNCTION pactwire_guard_run_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  source_run runs%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Run history cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'QUEUED' THEN
      RAISE EXCEPTION 'Runs must be created in QUEUED';
    END IF;
    IF NEW.retry_of_run_id IS NOT NULL THEN
      SELECT * INTO source_run
        FROM runs
        WHERE workspace_id = NEW.workspace_id AND id = NEW.retry_of_run_id;
      IF NOT FOUND
        OR source_run.state NOT IN ('COMPLETED', 'PARTIAL', 'FAILED', 'CANCELED')
        OR source_run.software_id IS DISTINCT FROM NEW.software_id
        OR source_run.agreement_version_id IS DISTINCT FROM NEW.agreement_version_id
        OR source_run.journey_version_id IS DISTINCT FROM NEW.journey_version_id
        OR source_run.authorization_id IS DISTINCT FROM NEW.authorization_id
        OR source_run.runner_config_version IS DISTINCT FROM NEW.runner_config_version
        OR source_run.snapshot_hash IS DISTINCT FROM NEW.snapshot_hash
      THEN
        RAISE EXCEPTION 'Retry must preserve the terminal source configuration';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.state IN ('COMPLETED', 'PARTIAL', 'FAILED', 'CANCELED') THEN
    RAISE EXCEPTION 'Terminal runs cannot change';
  END IF;
  IF OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
    OR OLD.id IS DISTINCT FROM NEW.id
    OR OLD.software_id IS DISTINCT FROM NEW.software_id
    OR OLD.agreement_version_id IS DISTINCT FROM NEW.agreement_version_id
    OR OLD.journey_version_id IS DISTINCT FROM NEW.journey_version_id
    OR OLD.authorization_id IS DISTINCT FROM NEW.authorization_id
    OR OLD.runner_config_version IS DISTINCT FROM NEW.runner_config_version
    OR OLD.snapshot_hash IS DISTINCT FROM NEW.snapshot_hash
    OR OLD.retry_of_run_id IS DISTINCT FROM NEW.retry_of_run_id
    OR OLD.queued_at IS DISTINCT FROM NEW.queued_at
  THEN
    RAISE EXCEPTION 'Run configuration is frozen';
  END IF;
  IF NOT (
    (OLD.state = 'QUEUED' AND NEW.state IN ('RUNNING', 'CANCELED'))
    OR (OLD.state = 'RUNNING' AND NEW.state IN ('COMPLETED', 'PARTIAL', 'FAILED', 'CANCELED'))
  ) THEN
    RAISE EXCEPTION 'Invalid run state transition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER runs_state_guard
BEFORE INSERT OR UPDATE OR DELETE ON runs
FOR EACH ROW EXECUTE FUNCTION pactwire_guard_run_change();

CREATE FUNCTION pactwire_reject_immutable_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Pactwire immutable records cannot be updated or deleted';
END;
$$;

CREATE TRIGGER agreement_versions_immutable BEFORE UPDATE OR DELETE ON agreement_versions FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
CREATE TRIGGER requirement_versions_immutable BEFORE UPDATE OR DELETE ON requirement_versions FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
CREATE TRIGGER journey_versions_immutable BEFORE UPDATE OR DELETE ON journey_versions FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
CREATE TRIGGER canaries_immutable BEFORE UPDATE OR DELETE ON canaries FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
CREATE TRIGGER observations_immutable BEFORE UPDATE OR DELETE ON observations FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
CREATE TRIGGER run_events_immutable BEFORE UPDATE OR DELETE ON run_events FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
CREATE TRIGGER canary_matches_immutable BEFORE UPDATE OR DELETE ON canary_matches FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
CREATE TRIGGER findings_immutable BEFORE UPDATE OR DELETE ON findings FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
CREATE TRIGGER evidence_receipts_immutable BEFORE UPDATE OR DELETE ON evidence_receipts FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
CREATE TRIGGER approval_events_immutable BEFORE UPDATE OR DELETE ON approval_events FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
CREATE TRIGGER human_decisions_immutable BEFORE UPDATE OR DELETE ON human_decisions FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
