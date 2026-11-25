/**
 * GitHub calls for the PR assurance add-on. Fixed host and paths only: the pinned repositories, the
 * pinned workflow and values validated here (40-character commits, UUID run ids, numeric GitHub ids).
 * Redirects are refused. The token is read from the environment for each call and never appears in an
 * error, a log or a return value.
 *
 * A start request that GitHub does not answer has an uncertain outcome (the run may exist): it is
 * reported as GITHUB_DISPATCH_UNCERTAIN and never repeated automatically. The caller looks for the run
 * by its correlation id instead.
 */
import { InputError, identifier } from '../workflow-input.mjs';
import { API_VERSION, readPull as readIntakePull } from '../intake/github.mjs';
import { SCENARIO } from './config.mjs';

const BASE = 'https://api.github.com';
const MAX_BYTES = 1024 * 1024;
const { owner, repo, workflow, ref, repositoryId } = SCENARIO.verifiers;
const VERIFIERS = `/repos/${owner}/${repo}`;
const PERMISSION = {
  dispatch: 'Actions: read and write on prcheck-verifiers',
  runs: 'Actions: read on prcheck-verifiers',
  checks: 'Checks: read on prcheck-verifiers',
};
const RUN_TITLE = correlationId => `qivvera ${correlationId}`;
/** The run link is shown to people, so only the pinned repository's Actions address is kept. */
const RUN_URL = new RegExp(`^https://github\\.com/${owner}/${repo}/actions/runs/\\d+$`);
const CHECK_NAME = correlationId => `qivvera-evidence ${correlationId}`;

const fail = (code, message, status = 503) => { throw new InputError(code, message, status); };
function commit(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) fail('INVALID_COMMIT', 'A full 40-character commit is required.', 400);
  return value;
}
const runId = value => (Number.isSafeInteger(value) && value > 0 ? value : fail('INVALID_GITHUB_RUN', 'A GitHub run id is required.', 400));

/** The workflow run fields Qivvera uses, after checking it is the run we started, in the pinned repository. */
function toRun(raw, correlationId) {
  if (!raw || raw.repository?.id !== repositoryId || raw.display_title !== RUN_TITLE(correlationId) || !Number.isSafeInteger(raw.id)) {
    fail('GITHUB_UNEXPECTED_RUN', 'GitHub returned a run that Qivvera did not start.', 502);
  }
  const url = typeof raw.html_url === 'string' && RUN_URL.test(raw.html_url) ? raw.html_url : null;
  return { id: raw.id, status: raw.status, conclusion: raw.conclusion ?? null, url, headSha: raw.head_sha };
}

export function createGitHubClient({ secretEnv = process.env, fetchFn = fetch, timeoutMs = 6000 } = {}) {
  const token = () => {
    const value = secretEnv[SCENARIO.tokenEnv];
    return typeof value === 'string' && value.length >= 16 && value.length <= 2048 && !/[\r\n]/.test(value) ? value : null;
  };

  async function call(method, path, { body, permission, uncertain = false } = {}) {
    const bearer = token();
    if (!bearer) fail('GITHUB_TOKEN_NOT_CONFIGURED', `No GitHub token is configured. Ask the deployer to set ${SCENARIO.tokenEnv}.`);
    let response;
    try {
      response = await fetchFn(`${BASE}${path}`, {
        method, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': API_VERSION, 'User-Agent': 'Qivvera-pr-assurance', Authorization: `Bearer ${bearer}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      if (uncertain) fail('GITHUB_DISPATCH_UNCERTAIN', 'GitHub did not answer, so the run may or may not have started. Qivvera will look for it instead of starting another.');
      fail('GITHUB_UNAVAILABLE', 'GitHub could not be reached. Try again shortly.');
    }
    const { status, headers } = response;
    if (status >= 300 && status < 400) fail('GITHUB_REDIRECT_REFUSED', 'GitHub answered with a redirect, which Qivvera does not follow.', 502);
    if (status === 429 || (status === 403 && (headers.get('x-ratelimit-remaining') === '0' || headers.has('retry-after')))) {
      fail('GITHUB_RATE_LIMITED', 'GitHub request limit reached. Try again in a minute.', 429);
    }
    if (status === 401) fail('GITHUB_TOKEN_REJECTED', `GitHub rejected the token in ${SCENARIO.tokenEnv}. Ask the deployer to replace it.`);
    if (status === 403 || status === 404) fail('GITHUB_PERMISSION_MISSING', `GitHub refused this request. The token needs ${permission}.`);
    if (status < 200 || status >= 300) fail('GITHUB_UNAVAILABLE', `GitHub answered ${status}. Try again shortly.`);
    if (status === 204) return null;
    const text = await response.text();
    if (text.length > MAX_BYTES) fail('GITHUB_RESPONSE_TOO_LARGE', 'GitHub returned more data than expected.', 502);
    try { return JSON.parse(text); } catch { fail('GITHUB_INVALID_RESPONSE', 'GitHub returned an unreadable answer.', 502); }
  }

  return {
    tokenConfigured: () => token() !== null,

    /** PR metadata through the existing intake reader (open PR, pinned repository id, exact head and base). */
    async readPull(number) {
      if (!SCENARIO.pulls.includes(number)) fail('PULL_NOT_IN_SCENARIO', 'Only the demo pull requests #6, #7 and #8 can be imported.', 400);
      return readIntakePull({ ...SCENARIO.app, tokenEnv: SCENARIO.tokenEnv }, number, { secretEnv, fetchFn });
    },

    async dispatch({ appSha, correlationId }) {
      const inputs = { app_sha: commit(appSha), correlation_id: identifier(correlationId, 'Run') };
      await call('POST', `${VERIFIERS}/actions/workflows/${workflow}/dispatches`, { body: { ref, inputs }, permission: PERMISSION.dispatch, uncertain: true });
    },

    /** The run started for this correlation id, looking only at runs created since shortly before `notBefore`. */
    async findRun(correlationId, notBefore) {
      identifier(correlationId, 'Run');
      const since = new Date(Date.parse(notBefore) - 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const query = new URLSearchParams({ event: 'workflow_dispatch', per_page: '30', created: `>=${since}` });
      const answer = await call('GET', `${VERIFIERS}/actions/workflows/${workflow}/runs?${query}`, { permission: PERMISSION.runs });
      const match = (answer?.workflow_runs ?? []).find(run => run?.display_title === RUN_TITLE(correlationId));
      return match ? toRun(match, correlationId) : null;
    },

    async getRun(id, correlationId) {
      return toRun(await call('GET', `${VERIFIERS}/actions/runs/${runId(id)}`, { permission: PERMISSION.runs }), correlationId);
    },

    /** The progress/evidence check run for this correlation id, written by GitHub Actions on the run's commit. */
    async findCheckRun(headSha, correlationId) {
      const query = new URLSearchParams({ check_name: CHECK_NAME(identifier(correlationId, 'Run')), filter: 'latest', per_page: '10' });
      const answer = await call('GET', `${VERIFIERS}/commits/${commit(headSha)}/check-runs?${query}`, { permission: PERMISSION.checks });
      const match = (answer?.check_runs ?? []).find(c => c?.name === CHECK_NAME(correlationId) && c?.app?.slug === 'github-actions');
      return match ? { id: match.id, status: match.status, conclusion: match.conclusion ?? null, text: match.output?.text ?? null } : null;
    },
  };
}
