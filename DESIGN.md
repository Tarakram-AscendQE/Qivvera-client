# Qivvera design system

Qivvera is an **Operate** surface: Authors, Policy Authorities and Viewers come to finish a task
(propose, review, plan, check, fix) and to see where a change stands. Clarity and honest status beat
decoration. The approved mockups for this system: https://claude.ai/artifact/Tv2Sd4imQhq7LAYNGRcUVz

Styles live in `frontend/static/theme.css`, loaded after the legacy sheets (`app.css`, `workflow.css`,
`assurance.css`, `resolution.css`). New components belong in `theme.css`; legacy sheets shrink over time.

## Product rules the UI must keep (AGENTS.md)

- Accepting a requirement is never shown as proof. Only a **current, completed** assessment shows
  Ready / Not ready / Can't decide yet, always for the exact commit.
- A failed result stays red; a later pass on the same commit never hides it.
- A fix needs a new revision, a fresh check and an independent verifier — the fix path says so.
- These rules are stated once per screen where they matter ("How Qivvera decides" links to the guide),
  not repeated as banners and footers.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--ink` / `--ink-2` | `#0f172a` / `#334155` | Text, secondary text |
| `--muted` / `--faint` | `#526075` / `#64748b` | Meta text (≥4.5:1 on white) |
| `--paper` / `--white` | `#f6f8fa` / `#fff` | Page / surfaces |
| `--line` / `--line-soft` | `#e2e8f0` / `#eef2f6` | Borders, row dividers |
| `--navy` | `#0e1b2c` | Sidebar, selected filter chip |
| `--teal` / `--teal-strong` / `--teal-soft` | `#0b6e63` / `#08534a` / `#e6f4f1` | Brand, primary action, done steps, links |
| `--radius` / `--radius-sm` | 12px / 8px | Surfaces / controls |
| `--shadow` | 1px+4px soft, offset | Surface lift |

**Status tones** (same five everywhere: pills, step bars, banners). Each differs in lightness, so
status still reads without colour:

| Class | Meaning | Background / text |
|---|---|---|
| `tone-ready` | Ready | `#dcfce7` / `#14532d` |
| `tone-not-ready` | Not ready (failed) | `#fee2e2` / `#991b1b` |
| `tone-waiting`, `tone-gap` | Waiting on someone / can't decide / re-check | `#fef3c7` / `#854d0e` |
| `tone-active` | Check queued or running | `#dbeafe` / `#1e40af` |
| `tone-draft` | Draft, nothing yet, in progress | `#f1f5f9` / `#334155` |

## Type

Inter (variable, self-hosted `frontend/static/inter.woff2`, SIL OFL — `INTER-LICENSE.txt`); the strict
CSP allows no font CDN. Base 15px / 1.55. Page title 30px bold, −0.025em. Section titles 13px
semibold muted. No eyebrow labels above headings. Tabular numerals in tables and counts.
Monospace only for commits and digests.

## Layout and components

- **Frame**: 248px navy sidebar in three groups (Work · Connect · Help), one distinct stroke icon per
  item; top bar with breadcrumb, "How Qivvera decides", identity, sign out. Below 900px the sidebar is a
  drawer behind a 44px menu button.
- **Home ("Your turn")**: a task list of changes waiting for the signed-in roles (from
  `workspace/stage.ts`), one action button each; side cards for "Where changes stand" and recent activity.
- **Changes table**: filter chips (All, Needs my action, In progress, Ready, Not ready); columns
  Change · Stage (4-segment bar + text) · Status pill · Waiting on.
- **Change page**: a step tracker (Describe → Requirements → Plan & check → Result → Resolutions) where
  each step is a button named after its section, status text beside it; Records (Revisions, History) at
  the end. Then the assessment banner and "What to do next", then the selected section.
- **Not ready**: the Result section adds "How to get to Ready" (track fix → corrected commit → re-check →
  independent verification).
- Stage logic is in `frontend/src/workspace/stage.ts` (lists) and `steps()` in
  `frontend/src/change/ChangePage.tsx` (change page). Both derive state only from recorded data.

## States

Every control has hover, focus-visible (2px teal ring), disabled (grey, with a title saying why where
the reason is not visible). Empty states say what happens next and who does it. Motion: 150ms colour
transitions and the 250ms drawer slide; `prefers-reduced-motion` turns them off.
