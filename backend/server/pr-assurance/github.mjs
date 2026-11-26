/**
 * GitHub calls for PR assurance, made with one application's own token against that application's
 * own repositories (recorded, with their GitHub ids, when the application was connected). Fixed host
 * and fixed path shapes only; repository names were validated when they were saved, and commits, run
 * ids and pull numbers are validated here. Redirects are refused. The token never appears in an
 * error, a log or a return value.
 *
 * A start request that GitHub does not answer has an uncertain outcome (the run may exist): it is
 * reported as GITHUB_DISPATCH_UNCERTAIN and never repeated automatically. The caller looks for the run
 * by its correlation id instead.
 */
import { InputError, identifier } from '../workflow-input.mjs';
import { API_VERSION, PULL_LIST_LIMIT, normalizePull, normalizePullSummary, pullNumber } from '../intake/github.mjs';
import { PR_ASSURANCE } from './config.mjs';

const BASE = 'https://api.github.com';
const MAX_BYTES = 1024 * 1024;
const OWNER = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/;
const REPO = /^[a-zA-Z0-9_.-]{1,100}$/;
/** The commit status name a branch protection rule requires, and the marker of Qivvera's one comment per PR. */
export const STATUS_CONTEXT = 'Qivvera';
export const COMMENT_MARKER = '<!-- qivvera-pr-assurance -->';
const STATUS_STATES = ['pending', 'success', 'failure', 'error'];
const RUN_TITLE = correlationId => `qivvera ${correlationId}`;
const CHECK_NAME = correlationId => `qivvera-evidence ${correlationId}`;

const fail = (code, message, status = 503) => { throw new InputError(code, message, status); };
function commit(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) fail('INVALID_COMMIT', 'A full 40-character commit is required.', 400);
  return value;
}
const runId = value => (Number.isSafeInteger(value) && value > 0 ? value : fail('INVALID_GITHUB_RUN', 'A GitHub run id is required.', 400));

/** Fine-grained (github_pat_…) and classic (ghp_…) tokens: letters, digits and underscores only. */
export const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_]{20,255}$/.test(value);

/** "owner/repo" split and checked, so it can only ever form a /repos/<owner>/<repo> path. */
export function repositoryName(fullName) {
  const [owner, repo, ...rest] = typeof fullName === 'string' ? fullName.split('/') : [];
  if (rest.length || !OWNER.test(owner ?? '') || !REPO.test(repo ?? '') || ['.', '..'].includes(repo)) throw new Error('INVALID_REPOSITORY_NAME');
  return { owner, repo, path: `/repos/${owner}/${repo}` };
}
/** GitHub's own short reason for refusing a request (its message and validation errors), on one line. */
async function reasonOf(response) {
  try {
    const body = JSON.parse((await response.text()).slice(0, 4096));
    const errors = typeof body?.errors === 'string' ? body.errors
      : Array.isArray(body?.errors) ? body.errors.map(e => e?.message ?? [e?.field, e?.code].filter(Boolean).join(' ')).filter(Boolean).join('; ') : '';
    const reason = [body?.message, errors].filter(x => typeof x === 'string' && x).join(': ').replace(/\s+/g, ' ').slice(0, 300);
    return reason || 'no reason given';
  } catch { return 'no reason given'; }
}
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One requester bound to one token. `missing: true` returns null for a 404 instead of failing
 * (used where "not there" and "not allowed" must be told apart by the caller).
 */
