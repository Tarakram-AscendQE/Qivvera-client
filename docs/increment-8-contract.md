# Increment 8 — declared revision impact and next checks

Version 0.9.0. Base: published Increment 7 commit
`12042abb6d1f372a51c829aa12ff52655508d9c1`. Maximum supported schema remains 6.

## Product decision and boundary

Continue Horizon 2 with an explainable view of recorded revision impact and reassessment needs.
An authenticated user opens **Impact & next checks** from a selected change revision. Qivvera
compares that revision with its recorded direct parent, explains exact obligation differences,
shows declarations not carried forward, and directs the user to existing review and assurance
workflows. This is a bounded step toward impact understanding and verification recommendations.

The report is a deterministic read model. It does not inspect source code, infer dependencies,
judge semantic equivalence, discover all affected requirements, or introduce an ImpactAssertion
authority workflow. Broader inferred impact and reduced-scope targeted execution remain future work.
The Product Atlas's source/authority/evidence distinctions and no inherited disposition rule apply.

## Comparison contract

- The caller selects a change and one of its revisions. The baseline is only that revision's
  recorded direct parent, never an arbitrary revision, another change or a guessed common ancestor.
- A first revision has no baseline and explicitly says so. Empty scope is not complete scope.
- Compare declared source revision, intent and producer exactly. A declared Git identity remains
  a declaration; this feature does not fetch a diff, inspect a repository or attest a running artifact.
- Match obligations only through a valid `copied_from` link to the direct parent. Equal or similar
  wording without that link remains a new independent declaration.
- Compare statement, source reference, source version and criticality exactly. Preserve case,
  Unicode form and internal whitespace. Display authority/review changes separately from content.
- Classifications are NEW, COPIED_UNCHANGED and COPIED_CHANGED. Unchanged means the compared
  recorded fields are equal; it does not mean software behaviour is unaffected or a check can be skipped.
- Show all parent obligations with no copied descendant as **not carried forward**, including their
  recorded review status. Absence does not prove resolution, irrelevance or approved scope reduction.
- A missing/cross-change parent, invalid/duplicate copied lineage, damaged history membership or
  more than 500 obligations in either compared revision fails explicitly. Never silently drop
  mandatory obligations to make a report appear complete.

## Guidance and assurance context

All non-rejected selected obligations remain mandatory, including unaccepted and unmapped items.
The report explains review needs, configured targets, current approved plan, supported check options,
and the latest recorded assessment. These explanations create no authority, mapping or evidence.

A prior explicit mapping may be shown as a historical hint for a copied requirement where the
recorded content supports that comparison. It requires fresh human applicability review and a new
approved plan. The catalogue describes available bounded checks; it never assigns checks by keywords
or presents an unsupported requirement as covered.

Use the latest assessment for the selected revision, including queued, running, cancelled or failed
states. Do not select an older pass because it is more favourable. A completed result must pass the
existing evidence digest, binding and counterevidence checks before its recorded disposition is shown.
Expose the recorded disposition separately from the currently applicable disposition. A historical
revision, changed inputs or invalid evidence cannot establish current readiness.

Explain changed scope and other assessment input differences when a latest run exists. Expired queue
deadlines/leases may be observed and labelled in the report; reading the report must not expire the run
in storage. Guidance sends the user to the established workflows, which revalidate state when an action
is taken. Historical reports are for inspection; new actions belong to the current revision.

## Read, authorization and export contract

All authenticated workspace roles may inspect a report. These endpoints have no mutation operation:

```text
GET /api/changes/:changeId/impact?revision=:revisionId
GET /api/changes/:changeId/impact/export?revision=:revisionId
```

Require exactly one nonempty `revision` query parameter. Reject unknown or repeated parameters and
revisions belonging to another change. Responses inherit the authenticated API's no-store and security
headers. The export uses an attachment filename derived from the validated change identifier.

The report schema is `qivvera.impact/1`. It contains selected/baseline identity, exact field differences,
all scope comparisons, summaries, guidance, bounded assurance context, generation time, a content digest
and explicit limitations. The protected workspace review mode is part of the report and digest;
founder-review mode remains visibly qualified and does not claim independent human approval.
The report has no newly calculated top-level release disposition.

Comparison and assurance data are read from one database transaction. PostgreSQL uses REPEATABLE READ,
READ ONLY. The reader shares the existing workflow database adapter and pool; it opens no extra pool.
Neither view nor export writes activity, changes evidence, expires leases, invokes a worker, contacts
a provider or fetches source metadata. Existing authenticated session lookup remains necessary.

Project only the target identity needed to explain configuration. Exclude target origin, execution
actor identities, credential environment names, secrets and raw execution observations. The report
still contains business declarations and must be handled as a business record. It is separate from the
allowlisted Support diagnostic. Its digest is a content identifier, not a signature or trusted timestamp.

The browser downloads the displayed report snapshot. A fresh server export is a new read and may
reflect intervening changes. Refresh explicitly loads current records; responses from an old route
or session cannot restore content after navigation or sign-out.

## Compatibility and required verification

No new migration, provider credential, runtime dependency or execution contract is introduced.
Schema 2 supports declared comparison with assurance disabled; configured assurance requires its
existing schemas/checksums, and the cumulative deployment continues to support schema 6.
Existing verifier code and hashed contracts, earlier migration bytes, scope rules and evidence semantics
remain unchanged. Publication is to `increment8`; earlier branch heads and deployment flags are preserved.

The engineering gate includes cumulative automated tests, all six real PostgreSQL suites, all six
native browser suites and the three existing reference execution commands. Dedicated cases cover exact
lineage/content differences, latest-run semantics, stale/incomplete/corrupt evidence, read-only database
permissions, query/authentication boundaries, exports, route/session races and mobile presentation.
Hosted HTTPS/PostgreSQL acceptance, effective production permissions, recovery and independent QE are
separate recorded outcomes. There is no AI provider call or new live-integration claim in this increment.
