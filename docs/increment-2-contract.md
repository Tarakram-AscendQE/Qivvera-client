# Increment 2 contracts and decisions

## User outcome
Accept or question a requirement for a declared change revision; preserve who decided, why, which
source/version was considered, and what the exact obligation said. Then add a new revision without
rewriting earlier history. Atlas alignment: G3 (identities), G4 (confirmation), G1/G15 (revision semantics).

## Identity and roles
Trusted deployment configuration defines named accounts. AUTHOR can register applications/changes,
propose/edit obligations, request/withdraw review, and create revisions. POLICY_AUTHORITY can accept,
reject, or request clarification. VIEWER is read-only. All authenticated identities can read the single
workspace. This is workspace-level authorization, not enterprise tenancy or per-application RBAC.
Roles and actor identity are taken from the current authenticated server session, never request JSON.
An identity may have multiple roles. Default independent mode prohibits acceptance/rejection/clarification
by the proposer or any recorded content contributor to the same obligation. Distinct login identities
are not proof of organizational independence. Explicit founder-review mode permits same-actor review,
records independentActor=false and displays a warning. It is not a bypass represented as independence.

## State transitions
- New candidate: DRAFT / CANDIDATE / NOT_ASSESSED.
- SUBMIT: DRAFT or CLARIFICATION_REQUIRED → IN_REVIEW. Source reference and source version required.
- WITHDRAW: IN_REVIEW → DRAFT, only proposer/last editor.
- ACCEPT: IN_REVIEW → ACCEPTED / AUTHORITATIVE. Required policy-authority role, valid reviewer and reason.
- REJECT: IN_REVIEW → REJECTED / CANDIDATE. This does not mean a software VIOLATION.
- REQUEST_CLARIFICATION: IN_REVIEW → CLARIFICATION_REQUIRED / CANDIDATE.
- Edit outside IN_REVIEW: new DRAFT content/version; previous decisions and wording retained.
- Editing IN_REVIEW is refused until withdrawn. Accepted obligations can be revised, but current
  acceptance is removed and the new content needs review.
The optimistic `version` increments on every state/content event, not only changes to wording.
Source references/version labels remain human declarations; acceptance is not external document
verification, material-obligation completeness, executable policy, or evidence of software behaviour.

## Routes added
POST /api/obligations/{id}/review
  action, version, revisionId, rationale (minimum 10 characters for a decision).
GET /api/obligations/{id}/history
  Versioned snapshots, decision actor, reason, source/version and recorded reviewer-independence flag.
POST /api/changes/{id}/revisions
  expectedRevisionId, sourceRevision, intent, reason, copyObligations (explicit boolean).
GET /api/changes/{id}?revision={revisionId}
  Read the exact historical revision. No cross-change revision access.

Obligation creation/editing now requires revisionId; editing also requires the current version.
Creation/edit fields include sourceVersion. Clients cannot set authority, evidence state, disposition,
blocking status or actor. Stale edits/heads return 409; unauthorized roles 403; unauthenticated calls 401.
All mutations require the exact approved Origin and the authenticated CSRF token.

## Revision decisions
One Change has multiple sequential immutable-through-API Revision records, each with a parent, source
reference, intent, creator, timestamp and reason. A source reference remains declared, not independently
verified against Git. A new revision requires an explicit source reference; an initial imported reference
may be absent. Duplicate exact source references within a change are refused.
Old revisions cannot be edited/reviewed. Copying selects non-rejected prior obligations, creates new IDs,
records copiedFrom and starts DRAFT / CANDIDATE. This conservative initial policy does not implement
reusable accepted policy libraries or evidence reuse. All revisions have disposition=null.

## Persistence and concurrency
Existing registry tables/data are retained. Migration 002 adds revisions, review state/history, shared
sessions, shared login-attempt buckets, and migration checksums. Existing obligations are imported as
DRAFT candidates with explicit unknown historical author; a named user must inspect and save them
before submission. No retroactive approval or earlier change history is invented.
Database transactions serialize modifications under a per-change row lock in PostgreSQL. SQLite uses
an explicitly local transaction queue. Version and current-head checks occur inside the lock. History and
state writes commit together. History is append-only through this application API, not tamper-proof
against database administrators or old applications with write credentials.

## Security changes necessary for authority decisions
No embedded DB connection or default/legacy accounts. Credential-based session fingerprint binds current
role/credential configuration. Every request consults the shared session store; no stale per-instance
session cache can restore a logged-out session. Old deployments with old credentials MUST be retired.
Login throttling is shared per known account (plus one unknown bucket), 10 attempts/10 minutes; it is a
bounded review control, not a complete internet-scale abuse defence. Periodic expired-session cleanup
is an operational task via repository.cleanupSessions().
Hosted TLS requires certificate verification. Origin formatting normalization does not allow arbitrary
preview domains. Configuration must include the exact preview/prod origin. Public errors contain no
stack traces or credential strings. No broad customer-code execution has been introduced.
