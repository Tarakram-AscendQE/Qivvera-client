-- Review template, not an automatic role-creation script. Apply with the authorized database owner.
-- Replace qivvera_web with the approved non-owner web-runtime role. Preserve existing grants.
GRANT SELECT, INSERT, UPDATE ON resolution_items,resolution_challenges TO qivvera_web;
GRANT SELECT, INSERT ON resolution_history TO qivvera_web;
-- This workflow never needs evidence writes, history updates/deletes, or a waiver operation.
REVOKE INSERT, UPDATE, DELETE ON assurance_evidence FROM qivvera_web;
REVOKE UPDATE, DELETE ON resolution_history FROM qivvera_web;
-- Existing workflow privileges include locking changes for an atomic resolution decision.
-- The verifier worker needs no resolution-table writes. Do not grant them incidentally.
-- These statements do not prove least privilege: audit inherited grants/owner privileges separately.
