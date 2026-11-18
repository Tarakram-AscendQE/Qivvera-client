# Increment 7 — source-grounded obligation drafting

Version 0.8.0. Base: published Increment 6 commit
`0351da4c35de3de0c2c9ce4b1b36f4e5154f7015`. Additive database schema 6.

## Product decision

Begin Horizon 2 with the preparation of obligation candidates. The earlier roadmap names
AI-assisted suggestions, impact understanding, verification recommendations and targeted
reassessment. This increment implements the first bounded drafting workflow; it does not claim
the whole horizon. Increment 6 hosted acceptance and independent QE continue separately.

An Author supplies a named, versioned source excerpt for the selected current change revision.
Qivvera preserves that text and proposes statements with exact source quotations. The Author
reviews each suggestion and explicitly creates a draft candidate or dismisses the suggestion
with a reason. Existing Policy Authority review, verification planning and execution follow.

Source citation proves where wording came from. It does not prove source authenticity,
applicability, semantic correctness, completeness or software behaviour.

## Generation methods

- **Explicit clauses (built in):** deterministic extraction of individual source lines containing
  supported requirement phrases. Clearly labelled rule-based; no AI or semantic-discovery claim.
  Long or excess matching clauses generate visible limitations, never silent truncation.
- **AI suggestions (optional):** a protected operator-configured OpenAI Responses adapter. The
  user must select this method and explicitly confirm external processing of the displayed source
  text. Fixed HTTPS destination, no tools, no redirects, no arbitrary URL fetching, no automatic
  retries or rule-based fallback. Only the approved source text is sent as task data; account,
  application, evidence and credential records are excluded. Provider/model/prompt identity is
  recorded. Provider retention is governed by the operator's account and policy; `store:false`
  is not a claim of zero retention. Live-provider acceptance remains separate from fixture tests.

Both methods may return zero suggestions. Neither determines authority, criticality, verifier
selection, evidence or disposition. Suggested wording and source text remain untrusted data.

## Source and result contract

- Source reference: 1–500 characters; declared source version: 1–120 characters.
- Source text: 1–6,000 UTF-16 code units and at most 12,000 UTF-8 bytes, with at most 200 lines.
  CRLF and CR are normalized to LF before storage and citation numbering. Other whitespace is
  preserved. Reject unsupported controls and unpaired surrogate characters.
- Generation accepts a bounded 32 KB JSON envelope so valid UTF-8 and JSON-escaped text fits;
  all earlier mutation routes retain the existing 16 KB limit. Source limits still apply separately.
- Store application, change and revision identities, declared commit, requesting actor, time,
  source digest, immutable method metadata, original suggestions and a result digest.
- At most eight suggestions. Each has statement (1–1,200 characters), quote (1–1,200),
  and 1-based inclusive startLine/endLine. The quote must exactly equal the trimmed joined
  source lines in that range. Reject fabricated spans/quotes, duplicate statements and unknown
  output fields before storing a completed result. Quotation matching does not establish entailment.
- Preserve original suggestions alongside subsequent edited wording, explicit criticality,
  decision rationale, actor/time and linked obligation. No bulk conversion in this increment.

## Lifecycle and authorization

Generation and suggestion decisions require AUTHOR. Authenticated workspace roles can inspect
saved source/drafting records. Only the generation's requesting Author can act on its suggestions.
The server derives identity from the session and applies existing Origin and CSRF checks.

Generation reserves an actor-bound request ID before provider work. Identical replay returns the
same saved run without re-execution. Different input with the same request ID conflicts. Limit
generation to a bounded per-actor rate and one active generation per actor. Generation states are
GENERATING, COMPLETED and FAILED. An interrupted old GENERATING run is visibly EXPIRED on read;
it is not automatically retried or presented as empty successful output.

Suggestion states are PROPOSED, CANDIDATE_CREATED and DISMISSED, with optimistic versions.
Creating one candidate and recording its decision/receipt occur in one transaction under the
existing change lock. Identical decision replay returns the existing receipt; changed choices
conflict. A duplicate statement already declared on the revision conflicts instead of silently
merging authority. Historical or changed revisions cannot receive new decisions.

