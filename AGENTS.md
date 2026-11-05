# Qivvera development rules

The founder is the end user/product owner, not the programmer. Deliver working,
verified increments. Do not use documents or prompts as a substitute for software.

## Product
Independent Change Assurance. Change → Obligations → Evidence → Gaps → Disposition.
Do not build an AI-DLC orchestrator. Keep this project separate from U1/Bugwhistle.
The Conclave case is a reference fixture, not the platform's scope.

## Truth and controls
- A new revision never inherits an earlier disposition.
- Lifecycle, obligation state, evidence applicability, and disposition are separate.
- Never promote a candidate obligation to authority without an authorized decision.
- Missing or wrong-target evidence cannot support READY.
- Keep evidence observations separate from accepted judgments and decisions.
- Preserve valid counterevidence; do not average a violation away.
- Exception acceptance never changes an observed violation into support.
- Keep producer access away from protected policies, verifier configuration and evidence.
- Do not claim a digest or a separate repository alone establishes independence.
- Test positive controls as well as negative controls.
- No fake trust scores, artificial test passes, or simulated results described as live.

## Current implementation
The core is a provisional internal policy kernel, not an authoritative evidence evaluator.
Release 0.1 adds a local, single-owner application/change/candidate-obligation registry.
SQLite is a local review adapter only; the hosted PostgreSQL adapter is not implemented.
There is a session-protected registry API, but no public assessment or evidence endpoint.
The registry cannot issue dispositions or approve authority. Do not expose the kernel to
producer-controlled snapshots. The start script refuses production/public binding.

## Working method
Run npm run check. Record actual outcomes and limitations in docs/checkpoint-report.md.
Keep secrets out of commits. Do not deploy publicly, incur hosting costs, create paid
services, or attach customer repositories without appropriate authorization.
Treat remote CI, protected deployment, persistence and rollback as unverified until run.
