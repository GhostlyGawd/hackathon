ALTER TABLE destination_records
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN created_by jsonb NOT NULL DEFAULT '{"kind":"IMPORTED_SYSTEM","actorId":"legacy-destination-import","source":"pre-versioned-registry"}'::jsonb;

CREATE TABLE destination_record_versions (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  record_id uuid NOT NULL,
  hostname text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  source_destination_version_id uuid,
  ownership text NOT NULL CHECK (ownership IN ('UNKNOWN', 'CONFIRMED')),
  classification text NOT NULL CHECK (classification IN ('ALLOWED', 'PROHIBITED', 'UNREVIEWED')),
  version_hash text NOT NULL CHECK (version_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  created_by jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, record_id, version),
  FOREIGN KEY (workspace_id, record_id)
    REFERENCES destination_records(workspace_id, id),
  FOREIGN KEY (workspace_id, source_destination_version_id)
    REFERENCES destination_record_versions(workspace_id, id),
  CHECK (
    (version = 1 AND source_destination_version_id IS NULL)
    OR
    (version > 1 AND source_destination_version_id IS NOT NULL)
  ),
  CHECK (ownership <> 'UNKNOWN' OR classification = 'UNREVIEWED')
);

CREATE INDEX destination_record_versions_latest_idx
  ON destination_record_versions(workspace_id, record_id, version DESC);

CREATE INDEX destination_record_versions_hostname_idx
  ON destination_record_versions(workspace_id, hostname, version DESC);

CREATE FUNCTION pactwire_validate_destination_version() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  source_record destination_record_versions%ROWTYPE;
  agreement_record agreement_versions%ROWTYPE;
  evidence_id text;
  evidence_record jsonb;
  classification_record jsonb;
