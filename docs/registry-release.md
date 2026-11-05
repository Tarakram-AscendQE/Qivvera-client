# Registry increment 0.1.0 — 2026-10-31

## Delivered

A local, session-protected, single-owner workspace for registering applications, describing changes, proposing and editing candidate obligations, reviewing saved activity and exporting working records. The interface uses the same live local Node API and SQLite database exercised by the HTTP tests. No preloaded application or synthetic assurance verdict is shipped.

New obligations are always CANDIDATE / NOT_ASSESSED. Source references and commit references remain declared, not verified. No public endpoint accepts evidence judgments, authority acceptance or dispositions. Run Assurance is visibly unavailable.

## Actual checks

- TypeScript type check and build passed.
- 90 Node tests passed: the prior 41 foundation checks plus 49 registry, persistence, authentication and HTTP checks.
- A complete Chromium interface journey passed 12 checks, including create/edit/navigation and record persistence after stopping/restarting the actual Node service.
- Screens reviewed at 1440px, 1366px and 390px; horizontal page overflow check passed at 1366px and 390px.
- GitHub foundation commit 7308ad0b13ce2b8dcdf780c4adc8533e279aa20c passed a clean remote npm install and check workflow, run 41185056348. Registry remote CI must be checked separately for this revision.

## Browser-test limitation

Managed Chromium rejected native network navigation with ERR_BLOCKED_BY_ADMINISTRATOR. No browser policy was disabled. For UI testing, the actual production HTML/CSS/JavaScript was rendered with a test-only fetch bridge to the actual local Node API. The bridge was not part of the application. This exercise does NOT validate native browser cookie transport, deployed TLS or production CSP behavior. Separate direct HTTP and auth tests validate server contracts; native hosted-browser testing remains a release gate.

## Storage and security boundaries

SQLite through node:sqlite is a local review adapter. Node 22.16 labels that API experimental. This is not the selected production database and not an immutable assurance-evidence store. The hosted PostgreSQL adapter, backup/restore and production migration workflow remain unimplemented.

Owner login uses a configured scrypt hash, short-lived server sessions, HttpOnly/SameSite cookies, explicit request-origin checks, CSRF checks and login throttling. This is bounded founder-review authentication, not enterprise IAM. Sessions deliberately do not survive process restart. Working activity records are not tamper-proof audit evidence.

The registry startup refuses production mode and non-loopback binding. No paid infrastructure, public hosting or customer data has been provisioned. The Dockerfile remains a foundation health image, not a registry deployment configuration; its build is unverified locally.

## Next deployment gate

Before hosting: approve budget; establish Render access to the private repository; implement and test the PostgreSQL adapter and migration; provision owner credentials without posting secrets in chat; exercise native HTTPS login, persistence, restart and recovery; then provide a browser review URL.

Independent verification execution, authority decisions, evidence collection and scoped dispositions are subsequent product increments. This release is a real registry, not yet a working independent assurance system.