Created obligations use the existing creation path and start DRAFT / CANDIDATE / NOT_ASSESSED,
with zero evidence and the Author recorded as contributor. They subsequently become ordinary
mandatory declared scope gaps under the existing rules. Unconverted suggestions are preparation
records, not declared obligations or passes. Show this distinction and pending suggestions plainly.
Dismissal is not an obligation rejection, waiver, evidence or proof of complete scope.

Do not change prior verifier bytes, evidence contracts, disposition rules or previous SQL migrations.
No proposed draft can set authority, review status, evidence, disposition or executable mappings.
Integrity failures block use. Preserve provenance after later edits and revisions.

## API and module contract

The optional service is `repository.drafting`, initialized on the workflow repository's existing
database connection with its transaction-level candidate creator and change lock helpers.
It must not call public `addObligation()` inside a second transaction.

- `GET /api/changes/:changeId/drafting?revision=:revisionId` calls `getContext(changeId, revisionId)`.
  Returns `{changeId, revisionId, isCurrentRevision, methods:{rules:true,openai:boolean}, runs:[...]}`.
- `POST /api/changes/:changeId/drafting-runs` calls `generate(changeId,input,actor)`.
  Input: `{requestId,revisionId,sourceReference,sourceVersion,sourceText,method,externalProcessingConfirmed}`.
  Method is `rules` or `openai`; confirmation is required boolean, true for OpenAI.
- `GET /api/drafting-runs/:id` and `/export` call `get(id)`.
- `POST /api/drafting-runs/:id/suggestions/:suggestionId/actions` calls `act(id,suggestionId,input,actor)`.
  CREATE_CANDIDATE input: `{action,version,statement,criticality,rationale}`.
  DISMISS input: `{action,version,rationale}`. Rationale: 10–1,500 characters.

Run view: `{id,changeId,revisionId,sourceRevision,createdBy,createdAt,status,applicability,
source:{reference,version,text,digest},engine,warnings,failureCode,suggestions,replayed?}`.
Applicability is CURRENT or HISTORICAL. Suggestion view includes `{id,statement,quote,startLine,
endLine,status,version,decision}`; decision is null or `{action,actor,rationale,statement?,
criticality?,obligationId?,createdAt}`. Action returns the updated run, with `replayed` when applicable.
Context run summaries include source reference/version, method, status, createdBy/createdAt and
pending/created/dismissed counts. Use explicit paging rather than silently hiding old runs.

Generator callback contract: `generateDrafts(sourceText,method,config)` returns
`{engine,suggestions:[{statement,quote,startLine,endLine}],warnings:[fixed-code]}`.
Root implements `server/drafting/contracts.mjs` and `generator.mjs` (validation/config/extraction/provider).
Repository validates generated output again before persisting; test callback injection is explicit.

## Configuration and deployment

`QIVVERA_DRAFTING_ENABLED=true` enables the workbench after schema 6 is reviewed/applied.
`QIVVERA_DRAFTING_OPENAI_ENABLED=true` additionally requires protected
`QIVVERA_DRAFTING_OPENAI_API_KEY` and `QIVVERA_DRAFTING_OPENAI_MODEL` configuration.
No default model choice, public signup, paid provisioning or live provider call is implied.
Hosted startup never migrates. Preserve the Vercel/PostgreSQL/separate-worker architecture and
prior branch flags; hold automatic deployment on `increment7`.

## Acceptance evidence

Require cumulative Node tests, all prior real PostgreSQL suites plus drafting persistence/race/
least-privilege/migration tests, the three unchanged reference journeys, and genuine native browser
drafting-to-review journeys. Browser tests include permissions, stale revisions, escaped text,
session cleanup, mobile layout and lost-response/replay handling where applicable.
Provider fixtures establish protocol/validation behaviour only. Hosted migration/grants/recovery,
live model evaluation when enabled, independent QE and release approval remain explicit gates.
