# Frontend migration — task list

Definition of done for every task (AGENTS.md gates): legacy-vs-React parity identical; Vitest tests added and
passing; `npm run check` green (backend counts unchanged: 694 / 686 pass / 0 fail / 8 skipped without a test
database); all 8 native browser suites pass on Node 22; one local commit per verified task (no push).

## Phase A — Standalone screens (done)
- [x] Guide and Support (a038dcd)
- [x] Shared bundle + generic unmount (1e1ae56), GitHub intake (dd905ff), render errors to router (886ad3a)
- [x] Revision impact (af328b2), source drafting (e14bce3), verification templates (5dfe317)
- [x] Simplification refactors (9e6b47b..e84e2f5)

## Phase B — Workspace screens inside the legacy shell

### Task 1: Overview and getting-started guidance
**Acceptance:** overview renders identically for Author / Policy Authority / Viewer, empty and populated
workspace; "New application" / "New change" open the same legacy dialogs; recent changes and activity rows match.
**Files:** `frontend/src/workspace/overview*.tsx`, `frontend/legacy/app.js` (call the React module), vite input.
**Size:** M. **Depends on:** none.
- [x] Task 1 (overview; parity 16 cases)

### Task 2: Applications list and application detail
**Acceptance:** list, detail and "not found" error match; register/new-change actions open the same dialogs.
**Size:** S. **Depends on:** Task 1 (shared workspace module).
- [x] Task 2 (applications + detail)

### Task 3: Changes list and Activity
**Acceptance:** both pages match; export link unchanged; role-gated "New change" button state matches.
**Size:** S. **Depends on:** Task 1.
- [x] Task 3 (changes + activity)

### Checkpoint B
- [ ] All gates green; commit per task

## Phase C — Change page (data still loaded by the legacy router)

### Task 4: The change page renders in React
**Acceptance:** the whole change page matches for every tab (overview incl. imported source receipts,
obligations, assurance, evidence, revisions, history), current and historical revisions, founder-review mode,
every "What to do next" branch, every assessment-banner state and the run-button state. Buttons keep their
data-action hooks (dialogs stay legacy until Tasks 5–6). The resolution tab embeds resolution.js's HTML until Task 7.
**Size:** M (render only). **Depends on:** Phase B.
- [x] Task 4 (change page; parity 640 cases)

### Task 5: Obligation dialogs
**Acceptance:** propose / revise / submit / withdraw / decision dialogs send identical payloads and keep the
same own-contribution rules; review-history dialog matches and ignores late answers.
**Size:** M. **Depends on:** Task 4 and the dialog component (Task 8 may be pulled forward).
- [x] Task 5 (record dialogs; parity 12 cases)

### Task 6: Assurance dialogs and the assessment case
**Acceptance:** plan dialogs (one/two checks), request dialog (one key per request), cancel, and the
assessment-case dialog match; polling behaviour unchanged.
**Size:** M. **Depends on:** Task 4.
- [x] Task 6 (assurance dialogs + assessment case; parity 8 cases)

### Task 7: Resolution (inbox, item, change tab, actions)
**Acceptance:** inbox, item view, change-page panel, source buttons and every resolution action match,
including late-answer and dialog-after-navigation guards.
**Size:** M. **Depends on:** Tasks 5–6.
- [x] Task 7 (inbox, item, change tab, source buttons and actions; parity 19 cases)

### Checkpoint C
- [ ] All gates green; the legacy shell now only routes, signs in, frames and opens dialogs

## Phase D — Replace the shell

### Task 8: React dialog infrastructure (native `<dialog>`)
**Acceptance:** one React form-dialog component reproduces openForm (visit-bound, controls locked while saving,
409 text, refresh then navigate, "saved but not refreshed" toast); every dialog uses it; legacy openForm removed.
**Size:** M. **Depends on:** Phase C.
- [x] Task 8 (dialog host + FormDialog; pulled forward with Task 5)

### Task 9: Sign-in, session bootstrap and the api client in TypeScript
**Acceptance:** sign-in page and password toggle match; api() semantics identical (CSRF, stale-session
rejection, 401 → sign-in, unreadable/5xx/403 messages, request reference); bootstrap error page matches.
**Size:** M. **Depends on:** Task 8.
- [ ] Task 9

### Task 10: App frame and router (React Router, same hash routes); delete app.js
**Acceptance:** sidebar/top bar/footer match; every legacy route resolves identically (incl. invalid-link error
pages and capability checks); route generation, toast and polling semantics preserved; app.js deleted.
**Size:** L (do in sub-steps: frame → router → polling → delete). **Depends on:** Task 9.
- [ ] Task 10

### Checkpoint D
- [ ] All gates green twice in a row; no legacy JavaScript is loaded

## Phase E — Retire the legacy layer
(Remove scripts/check-legacy-names.mjs from `npm run check` when no legacy JavaScript remains.)
### Task 11: Remove the bridge and legacy copies; update docs
**Acceptance:** `frontend/legacy` holds only static assets (or is removed); sync-assets copies index.html/CSS/logo
only; README/AGENTS layout updated; offline component checks updated or retired with a note.
**Size:** S. **Depends on:** Phase D.
- [ ] Task 11

### Final checkpoint
- [ ] code-review-and-quality review of the full frontend diff
- [ ] All gates green; report to user (what changed, what was verified, what was not)
