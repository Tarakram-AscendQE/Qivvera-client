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
- [ ] Task 1

### Task 2: Applications list and application detail
**Acceptance:** list, detail and "not found" error match; register/new-change actions open the same dialogs.
**Size:** S. **Depends on:** Task 1 (shared workspace module).
- [ ] Task 2

### Task 3: Changes list and Activity
**Acceptance:** both pages match; export link unchanged; role-gated "New change" button state matches.
**Size:** S. **Depends on:** Task 1.
- [ ] Task 3

### Checkpoint B
- [ ] All gates green; commit per task

## Phase C — Change page (data still loaded by the legacy router)

### Task 4: Change page frame and read-only tabs
**Acceptance:** heading, historical notice, "What to do next", assessment banner, tab bar, and the Overview
(incl. imported source receipts), Revisions, History and Evidence tabs match for current/historical revisions.
**Size:** M. **Depends on:** Phase B.
- [ ] Task 4

### Task 5: Obligations tab and obligation dialogs
**Acceptance:** obligation cards, review states and own-contribution rules match; propose / revise / submit /
decision dialogs send identical payloads; review history dialog matches and ignores late answers.
**Size:** M. **Depends on:** Task 4.
- [ ] Task 5

### Task 6: Assurance tab, plan dialogs, assessment request and assessment case
**Acceptance:** plan, template receipt, runs, run button state, plan dialogs (one/two checks), request dialog
(one key per request) and the assessment-case dialog match; polling behaviour unchanged.
**Size:** M. **Depends on:** Task 4.
- [ ] Task 6

### Task 7: Resolution (inbox, item, change tab, actions)
**Acceptance:** inbox, item view, change-page panel, source buttons and every resolution action match,
including late-answer and dialog-after-navigation guards.
**Size:** M. **Depends on:** Tasks 5–6.
- [ ] Task 7

### Checkpoint C
- [ ] All gates green; the legacy shell now only routes, signs in, frames and opens dialogs

## Phase D — Replace the shell

### Task 8: React dialog infrastructure (native `<dialog>`)
**Acceptance:** one React form-dialog component reproduces openForm (visit-bound, controls locked while saving,
409 text, refresh then navigate, "saved but not refreshed" toast); every dialog uses it; legacy openForm removed.
**Size:** M. **Depends on:** Phase C.
- [ ] Task 8

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
### Task 11: Remove the bridge and legacy copies; update docs
**Acceptance:** `frontend/legacy` holds only static assets (or is removed); sync-assets copies index.html/CSS/logo
only; README/AGENTS layout updated; offline component checks updated or retired with a note.
**Size:** S. **Depends on:** Phase D.
- [ ] Task 11

### Final checkpoint
- [ ] code-review-and-quality review of the full frontend diff
- [ ] All gates green; report to user (what changed, what was verified, what was not)
