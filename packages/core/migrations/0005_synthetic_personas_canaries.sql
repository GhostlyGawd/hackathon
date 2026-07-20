ALTER TABLE personas
  ADD COLUMN fictional_confirmation jsonb NOT NULL,
  ADD COLUMN scan_result jsonb NOT NULL;

ALTER TABLE personas
  ADD CONSTRAINT personas_obviously_fictional_name
    CHECK (display_name ~* 'fictional'),
  ADD CONSTRAINT personas_reserved_lowercase_email
    CHECK (
      email = lower(email)
      AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.invalid$'
    ),
  ADD CONSTRAINT personas_fields_are_object
    CHECK (jsonb_typeof(fields) = 'object'),
  ADD CONSTRAINT personas_confirmation_is_human
    CHECK (
      fictional_confirmation->>'statementVersion' = 'fictional-only-v1'
      AND fictional_confirmation->'confirmedBy'->>'kind' = 'HUMAN'
      AND length(fictional_confirmation->'confirmedBy'->>'actorId') > 0
      AND length(fictional_confirmation->>'confirmedAt') > 0
    ),
  ADD CONSTRAINT personas_scan_is_clear
    CHECK (
      scan_result->>'scannerVersion' = 'likely-real-v1'
      AND scan_result->>'outcome' = 'CLEAR'
      AND scan_result->'findings' = '[]'::jsonb
    );

ALTER TABLE canaries
  ADD COLUMN persona_id uuid NOT NULL;

ALTER TABLE canaries
  ADD CONSTRAINT canaries_persona_source_fk
    FOREIGN KEY (workspace_id, persona_id) REFERENCES personas(workspace_id, id),
  ADD CONSTRAINT canaries_one_mapping_per_source
    UNIQUE (workspace_id, run_id, persona_id, source_field),
  ADD CONSTRAINT canaries_value_never_reused
    UNIQUE (value),
  ADD CONSTRAINT canaries_generated_value_shape
    CHECK (
      (
        source_field = 'email'
        AND value ~ '^pw-[a-f0-9]{32}@canary\.pactwire\.invalid$'
      )
      OR
      (
        source_field <> 'email'
        AND value ~ '^PACTWIRE-FICTIONAL-[A-F0-9]{32}$'
      )
    );
