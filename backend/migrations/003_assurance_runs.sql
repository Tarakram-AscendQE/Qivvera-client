-- Additive, no automatic execution against hosted databases. JSON is stored as text for adapter parity.
CREATE TABLE IF NOT EXISTS assurance_plans (
 id TEXT PRIMARY KEY, change_id TEXT NOT NULL REFERENCES changes(id), revision_id TEXT NOT NULL REFERENCES change_revisions(id),
 version INTEGER NOT NULL, scope_digest TEXT NOT NULL, snapshot TEXT NOT NULL, approved_by TEXT NOT NULL, rationale TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(revision_id,version)
);
CREATE TABLE IF NOT EXISTS assurance_runs (
 id TEXT PRIMARY KEY, change_id TEXT NOT NULL REFERENCES changes(id), revision_id TEXT NOT NULL REFERENCES change_revisions(id),
 plan_id TEXT NOT NULL REFERENCES assurance_plans(id), run_number INTEGER NOT NULL, request_key TEXT NOT NULL UNIQUE, request_digest TEXT NOT NULL,
 requested_by TEXT NOT NULL, status TEXT NOT NULL, snapshot TEXT NOT NULL, queued_at TEXT NOT NULL, queued_deadline BIGINT NOT NULL,
 started_at TEXT, finished_at TEXT, lease_until BIGINT, lease_hash TEXT, worker_id TEXT, failure_code TEXT,
 UNIQUE(revision_id,run_number),
 CHECK(status IN ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS assurance_runs_revision ON assurance_runs(revision_id,queued_at);
CREATE INDEX IF NOT EXISTS assurance_runs_queue ON assurance_runs(status,queued_deadline);
CREATE TABLE IF NOT EXISTS assurance_evidence (
 run_id TEXT PRIMARY KEY REFERENCES assurance_runs(id), manifest TEXT NOT NULL, digest TEXT NOT NULL, created_at TEXT NOT NULL
);
