-- REVIEW TEMPLATE ONLY. Apply as the authorized owner after schema 9.
-- Replace qivvera_web with the actual non-owner web runtime role; this creates no account.
REVOKE ALL ON github_webhook_deliveries,source_events FROM qivvera_web;
GRANT SELECT,INSERT ON github_webhook_deliveries,source_events TO qivvera_web;
-- Receipts are append-only: no UPDATE or DELETE is required. Redelivery is idempotent by delivery ID.
-- Existing SELECT on applications/source_imports and INSERT on activity are required.
-- No webhook privilege is required by the verifier worker.
-- Inspect inherited permissions, owner status and memberships separately: these direct grants alone
-- do not establish least privilege and are not executed automatically at startup or during build.
