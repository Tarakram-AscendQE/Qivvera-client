-- REVIEW TEMPLATE ONLY. Apply as the authorized owner after schema 7.
-- Replace qivvera_web with the actual non-owner web runtime role; this creates no account.
REVOKE ALL ON verification_templates,verification_template_versions,
 verification_template_mutations,verification_template_uses FROM qivvera_web;
GRANT SELECT,INSERT ON verification_templates,verification_template_versions,
 verification_template_mutations,verification_template_uses TO qivvera_web;
GRANT UPDATE(state,state_version,archived_by,archived_at,archive_rationale,archive_request_key)
 ON verification_templates TO qivvera_web;
-- Version bodies, source identities, mutation/use receipts and family identity cannot be updated.
-- No DELETE is required. No template privilege is required by the verifier worker.
-- Existing SELECT on source scope/history/plans and INSERT on assurance_plans/activity are required.
-- Existing UPDATE(id) on changes permits the destination/source change row lock.
-- Inspect inherited permissions, owner status and memberships separately: these direct grants alone
-- do not establish least privilege and are not executed automatically at startup or during build.
