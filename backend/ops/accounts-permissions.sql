-- REVIEW TEMPLATE ONLY. Apply as the authorized owner after schema 8.
-- Replace qivvera_web with the actual non-owner web runtime role; this creates no account.
REVOKE ALL ON workspace_users,workspace_user_roles FROM qivvera_web;
GRANT SELECT ON workspace_users,workspace_user_roles TO qivvera_web;
GRANT UPDATE(last_login_at) ON workspace_users TO qivvera_web;
-- The web runtime never creates, edits, re-roles or disables accounts. Those changes are made by the
-- operator (npm run accounts, or reviewed SQL from `npm run accounts -- sql ...`) with owner access.
-- Existing DELETE on workspace_sessions lets the web runtime remove a session whose credentials changed.
-- No account privilege is required by the verifier worker.
-- Inspect inherited permissions, owner status and memberships separately: these direct grants alone
-- do not establish least privilege and are not executed automatically at startup or during build.
