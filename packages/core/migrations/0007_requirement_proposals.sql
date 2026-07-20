CREATE TABLE requirement_proposal_runs (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  software_id uuid NOT NULL,
  agreement_version_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN (
    'SUCCEEDED',
    'REFUSED',
    'INCOMPLETE',
    'INVALID_OUTPUT',
    'UNRELATED',
    'MODEL_MISMATCH',
    'PROVIDER_ERROR',
    'CITATION_MISMATCH'
  )),
  provider text NOT NULL CHECK (provider IN ('OPENAI', 'DETERMINISTIC_FIXTURE')),
  requested_model text NOT NULL CHECK (length(trim(requested_model)) > 0),
  returned_model text,
  attempts jsonb NOT NULL,
  total_input_tokens bigint NOT NULL CHECK (total_input_tokens >= 0),
  total_cached_input_tokens bigint NOT NULL CHECK (
    total_cached_input_tokens >= 0
    AND total_cached_input_tokens <= total_input_tokens
  ),
  total_output_tokens bigint NOT NULL CHECK (total_output_tokens >= 0),
  total_reasoning_tokens bigint NOT NULL CHECK (total_reasoning_tokens >= 0),
  total_tokens bigint NOT NULL CHECK (
    total_tokens >= total_input_tokens + total_output_tokens
  ),
  total_estimated_cost_micro_usd bigint NOT NULL CHECK (
    total_estimated_cost_micro_usd >= 0
  ),
  failure_code text,
  safe_message text,
  requested_by jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, id, agreement_version_id),
  FOREIGN KEY (workspace_id, agreement_version_id, software_id)
    REFERENCES agreement_versions(workspace_id, id, software_id),
  CHECK (jsonb_typeof(attempts) = 'array' AND jsonb_array_length(attempts) > 0),
  CHECK (
    requested_by->>'kind' = 'HUMAN'
    AND length(trim(requested_by->>'actorId')) > 0
  ),
  CHECK (
    (status = 'SUCCEEDED' AND failure_code IS NULL AND safe_message IS NULL)
    OR
    (status <> 'SUCCEEDED' AND failure_code IS NOT NULL AND safe_message IS NOT NULL)
  )
);

ALTER TABLE requirement_versions
  ADD COLUMN model_run_id uuid,
  ADD CONSTRAINT requirement_versions_model_run_fk
    FOREIGN KEY (workspace_id, model_run_id, agreement_version_id)
    REFERENCES requirement_proposal_runs(workspace_id, id, agreement_version_id);

CREATE FUNCTION pactwire_validate_requirement_model_run() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  proposal_status text;
BEGIN
  IF NEW.status = 'PROPOSED' AND NEW.model_run_id IS NULL THEN
    RAISE EXCEPTION 'A new proposed requirement requires a model proposal run';
  END IF;

  IF NEW.model_run_id IS NOT NULL THEN
    SELECT status
      INTO proposal_status
      FROM requirement_proposal_runs
      WHERE workspace_id = NEW.workspace_id
        AND id = NEW.model_run_id
        AND agreement_version_id = NEW.agreement_version_id;
    IF NOT FOUND OR proposal_status <> 'SUCCEEDED' THEN
      RAISE EXCEPTION 'Only a successful model proposal run can create a requirement proposal';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER requirement_versions_model_run_guard
BEFORE INSERT ON requirement_versions
FOR EACH ROW EXECUTE FUNCTION pactwire_validate_requirement_model_run();

CREATE TRIGGER requirement_proposal_runs_immutable
BEFORE UPDATE OR DELETE ON requirement_proposal_runs
FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
