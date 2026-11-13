-- REVIEW TEMPLATE ONLY. DBA must create appropriately named non-owner roles and verify existing grants.
-- Never run this against an unknown provider/workspace; it is not part of npm run migrate.
-- These grant additions are NOT a full audit of privileges inherited from other roles or PUBLIC.
-- Example roles qivvera_app and qivvera_worker must already exist and must NOT own these tables.
REVOKE ALL ON assurance_evidence FROM qivvera_app;
GRANT SELECT ON assurance_evidence TO qivvera_app;
GRANT SELECT, INSERT ON assurance_plans, assurance_runs TO qivvera_app;
GRANT UPDATE (status, finished_at, failure_code, lease_hash) ON assurance_runs TO qivvera_app;

GRANT SELECT ON applications, changes, change_revisions, obligations, obligation_workflow,
  obligation_history, qivvera_migrations, assurance_plans, assurance_runs, assurance_evidence TO qivvera_worker;
GRANT UPDATE (status, started_at, finished_at, lease_until, lease_hash, worker_id, failure_code)
  ON assurance_runs TO qivvera_worker;
GRANT INSERT ON assurance_evidence, activity TO qivvera_worker;
-- Review/revoke inherited write privileges on plan and authority tables independently.
-- Web app retains its separately reviewed Increment 2 registry/session grants; migration uses a different owner.
