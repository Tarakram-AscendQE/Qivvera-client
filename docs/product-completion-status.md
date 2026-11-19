# Product completion status

Reviewed 19 November 2026 against **Qivvera Product Atlas**, supplied 27 October 2026, and the actual
Increment 1–9 implementation. Increment 10 closes concrete integrity/navigation defects and adds
executable operational verification. Its final verification outcomes belong in the delivery record.

## Product direction and current boundary

Qivvera is generalized, producer- and AI-DLC-agnostic Independent Change Assurance. VendorPay is a
reference application. The visible workflow is Change → Obligations → Evidence → Gaps → a
scope-bound Disposition. Requirement acceptance is not evidence that software satisfies a requirement.

The current product supports sourced change/obligation records; independent authority review;
source-grounded preparation; explicit plan approval; separate-worker execution; immutable evidence;
explainable assessment results; finding/correction review; GitHub metadata intake; revision-impact
explanation; reusable versioned templates; and role-aware onboarding/support.

Execution remains bounded to approval separation and approval finality through two fixed adapters.
Other declared obligations remain gaps. The product does not yet provide arbitrary configurable
profiles/verifiers, code/dependency impact analysis, log/audit evidence collection, accepted waivers,
or a producer-repository enforcement integration. Those limitations must stay visible in product
positioning, customer selection and release acceptance.

## Atlas gap reconciliation

The Atlas's G-cards identify ambiguities and capabilities, rather than nineteen interchangeable
features. A bounded implementation closes some questions without implementing every future use case.

### G1 — Pre-assessment state and revision changes: implemented

Queued/running/failed/cancelled runs have no disposition. New revisions do not inherit an older
revision's result. Prior evidence remains visible with current applicability explained. Increment 10
adds stricter checks that the recorded scope and run binding are intact.

### G2 — Conflict resolution: bounded implementation; broader conflict handling remains

Findings have owned resolution work, challenges, fresh correction evidence and separately reviewed
resolution decisions. A later pass cannot erase a valid earlier counterexample. The production
workflow does not yet adjudicate arbitrary conflicting policy or evidence sources; a reserved
kernel state is not a complete multi-source conflict workflow.

### G3 — Identities and roles: implemented; hosted enforcement requires evidence

Named Author, Policy Authority and Viewer identities, contributor separation, sessions and audit
history exist. Founder-review mode stays explicitly qualified. Hosted accounts and actual non-owner
web/worker database privileges require operator verification. Increment 10 adds a reusable effective
permission audit; it does not create accounts or change privileges.

### G4 — Candidate authority decisions: implemented

Accept/reject/clarify decisions have named actors, reasons, source versions and immutable history.
Draft-generation output creates preparation records and explicitly requested candidate obligations.
It does not confer authority or a software-evidence state.

### G5 — Exceptions and READY WITH EXCEPTIONS: remaining product development

The kernel reserves the vocabulary and rejects unsupported exception requests. The product does
not create or accept waivers. A complete implementation still needs independently authorized
acceptance, scope/expiry/compensating controls, revocation and reevaluation semantics. No green or
qualified-green result may be inferred from the absence of this feature.

### G6 — Decisions and operating guidance: implemented; operating outcomes remain separate

Increment contracts, decisions, engineer handoffs, verification records and release acceptance
records exist. Blank acceptance fields remain unperformed. Increment 10 supplies executable
permission and synthetic recovery checks alongside this consolidated completion record.

### G7 — Discriminating verifier checks: implemented for supported checks

The supported executors have deliberate faulty and correct reference cases. These establish the
bounded contracts, not all five VendorPay verifier ideas in the original Atlas. Authorization,
sensitive-log, audit-store and scheduled-payment contracts need their own independently grounded
oracles, negative fixtures and real execution adapters before they can be claimed as supported.

### G8 — Execution isolation and ordering: implemented for supported executors

Separate worker execution, unique synthetic requests, explicit target bindings, leases and bounded
transports are implemented. New verifier families must define their own state and isolation contract.

