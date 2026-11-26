/**
 * Connecting an application to GitHub: its three repositories and its own token, checked against
 * GitHub before anything is saved.
 *
 *   Application repository      read the repository; list pull requests          (Pull requests: read)
 *   Test Automation repository  read the repository; find the Qivvera workflow    (Actions: read)
 *                               read its default branch; read check runs          (Contents: read, Checks: read)
 *   Profiles repository         read its default branch; read the rules snapshot  (Contents: read)
 *
 * "Actions: write" (needed to start a run) cannot be checked without starting one, so a missing write
 * permission is reported the first time someone evaluates. Every message names the repository and
 * the permission; none contains the token.
 */
import { InputError, fields, text } from '../workflow-input.mjs';
import { PR_ASSURANCE } from './config.mjs';
import { githubRequester, repositoryName, validToken } from './github.mjs';
import { acceptPublishedSnapshot } from './rules.mjs';

const fail = (code, message, status = 400) => { throw new InputError(code, message, status); };

export const CONNECTION_FIELDS = Object.freeze(['repositoryUrl', 'testRepositoryUrl', 'profilesRepositoryUrl', 'githubToken']);
const LABELS = Object.freeze({ repositoryUrl: 'Application repository URL', testRepositoryUrl: 'Test automation repository URL', profilesRepositoryUrl: 'Profiles repository URL' });

/** https://github.com/<owner>/<repo>[.git][/] → "owner/repo". Nothing else is accepted. */
export function parseRepositoryUrl(value, label) {
    const raw = text(value, label, 500);
    let url;
    try { url = new URL(raw); } catch { fail('INVALID_URL', `${label}: enter a GitHub URL such as https://github.com/owner/repository.`); }
    if (url.protocol !== 'https:' || !['github.com', 'www.github.com'].includes(url.hostname.toLowerCase()) || url.port || url.username || url.password || url.search || url.hash) {
        fail('INVALID_URL', `${label}: use an https://github.com/owner/repository URL, without credentials or query parameters.`);
    }
    const [owner, repo, ...rest] = url.pathname.replace(/\/+$/, '').replace(/\.git$/i, '').split('/').filter(Boolean);
    try {
        if (rest.length || !owner || !repo) throw new Error('path');
        repositoryName(`${owner}/${repo}`);
    } catch {
        fail('INVALID_URL', `${label}: use the repository's own address, https://github.com/owner/repository.`);
    }
    return `${owner}/${repo}`;
}

/** The connection form's fields, validated. The token is checked for shape only; it is never echoed. */
export function connectionInput(input) {
    fields(input, CONNECTION_FIELDS);
    const token = typeof input.githubToken === 'string' ? input.githubToken.trim() : '';
    if (!validToken(token)) fail('INVALID_GITHUB_TOKEN', 'Enter a GitHub personal access token. It starts with github_pat_ or ghp_ and has no spaces.');
    return {
        app: parseRepositoryUrl(input.repositoryUrl, LABELS.repositoryUrl),
        tests: parseRepositoryUrl(input.testRepositoryUrl, LABELS.testRepositoryUrl),
        profiles: parseRepositoryUrl(input.profilesRepositoryUrl, LABELS.profilesRepositoryUrl),
        token,
    };
}

/**
 * Checks the token and every repository with GitHub. Returns what will be stored (repository names as
 * GitHub spells them, their ids, the test repository's branch, the profiles commit and the rules).
 * A rejected token and missing permissions are the person's to fix, so they are 400s here rather than 503s.
 */
export async function inspectConnection(input, { fetchFn = fetch, bundled, timeoutMs } = {}) {
    const call = githubRequester({ token: input.token, fetchFn, timeoutMs });
    const asInput = error => {
        if (error instanceof InputError && ['GITHUB_PERMISSION_MISSING', 'GITHUB_TOKEN_REJECTED'].includes(error.code)) error.status = 400;
        throw error;
    };

    async function repository(fullName, label) {
        const { path } = repositoryName(fullName);
        const raw = await call('GET', path, { missing: true, permission: `Metadata: read on ${fullName}` });
        if (!raw) fail('GITHUB_REPOSITORY_INACCESSIBLE', `${label}: ${fullName} was not found, or this token has no access to it. Check the URL and the repositories the token may use.`);
        if (!Number.isSafeInteger(raw.id) || raw.id < 1 || String(raw.full_name).toLowerCase() !== fullName.toLowerCase() || typeof raw.default_branch !== 'string') {
            fail('GITHUB_REPOSITORY_MISMATCH', `${label}: GitHub answered for a different repository. If it was renamed or moved, use its current URL.`);
        }
        return { repository: raw.full_name, repositoryId: raw.id, path, branch: raw.default_branch };
    }
    async function head(repo, label) {
        const branch = repo.branch.split('/').map(encodeURIComponent).join('/');
        const ref = await call('GET', `${repo.path}/git/ref/heads/${branch}`, { missing: true, permission: `Contents: read on ${repo.repository}` });
        const sha = ref?.object?.sha;
        if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) fail('GITHUB_REPOSITORY_EMPTY', `${label}: ${repo.repository} has no commit on its default branch, or the token lacks Contents: read on it.`);
        return sha;
    }

    const app = async () => {
        const repo = await repository(input.app, LABELS.repositoryUrl);
        await call('GET', `${repo.path}/pulls?state=open&per_page=1`, { permission: `Pull requests: read on ${repo.repository}` });
        return repo;
    };
    const tests = async () => {
        const repo = await repository(input.tests, LABELS.testRepositoryUrl);
        const workflow = await call('GET', `${repo.path}/actions/workflows/${PR_ASSURANCE.workflow}`, { missing: true, permission: `Actions: read on ${repo.repository}` });
        if (!workflow) fail('TEST_WORKFLOW_NOT_FOUND', `${repo.repository} has no .github/workflows/${PR_ASSURANCE.workflow} that this token can see. Add the workflow, or give the token Actions: read and write on that repository.`);
        if (workflow.state !== 'active') fail('TEST_WORKFLOW_DISABLED', `The ${PR_ASSURANCE.workflow} workflow in ${repo.repository} is disabled. Enable it in the repository's Actions tab.`);
        const sha = await head(repo, LABELS.testRepositoryUrl);
        await call('GET', `${repo.path}/commits/${sha}/check-runs?per_page=1`, { permission: `Checks: read on ${repo.repository}` });
        return repo;
    };
    const profiles = async () => {
        const repo = await repository(input.profiles, LABELS.profilesRepositoryUrl);
        const commit = await head(repo, LABELS.profilesRepositoryUrl);
        const published = await call('GET', `${repo.path}/contents/${PR_ASSURANCE.rulesFile}?ref=${commit}`, { missing: true, accept: 'application/vnd.github.raw+json', permission: `Contents: read on ${repo.repository}` });
        if (published) return { repo, commit, rules: acceptPublishedSnapshot(published, repo.repository), rulesSource: 'REPOSITORY' };
        const shipped = bundled?.forRepository(repo.repository) ?? null;
        return { repo, commit, rules: shipped, rulesSource: shipped ? 'BUNDLED' : null };
    };

    const [a, t, p] = await Promise.all([app(), tests(), profiles()]).catch(asInput);
    return {
        app: { repository: a.repository, repositoryId: a.repositoryId },
        tests: { repository: t.repository, repositoryId: t.repositoryId, ref: t.branch },
        profiles: { repository: p.repo.repository, repositoryId: p.repo.repositoryId, commit: p.commit },
        rules: p.rules, rulesSource: p.rulesSource,
    };
}
