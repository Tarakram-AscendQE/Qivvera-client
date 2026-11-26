/**
 * The PR assurance demo's fixed scenario. Nothing here comes from a browser: repositories, their
 * GitHub ids, the workflow and the three pull requests are pinned. Repository ids are checked on every
 * answer, so a renamed or replaced repository is not silently trusted.
 */
export const SCENARIO = Object.freeze({
  application: 'VendorPay',
  change: "VP-184 · Let Procurement change a supplier's bank account",
  app: Object.freeze({ owner: 'prcheck-live', repo: 'vendorpay-app', repositoryId: 1440617142 }),
  verifiers: Object.freeze({
    owner: 'prcheck-live', repo: 'prcheck-verifiers', repositoryId: 1440617261,
    workflow: 'qivvera-pr-assessment.yml', ref: 'main',
  }),
  pulls: Object.freeze([6, 7, 8]),
  /** The fine-grained token is read from this variable when needed; it is never stored or returned. */
  tokenEnv: 'QIVVERA_PR_ASSURANCE_GITHUB_TOKEN',
  snapshotFile: 'fixtures/pr-assurance/vendorpay-policies-e408884.json',
  /** A run with no result after this long is TIMED_OUT (the workflow itself stops after 12 minutes). */
  runTimeoutMs: 15 * 60 * 1000,
});

/**
 * `githubWrite` (off unless QIVVERA_PR_ASSURANCE_GITHUB_WRITE is exactly "true") lets Qivvera set the
 * "Qivvera" commit status and its one PR comment on the demo app repository. Nothing else is written.
 */
export function loadPrAssuranceConfig(env = process.env) {
  return { enabled: env.QIVVERA_PR_ASSURANCE_ENABLED === 'true', githubWrite: env.QIVVERA_PR_ASSURANCE_GITHUB_WRITE === 'true', scenario: SCENARIO };
}
