# Increment 9 — reusable verification templates

Version 0.10.0. Base: published Increment 8
`60153c714cf0b97794166c069dd59f1ff284ff62`. Additive database schema 7.

## Product decision

Continue the reuse work with **Verification templates**: a Policy Authority saves the explicit
check choices of a current approved multi-obligation plan as a versioned preparation record.
For another current change revision, a Policy Authority deliberately matches every template check
to an accepted obligation, chooses a configured target and approves a fresh plan. Execution remains
a separate user action and a separate worker operation.

This bounded step follows the Product Atlas's profile/versioning concern (G13) and the roadmap's
reuse direction. It is not completion of arbitrary configurable assurance profiles. Existing
profiles still determine execution, scope and disposition; a template cannot edit those rules.
Code-aware impact, broader verifier discovery and reduced-scope execution remain future work.

The direct source baseline and cumulative gates are explicit so a chat interruption or an earlier
failed attempt cannot be confused with the published commit's result. Hosted release acceptance
is recorded separately from engineering completion.

## Template lifecycle and authority

- All authenticated workspace roles may inspect templates and their immutable versions.
- Only Policy Authority may create a family, publish a new version, archive a family, or approve a
  plan using a template. Source review and destination obligation acceptance retain their existing
  contributor/independent-review rules.
- Capture only the current approved version-2 plan on the current source revision. The source plan,
  complete scope, accepted mappings, profile and verifier identities must be valid when captured.
  No completed assessment or passing outcome is required: the template records an approach.
- Each immutable version preserves exact source requirements, their source/acceptance provenance,
  mapping reasons, source plan identity/digest, check rules, profile/verifier identities, creator,
  rationale and protected review mode. The first version has no parent; later versions record their
  immediate parent. Titles and explanations belong to the immutable version.
- A new version is captured from a newly selected eligible plan, with explicit expected latest
  version and family state version. Existing versions are never edited or overwritten.
- Archiving requires a reason and the expected version/state. It prevents new versions and new uses
  of that family. It does not revoke or mutate earlier approved plans, assessments or evidence.
  Restoring an archived family is outside this increment; a new family can be deliberately created.
- Only the latest active version may start a new use. Historical versions remain inspectable.
  Advancing the source change or its later review decisions does not rewrite a saved template.
  Source wording and prior mapping reasons remain historical examples, not destination authority.
- Founder-review mode remains visible in the record and UI. Neither the creator role nor the
  saved source plan is evidence of independent human approval in that mode.

## Fresh plan decision

Reuse preserves exactly the template's one or two supported check IDs. A human must explicitly
choose a distinct, currently accepted destination obligation for every check and explain the fresh
mapping. There is no automatic matching by text, position, copied lineage, source ID or similarity.
Case, Unicode form and internal whitespace remain significant.

The destination is the current revision of a registered change. Its entire scope is frozen through
the existing plan flow. Every non-rejected obligation remains mandatory, including unaccepted and
unmapped obligations. Those items remain gaps; the template cannot remove them.

Select a fresh operator-configured target matching the destination application and source revision.
This increment supports reuse within the same adapter contract as the source template. The source
target itself is not reused. Crossing a change or application within the same workspace is allowed
when the destination obligations, supported check contract, adapter and target are explicitly valid.

Approval rechecks the current scope digest, expected plan version, active/latest template version,
template digest, supported check/profile/verifier identities and all explicit mappings. The plan,
template-use receipt and activity are stored atomically in the same database transaction. A sidecar
receipt connects the plan to the template version; published plan/evidence snapshot formats do not
change. Template history is preparation provenance, never an evidence item.

Changing or archiving a template after a plan is approved does not make that plan stale. Plan
applicability continues to depend on the established scope, target, verifier and latest-plan rules.
No requirement, acceptance, assessment, pass, counterexample closure or disposition is inherited.

## Persistence, concurrency and integrity

