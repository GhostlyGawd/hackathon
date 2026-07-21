ALTER TABLE journey_versions
  ADD COLUMN software_id uuid,
  ADD COLUMN agreement_version_id uuid,
  ADD COLUMN persona_id uuid,
  ADD COLUMN source_journey_version_id uuid,
  ADD CONSTRAINT journey_versions_scope_present CHECK (
    software_id IS NOT NULL
    AND agreement_version_id IS NOT NULL
    AND persona_id IS NOT NULL
  ) NOT VALID,
  ADD CONSTRAINT journey_versions_lineage_shape CHECK (
    (version = 1 AND source_journey_version_id IS NULL)
    OR (version > 1 AND source_journey_version_id IS NOT NULL)
  ) NOT VALID,
  ADD CONSTRAINT journey_versions_software_fk
    FOREIGN KEY (workspace_id, software_id)
    REFERENCES software_records(workspace_id, id) NOT VALID,
  ADD CONSTRAINT journey_versions_agreement_fk
    FOREIGN KEY (workspace_id, agreement_version_id, software_id)
    REFERENCES agreement_versions(workspace_id, id, software_id) NOT VALID,
  ADD CONSTRAINT journey_versions_persona_fk
    FOREIGN KEY (workspace_id, persona_id)
    REFERENCES personas(workspace_id, id) NOT VALID,
  ADD CONSTRAINT journey_versions_source_fk
    FOREIGN KEY (workspace_id, source_journey_version_id)
    REFERENCES journey_versions(workspace_id, id) NOT VALID;

CREATE INDEX journey_versions_software_current_idx
  ON journey_versions(workspace_id, software_id, journey_id, version DESC);

CREATE FUNCTION pactwire_validate_named_journey_version() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  source_record journey_versions%ROWTYPE;
  authorization_record authorizations%ROWTYPE;
  authorization_review_at timestamptz;
  persona_record personas%ROWTYPE;
  requirement_record requirement_versions%ROWTYPE;
  requirement_id uuid;
  field_record jsonb;
  source_field text;
