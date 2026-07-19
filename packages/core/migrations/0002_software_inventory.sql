CREATE TABLE software_inventory_details (
  workspace_id uuid NOT NULL,
  software_id uuid NOT NULL,
  authorized_tenant_url text NOT NULL CHECK (
    length(trim(authorized_tenant_url)) > 0
    AND authorized_tenant_url ~ '^https://'
    AND authorized_tenant_url !~ '@'
  ),
  district_owner text NOT NULL CHECK (length(trim(district_owner)) > 0),
  known_version text CHECK (known_version IS NULL OR length(trim(known_version)) > 0),
  created_by jsonb NOT NULL CHECK (created_by ->> 'kind' = 'HUMAN'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, software_id),
  FOREIGN KEY (workspace_id, software_id)
    REFERENCES software_records(workspace_id, id)
);

CREATE TABLE software_approval_origins (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  software_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('UNKNOWN', 'APPROVED', 'HOLD', 'REJECTED', 'RETIRED')),
  actor_kind text NOT NULL CHECK (actor_kind IN ('HUMAN', 'IMPORTED_SYSTEM')),
  set_by jsonb NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  source_reference text CHECK (
    source_reference IS NULL OR length(trim(source_reference)) > 0
  ),
  recorded_by jsonb NOT NULL CHECK (recorded_by ->> 'kind' = 'HUMAN'),
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, software_id)
    REFERENCES software_records(workspace_id, id),
  CHECK (set_by ->> 'kind' = actor_kind),
  CHECK (length(trim(set_by ->> 'actorId')) > 0),
  CHECK (length(trim(set_by ->> 'displayName')) > 0),
  CHECK (
    actor_kind <> 'IMPORTED_SYSTEM'
    OR length(trim(set_by ->> 'source')) > 0
  ),
  CHECK (
    actor_kind <> 'IMPORTED_SYSTEM'
    OR state NOT IN ('HOLD', 'RETIRED')
  )
);

CREATE FUNCTION pactwire_validate_software_approval_origin() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  record_state text;
  record_owner text;
BEGIN
  SELECT approval_state, approval_owner
    INTO record_state, record_owner
    FROM software_records
    WHERE workspace_id = NEW.workspace_id AND id = NEW.software_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval origin software record does not exist';
  END IF;
  IF record_state IS DISTINCT FROM NEW.state THEN
    RAISE EXCEPTION 'Approval origin state must match the software record';
  END IF;
  IF record_owner IS DISTINCT FROM NEW.actor_kind THEN
    RAISE EXCEPTION 'Approval origin actor must match the software owner kind';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER software_approval_origin_guard
BEFORE INSERT ON software_approval_origins
FOR EACH ROW EXECUTE FUNCTION pactwire_validate_software_approval_origin();

CREATE TRIGGER software_approval_origins_immutable
BEFORE UPDATE OR DELETE ON software_approval_origins
FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
