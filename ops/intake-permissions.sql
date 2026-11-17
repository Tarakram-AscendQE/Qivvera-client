-- REVIEW TEMPLATE ONLY. Run as the authorized database owner after schema 5.
-- Replace qivvera_web with the existing non-owner runtime role. This does not create users.
GRANT SELECT ON source_previews, source_imports, source_backoff TO qivvera_web;
GRANT INSERT, UPDATE, DELETE ON source_previews TO qivvera_web;
GRANT INSERT ON source_imports TO qivvera_web;
GRANT INSERT, UPDATE ON source_backoff TO qivvera_web;
-- Existing workflow write permissions remain needed for atomic import of changes/revisions/candidates.
-- DO NOT grant UPDATE or DELETE on source_imports, evidence, review history or resolution history.
-- Worker needs no source-intake-table writes. Verify inherited grants and owner privileges separately.
