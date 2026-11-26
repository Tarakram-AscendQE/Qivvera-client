/** GitHub webhook verification and pull-request event normalization.
 *  Receipt only: no GitHub API call, code execution, import, requirement, assessment or outbound write.
 *  Every payload field is untrusted provider text; only bounded, validated fields are kept. */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const WEBHOOK_MAX_BYTES = 1048576;
export const PULL_REQUEST_ACTIONS = Object.freeze(['opened', 'synchronize', 'reopened', 'ready_for_review']);
const DELIVERY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_NAME = /^[a-z_]{1,64}$/;
const SIGNATURE = /^sha256=[0-9a-f]{64}$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

/** Secret shared with GitHub. Required only when webhooks are enabled; never logged or returned. */
export function webhookSecret(value) {
    if (value === undefined || value === '') return null;
    if (typeof value !== 'string' || value.length < 32 || value.length > 256 || /\s/.test(value))
        throw new Error('INVALID_GITHUB_WEBHOOK_SECRET');
    return value;
}

/** Constant-time check of X-Hub-Signature-256 over the exact raw request bytes. */
export function validSignature(raw, header, secret) {
    if (!Buffer.isBuffer(raw) || typeof secret !== 'string' || !secret || typeof header !== 'string' || !SIGNATURE.test(header)) return false;
    const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(raw).digest('hex'));
    const given = Buffer.from(header);
    return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Validated delivery headers, or null when GitHub's required headers are missing or malformed. */
export function deliveryHeaders(headers) {
    const deliveryId = headers['x-github-delivery'], event = headers['x-github-event'];
    if (typeof deliveryId !== 'string' || !DELIVERY_ID.test(deliveryId) || typeof event !== 'string' || !EVENT_NAME.test(event)) return null;
    return { deliveryId: deliveryId.toLowerCase(), event };
}

const bounded = (value, max) => typeof value === 'string' && value.trim() && value.length <= max && !CONTROL.test(value) ? value : null;
const positiveId = value => Number.isSafeInteger(value) && value > 0 ? value : null;
const ignored = reason => ({ outcome: 'IGNORED', reason });

/** Normalizes one pull_request delivery against the operator-configured repository bindings.
 *  Returns { outcome: 'IGNORED', reason } or { outcome: 'RECORDED', event, bindings }. */
export function pullRequestEvent(payload, catalogue) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ignored('INVALID_PAYLOAD');
    const action = typeof payload.action === 'string' ? payload.action : null;
    if (!PULL_REQUEST_ACTIONS.includes(action)) return ignored('UNSUPPORTED_ACTION');
    const repositoryId = positiveId(payload.repository?.id), fullName = bounded(payload.repository?.full_name, 200);
    if (!repositoryId || !fullName) return ignored('INVALID_PAYLOAD');
    // Bind by GitHub's numeric repository ID and its name; a renamed or different repository is not trusted.
    const bindings = catalogue.filter(r => r.repositoryId === repositoryId && `${r.owner}/${r.repo}`.toLowerCase() === fullName.toLowerCase());
    if (!bindings.length) return ignored('REPOSITORY_NOT_CONFIGURED');
    const pr = payload.pull_request;
    const number = positiveId(pr?.number), headSha = typeof pr?.head?.sha === 'string' && FULL_SHA.test(pr.head.sha) ? pr.head.sha : null;
    const title = bounded(pr?.title, 256), headRef = bounded(pr?.head?.ref, 255), baseRef = bounded(pr?.base?.ref, 255);
    if (!number || number > 2147483647 || !headSha || !title || !headRef || !baseRef || pr.state !== 'open') return ignored('INVALID_PULL_REQUEST');
    if (positiveId(pr.base?.repo?.id) !== repositoryId) return ignored('REPOSITORY_MISMATCH');
    return {
        outcome: 'RECORDED',
        bindings,
        event: { action, repositoryId, repository: fullName, pullNumber: number, headSha, baseRef, headRef, title,
            draft: pr.draft === true, sender: bounded(payload.sender?.login, 100) ?? 'unknown' }
    };
}
