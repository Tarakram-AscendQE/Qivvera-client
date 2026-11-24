-- Draft preparation is separate from authority, verification and evidence.
CREATE TABLE IF NOT EXISTS drafting_runs (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL,
 request_digest TEXT NOT NULL,
 application_id TEXT NOT NULL REFERENCES applications(id),
 change_id TEXT NOT NULL REFERENCES changes(id),
 revision_id TEXT NOT NULL REFERENCES change_revisions(id),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 created_at_ms BIGINT NOT NULL,
 expires_at BIGINT NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('rules','openai')),
 status TEXT NOT NULL CHECK(status IN ('GENERATING','COMPLETED','FAILED')),
 source_snapshot TEXT NOT NULL,
 source_snapshot_digest TEXT NOT NULL,
 result_snapshot TEXT,
 result_digest TEXT,
 failure_code TEXT,
 completed_at TEXT,
 UNIQUE(created_by,request_id)
);
CREATE INDEX IF NOT EXISTS drafting_runs_revision ON drafting_runs(revision_id,created_at,id);
CREATE INDEX IF NOT EXISTS drafting_runs_actor_time ON drafting_runs(created_by,created_at_ms);
CREATE INDEX IF NOT EXISTS drafting_runs_method_time ON drafting_runs(method,created_at_ms);
CREATE TABLE IF NOT EXISTS drafting_suggestions (
 id TEXT PRIMARY KEY,
 run_id TEXT NOT NULL REFERENCES drafting_runs(id),
 ordinal INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('PROPOSED','CANDIDATE_CREATED','DISMISSED')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version IN (1,2)),
 decision_snapshot TEXT,
 decision_digest TEXT,
 decision_request_digest TEXT,
 obligation_id TEXT REFERENCES obligations(id),
 UNIQUE(run_id,ordinal)
);
