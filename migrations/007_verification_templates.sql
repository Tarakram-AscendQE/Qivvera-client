-- Reusable preparation only. Existing plan/evidence schemas and bytes are unchanged.
CREATE TABLE IF NOT EXISTS verification_templates (
 id TEXT PRIMARY KEY,
 state TEXT NOT NULL CHECK(state IN ('ACTIVE','ARCHIVED')),
 state_version INTEGER NOT NULL CHECK(state_version IN (1,2)),
 created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 archived_by TEXT, archived_at TEXT, archive_rationale TEXT,
 archive_request_key TEXT
);
CREATE TABLE IF NOT EXISTS verification_template_versions (
 id TEXT PRIMARY KEY,
 template_id TEXT NOT NULL REFERENCES verification_templates(id),
 version INTEGER NOT NULL CHECK(version BETWEEN 1 AND 50),
 parent_version_id TEXT REFERENCES verification_template_versions(id),
 source_plan_id TEXT NOT NULL REFERENCES assurance_plans(id),
 source_plan_digest TEXT NOT NULL,
 snapshot TEXT NOT NULL, digest TEXT NOT NULL,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(template_id,version)
);
CREATE TABLE IF NOT EXISTS verification_template_mutations (
 id TEXT PRIMARY KEY,
 actor TEXT NOT NULL, request_key TEXT NOT NULL, request_digest TEXT NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('CREATE','VERSION','ARCHIVE')),
 template_id TEXT NOT NULL REFERENCES verification_templates(id),
 version_id TEXT NOT NULL REFERENCES verification_template_versions(id),
 input_snapshot TEXT NOT NULL,
 receipt_snapshot TEXT NOT NULL, receipt_digest TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(actor,request_key)
);
CREATE TABLE IF NOT EXISTS verification_template_uses (
 plan_id TEXT PRIMARY KEY REFERENCES assurance_plans(id),
 template_id TEXT NOT NULL REFERENCES verification_templates(id),
 version_id TEXT NOT NULL REFERENCES verification_template_versions(id),
 actor TEXT NOT NULL, request_key TEXT NOT NULL, request_digest TEXT NOT NULL,
 input_snapshot TEXT NOT NULL,
 receipt_snapshot TEXT NOT NULL, receipt_digest TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(actor,request_key)
);
CREATE INDEX IF NOT EXISTS verification_template_versions_family ON verification_template_versions(template_id,version);
CREATE INDEX IF NOT EXISTS verification_template_uses_version ON verification_template_uses(version_id,created_at);
