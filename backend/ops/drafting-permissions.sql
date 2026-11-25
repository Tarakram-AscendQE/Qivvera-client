-- REVIEW TEMPLATE ONLY. Apply as the authorized database owner after schema 6.
-- Replace qivvera_web with the existing non-owner web runtime role. No users are created.
-- Clear direct grants on the NEW tables, then grant only the runtime's required operations.
REVOKE ALL ON drafting_runs, drafting_suggestions FROM qivvera_web;
GRANT SELECT, INSERT ON drafting_runs, drafting_suggestions TO qivvera_web;
GRANT UPDATE(status,result_snapshot,result_digest,failure_code,completed_at)
    ON drafting_runs TO qivvera_web;
GRANT UPDATE(status,version,decision_snapshot,decision_digest,decision_request_digest,obligation_id)
    ON drafting_suggestions TO qivvera_web;
-- Immutable request/source columns and suggestion identities receive no UPDATE grants.
-- Neither table needs DELETE. Expired generations remain visible and are not auto-retried.
-- Existing workflow grants remain required: SELECT on application/change/revision/obligation/history;
-- INSERT on obligations,obligation_workflow,obligation_history,activity; UPDATE(id) on changes
-- for the per-change lock. Normal review routes retain their separately reviewed workflow grants.
-- The verifier worker needs no drafting-table writes. Do not grant them incidentally.
-- Audit inherited grants, table ownership and privileged memberships separately: this template
-- does not revoke permissions inherited through another role and is not proof of least privilege.
