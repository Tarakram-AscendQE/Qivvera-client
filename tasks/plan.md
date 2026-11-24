# Implementation Plan: Complete the React frontend

Source: "Qivvera Platform Architecture Proposal" — Decisions agreed (24 Nov 2026), frontend row; roadmap Phase 2
("React UI, moved screen by screen"). User instruction (24 Nov): finish the frontend before the Express backend.

## Overview

Replace the remaining hand-written legacy UI (`frontend/legacy/app.js`, ~72 KB, and `resolution.js`, ~18 KB)
with React + TypeScript, screen by screen, then replace the legacy shell itself and delete `frontend/legacy/*.js`.
Behaviour stays identical: the eight native browser suites (AGENTS.md gates) must keep passing unchanged.

Already done (branch `feat/react-guide-support`, commits a038dcd..e84e2f5): Guide/Support, GitHub intake,
revision impact, source drafting, verification templates; one shared.js bundle; render errors reach the
legacy error page; five behaviour-preserving refactors.

## Architecture decisions

- **Strangler order.** Screens move into React while the legacy shell still owns routing, session, frame and
  dialogs (`frontend/src/screen-host.tsx` mounts them). The shell is replaced last, when its glue is small.
- **Behaviour parity is the acceptance bar.** Each slice gets a legacy-vs-React DOM parity harness (scratch
  scripts against the built bundle), Vitest + Testing Library tests, `npm run check`, and all 8 browser suites.
- **Visit-bound results.** Every async result is checked against the visit (route, session, generation) that
  requested it (`visits.ts`); saves keep one request ID per unchanged submission; no automatic retries.
- **Dialogs stay native `<dialog>`** rendered from React (the browser suites select `dialog`; native
  `showModal()` already gives focus containment, Esc and `aria-modal`). React Aria only for widgets HTML lacks.
- **Routing.** When the shell moves (Phase D), use React Router with the same hash routes (bookmarks and tests
  keep working). Verify the React Router 8 API against its docs before using it (source-driven-development).
  Loader-style "load, then draw" matches the legacy route() (the old page stays until new data is ready).
- **Out of scope for this run** (needs a user decision): porting the Python browser suites to Playwright Test
  (AGENTS.md names the current suites as mandatory gates); CSS Modules (styling-only move, no visual tests);
  a formatter (Prettier) for long JSX lines.

## Task list

See `tasks/todo.md` (checklist with acceptance criteria).

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Race semantics (late answers, sign-out, dialog after navigation) differ in React | High | Port the legacy guards literally (visits, dialog generation); navigation/first-release suites cover them; parity harness drives the same sequences |
| Polling (2.5 s, paused while a dialog is open or the page hidden) changes timing | Medium | Keep the legacy poll until the shell moves; then reproduce the exact pause rules; assurance suite covers it |
| Shell replacement is a large final step | High | Do it last, after every screen and dialog is React; keep the same hash routes and api() semantics |
| Intermittent templates lost-reply failure (8/9 React, 10/10 legacy) | Low | Tracked; every slice reruns all suites; capture a network trace if it recurs |
| One shared.js grows as screens move | Low | Loaded once; acceptable for an authenticated app; revisit route-level splitting after the shell moves (server asset list must then allow the chunk names) |
| Long session / context limits | Medium | This plan and todo.md are the source of truth; commit each verified slice |

## Open questions (defaults in use until the user says otherwise)

- Port browser suites to Playwright Test (TypeScript)? Default: not in this run.
- React Aria dialogs vs native `<dialog>`? Default: native, as above.
- CSS Modules and a formatter? Default: later, separately.
