CREATE TABLE secret_records (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  id uuid NOT NULL,
  software_id uuid NOT NULL,
  label text NOT NULL CHECK (length(trim(label)) > 0),
  kind text NOT NULL CHECK (kind IN ('PASSWORD', 'API_TOKEN', 'SESSION_COOKIE')),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED')),
  key_version text NOT NULL CHECK (length(trim(key_version)) > 0),
  encrypted_value jsonb NOT NULL CHECK (
    encrypted_value ->> 'algorithm' = 'AES-256-GCM'
    AND length(encrypted_value ->> 'iv') > 0
    AND length(encrypted_value ->> 'ciphertext') > 0
    AND length(encrypted_value ->> 'authTag') > 0
    AND encrypted_value ->> 'keyVersion' = key_version
  ),
  created_at timestamptz NOT NULL,
  created_by jsonb NOT NULL CHECK (created_by ->> 'kind' = 'HUMAN'),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by jsonb,
  revocation_reason text,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (id),
  UNIQUE (workspace_id, id, software_id),
  FOREIGN KEY (workspace_id, software_id)
    REFERENCES software_records(workspace_id, id),
  CHECK (expires_at IS NULL OR expires_at > created_at),
  CHECK (
    (status = 'ACTIVE' AND revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
    OR
    (
      status = 'REVOKED'
      AND revoked_at IS NOT NULL
      AND revoked_by ->> 'kind' = 'HUMAN'
      AND length(trim(revocation_reason)) > 0
    )
  )
);

CREATE TABLE secret_access_leases (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  software_id uuid NOT NULL,
  secret_id uuid NOT NULL,
  purpose text NOT NULL CHECK (length(trim(purpose)) > 0),
  token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  browser_context_hash text NOT NULL CHECK (browser_context_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('AVAILABLE', 'CONSUMED')),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  issued_by jsonb NOT NULL CHECK (issued_by ->> 'kind' = 'HUMAN'),
  consumed_at timestamptz,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (id),
  FOREIGN KEY (workspace_id, secret_id, software_id)
    REFERENCES secret_records(workspace_id, id, software_id),
  CHECK (expires_at > issued_at),
  CHECK (
    (status = 'AVAILABLE' AND consumed_at IS NULL)
    OR (status = 'CONSUMED' AND consumed_at IS NOT NULL)
  )
);

CREATE VIEW secret_metadata AS
SELECT
  workspace_id,
  id,
  software_id,
  label,
  kind,
  status,
  key_version,
  created_at,
  created_by,
  expires_at,
  revoked_at,
  revoked_by,
  revocation_reason
FROM secret_records;

CREATE FUNCTION pactwire_guard_secret_record_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Pactwire secret records cannot be deleted';
  END IF;
  IF ROW(
    OLD.workspace_id,
    OLD.id,
    OLD.software_id,
    OLD.label,
    OLD.kind,
    OLD.key_version,
    OLD.encrypted_value,
    OLD.created_at,
    OLD.created_by,
    OLD.expires_at
  ) IS DISTINCT FROM ROW(
    NEW.workspace_id,
    NEW.id,
    NEW.software_id,
    NEW.label,
    NEW.kind,
    NEW.key_version,
    NEW.encrypted_value,
    NEW.created_at,
    NEW.created_by,
    NEW.expires_at
  ) THEN
    RAISE EXCEPTION 'Pactwire encrypted secret bytes and identity are immutable';
  END IF;
  IF OLD.status = 'REVOKED' OR NEW.status <> 'REVOKED' THEN
    RAISE EXCEPTION 'Pactwire secret status can only transition ACTIVE to REVOKED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER secret_records_immutable
BEFORE UPDATE OR DELETE ON secret_records
FOR EACH ROW EXECUTE FUNCTION pactwire_guard_secret_record_change();

CREATE FUNCTION pactwire_guard_secret_lease_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Pactwire secret access leases cannot be deleted';
  END IF;
  IF ROW(
    OLD.workspace_id,
    OLD.id,
    OLD.software_id,
    OLD.secret_id,
    OLD.purpose,
    OLD.token_hash,
    OLD.browser_context_hash,
    OLD.issued_at,
    OLD.expires_at,
    OLD.issued_by
  ) IS DISTINCT FROM ROW(
    NEW.workspace_id,
    NEW.id,
    NEW.software_id,
    NEW.secret_id,
    NEW.purpose,
    NEW.token_hash,
    NEW.browser_context_hash,
    NEW.issued_at,
    NEW.expires_at,
    NEW.issued_by
  ) THEN
    RAISE EXCEPTION 'Pactwire secret lease bindings are immutable';
  END IF;
  IF OLD.status = 'CONSUMED' OR NEW.status <> 'CONSUMED' THEN
    RAISE EXCEPTION 'Pactwire secret lease can only transition AVAILABLE to CONSUMED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER secret_access_leases_immutable
BEFORE UPDATE OR DELETE ON secret_access_leases
FOR EACH ROW EXECUTE FUNCTION pactwire_guard_secret_lease_change();
