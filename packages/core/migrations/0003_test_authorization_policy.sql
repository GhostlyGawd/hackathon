CREATE TABLE authorization_policy_decisions (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  software_id uuid NOT NULL,
  authorization_id uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('ALLOW', 'DENY')),
  reason text NOT NULL CHECK (reason IN (
    'POLICY_ALLOWED',
    'AUTHORIZATION_NOT_YET_VALID',
    'AUTHORIZATION_REVIEW_DUE',
    'AUTHORIZATION_EXPIRED',
    'AUTHORIZATION_REVOKED',
    'INVALID_TARGET',
    'TARGET_NOT_HTTPS',
    'DOMAIN_NOT_ALLOWED',
    'BASE_PATH_NOT_ALLOWED',
    'ACTION_NOT_ALLOWED',
    'ACTION_PROHIBITED',
    'POPUP_BLOCKED'
  )),
  message text NOT NULL CHECK (length(trim(message)) > 0),
  attempt_kind text NOT NULL CHECK (attempt_kind IN (
    'RUN_QUEUE', 'NAVIGATION', 'REDIRECT', 'POPUP', 'ACTION'
  )),
  target_domain text,
  action text CHECK (action IS NULL OR action IN (
    'NAVIGATE', 'SUBMIT', 'DOWNLOAD', 'UPLOAD',
    'MESSAGE', 'PURCHASE', 'DELETE', 'ADMINISTER'
  )),
  actor_kind text NOT NULL CHECK (actor_kind IN ('HUMAN', 'AUTOMATION')),
  actor jsonb NOT NULL,
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, authorization_id, software_id)
    REFERENCES authorizations(workspace_id, id, software_id),
  CHECK ((outcome = 'ALLOW') = (reason = 'POLICY_ALLOWED')),
  CHECK (actor ->> 'kind' = actor_kind),
  CHECK (length(trim(actor ->> 'actorId')) > 0),
  CHECK (
    target_domain IS NULL
    OR target_domain ~ '^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
  )
);

CREATE TRIGGER authorization_policy_decisions_immutable
BEFORE UPDATE OR DELETE ON authorization_policy_decisions
FOR EACH ROW EXECUTE FUNCTION pactwire_reject_immutable_change();

CREATE FUNCTION pactwire_validate_run_authorization() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  authorization_status text;
  authorization_valid_from timestamptz;
  authorization_expires_at timestamptz;
  authorization_scope jsonb;
  authorization_actor jsonb;
  review_at timestamptz;
BEGIN
  IF NEW.state <> 'QUEUED' THEN
    RETURN NEW;
  END IF;

  SELECT status, valid_from, expires_at, scope, attested_by
    INTO authorization_status, authorization_valid_from,
      authorization_expires_at, authorization_scope, authorization_actor
    FROM authorizations
    WHERE workspace_id = NEW.workspace_id
      AND id = NEW.authorization_id
      AND software_id = NEW.software_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Run authorization is unavailable';
  END IF;
  IF authorization_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Run authorization is not active';
  END IF;
  IF CURRENT_TIMESTAMP < authorization_valid_from THEN
    RAISE EXCEPTION 'Run authorization is not valid yet';
  END IF;
  IF CURRENT_TIMESTAMP >= authorization_expires_at THEN
    RAISE EXCEPTION 'Run authorization has expired';
  END IF;
  IF authorization_actor ->> 'kind' <> 'HUMAN' THEN
    RAISE EXCEPTION 'Run authorization requires human attestation';
  END IF;
  IF COALESCE(
    (authorization_scope #>> '{attestation,authorityConfirmed}')::boolean,
    false
  ) IS NOT TRUE OR COALESCE(
    (authorization_scope #>> '{attestation,syntheticAccountsOnlyConfirmed}')::boolean,
    false
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Run authorization attestation is incomplete';
  END IF;
  BEGIN
    review_at := (authorization_scope ->> 'reviewAt')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Run authorization review date is invalid';
  END;
  IF CURRENT_TIMESTAMP >= review_at THEN
    RAISE EXCEPTION 'Run authorization review is due';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER runs_current_authorization_guard
BEFORE INSERT ON runs
FOR EACH ROW EXECUTE FUNCTION pactwire_validate_run_authorization();
