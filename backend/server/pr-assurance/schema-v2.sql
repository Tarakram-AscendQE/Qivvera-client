-- PR assurance add-on, version 2 of its own ledger (pr_assurance_migrations): one GitHub connection
-- per application. The workspace schema is unchanged.
--
-- Each application has its own three repositories and its own GitHub token. The token is stored only
-- encrypted (AES-256-GCM, bound to the application id); the key is in QIVVERA_CREDENTIAL_KEY and never
-- in the database. Imported pull requests and runs now belong to an application, so two applications
-- can both have a PR #6.
--
-- Rows from version 1 (the single VendorPay demo) are assigned to the application named VendorPay, if
-- there is one. Columns are added with a constant default, which PostgreSQL applies without firing row
-- triggers, so finished runs stay unchanged (pr_assurance_keep_run_history still refuses any UPDATE).

CREATE TABLE IF NOT EXISTS pr_assurance_connections (
  application_id          TEXT PRIMARY KEY CHECK (application_id ~ '^[0-9a-f-]{36}$'),
  app_repository          TEXT NOT NULL,
  app_repository_id       BIGINT NOT NULL CHECK (app_repository_id > 0),
  tests_repository        TEXT NOT NULL,
  tests_repository_id     BIGINT NOT NULL CHECK (tests_repository_id > 0),
  tests_ref               TEXT NOT NULL,
  profiles_repository     TEXT NOT NULL,
  profiles_repository_id  BIGINT NOT NULL CHECK (profiles_repository_id > 0),
  profiles_commit         TEXT NOT NULL CHECK (profiles_commit ~ '^[0-9a-f]{40}$'),
  rules_snapshot_digest   TEXT CHECK (rules_snapshot_digest ~ '^sha256:[0-9a-f]{64}$'),
  rules_source            TEXT CHECK (rules_source IN ('REPOSITORY','BUNDLED')),
  token_ciphertext        TEXT NOT NULL,
  token_key_id            TEXT NOT NULL,
  configured_by           TEXT NOT NULL,
  configured_at           TEXT NOT NULL,
  CHECK ((rules_snapshot_digest IS NULL) = (rules_source IS NULL))
);

-- Rules snapshots by content digest. A run records the digest it was assessed against, so its report
-- can be derived again later even after the application's rules move on.
CREATE TABLE IF NOT EXISTS pr_assurance_rule_snapshots (
  digest      TEXT PRIMARY KEY CHECK (digest ~ '^sha256:[0-9a-f]{64}$'),
  repository  TEXT NOT NULL,
  body        TEXT NOT NULL,
  stored_at   TEXT NOT NULL
);

DO $$
DECLARE legacy TEXT := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF to_regclass('applications') IS NOT NULL THEN
    legacy := COALESCE((SELECT id FROM applications WHERE normalized_name = 'vendorpay' ORDER BY created_at, id LIMIT 1), legacy);
  END IF;
  EXECUTE format('ALTER TABLE pr_assurance_pulls ADD COLUMN application_id TEXT NOT NULL DEFAULT %L', legacy);
  EXECUTE format('ALTER TABLE pr_assurance_runs ADD COLUMN application_id TEXT NOT NULL DEFAULT %L', legacy);
END $$;
ALTER TABLE pr_assurance_pulls ALTER COLUMN application_id DROP DEFAULT;
ALTER TABLE pr_assurance_runs ALTER COLUMN application_id DROP DEFAULT;

ALTER TABLE pr_assurance_runs DROP CONSTRAINT pr_assurance_runs_pull_number_fkey;
ALTER TABLE pr_assurance_pulls DROP CONSTRAINT pr_assurance_pulls_pkey;
ALTER TABLE pr_assurance_pulls ADD CONSTRAINT pr_assurance_pulls_pkey PRIMARY KEY (application_id, pull_number);
ALTER TABLE pr_assurance_runs ADD CONSTRAINT pr_assurance_runs_pull_fkey
  FOREIGN KEY (application_id, pull_number) REFERENCES pr_assurance_pulls (application_id, pull_number);
DROP INDEX pr_assurance_runs_by_pull;
CREATE INDEX pr_assurance_runs_by_pull ON pr_assurance_runs (application_id, pull_number, created_at DESC);
