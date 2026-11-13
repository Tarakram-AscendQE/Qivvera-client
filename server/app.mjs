import http from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAuth } from './auth.mjs';
import { createWorkspaceAuth } from './workspace-auth.mjs';
import { fields, InputError } from './errors.mjs';
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
async function body(req) {
    if ((req.headers['content-type'] ?? '').split(';')[0].trim() !== 'application/json')
        throw new InputError('JSON_REQUIRED', 'Send JSON.', 415);
    if (Number(req.headers['content-length'] ?? 0) > 16384) {
        req.resume?.();
        throw new InputError('BODY_TOO_LARGE', 'Request exceeds 16 KB.', 413);
    }
    // Some serverless adapters have already parsed the request body. Validate the same size/shape.
    if (req.body !== undefined) {
        let raw = req.body;
        if (Buffer.isBuffer(raw))
            raw = raw.toString('utf8');
        if (typeof raw !== 'string') {
            const s = JSON.stringify(raw);
            if (Buffer.byteLength(s) > 16384)
                throw new InputError('BODY_TOO_LARGE', 'Request exceeds 16 KB.', 413);
            return raw;
        }
        if (Buffer.byteLength(raw) > 16384)
            throw new InputError('BODY_TOO_LARGE', 'Request exceeds 16 KB.', 413);
        try {
            return JSON.parse(raw);
        }
        catch {
            throw new InputError('INVALID_JSON', 'The request is not valid JSON.');
        }
    }
    return new Promise((accept, reject) => { let n = 0, chunks = [], oversize = false; req.on('data', chunk => { n += chunk.length; if (n > 16384) {
        if (!oversize)
            reject(new InputError('BODY_TOO_LARGE', 'Request exceeds 16 KB.', 413));
        oversize = true;
        chunks = [];
    }
    else if (!oversize)
        chunks.push(chunk); }); req.on('end', () => { if (oversize)
        return; try {
        accept(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    }
    catch {
        reject(new InputError('INVALID_JSON', 'The request is not valid JSON.'));
    } }); req.on('error', reject); req.on('aborted', () => reject(new InputError('REQUEST_ABORTED', 'The request was interrupted.'))); });
}
export function createApplicationServer({ repository, accounts, ownerEmail, passwordHash, publicOrigin, secureCookies = false, webRoot = resolve('web'), releaseRevision = 'unrecorded' }) {
    if (!publicOrigin || new URL(publicOrigin).origin !== publicOrigin)
        throw new Error('PUBLIC_ORIGIN must be an exact origin.');
    if (secureCookies && !publicOrigin.startsWith('https://'))
        throw new Error('HTTPS_REQUIRED');
    const workflow = repository.workflow === true;
    // Legacy adapter retained only for baseline local regression tests. Hosted startup always
    // creates the workflow repository and cannot fall back to this adapter.
    const auth = workflow ? createWorkspaceAuth({ accounts: accounts ?? [{ email: ownerEmail, passwordHash, roles: ['AUTHOR', 'POLICY_AUTHORITY'] }], repository, secureCookies }) : createAuth({ ownerEmail, passwordHash, secureCookies });
    const publicSession = s => ({ email: s.email, roles: s.roles ?? ['AUTHOR'], csrfToken: s.csrfToken, reviewMode: workflow ? repository.reviewMode : 'not-available' });
    const assets = new Map();
    for (const [name, type] of [['index.html', 'text/html'], ['app.js', 'text/javascript'], ['app.css', 'text/css'], ['workflow.css', 'text/css'], ['logo.svg', 'image/svg+xml']]) {
        try {
            assets.set(name === 'index.html' ? '/' : '/' + name, [readFileSync(resolve(webRoot, name)), type + '; charset=utf-8']);
        }
        catch (e) {
            if (['index.html', 'app.js', 'app.css'].includes(name))
                throw new Error('REQUIRED_ASSET_MISSING');
        }
    }
    return http.createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 16384 }, async (req, res) => {
        const requestId = randomUUID();
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Request-ID', requestId);
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        if (secureCookies)
            res.setHeader('Strict-Transport-Security', 'max-age=31536000');
        try {
            const url = new URL(req.url, 'http://internal'), path = url.pathname;
            // Do not use client-controlled forwarded URL/Host headers for routing or origin trust.
            if (req.method === 'GET' && ['/healthz', '/readyz'].includes(path)) {
                let healthy = false;
                try {
                    healthy = await repository.healthy();
                }
                catch { }
                return json(res, healthy ? 200 : 503, { service: 'qivvera-registry', version: '0.3.0', process: 'running', storage: repository.driver ?? 'local-review', ready: healthy, revision: releaseRevision, assuranceExecution: false });
            }
            if (req.method === 'GET' && assets.has(path)) {
                const [a, type] = assets.get(path);
                res.writeHead(200, { 'Content-Type': type });
                res.end(a);
                return;
            }
            if (req.method !== 'GET' && req.headers.origin !== publicOrigin)
                return json(res, 403, { error: 'ORIGIN_REJECTED', message: 'This request did not originate from the configured workspace.', requestId });
            if (req.method === 'POST' && path === '/api/session') {
                const b = await body(req);
                fields(b, ['email', 'password']);
                const r = await auth.login(b.email, b.password, req.socket?.remoteAddress);
                if (r.error)
                    return json(res, r.status, { error: r.error, message: r.status === 429 ? 'Too many sign-in attempts. Try again in 10 minutes.' : 'Email or password not recognized.', requestId });
                res.setHeader('Set-Cookie', r.cookie);
                return json(res, 200, publicSession(r.session));
            }
            const session = await auth.session(req);
            if (!session)
                return json(res, 401, { error: 'AUTH_REQUIRED', message: 'Sign in to your workspace.', requestId });
            if (req.method === 'GET' && path === '/api/session')
                return json(res, 200, publicSession(session));
            if (req.method !== 'GET' && !auth.validCsrf(req, session))
                return json(res, 403, { error: 'CSRF_REJECTED', message: 'Reload the page before submitting this request.', requestId });
            if (req.method === 'DELETE' && path === '/api/session') {
                res.setHeader('Set-Cookie', await auth.logout(req));
                return json(res, 200, { signedOut: true });
            }
            const actor = workflow ? session : session.email;
            if (req.method === 'GET' && path === '/api/workspace')
                return json(res, 200, { applications: await repository.listApplications(), changes: await repository.listChanges(), activity: await repository.listActivity(), capabilities: { registry: true, authorityDecisions: workflow, changeRevisions: workflow, verifierExecution: false, evidenceCollection: false, assuranceDisposition: false }, storage: repository.driver ?? 'local-review', release: '0.3.0', revision: releaseRevision, reviewMode: repository.reviewMode ?? 'not-available' });
            if (req.method === 'GET' && path === '/api/export') {
                res.setHeader('Content-Disposition', 'attachment; filename="qivvera-workspace.json"');
                return json(res, 200, await repository.exportWorkspace());
            }
            if (req.method === 'GET' && path === '/api/applications')
                return json(res, 200, await repository.listApplications());
            if (req.method === 'POST' && path === '/api/applications')
                return json(res, 201, await repository.createApplication(await body(req), actor));
            if (req.method === 'POST' && path === '/api/changes')
                return json(res, 201, await repository.createChange(await body(req), actor));
            let m = path.match(/^\/api\/applications\/([a-f0-9-]{36})$/);
            if (req.method === 'GET' && m) {
                const r = await repository.getApplication(m[1]);
                if (!r)
                    throw new InputError('APPLICATION_NOT_FOUND', 'Application not found.', 404);
                return json(res, 200, r);
            }
            m = path.match(/^\/api\/changes\/([a-f0-9-]{36})$/);
            if (req.method === 'GET' && m) {
                const c = await repository.getChange(m[1], url.searchParams.get('revision') || undefined);
                if (!c)
                    throw new InputError('CHANGE_NOT_FOUND', 'This change was not found.', 404);
                return json(res, 200, c);
            }
            m = path.match(/^\/api\/changes\/([a-f0-9-]{36})\/obligations$/);
            if (req.method === 'POST' && m)
                return json(res, 201, await repository.addObligation(m[1], await body(req), actor));
            m = path.match(/^\/api\/obligations\/([a-f0-9-]{36})$/);
            if (req.method === 'PATCH' && m)
                return json(res, 200, await repository.editObligation(m[1], await body(req), actor));
            if (workflow) {
                m = path.match(/^\/api\/obligations\/([a-f0-9-]{36})\/review$/);
                if (req.method === 'POST' && m)
                    return json(res, 200, await repository.transitionObligation(m[1], await body(req), actor));
                m = path.match(/^\/api\/obligations\/([a-f0-9-]{36})\/history$/);
                if (req.method === 'GET' && m)
                    return json(res, 200, await repository.getObligationHistory(m[1]));
                m = path.match(/^\/api\/changes\/([a-f0-9-]{36})\/revisions$/);
                if (req.method === 'POST' && m)
                    return json(res, 201, await repository.createRevision(m[1], await body(req), actor));
            }
            return json(res, 404, { error: 'NOT_FOUND', message: 'This capability is not available in this release.', requestId });
        }
        catch (e) {
            if (e instanceof InputError)
                return json(res, e.status, { error: e.code, message: e.message, requestId });
            console.error(JSON.stringify({ event: 'request_failed', requestId }));
            return json(res, 500, { error: 'INTERNAL_ERROR', message: 'The request could not be confirmed. Reload saved records before retrying.', requestId });
        }
    });
}
