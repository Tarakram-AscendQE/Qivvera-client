-- Additive resolution workflow. Never mutates prior assurance plans, runs or evidence.
CREATE TABLE IF NOT EXISTS resolution_items (
 id TEXT PRIMARY KEY,
 change_id TEXT NOT NULL REFERENCES changes(id),
 source_run_id TEXT NOT NULL REFERENCES assurance_runs(id),
 source_revision_id TEXT NOT NULL REFERENCES change_revisions(id),
 source_obligation_id TEXT NOT NULL REFERENCES obligations(id),
 kind TEXT NOT NULL CHECK(kind IN ('VIOLATION','AUTHORITY_GAP','VERIFICATION_GAP','EVIDENCE_GAP','EXECUTION_FAILURE')),
 source_snapshot TEXT NOT NULL, source_digest TEXT NOT NULL,
 assigned_to TEXT NOT NULL, action_plan TEXT NOT NULL, external_reference TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('OPEN','IN_PROGRESS','AWAITING_REASSESSMENT','RESOLVED')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 correction_revision_id TEXT REFERENCES change_revisions(id),
 correction_obligation_id TEXT REFERENCES obligations(id),
 correction_note TEXT, correction_proposed_by TEXT, correction_proposed_at TEXT,
 correction_run_floor INTEGER,
 linked_run_id TEXT REFERENCES assurance_runs(id),
 verification_snapshot TEXT, verified_by TEXT, verified_at TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(source_run_id,source_obligation_id)
);
CREATE INDEX IF NOT EXISTS resolution_items_change ON resolution_items(change_id,created_at,id);
CREATE TABLE IF NOT EXISTS resolution_history (
 id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES resolution_items(id),
 version INTEGER NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL,
 rationale TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(item_id,version)
);
CREATE TABLE IF NOT EXISTS resolution_challenges (
 id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES resolution_items(id),
 state TEXT NOT NULL CHECK(state IN ('OPEN','RESPONDED')),
 raised_by TEXT NOT NULL, rationale TEXT NOT NULL, created_at TEXT NOT NULL,
 response TEXT CHECK(response IN ('FINDING_UPHELD','REASSESSMENT_REQUIRED')),
 responded_by TEXT, response_reason TEXT, independent_actor INTEGER, responded_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS resolution_one_open_challenge ON resolution_challenges(item_id) WHERE state='OPEN';