BEGIN
  IF NEW.created_by->>'kind' = 'MODEL' THEN
    RAISE EXCEPTION 'A model cannot author a destination registry version';
  END IF;

  IF NEW.payload->>'schemaVersion' IS DISTINCT FROM 'destination-registry-v1'
    OR NEW.payload->>'id' IS DISTINCT FROM NEW.id::text
    OR NEW.payload->>'recordId' IS DISTINCT FROM NEW.record_id::text
    OR NEW.payload->>'workspaceId' IS DISTINCT FROM NEW.workspace_id::text
    OR NEW.payload->>'hostname' IS DISTINCT FROM NEW.hostname
    OR (NEW.payload->>'version')::integer IS DISTINCT FROM NEW.version
    OR NEW.payload->'ownership'->>'status' IS DISTINCT FROM NEW.ownership
    OR NEW.payload->>'versionHash' IS DISTINCT FROM NEW.version_hash
    OR NEW.payload->'createdBy' IS DISTINCT FROM NEW.created_by THEN
    RAISE EXCEPTION 'Destination version columns must match the immutable payload';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(COALESCE(NEW.payload->'sourceEvidence', '[]'::jsonb)) evidence
      WHERE evidence->'recordedBy'->>'kind' = 'MODEL'
  ) THEN
    RAISE EXCEPTION 'Model output cannot serve as destination source evidence';
  END IF;

  IF NEW.version = 1 THEN
    IF NEW.ownership <> 'UNKNOWN'
      OR NEW.classification <> 'UNREVIEWED'
      OR NEW.payload->'ownership'->>'status' IS DISTINCT FROM 'UNKNOWN'
      OR jsonb_array_length(COALESCE(NEW.payload->'classifications', '[]'::jsonb)) <> 0 THEN
      RAISE EXCEPTION 'A newly observed destination must begin UNKNOWN and unreviewed';
    END IF;
    RETURN NEW;
  END IF;

  SELECT *
    INTO source_record
    FROM destination_record_versions
    WHERE workspace_id = NEW.workspace_id
      AND id = NEW.source_destination_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The source destination version does not exist';
  END IF;

  IF source_record.record_id <> NEW.record_id
    OR source_record.hostname <> NEW.hostname
    OR NEW.version <> source_record.version + 1
    OR NEW.payload->>'sourceVersionId' IS DISTINCT FROM source_record.id::text THEN
    RAISE EXCEPTION 'A destination version must directly follow its source';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM destination_record_versions current_version
      WHERE current_version.workspace_id = NEW.workspace_id
        AND current_version.record_id = NEW.record_id
        AND current_version.version > source_record.version
  ) THEN
    RAISE EXCEPTION 'A destination review must append to the latest destination version';
  END IF;

  IF source_record.ownership = 'UNKNOWN' AND NEW.ownership = 'CONFIRMED' THEN
    IF NEW.created_by->>'kind' IS DISTINCT FROM 'HUMAN'
      OR NEW.payload->'ownership'->'confirmedBy'->>'kind' IS DISTINCT FROM 'HUMAN' THEN
      RAISE EXCEPTION 'Only a named human can confirm destination ownership';
    END IF;
  END IF;

  IF (
    NEW.payload->'ownership' IS DISTINCT FROM source_record.payload->'ownership'
    OR NEW.payload->'classifications' IS DISTINCT FROM source_record.payload->'classifications'
  ) AND NEW.created_by->>'kind' IS DISTINCT FROM 'HUMAN' THEN
    RAISE EXCEPTION 'Only a named human can change destination ownership or agreement status';
  END IF;

  IF NEW.ownership = 'CONFIRMED' THEN
    IF NEW.payload->'ownership'->'confirmedBy'->>'kind' IS DISTINCT FROM 'HUMAN' THEN
      RAISE EXCEPTION 'Confirmed destination ownership requires a named human';
    END IF;

    FOR evidence_id IN
      SELECT jsonb_array_elements_text(
        COALESCE(NEW.payload->'ownership'->'evidenceIds', '[]'::jsonb)
      )
    LOOP
      SELECT evidence
        INTO evidence_record
        FROM jsonb_array_elements(NEW.payload->'sourceEvidence') evidence
        WHERE evidence->>'evidenceId' = evidence_id;
      IF NOT FOUND
        OR evidence_record->>'role' IS DISTINCT FROM 'ENTITY_MAPPING'
        OR evidence_record->>'kind' NOT IN (
          'DISTRICT_INVENTORY',
          'SIGNED_AGREEMENT',
          'VENDOR_ATTESTATION',
          'VENDOR_CONTROLLED_DOCUMENT'
        )
        OR evidence_record->'recordedBy'->>'kind' IS DISTINCT FROM 'HUMAN'
        OR position(lower(NEW.hostname) IN lower(evidence_record->>'excerpt')) = 0
        OR position(
          lower(NEW.payload->'ownership'->>'entityName')
          IN lower(evidence_record->>'excerpt')
        ) = 0 THEN
        RAISE EXCEPTION 'Confirmed ownership requires exact human-reviewed entity-mapping evidence';
      END IF;

      IF evidence_record->>'kind' = 'SIGNED_AGREEMENT' THEN
        SELECT *
          INTO agreement_record
          FROM agreement_versions agreement
          WHERE agreement.workspace_id = NEW.workspace_id
            AND agreement.source_sha256 = evidence_record->>'sourceSha256'
            AND EXISTS (
              SELECT 1
                FROM jsonb_array_elements(agreement.page_map) agreement_page
                WHERE (agreement_page->>'pageNumber')::integer =
                    (evidence_record->>'pageNumber')::integer
                  AND position(
                    evidence_record->>'excerpt'
                    IN agreement_page->>'text'
                  ) > 0
            )
          LIMIT 1;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Signed-agreement mapping evidence must match a stored agreement page';
        END IF;
      END IF;
    END LOOP;
  END IF;

  FOR classification_record IN
    SELECT classification
      FROM jsonb_array_elements(
        COALESCE(NEW.payload->'classifications', '[]'::jsonb)
      ) classification
  LOOP
    IF classification_record->'reviewedBy'->>'kind' IS DISTINCT FROM 'HUMAN' THEN
      RAISE EXCEPTION 'Only a named human can classify a destination for an agreement';
    END IF;

    SELECT *
      INTO agreement_record
      FROM agreement_versions agreement
      WHERE agreement.workspace_id = NEW.workspace_id
        AND agreement.id = (classification_record->>'agreementVersionId')::uuid
        AND agreement.software_id = (classification_record->>'softwareId')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Destination classification must reference an exact stored agreement version';
    END IF;

    FOR evidence_id IN
      SELECT jsonb_array_elements_text(
        COALESCE(classification_record->'evidenceIds', '[]'::jsonb)
      )
    LOOP
      SELECT evidence
        INTO evidence_record
        FROM jsonb_array_elements(NEW.payload->'sourceEvidence') evidence
        WHERE evidence->>'evidenceId' = evidence_id;
      IF NOT FOUND
        OR evidence_record->>'role' IS DISTINCT FROM 'AGREEMENT_CLASSIFICATION'
        OR evidence_record->>'kind' IS DISTINCT FROM 'SIGNED_AGREEMENT'
        OR evidence_record->>'sourceSha256' IS DISTINCT FROM agreement_record.source_sha256
        OR NOT EXISTS (
          SELECT 1
            FROM jsonb_array_elements(agreement_record.page_map) agreement_page
            WHERE (agreement_page->>'pageNumber')::integer =
                (evidence_record->>'pageNumber')::integer
              AND position(
                evidence_record->>'excerpt'
                IN agreement_page->>'text'
              ) > 0
        ) THEN
        RAISE EXCEPTION 'Destination classification evidence must match the exact stored agreement page';
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER destination_record_versions_guard
BEFORE INSERT ON destination_record_versions
FOR EACH ROW EXECUTE FUNCTION pactwire_validate_destination_version();

CREATE TRIGGER destination_record_versions_immutable
BEFORE UPDATE OR DELETE ON destination_record_versions
FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();
