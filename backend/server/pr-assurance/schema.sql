-- PR assurance demo (an add-on), version 1 of its own ledger, pr_assurance_migrations.
-- The workspace schema stays 8: no other table is referenced or changed, and the operations
-- backup/permission tools (which cover the schema-8 contract) do not include these tables yet.
-- Run history is kept: a finished run (COMPLETED, FAILED, TIMED_OUT, CANCELLED) never changes,
-- no run is deleted, and progress events are append-only.

CREATE TABLE IF NOT EXISTS pr_assurance_pulls (
  pull_number  INTEGER PRIMARY KEY CHECK (pull_number > 0),
  repository   TEXT NOT NULL,
  head_sha     TEXT NOT NULL CHECK (head_sha ~ '^[0-9a-f]{40}$'),
  base_sha     TEXT NOT NULL CHECK (base_sha ~ '^[0-9a-f]{40}$'),
  head_ref     TEXT NOT NULL,
  base_ref     TEXT NOT NULL,
  title        TEXT NOT NULL,
  url          TEXT NOT NULL,
  fingerprint  TEXT NOT NULL,
  imported_by  TEXT NOT NULL,
  imported_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pr_assurance_runs (
  id                     TEXT PRIMARY KEY CHECK (id ~ '^[0-9a-f-]{36}$'),
  pull_number            INTEGER NOT NULL REFERENCES pr_assurance_pulls(pull_number),
  head_sha               TEXT NOT NULL CHECK (head_sha ~ '^[0-9a-f]{40}$'),
  rules_snapshot_digest  TEXT NOT NULL CHECK (rules_snapshot_digest ~ '^sha256:[0-9a-f]{64}$'),
  requested_by           TEXT NOT NULL,
  request_key            TEXT NOT NULL,
  status                 TEXT NOT NULL CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED','TIMED_OUT','CANCELLED')),
  github_run_id          BIGINT,
  github_run_url         TEXT,
  check_run_id           BIGINT,
  progress               TEXT,
  evidence_text          TEXT,
  evidence_sha256        TEXT CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  team_tests             TEXT,
  disposition            TEXT CHECK (disposition IN ('READY','NOT_READY','INDETERMINATE')),
  failure_code           TEXT,
  failure_message        TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  finished_at            TEXT,
  UNIQUE (requested_by, request_key),
  CHECK ((status = 'COMPLETED') = (disposition IS NOT NULL)),
  CHECK (status <> 'COMPLETED' OR (evidence_text IS NOT NULL AND evidence_sha256 IS NOT NULL)),
  CHECK ((status IN ('QUEUED','RUNNING')) = (finished_at IS NULL)),
  CHECK (status IN ('QUEUED','RUNNING','COMPLETED') OR failure_code IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS pr_assurance_runs_by_pull ON pr_assurance_runs (pull_number, created_at DESC);

CREATE TABLE IF NOT EXISTS pr_assurance_run_events (
  run_id       TEXT NOT NULL REFERENCES pr_assurance_runs(id),
  seq          INTEGER NOT NULL CHECK (seq >= 1),
  stage        TEXT NOT NULL,
  message      TEXT NOT NULL,
  recorded_at  TEXT NOT NULL,
  PRIMARY KEY (run_id, seq)
);

CREATE OR REPLACE FUNCTION pr_assurance_keep_run_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PR_ASSURANCE_HISTORY_KEPT';
  END IF;
  IF OLD.status IN ('COMPLETED','FAILED','TIMED_OUT','CANCELLED') THEN
    RAISE EXCEPTION 'PR_ASSURANCE_RUN_FINAL';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER pr_assurance_runs_history
  BEFORE UPDATE OR DELETE ON pr_assurance_runs
  FOR EACH ROW EXECUTE FUNCTION pr_assurance_keep_run_history();

CREATE OR REPLACE FUNCTION pr_assurance_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PR_ASSURANCE_HISTORY_KEPT';
END $$;
CREATE OR REPLACE TRIGGER pr_assurance_run_events_append_only
  BEFORE UPDATE OR DELETE ON pr_assurance_run_events
  FOR EACH ROW EXECUTE FUNCTION pr_assurance_events_append_only();