### G9 — Infrastructure failure: implemented

Failure, timeout, cancellation and lease expiry cannot become supporting evidence or a completed
passing disposition. Increment 10 also prevents known damaged plan/run input from executing or
receiving a completed result.

### G10 — Proof methods and strength: bounded implementation

Fixed profiles identify their behavioral execution methods, expected/observed contract and limits.
The broader cross-method vocabulary and evidence-strength policy must be specified when adding
log, audit-store, policy-engine, differential or human-judgment evidence. No synthetic trust score
or generic strength label can substitute for an adequate method.

### G11 — Complete log collection: remaining product development

There is no generalized log collector. It needs declared sources/window/completeness, marker
protection and fail-closed adequacy rules. Missing logs must never imply that sensitive data was absent.

### G12 — AI inside assurance: implemented for drafting; live quality is conditional

Drafting records source quotation, generator identity and human decisions. Deterministic clauses
and optional provider suggestions are distinguished. Source text cannot supply authority, evidence
or dispositions. An enabled live model requires its separate integration and human-quality checks.

### G13 — Profile schema/versioning: bounded implementation; extensibility remains

Used plans snapshot immutable fixed profile/verifier identities. Versioned templates preserve and
reuse explicit preparation choices with fresh destination approval. Templates do not edit assurance
policy. A configurable profile/verifier lifecycle still requires protected authorship, validation,
compatibility, approval and safe executor registration.

### G14 — Trace/replay: exports implemented; presentation replay remains

Assessment and template exports preserve inspectable snapshots/provenance. A replay/presenter mode
with a dedicated bundle-validation contract is not implemented. It must never manufacture live
execution or current applicability from historical traces.

### G15 — Change intake identity: implemented within the declared intake contract

Applications, changes and source revisions have durable identities; copied lineage is explicit.
GitHub metadata previews are actor-bound, short-lived and revalidated before import. PR metadata
does not attest code or artifacts. Whole-code diff analysis and automatic force-push synchronization
remain separate capabilities.

### G16 — Impact assertions: bounded implementation; code-aware impact remains

The current workbench explains exact recorded declaration changes, copied lineage and assurance
context. It does not infer semantic equivalence or prove impacted-code completeness. The broader
Observed/Derived/Inferred/Unknown impact domain still needs independently inspectable provenance.

### G17 — Boundary identity and time: implemented with a stated trust boundary

Snapshots bind source revision, artifact/environment identities, profile/verifier and timestamps.
Target identity is operator-pinned and target-reported. Independent artifact attestation and broader
environment manifests remain beyond the present contract; digests alone do not supply them.

### G18 — API and lifecycle: implemented; external enforcement remains

Authenticated APIs, origin/CSRF protection, explicit errors, bounded lists, queue/run/cancel/timeout
and separate protected result storage exist. Outbound GitHub check publication and required-check
enforcement are not implemented. An enforcement integration must publish only a scope-qualified,
revision-bound result and cannot reinterpret technical CI green as assurance approval.

### G19 — Stage budgets: reference engineering exists; observed hosted budgets remain

Reference journeys and native browser checks are repeatable and retain actual execution reports.
No stage or production performance budget is inferred from them. A real hosting environment needs
measured latency/cold-start/recovery results and an agreed use envelope.

## Gates before invited-user release

1. Exact-commit cumulative engineering checks, with all mandatory PostgreSQL and native browser
   suites executed and no remaining material defects.
2. Hosted commit/schema/grant identity, HTTPS/session controls, persistence and separate worker
   execution on the actual configured targets.
3. Isolated restore of the actual hosted backup, with recorded recovery time and data reconciliation.
4. Independent human QE with actual results and material-defect retests.
5. Unfamiliar-user acceptance of a real supported workflow, including understanding its evidence gaps.

These are separate outcomes. A successful development CI run does not fill in the hosted or human
acceptance records. The first release can support the documented bounded contracts while the
remaining product capabilities above continue as explicit development work.
