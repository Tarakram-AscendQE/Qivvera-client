# Engineering decisions

## D-001 — Repository-backed development
Founder-owned private repository MadhuRonanki/qivvera. The founder reviews working increments as an end user. Qivvera is separate from the Polsia/U1/Bugwhistle work.

## D-002 — Assessment lifecycle is not disposition
Only COMPLETED kernel snapshots can have a disposition. QUEUED, RUNNING, FAILED and CANCELLED return null with an explicit lifecycle reason. Null never means success.

## D-003 — Exact declared target matching
Evidence must match application, revision, artifact, environment, profile/version, scope and verifier-set identity. This is applicability checking, not verification of provenance or actual deployed artifact identity.

## D-004 — Internal trust boundary
The kernel consumes accepted internal assessments. Accepted authority and admissibility flags are never accepted from a change producer. Implement identity and independent validation before exposing an assessment API.

## D-005 — Fail closed
Empty required scope, unconfirmed scope, unresolved authority, missing applicable evidence and unresolved required obligations prevent READY. A valid blocking violation dominates other support. Exception requests never override a violation.

## D-006 — Exceptions not yet implemented
READY_WITH_EXCEPTIONS is reserved. No unaudited acceptance shortcut exists.

## D-007 — Recovered toolchain
Node 22.16.0 and TypeScript 5.8.3 were available locally. The 41-test foundation was recovered from local bundle commit dbe1553 and rerun. A fresh npm registry install was unavailable in the execution container due to DNS resolution failure; local checks used the preinstalled compiler of the same version. CI must independently establish a clean locked install.

## D-008 — Render selected, spending not authorized
The founder selected Render workspace tea-dbiq1sk9v7es7389ptpg. No hosting resources have been provisioned. Private repository access for Render and a spending limit must be established before deployment. Do not treat the ChatGPT GitHub connection as Render repository authorization.

## D-009 — Source import
The remote repository started with a README bootstrap commit. The foundation source is imported with provenance to dbe1553; the original local ancestry remains in the user-supplied bundle. Do not claim that ancestry was pushed.

## D-010 — CI action identity
The official actions/checkout v6 and actions/setup-node v7 tag SHAs were retrieved on 2026-10-31 and used as immutable action references. This pins identity; it is not a claim of a source security audit. No deploy or paid runner is configured.
