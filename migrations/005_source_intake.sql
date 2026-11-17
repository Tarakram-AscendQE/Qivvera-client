-- Source context only: no authority or assurance-result columns.
CREATE TABLE IF NOT EXISTS source_previews (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, repository_key TEXT NOT NULL,
 configuration_digest TEXT NOT NULL, snapshot TEXT NOT NULL, snapshot_digest TEXT NOT NULL,
 created_at TEXT NOT NULL, expires_at BIGINT NOT NULL, import_id TEXT, request_digest TEXT
);
CREATE TABLE IF NOT EXISTS source_imports (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
 change_id TEXT NOT NULL REFERENCES changes(id), revision_id TEXT NOT NULL REFERENCES change_revisions(id),
 repository_id BIGINT NOT NULL, pull_number INTEGER NOT NULL, head_sha TEXT NOT NULL,
 snapshot TEXT NOT NULL, snapshot_digest TEXT NOT NULL, imported_by TEXT NOT NULL, imported_at TEXT NOT NULL,
 UNIQUE(application_id,repository_id,pull_number,head_sha)
);
CREATE INDEX IF NOT EXISTS source_imports_change ON source_imports(change_id,imported_at);
CREATE TABLE IF NOT EXISTS source_backoff(repository_key TEXT PRIMARY KEY, retry_after BIGINT NOT NULL);
