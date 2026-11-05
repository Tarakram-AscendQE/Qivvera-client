-- Qivvera Registry PostgreSQL Schema

CREATE TABLE IF NOT EXISTS applications (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  normalized_name   TEXT NOT NULL UNIQUE,
  description       TEXT NOT NULL DEFAULT '',
  repository_url    TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS changes (
  id                TEXT PRIMARY KEY,
  application_id    TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  intent            TEXT NOT NULL DEFAULT '',
  source_revision   TEXT NOT NULL DEFAULT '',
  producer          TEXT NOT NULL DEFAULT 'UNSPECIFIED',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS obligations (
  id                TEXT PRIMARY KEY,
  change_id         TEXT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  statement         TEXT NOT NULL,
  source_reference  TEXT NOT NULL DEFAULT '',
  criticality       TEXT NOT NULL DEFAULT 'MEDIUM',
  version           INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity (
  id                TEXT PRIMARY KEY,
  actor             TEXT NOT NULL,
  action            TEXT NOT NULL,
  entity_id         TEXT NOT NULL,
  detail            TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash        TEXT PRIMARY KEY,
  email             TEXT NOT NULL,
  csrf_token        TEXT NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_changes_application ON changes(application_id);
CREATE INDEX IF NOT EXISTS idx_obligations_change ON obligations(change_id);
CREATE INDEX IF NOT EXISTS idx_activity_time ON activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

