ALTER TABLE requirement_versions
  ADD COLUMN source_requirement_version_id uuid,
  ADD CONSTRAINT requirement_versions_source_fk
    FOREIGN KEY (workspace_id, source_requirement_version_id)
    REFERENCES requirement_versions(workspace_id, id),
  ADD CONSTRAINT requirement_versions_review_source_check CHECK (
    (status = 'PROPOSED' AND source_requirement_version_id IS NULL)
    OR
    (status <> 'PROPOSED' AND source_requirement_version_id IS NOT NULL)
  ),
  ADD CONSTRAINT requirement_versions_model_source_check CHECK (
    (status = 'PROPOSED' AND model_run_id IS NOT NULL)
    OR
    (status <> 'PROPOSED' AND model_run_id IS NULL)
  );

CREATE INDEX requirement_versions_source_idx
  ON requirement_versions(workspace_id, source_requirement_version_id)
  WHERE source_requirement_version_id IS NOT NULL;

CREATE FUNCTION pactwire_validate_requirement_review() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  source_record requirement_versions%ROWTYPE;
BEGIN
  IF NEW.status = 'PROPOSED' THEN
    RETURN NEW;
  END IF;

  IF NEW.source_requirement_version_id IS NULL THEN
    RAISE EXCEPTION 'A reviewed requirement requires a source requirement version';
  END IF;

  SELECT *
    INTO source_record
    FROM requirement_versions
    WHERE workspace_id = NEW.workspace_id
      AND id = NEW.source_requirement_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The source requirement version does not exist';
  END IF;

  IF source_record.agreement_version_id <> NEW.agreement_version_id
    OR source_record.requirement_key <> NEW.requirement_key THEN
    RAISE EXCEPTION 'A review must remain on the source agreement and requirement key';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM requirement_versions current_version
      WHERE current_version.workspace_id = NEW.workspace_id
        AND current_version.agreement_version_id = NEW.agreement_version_id
        AND current_version.requirement_key = NEW.requirement_key
        AND current_version.version > source_record.version
  ) THEN
    RAISE EXCEPTION 'A review must append to the latest requirement version';
  END IF;

  IF NEW.version <> source_record.version + 1 THEN
    RAISE EXCEPTION 'A review version must directly follow its source version';
  END IF;

  IF NEW.payload->>'sourceVersionId' IS DISTINCT FROM NEW.source_requirement_version_id::text
    OR NEW.payload->>'status' IS DISTINCT FROM NEW.status
    OR (NEW.payload->>'executable')::boolean IS DISTINCT FROM NEW.executable THEN
    RAISE EXCEPTION 'Requirement review columns must match the immutable payload';
  END IF;

  IF NEW.status = 'CONFIRMED' THEN
    IF NEW.payload->'confirmedBy'->>'kind' IS DISTINCT FROM 'HUMAN'
      OR length(trim(COALESCE(NEW.payload->'confirmedBy'->>'actorId', ''))) = 0 THEN
      RAISE EXCEPTION 'Only a named human can confirm a requirement';
    END IF;
    IF NEW.executable AND NEW.payload->'predicate' IS NULL THEN
      RAISE EXCEPTION 'An executable confirmed requirement needs a predicate';
    END IF;
  ELSE
    IF NEW.executable THEN
      RAISE EXCEPTION 'Rejected or ambiguous requirements cannot be executable';
    END IF;
    IF NEW.payload->'reviewedBy'->>'kind' IS DISTINCT FROM 'HUMAN'
      OR length(trim(COALESCE(NEW.payload->'reviewedBy'->>'actorId', ''))) = 0 THEN
      RAISE EXCEPTION 'Only a named human can review a requirement';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER requirement_versions_review_guard
BEFORE INSERT ON requirement_versions
FOR EACH ROW EXECUTE FUNCTION pactwire_validate_requirement_review();