Schema 7 adds template families, immutable version snapshots, mutation receipts and plan-use
provenance. It preserves earlier migration bytes and existing business/evidence records. A bounded
workspace catalogue supports at most 100 families and 50 versions per family; list pagination is
explicit. Bounds fail visibly instead of truncating a history or silently dropping scope.
An additional 16 MiB budget bounds the combined serialized version, source-plan and archive-receipt
context for a read. The database checks byte sizes before returning those bodies. A save that would
exceed the per-family budget rolls back, preserving the existing readable history. If a catalogue
page exceeds the aggregate budget, the UI retries the read with fewer items and shows explicit
pagination. It never drops a version or silently returns an incomplete family.
Creation and versioning reserve the current receipt size plus 32 KiB for future archive metadata.
Archiving checks the final stored receipt inside the same transaction; an oversized archive rolls
back without changing the active family. This is a bounded resource safeguard, not a promise that
every possible corrupted record or future configuration will fit.

Mutations use actor-bound request keys and payload digests. An identical replay returns its original
result; a key reused for a different request fails. Scope/plan/template changes must fail stale
submissions. Locks and transactions serialize competing versions, archives and plan uses. Receipts
cannot claim a save if a plan/version insert failed. Invalid/missing snapshot, identity, history or
source references produce an integrity error, not a guessed template or fallback plan.

Templates share the existing assurance database connection/pool. Read paths do not call a provider,
execute a check, expire worker leases, migrate a database or create activity. The worker gains no
template write privileges. Ordinary database owners remain a trust boundary: a content digest is
not a signature or protection from administrators.

## API and user experience

Authenticated routes:

```text
GET  /api/verification-templates?offset=0&limit=20&includeArchived=false
POST /api/verification-templates
GET  /api/verification-templates/:templateId?version=:versionId
GET  /api/verification-templates/:templateId/export?version=:versionId
POST /api/verification-templates/:templateId/versions
POST /api/verification-templates/:templateId/archive
POST /api/changes/:changeId/assurance-plan
```

The existing plan endpoint accepts an optional `templateUse` containing `templateId`, `versionId`,
`templateDigest` and actor-bound `requestKey`. All existing explicit scope, mapping, target,
expected-plan-version, rationale and limits-acknowledgement fields remain required.

New routes reject unsupported, duplicate and empty query parameters. Mutation routes accept no
query parameters. Existing authentication, exact-origin and CSRF protections apply. New mutation
and plan-approval envelopes are bounded at 32 KiB to support the allowed Unicode field lengths;
per-field validation remains strict. Other routes retain their previous body limits.

Names are bounded at 120 characters; purpose and rationale at 2,000 each. List defaults to 20 items
and permits at most 50. Detail/export schema is `qivvera.verification-template/1`. Source target
origins, execution actors, credentials, raw observations and evidence are excluded from templates.
The record still contains business requirements and named decision provenance; it is not a Support
diagnostic. Support exports gain only allowlisted configuration and role hints.

The UI offers **Save as template**, **Verification templates**, **Use a template**, inspection of
each version and a separate **Approve new plan** action. It never preselects destination mappings or
copies old rationale as a fresh decision. JSON download saves the exact displayed record. A delayed
response cannot replace another route or restore a signed-out session. A lost mutation response is
reported as uncertain; the browser does not automatically repeat it.

## Configuration and verification

Protected `QIVVERA_TEMPLATES_ENABLED=true` requires assurance and generalization enabled and the
reviewed schema-7 migration/grants. It defaults to false so an existing deployment is not silently
required to migrate merely by upgrading code. Builds and hosted startup never apply migrations.
Older published binaries reject schema 7; application rollback is not database rollback.

Required engineering gates: cumulative automated tests; all seven real PostgreSQL suites; all seven
native browser suites; all three reference execution commands; clean dependency installation;
canonical public assets; and independent review of concurrency, integrity and trust-boundary cases.
The exact published commit's CI result is authoritative for those gates. Native local HTTP/SQLite
browser journeys and separate PostgreSQL integration do not establish hosted HTTPS/PostgreSQL
acceptance. Team deployment, effective grants, recovery, independent QE and optional live drafting
AI validation remain separately recorded outcomes.