BEGIN
  IF NEW.payload->>'id' IS DISTINCT FROM NEW.id::text
    OR NEW.payload->>'workspaceId' IS DISTINCT FROM NEW.workspace_id::text
    OR NEW.payload->>'softwareId' IS DISTINCT FROM NEW.software_id::text
    OR NEW.payload->>'agreementVersionId' IS DISTINCT FROM NEW.agreement_version_id::text
    OR NEW.payload->>'journeyId' IS DISTINCT FROM NEW.journey_id::text
    OR (NEW.payload->>'version')::integer IS DISTINCT FROM NEW.version
    OR NEW.payload->>'authorizationId' IS DISTINCT FROM NEW.authorization_id::text
    OR NEW.payload->>'personaId' IS DISTINCT FROM NEW.persona_id::text
    OR COALESCE(NEW.payload->>'sourceVersionId', '')
      IS DISTINCT FROM COALESCE(NEW.source_journey_version_id::text, '') THEN
    RAISE EXCEPTION 'Journey columns must match the immutable payload';
  END IF;

  IF NEW.created_by->>'kind' IS DISTINCT FROM 'HUMAN'
    OR length(trim(COALESCE(NEW.created_by->>'actorId', ''))) = 0 THEN
    RAISE EXCEPTION 'Only a named human can author a runnable journey version';
  END IF;

  IF NEW.version = 1 THEN
    IF NEW.source_journey_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'The first journey version cannot identify a source';
    END IF;
  ELSE
    SELECT * INTO source_record
      FROM journey_versions
      WHERE workspace_id = NEW.workspace_id
        AND id = NEW.source_journey_version_id;
    IF NOT FOUND
      OR source_record.journey_id <> NEW.journey_id
      OR source_record.software_id <> NEW.software_id
      OR source_record.agreement_version_id <> NEW.agreement_version_id
      OR NEW.version <> source_record.version + 1 THEN
      RAISE EXCEPTION 'A journey version must append directly to its scoped source';
    END IF;
    IF EXISTS (
      SELECT 1 FROM journey_versions current_version
      WHERE current_version.workspace_id = NEW.workspace_id
        AND current_version.journey_id = NEW.journey_id
        AND current_version.version > source_record.version
    ) THEN
      RAISE EXCEPTION 'A journey version must append to the current version';
    END IF;
  END IF;

  SELECT * INTO authorization_record
    FROM authorizations
    WHERE workspace_id = NEW.workspace_id
      AND id = NEW.authorization_id
      AND software_id = NEW.software_id;
  IF NOT FOUND
    OR authorization_record.status <> 'ACTIVE'
    OR CURRENT_TIMESTAMP < authorization_record.valid_from
    OR CURRENT_TIMESTAMP >= authorization_record.expires_at THEN
    RAISE EXCEPTION 'A runnable journey requires an active scoped authorization';
  END IF;
  BEGIN
    authorization_review_at :=
      (authorization_record.scope->>'reviewAt')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Journey authorization review date is invalid';
  END;
  IF CURRENT_TIMESTAMP >= authorization_review_at THEN
    RAISE EXCEPTION 'A runnable journey requires authorization review to be current';
  END IF;
  IF EXISTS (
    SELECT 1 FROM authorizations newer_authorization
    WHERE newer_authorization.workspace_id = NEW.workspace_id
      AND newer_authorization.software_id = NEW.software_id
      AND newer_authorization.version > authorization_record.version
  ) THEN
    RAISE EXCEPTION 'A runnable journey requires the current authorization version';
  END IF;
  IF jsonb_typeof(NEW.payload->'allowedActions') IS DISTINCT FROM 'array'
    OR jsonb_array_length(NEW.payload->'allowedActions') = 0
    OR jsonb_typeof(NEW.payload->'prohibitedActions') IS DISTINCT FROM 'array'
    OR jsonb_typeof(authorization_record.scope->'allowedActions')
      IS DISTINCT FROM 'array'
    OR jsonb_typeof(authorization_record.scope->'prohibitedActions')
      IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Journey authorization action scope is invalid';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(NEW.payload->'allowedActions')
      AS journey_action(value)
    WHERE NOT (
      authorization_record.scope->'allowedActions' ? journey_action.value
    )
  ) THEN
    RAISE EXCEPTION 'Journey actions exceed the active authorization scope';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      authorization_record.scope->'prohibitedActions'
    ) AS prohibited_action(value)
    WHERE NOT (NEW.payload->'prohibitedActions' ? prohibited_action.value)
  ) THEN
    RAISE EXCEPTION 'Journey must retain every action prohibited by its authorization';
  END IF;

  SELECT * INTO persona_record
    FROM personas
    WHERE workspace_id = NEW.workspace_id
      AND id = NEW.persona_id;
  IF NOT FOUND OR persona_record.role IS DISTINCT FROM NEW.payload->>'role' THEN
    RAISE EXCEPTION 'A runnable journey requires a matching fictional persona role';
  END IF;

  IF jsonb_typeof(NEW.payload->'requirementVersionIds') IS DISTINCT FROM 'array'
    OR jsonb_array_length(NEW.payload->'requirementVersionIds') = 0 THEN
    RAISE EXCEPTION 'A runnable journey requires a linked requirement';
  END IF;
  FOR requirement_id IN
    SELECT value::uuid
    FROM jsonb_array_elements_text(NEW.payload->'requirementVersionIds')
  LOOP
    SELECT * INTO requirement_record
      FROM requirement_versions
      WHERE workspace_id = NEW.workspace_id
        AND agreement_version_id = NEW.agreement_version_id
        AND id = requirement_id;
    IF NOT FOUND
      OR requirement_record.status <> 'CONFIRMED'
      OR NOT requirement_record.executable THEN
      RAISE EXCEPTION 'A runnable journey requires human-confirmed executable requirements';
    END IF;
    IF EXISTS (
      SELECT 1 FROM requirement_versions newer_requirement
      WHERE newer_requirement.workspace_id = NEW.workspace_id
        AND newer_requirement.agreement_version_id = NEW.agreement_version_id
        AND newer_requirement.requirement_key = requirement_record.requirement_key
        AND newer_requirement.version > requirement_record.version
    ) THEN
      RAISE EXCEPTION 'A runnable journey requires the current requirement version';
    END IF;
  END LOOP;

  IF jsonb_typeof(NEW.payload->'testFields') IS DISTINCT FROM 'array'
    OR jsonb_array_length(NEW.payload->'testFields') = 0 THEN
    RAISE EXCEPTION 'A runnable journey requires fictional test fields';
  END IF;
  FOR field_record IN
    SELECT value FROM jsonb_array_elements(NEW.payload->'testFields')
  LOOP
    source_field := field_record->>'sourceField';
    IF source_field NOT IN ('email', 'displayName')
      AND NOT (persona_record.fields ? source_field) THEN
      RAISE EXCEPTION 'A journey test field must exist on its fictional persona';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER named_journey_version_guard
BEFORE INSERT ON journey_versions
FOR EACH ROW EXECUTE FUNCTION pactwire_validate_named_journey_version();
