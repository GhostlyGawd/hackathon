ALTER TABLE agreement_versions
  ADD COLUMN source_file_name text NOT NULL,
  ADD COLUMN source_byte_length integer NOT NULL,
  ADD COLUMN effective_from date,
  ADD COLUMN effective_until date,
  ADD COLUMN normalized_text text NOT NULL,
  ADD COLUMN page_map jsonb NOT NULL;

ALTER TABLE agreement_versions
  ADD CONSTRAINT agreement_source_object_key_is_content_addressed
    CHECK (source_object_key ~ '^agreements/sha256/[a-f0-9]{64}\.(pdf|txt)$'),
  ADD CONSTRAINT agreement_source_mime_type_supported
    CHECK (source_mime_type IN ('application/pdf', 'text/plain')),
  ADD CONSTRAINT agreement_source_file_name_is_bounded
    CHECK (
      length(trim(source_file_name)) BETWEEN 1 AND 255
      AND source_file_name !~ '[/\\]'
    ),
  ADD CONSTRAINT agreement_source_byte_length_is_bounded
    CHECK (source_byte_length BETWEEN 1 AND 10485760),
  ADD CONSTRAINT agreement_effective_dates_are_ordered
    CHECK (
      effective_from IS NULL
      OR effective_until IS NULL
      OR effective_until >= effective_from
    ),
  ADD CONSTRAINT agreement_normalized_text_is_bounded
    CHECK (length(normalized_text) BETWEEN 1 AND 2000000),
  ADD CONSTRAINT agreement_page_map_is_nonempty_array
    CHECK (jsonb_typeof(page_map) = 'array' AND jsonb_array_length(page_map) > 0),
  ADD CONSTRAINT agreement_uploader_is_human
    CHECK (
      created_by->>'kind' = 'HUMAN'
      AND length(trim(created_by->>'actorId')) > 0
    ),
  ADD CONSTRAINT agreement_version_hash_is_unique_per_software
    UNIQUE (workspace_id, software_id, source_sha256);
