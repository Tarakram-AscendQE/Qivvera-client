/** LOCAL TESTING ONLY: sends a signed GitHub webhook delivery to a Qivvera workspace, exactly as GitHub would.
 *  The secret is read from QIVVERA_GITHUB_WEBHOOK_SECRET (e.g. `node --env-file=.env.local …`), never argv.
 *
 *  node scripts/send-github-webhook.mjs ping [--url URL]
 *  node scripts/send-github-webhook.mjs pull_request --repo owner/name --repo-id 123 --pr 7 --sha <40 hex>
 *       [--action opened|synchronize|reopened|ready_for_review] [--title T] [--head REF] [--base REF] [--url URL]
 */
import { createHmac, randomUUID } from 'node:crypto';

const [event, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i]?.startsWith('--') || rest[i + 1] === undefined) { console.error(`Unexpected argument ${rest[i]}`); process.exit(2); }
    opt[rest[i].slice(2)] = rest[i + 1];
}
const secret = process.env.QIVVERA_GITHUB_WEBHOOK_SECRET;
if (!secret) { console.error('QIVVERA_GITHUB_WEBHOOK_SECRET is required (use node --env-file=.env.local).'); process.exit(2); }
const url = opt.url ?? `${process.env.PUBLIC_ORIGIN ?? 'http://127.0.0.1:5050'}/api/github/webhook`;

let payload;
if (event === 'ping') payload = { zen: 'Keep it logically awesome.', hook_id: 1 };
else if (event === 'pull_request') {
    for (const k of ['repo', 'repo-id', 'pr', 'sha']) if (!opt[k]) { console.error(`--${k} is required for pull_request`); process.exit(2); }
    const repositoryId = Number(opt['repo-id']), number = Number(opt.pr);
    payload = {
        action: opt.action ?? 'opened', number,
        pull_request: { number, state: 'open', draft: false, title: opt.title ?? `Test PR #${number}`,
            head: { sha: opt.sha, ref: opt.head ?? `feature/pr-${number}` }, base: { ref: opt.base ?? 'main', repo: { id: repositoryId, full_name: opt.repo } } },
        repository: { id: repositoryId, full_name: opt.repo },
        sender: { login: opt.sender ?? 'local-tester' }
    };
} else { console.error('Event must be ping or pull_request.'); process.exit(2); }

const body = JSON.stringify(payload);
const res = await fetch(url, { method: 'POST', body, headers: {
    'content-type': 'application/json', 'user-agent': 'GitHub-Hookshot/local-test',
    'x-github-event': event, 'x-github-delivery': randomUUID(),
    'x-hub-signature-256': 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
} });
console.log(res.status, await res.text());
if (res.status >= 300) process.exitCode = 1;
