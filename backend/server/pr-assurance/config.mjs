/**
 * PR assurance settings that are the same for every application. Everything application-specific
 * (its three repositories and its GitHub token) is registered in the UI and stored per application;
 * nothing here comes from a browser.
 */
export const PR_ASSURANCE = Object.freeze({
  /** The workflow each Test Automation repository provides: workflow_dispatch with app_sha and correlation_id. */
  workflow: 'qivvera-pr-assessment.yml',
  /** Where a Profiles repository publishes its rules snapshot (made by scripts/pr-assurance-snapshot.mjs). */
  rulesFile: '.qivvera/rules-snapshot.json',
  /** Snapshots shipped with Qivvera, used when a Profiles repository does not publish one. */
  bundledSnapshotsDir: 'fixtures/pr-assurance',
  /** A run with no result after this long is TIMED_OUT (the reference workflow stops after 12 minutes). */
  runTimeoutMs: 15 * 60 * 1000,
});

/**
 * `githubWrite` (off unless QIVVERA_PR_ASSURANCE_GITHUB_WRITE is exactly "true") lets Qivvera set the
 * "Qivvera" commit status and its one PR comment on each application's own repository, with that
 * application's own token. Nothing else is written.
 */
export function loadPrAssuranceConfig(env = process.env) {
  return { enabled: env.QIVVERA_PR_ASSURANCE_ENABLED === 'true', githubWrite: env.QIVVERA_PR_ASSURANCE_GITHUB_WRITE === 'true' };
}
