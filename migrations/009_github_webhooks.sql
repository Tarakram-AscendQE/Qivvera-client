-- Signed GitHub webhook receipts. Source context only: no authority, obligation or assurance-result columns.
-- Every verified delivery is kept once (redelivery is idempotent); unsigned requests are never stored.
CREATE TABLE IF NOT EXISTS github_webhook_deliveries (
 delivery_id TEXT PRIMARY KEY, event TEXT NOT NULL, action TEXT,
 repository_id BIGINT, outcome TEXT NOT NULL CHECK (outcome IN ('RECORDED','IGNORED')),
 reason TEXT NOT NULL, received_at TEXT NOT NULL
);
-- Pull-request activity for an operator-configured repository/application binding.
-- Title, refs and sender are untrusted provider text, shown escaped and never interpreted.
CREATE TABLE IF NOT EXISTS source_events (
 id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES github_webhook_deliveries(delivery_id),
 application_id TEXT NOT NULL REFERENCES applications(id), repository_key TEXT NOT NULL,
 repository_id BIGINT NOT NULL, repository TEXT NOT NULL, pull_number INTEGER NOT NULL,
 action TEXT NOT NULL CHECK (action IN ('opened','synchronize','reopened','ready_for_review')),
 head_sha TEXT NOT NULL, base_ref TEXT NOT NULL, head_ref TEXT NOT NULL, title TEXT NOT NULL,
 draft INTEGER NOT NULL CHECK (draft IN (0,1)), sender TEXT NOT NULL, received_at TEXT NOT NULL,
 UNIQUE(delivery_id,application_id)
);
CREATE INDEX IF NOT EXISTS source_events_application ON source_events(application_id,received_at);
CREATE INDEX IF NOT EXISTS source_events_pull ON source_events(repository_id,pull_number,received_at);