export function githubRequester({ token, fetchFn = fetch, timeoutMs = 6000 }) {
  if (!validToken(token)) fail('GITHUB_TOKEN_NOT_CONFIGURED', 'This application has no usable GitHub token. Enter one in the application\'s GitHub settings.');
  return async function call(method, path, { body, permission, uncertain = false, missing = false, accept = 'application/vnd.github+json' } = {}) {
    let response;
    try {
      response = await fetchFn(`${BASE}${path}`, {
        method, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: accept, 'X-GitHub-Api-Version': API_VERSION, 'User-Agent': 'Qivvera-pr-assurance', Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      if (uncertain) fail('GITHUB_DISPATCH_UNCERTAIN', 'GitHub did not answer, so the run may or may not have started. Qivvera will look for it instead of starting another.');
      fail('GITHUB_UNAVAILABLE', 'GitHub could not be reached. Try again shortly.');
    }
    const { status, headers } = response;
    if (status >= 300 && status < 400) fail('GITHUB_REDIRECT_REFUSED', 'GitHub answered with a redirect, which Qivvera does not follow. If a repository was renamed or moved, update its URL.', 502);
    if (status === 429 || (status === 403 && (headers.get('x-ratelimit-remaining') === '0' || headers.has('retry-after')))) {
      fail('GITHUB_RATE_LIMITED', 'GitHub request limit reached. Try again in a minute.', 429);
    }
    if (status === 401) fail('GITHUB_TOKEN_REJECTED', 'GitHub rejected this application\'s token: it is wrong, expired or revoked. Enter a new one in the application\'s GitHub settings.');
    if (status === 404 && missing) { await response.body?.cancel(); return null; }
    if (status === 403 || status === 404) fail('GITHUB_PERMISSION_MISSING', `GitHub refused this request. The token needs ${permission}.`);
    if (status === 422) fail('GITHUB_REQUEST_INVALID', `GitHub did not accept the request: ${await reasonOf(response)}`, 502);
    if (status < 200 || status >= 300) fail('GITHUB_UNAVAILABLE', `GitHub answered ${status}. Try again shortly.`);
    if (status === 204) return null;
    const text = await response.text();
    if (text.length > MAX_BYTES) fail('GITHUB_RESPONSE_TOO_LARGE', 'GitHub returned more data than expected.', 502);
    try { return JSON.parse(text); } catch { fail('GITHUB_INVALID_RESPONSE', 'GitHub returned an unreadable answer.', 502); }
  };
}

/**
 * The calls PR assurance makes for one connected application.
 * connection: { app: { repository, repositoryId }, tests: { repository, repositoryId, ref } }.
 */
export function createGitHubClient({ token, connection, fetchFn = fetch, timeoutMs = 6000 }) {
  const call = githubRequester({ token, fetchFn, timeoutMs });
  const app = repositoryName(connection.app.repository), tests = repositoryName(connection.tests.repository);
  const appConfig = { owner: app.owner, repo: app.repo, repositoryId: connection.app.repositoryId };
  const { workflow } = PR_ASSURANCE, { ref } = connection.tests;
  const permission = {
    pulls: `Pull requests: read on ${connection.app.repository}`,
    dispatch: `Actions: read and write on ${connection.tests.repository}`,
    runs: `Actions: read on ${connection.tests.repository}`,
    checks: `Checks: read on ${connection.tests.repository}`,
    statuses: `Commit statuses: read and write on ${connection.app.repository}`,
    comments: `Pull requests: read and write on ${connection.app.repository}`,
  };
  /** The run link is shown to people, so only this Test Automation repository's Actions address is kept. */
  const runUrl = new RegExp(`^https://github\\.com/${escape(tests.owner)}/${escape(tests.repo)}/actions/runs/\\d+$`, 'i');

  /** The workflow run fields Qivvera uses, after checking it is the run we started, in this application's test repository. */
  function toRun(raw, correlationId) {
    if (!raw || raw.repository?.id !== connection.tests.repositoryId || raw.display_title !== RUN_TITLE(correlationId) || !Number.isSafeInteger(raw.id)) {
      fail('GITHUB_UNEXPECTED_RUN', 'GitHub returned a run that Qivvera did not start.', 502);
    }
    const url = typeof raw.html_url === 'string' && runUrl.test(raw.html_url) ? raw.html_url : null;
    return { id: raw.id, status: raw.status, conclusion: raw.conclusion ?? null, url, headSha: raw.head_sha };
  }

  return {
    /** One open PR's metadata (exact head and base), from this application's repository only. */
    async readPull(number) {
      pullNumber(number);
      return normalizePull(await call('GET', `${app.path}/pulls/${number}`, { permission: permission.pulls }), appConfig, number);
    },

    /** The open PRs, newest first (at most 30). Listed for choosing what to import; nothing is stored. */
    async listOpenPulls() {
      const raw = await call('GET', `${app.path}/pulls?state=open&sort=created&direction=desc&per_page=${PULL_LIST_LIMIT}`, { permission: permission.pulls });
      if (!Array.isArray(raw) || raw.length > PULL_LIST_LIMIT) fail('GITHUB_INVALID_RESPONSE', 'GitHub returned an unexpected pull-request list.', 502);
      return raw.map(p => normalizePullSummary(p, appConfig));
    },

    /** Sets the "Qivvera" commit status on a commit of this application's repository (what branch protection can require). */
    async setCommitStatus(sha, { state, description, targetUrl = null }) {
      if (!STATUS_STATES.includes(state)) fail('INVALID_STATUS', 'Unknown commit status.', 400);
      const link = typeof targetUrl === 'string' && /^https?:\/\/[^\s]+$/.test(targetUrl) ? targetUrl : undefined;
      await call('POST', `${app.path}/statuses/${commit(sha)}`, {
        body: { state, context: STATUS_CONTEXT, description: String(description).slice(0, 140), ...(link ? { target_url: link } : {}) },
        permission: permission.statuses,
      });
    },

    /**
     * Writes Qivvera's one comment on a PR of this application's repository: the comment this token wrote
     * earlier with the marker is edited, otherwise a new one is added. Nobody else's comment is ever changed.
     */
    async upsertPullComment(number, markdown) {
      pullNumber(number);
      const body = `${COMMENT_MARKER}\n${markdown}`;
      const login = (await call('GET', '/user', { permission: permission.comments }))?.login;
      const comments = await call('GET', `${app.path}/issues/${number}/comments?per_page=100`, { permission: permission.comments });
      const own = (Array.isArray(comments) ? comments : []).find(c => typeof login === 'string' && c?.user?.login === login
        && typeof c?.body === 'string' && c.body.startsWith(COMMENT_MARKER) && Number.isSafeInteger(c?.id));
      if (own) await call('PATCH', `${app.path}/issues/comments/${own.id}`, { body: { body }, permission: permission.comments });
      else await call('POST', `${app.path}/issues/${number}/comments`, { body: { body }, permission: permission.comments });
      return { updated: !!own };
    },

    async dispatch({ appSha, correlationId }) {
      const inputs = { app_sha: commit(appSha), correlation_id: identifier(correlationId, 'Run') };
      await call('POST', `${tests.path}/actions/workflows/${workflow}/dispatches`, { body: { ref, inputs }, permission: permission.dispatch, uncertain: true });
    },

    /** The run started for this correlation id, looking only at runs created since shortly before `notBefore`. */
    async findRun(correlationId, notBefore) {
      identifier(correlationId, 'Run');
      const since = new Date(Date.parse(notBefore) - 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const query = new URLSearchParams({ event: 'workflow_dispatch', per_page: '30', created: `>=${since}` });
      const answer = await call('GET', `${tests.path}/actions/workflows/${workflow}/runs?${query}`, { permission: permission.runs });
      const match = (answer?.workflow_runs ?? []).find(run => run?.display_title === RUN_TITLE(correlationId));
      return match ? toRun(match, correlationId) : null;
    },

    async getRun(id, correlationId) {
      return toRun(await call('GET', `${tests.path}/actions/runs/${runId(id)}`, { permission: permission.runs }), correlationId);
    },

    /** The progress/evidence check run for this correlation id, written by GitHub Actions on the run's commit. */
    async findCheckRun(headSha, correlationId) {
      const query = new URLSearchParams({ check_name: CHECK_NAME(identifier(correlationId, 'Run')), filter: 'latest', per_page: '10' });
      const answer = await call('GET', `${tests.path}/commits/${commit(headSha)}/check-runs?${query}`, { permission: permission.checks });
      const match = (answer?.check_runs ?? []).find(c => c?.name === CHECK_NAME(correlationId) && c?.app?.slug === 'github-actions');
      return match ? { id: match.id, status: match.status, conclusion: match.conclusion ?? null, text: match.output?.text ?? null } : null;
    },
  };
}
