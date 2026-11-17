# Increment 5 — bounded reuse and source-intake contract

Version 0.6.0. Newly implemented from published Increment 4 commit 9823421694671253c7f01f332c93e2a4cfdd9f19. This is not recovery of the earlier unavailable Increment 5 package. That earlier completion/test claim remains withdrawn.

## User outcomes
A Policy Authority can approve up to two distinct executable mappings for distinct accepted obligations. The author requests one assessment; the separately configured worker runs the supported checks and records separate findings. The same core works against a Node approval reference application and an independently implemented Python/SQLite expense reference application through fixed reviewed adapters. A different Policy Authority can verify a correction to the specifically mapped finding without borrowing another check's evidence.

An AUTHOR can preview an open GitHub pull request from an operator-configured repository and import that reviewed source context as a new change or an explicitly selected change revision. Repository title/body are untrusted data, never instructions, accepted obligations, executable code, or assurance conclusions. VIEWER and policy-only identities cannot preview/import. Workspace readers can inspect source receipts.

## Supported verification contracts
`separation`: requester self-approval is prohibited; a different eligible approver must succeed. Both observations and before/after target-identity checks are required.

`finality`: after legitimate approval, a repeated approval must return 409 / NOT_PENDING and preserve the finalized record. A repeat success or observed mutation is a violation; inability to establish the positive control is insufficient. This is an explicit rejection contract, NOT a universal claim that idempotent-success APIs are defective. The operator and Policy Authority must confirm that this expectation actually applies.

At most two mappings, one per supported check, and a distinct accepted obligation per mapping. Each has a rationale, acceptance identity and verifier digest. Every other non-rejected obligation remains mandatory; an unmapped or unaccepted one prevents READY. Rejected obligations remain traceable exclusions, not passing tests. No automatic obligation discovery or proof of completeness.

## Preserved evidence and decisions
Version 1 plans/reports remain readable with their original profile and executor identity. Existing published contracts.mjs, approval-separation.mjs and transport.mjs are byte-preserved. Version 2 uses qivvera.assurance-plan/2, qivvera.multi-report/1 and qivvera.evidence/2. Each mapped verifier identity includes check, adapter and executable-source digests. There is no re-labeling of old cases as multi-check results.

A valid counterexample remains attached only to the affected compatible obligation/target context. Missing/corrupt previous completed evidence prevents accepting a new result; a later pass cannot quietly erase it. Stored manifest run/revision/snapshot/target binding and report shape are checked in addition to content digest. These are integrity checks, not signatures or protection from a database administrator.

A resolution requires the related original/copied obligation, materially equivalent expectation, compatible mapped verification contract, fresh completed supporting evidence, and an appropriately different Policy Authority. Changing a task or importing source cannot set readiness. One resolved finding does not resolve other gaps. All earlier history and evidence remain retained.

## GitHub intake protocol
Protected configuration binds repository key, owner/name, numeric repository ID, application ID and a secret environment-variable NAME. The product uses a separately provisioned repository-read credential, not this chat's GitHub connection. Only the fixed api.github.com REST pull endpoint is contacted. Requests are GET-only with bounded timeout/response sizes; redirects are refused for operator review, never followed with credentials. 429 and provider limit responses create a bounded shared cooldown; there is no automatic retry loop.

Preview stores provider-observed head/base SHA, fork repository identity, title/body, draft status, source fingerprint, configuration digest, actor and five-minute expiry. Import re-fetches and rejects any changed selected metadata before mutating the workspace. The GitHub head can advance after that read; the receipt is an as-observed exact source snapshot, NOT an atomic lock on GitHub, a code diff analysis, or deployed-artifact attestation.

Repeated identical consumption returns the same import. Altered choices conflict. A new revision requires an explicit current revision identity and same application/linked PR; concurrent updates conflict. Existing non-rejected obligations may be copied only as new draft candidates, without authority or evidence inheritance. The full supported source description is retained; the UI preview is bounded and the imported title limit is shown explicitly.

## Boundaries
Single workspace. Two synthetic reference applications are a reuse demonstration within approval workflows, not two customer deployments. One or two checks, not arbitrary testing. Only approved synthetic/test targets; no production payments or reimbursements. Python reference server binds loopback only; deployment of a real test adapter/target needs operator review. No arbitrary URL or executable upload, webhook receiver, outbound GitHub status/check/comment/merge, automatic remediation, source-to-build attestation, waiver, SSO or multitenant isolation. External ticket references remain plain text. Separate processes do not establish organizational independence or sandbox isolation.

## Release gates
Schema 5 upgrade preserves earlier records. Prior binaries reject schema 5; application rollback alone is not database rollback. Require all four disposable PostgreSQL suites, clean locked install, actual provider migration/grants and restoration, native hosted browser validation, authorized live GitHub preview/import, and independent QE. Neither historical CI nor offline UI rendering substitutes for these checks.
