-- Additive workflow schema. Existing registry tables and records are preserved.
CREATE TABLE IF NOT EXISTS qivvera_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS change_revisions (
 id TEXT PRIMARY KEY, change_id TEXT NOT NULL REFERENCES changes(id), revision_number INTEGER NOT NULL,
 parent_revision_id TEXT REFERENCES change_revisions(id), source_revision TEXT NOT NULL DEFAULT '',
 intent TEXT NOT NULL DEFAULT '', producer TEXT NOT NULL, reason TEXT NOT NULL,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(change_id,revision_number), CHECK(revision_number>0)
);
CREATE INDEX IF NOT EXISTS revisions_change ON change_revisions(change_id,revision_number DESC);
CREATE TABLE IF NOT EXISTS obligation_workflow (
 obligation_id TEXT PRIMARY KEY REFERENCES obligations(id), revision_id TEXT NOT NULL REFERENCES change_revisions(id),
 source_version TEXT NOT NULL DEFAULT '', review_state TEXT NOT NULL DEFAULT 'DRAFT',
 proposed_by TEXT NOT NULL, last_edited_by TEXT NOT NULL, imported INTEGER NOT NULL DEFAULT 0,
 copied_from TEXT REFERENCES obligations(id),
 CHECK(review_state IN ('DRAFT','IN_REVIEW','CLARIFICATION_REQUIRED','ACCEPTED','REJECTED'))
);
CREATE INDEX IF NOT EXISTS workflow_revision ON obligation_workflow(revision_id);
CREATE TABLE IF NOT EXISTS obligation_history (
 id TEXT PRIMARY KEY, obligation_id TEXT NOT NULL REFERENCES obligations(id), version INTEGER NOT NULL,
 revision_id TEXT NOT NULL REFERENCES change_revisions(id), action TEXT NOT NULL, actor TEXT NOT NULL,
 rationale TEXT NOT NULL, independent_actor INTEGER NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(obligation_id,version)
);
CREATE INDEX IF NOT EXISTS history_obligation ON obligation_history(obligation_id,version);
CREATE TABLE IF NOT EXISTS workspace_sessions (
 token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, csrf_token TEXT NOT NULL,
 expires_at BIGINT NOT NULL, credential_version TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_buckets (bucket_key TEXT PRIMARY KEY, attempt_count INTEGER NOT NULL, reset_at BIGINT NOT NULL);
