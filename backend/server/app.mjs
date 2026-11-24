import http from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createAuth } from './auth.mjs';
import { createWorkspaceAuth } from './workspace-auth.mjs';
import { fields, InputError } from './errors.mjs';
import { PRODUCT_VERSION } from './release.mjs';
import { createSupportReader } from './support-info.mjs';
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
async function body(req, maxBytes = 16384) {
    if ((req.headers['content-type'] ?? '').split(';')[0].trim() !== 'application/json')
        throw new InputError('JSON_REQUIRED', 'Send JSON.', 415);
    if (Number(req.headers['content-length'] ?? 0) > maxBytes) {
        req.resume?.();
        throw new InputError('BODY_TOO_LARGE', `Request exceeds ${maxBytes / 1024} KB.`, 413);
    }
    // Some serverless adapters have already parsed the request body. Validate the same size/shape.
    if (req.body !== undefined) {
        let raw = req.body;
        if (Buffer.isBuffer(raw))
            raw = raw.toString('utf8');
        if (typeof raw !== 'string') {
            const s = JSON.stringify(raw);
            if (Buffer.byteLength(s) > maxBytes)
                throw new InputError('BODY_TOO_LARGE', `Request exceeds ${maxBytes / 1024} KB.`, 413);
            return raw;
        }
        if (Buffer.byteLength(raw) > maxBytes)
            throw new InputError('BODY_TOO_LARGE', `Request exceeds ${maxBytes / 1024} KB.`, 413);
        try {
            return JSON.parse(raw);
        }
        catch {
            throw new InputError('INVALID_JSON', 'The request is not valid JSON.');
        }
    }
    return new Promise((accept, reject) => { let n = 0, chunks = [], oversize = false; req.on('data', chunk => { n += chunk.length; if (n > maxBytes) {
        if (!oversize)
            reject(new InputError('BODY_TOO_LARGE', `Request exceeds ${maxBytes / 1024} KB.`, 413));
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
export function createApplicationServer({ repository, assurance = null, resolution = null, intake = null, accounts, accountDirectory = null, ownerEmail, passwordHash, publicOrigin, secureCookies = false, webRoot = fileURLToPath(new URL('../../frontend/public', import.meta.url)), releaseRevision = 'unrecorded' }) {
    if (!publicOrigin || new URL(publicOrigin).origin !== publicOrigin)
        throw new Error('PUBLIC_ORIGIN must be an exact origin.');
    if (secureCookies && !publicOrigin.startsWith('https://'))
        throw new Error('HTTPS_REQUIRED');
    const workflow = repository.workflow === true;
    // Legacy adapter retained only for baseline local regression tests. Hosted startup always
    // creates the workflow repository and cannot fall back to this adapter.
    const auth = workflow ? createWorkspaceAuth({ directory: accountDirectory ?? undefined, accounts: accountDirectory ? undefined : accounts ?? [{ email: ownerEmail, passwordHash, roles: ['AUTHOR', 'POLICY_AUTHORITY'] }], repository, secureCookies }) : createAuth({ ownerEmail, passwordHash, secureCookies });
    const readSupport = createSupportReader({ repository, assurance, resolution, intake, accountDirectory, accounts: accounts ?? [{ email: ownerEmail, roles: ['AUTHOR', 'POLICY_AUTHORITY'] }], releaseRevision, secureCookies });
    const publicSession = s => ({ email: s.email, roles: s.roles ?? ['AUTHOR'], csrfToken: s.csrfToken, reviewMode: workflow ? repository.reviewMode : 'not-available' });
    const decorate = async change => {
        if (!change || !assurance) return change;
        let runs;
        try { runs = await assurance.listRuns(change.id, change.revision.id); }
        catch (error) {
            if (!(error instanceof InputError) || error.code !== 'ASSURANCE_INTEGRITY_FAILED') throw error;
            // Isolate an unavailable assessment without hiding it or taking down healthy records.
            // The strict assurance endpoints still reject the affected plan/run and cannot execute it.
            return { ...change, disposition: null, assessmentStatus: 'ASSURANCE_UNAVAILABLE', latestAssessment: null,
                assuranceError: { code: 'ASSURANCE_INTEGRITY_FAILED',
                    message: 'Saved assurance inputs are missing or inconsistent. No conclusion is available for this change. Ask the workspace operator to inspect the original records.' },
                ...(change.obligations ? { obligations: change.obligations.map(o => ({ ...o, state: 'NOT_ASSESSED', evidenceCount: 0 })) } : {}) };
        }
        const latest = runs[0];
        if (!latest) return change;
        const current = latest.applicability === 'CURRENT';
        const assessed = current && latest.status === 'COMPLETED' && latest.evidenceIntegrity === 'DIGEST_MATCH';
        return {...change, assessmentStatus: current ? latest.status : 'NOT_ASSESSED', disposition: assessed ? latest.disposition : null,
            latestAssessment: {id:latest.id,status:latest.status,applicability:latest.applicability},
            ...(change.obligations ? {obligations: change.obligations.map(o => {
                const finding = assessed ? latest.case?.findings.find(f=>f.obligationId===o.id) : null;
                return {...o,state:finding && finding.state!=='EXCLUDED' ? finding.state : 'NOT_ASSESSED',evidenceCount:finding?.evidenceIds.length??0};
            })}: {})};
    };
    const assets = new Map();
    for (const [name, type] of [['index.html', 'text/html'], ['app.js', 'text/javascript'], ['guide.js', 'text/javascript'], ['shared.js', 'text/javascript'], ['drafting.js', 'text/javascript'], ['impact.js', 'text/javascript'], ['templates.js', 'text/javascript'], ['app.css', 'text/css'], ['workflow.css', 'text/css'], ['assurance.css', 'text/css'], ['intake.js', 'text/javascript'], ['resolution.js', 'text/javascript'], ['resolution.css', 'text/css'], ['logo.svg', 'image/svg+xml']]) {
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
                return json(res, healthy ? 200 : 503, { service: 'qivvera-registry', version: PRODUCT_VERSION, process: 'running', storage: repository.driver ?? 'local-review', ready: healthy, revision: releaseRevision, assuranceExecution: false });
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
            if (req.method === 'GET' && path === '/api/support-info') {
                if (url.search) throw new InputError('SUPPORT_QUERY_UNSUPPORTED', 'Support information does not accept query parameters.', 400);
                return json(res, 200, await readSupport(session, requestId));
            }
            if (req.method !== 'GET' && !auth.validCsrf(req, session))
                return json(res, 403, { error: 'CSRF_REJECTED', message: 'Reload the page before submitting this request.', requestId });
            if (req.method === 'DELETE' && path === '/api/session') {
                res.setHeader('Set-Cookie', await auth.logout(req));
                return json(res, 200, { signedOut: true });
            }
            const actor = workflow ? session : session.email;
            if (workflow && assurance?.templates) {
                const templatePath = path.match(/^\/api\/verification-templates(?:\/([a-f0-9-]{36})(\/versions|\/archive|\/export)?)?$/);
                if (templatePath) {
                    const templates = assurance.templates, [, templateId, action] = templatePath;
                    const entries = [...url.searchParams.entries()];
                    const allowed = req.method === 'GET' ? templateId ? ['version'] : ['offset', 'limit', 'includeArchived'] : [];
                    if (entries.some(([key, value]) => !allowed.includes(key) || !value) || new Set(entries.map(([key]) => key)).size !== entries.length)
                        throw new InputError('TEMPLATE_QUERY_UNSUPPORTED', 'Use only the supported query fields once. Mutations do not accept query parameters.', 400);
                    if (req.method === 'GET' && !templateId) {
                        const values = Object.fromEntries(entries);
                        if (['offset', 'limit'].some(key => values[key] !== undefined && !/^(0|[1-9][0-9]*)$/.test(values[key])) || values.includeArchived !== undefined && !['true', 'false'].includes(values.includeArchived))
                            throw new InputError('TEMPLATE_QUERY_UNSUPPORTED', 'Use nonnegative whole-number pagination and true or false for includeArchived.', 400);
                        return json(res, 200, await templates.list({ offset: Number(values.offset ?? 0), limit: Number(values.limit ?? 20), includeArchived: values.includeArchived === 'true' }));
                    }
                    if (req.method === 'GET' && templateId && (!action || action === '/export')) {
                        const record = await templates.get(templateId, { versionId: url.searchParams.get('version') });
                        if (action === '/export') res.setHeader('Content-Disposition', 'attachment; filename="qivvera-verification-template-' + templateId + '.json"');
                        return json(res, 200, record);
                    }
                    if (req.method === 'POST' && !templateId) {
                        const record = await templates.create(await body(req, 32768), session);
                        return json(res, record.replayed ? 200 : 201, record);
                    }
                    if (req.method === 'POST' && action === '/versions') {
                        const record = await templates.revise(templateId, await body(req, 32768), session);
                        return json(res, record.replayed ? 200 : 201, record);
                    }
                    if (req.method === 'POST' && action === '/archive') return json(res, 200, await templates.archive(templateId, await body(req, 32768), session));
                }
            }
            if (workflow && repository.impact) {
                const impactPath = path.match(/^\/api\/changes\/([a-f0-9-]{36})\/impact(\/export)?$/);
                if (impactPath && req.method === 'GET') {
                    const entries = [...url.searchParams.entries()];
                    if (entries.length !== 1 || entries[0][0] !== 'revision' || !entries[0][1])
                        throw new InputError('IMPACT_QUERY_UNSUPPORTED', 'Select exactly one revision. No other query parameters are supported.', 400);
                    const report = await repository.impact.get(impactPath[1], entries[0][1]);
                    if (impactPath[2]) res.setHeader('Content-Disposition', 'attachment; filename="qivvera-impact-' + impactPath[1] + '.json"');
                    return json(res, 200, report);
                }
            }
            if (workflow && repository.drafting) {
                const drafting = repository.drafting;
                let d = path.match(/^\/api\/changes\/([a-f0-9-]{36})\/drafting$/);
                if (d && req.method === 'GET') {
                    for (const key of url.searchParams.keys()) if (!['revision', 'offset', 'limit'].includes(key)) throw new InputError('DRAFTING_QUERY_UNSUPPORTED', 'Use only revision and pagination parameters.');
                    return json(res, 200, await drafting.getContext(d[1], url.searchParams.get('revision') || undefined, { offset: Number(url.searchParams.get('offset') ?? 0), limit: Number(url.searchParams.get('limit') ?? 20) }));
                }
                d = path.match(/^\/api\/changes\/([a-f0-9-]{36})\/drafting-runs$/);
                if (d && req.method === 'POST') { const run = await drafting.generate(d[1], await body(req, 32768), session); return json(res, run.replayed ? 200 : 201, run); }
                d = path.match(/^\/api\/drafting-runs\/([a-f0-9-]{36})\/suggestions\/([a-f0-9-]{36})\/actions$/);
                if (d && req.method === 'POST') return json(res, 200, await drafting.act(d[1], d[2], await body(req), session));
                d = path.match(/^\/api\/drafting-runs\/([a-f0-9-]{36})(\/export)?$/);
                if (d && req.method === 'GET') {
                    if (url.search) throw new InputError('DRAFTING_QUERY_UNSUPPORTED', 'Drafting records do not accept query parameters.');
                    const run = await drafting.get(d[1]);
                    if (d[2]) res.setHeader('Content-Disposition', 'attachment; filename="qivvera-drafting-'+d[1]+'.json"');
                    return json(res, 200, run);
                }
            }
            if (workflow && assurance) {
                let a = path.match(/^\/api\/changes\/([a-f0-9-]{36})\/assurance-context$/);
                if (req.method === 'GET' && a) return json(res,200,await assurance.getContext(a[1],url.searchParams.get('revision')));
                a = path.match(/^\/api\/changes\/([a-f0-9-]{36})\/assurance-plan$/);
                if (req.method === 'POST' && a) {
                    if (url.search) throw new InputError('ASSURANCE_PLAN_QUERY_UNSUPPORTED', 'Plan approval does not accept query parameters.', 400);
                    const plan = await assurance.approvePlan(a[1], await body(req, 32768), session);
                    return json(res, plan.replayed ? 200 : 201, plan);
                }
                a = path.match(/^\/api\/changes\/([a-f0-9-]{36})\/assessments$/);
                if (req.method === 'POST' && a) return json(res,202,await assurance.requestRun(a[1],await body(req),session));
                if (req.method === 'GET' && a) return json(res,200,await assurance.listRuns(a[1],url.searchParams.get('revision')));
                a = path.match(/^\/api\/assessments\/([a-f0-9-]{36})(\/export|\/cancel)?$/);
                if (a && req.method === 'POST' && a[2] === '/cancel') { fields(await body(req),[]); return json(res,200,await assurance.cancel(a[1],session)); }
                if (a && req.method === 'GET' && a[2] !== '/cancel') {
                    const run = await assurance.getRun(a[1]);
                    if (a[2] === '/export') res.setHeader('Content-Disposition', 'attachment; filename="qivvera-assessment-'+a[1]+'.json"');
                    return json(res,200,run);
                }
                // No worker claim, completion, evidence-upload or arbitrary URL execution endpoint.
            }

            if (workflow && intake) {
                if(req.method==='GET'&&path==='/api/source-repositories')return json(res,200,await intake.listRepositories());
                if(req.method==='POST'&&path==='/api/source-previews')return json(res,201,await intake.preview(await body(req),session));
                if(req.method==='POST'&&path==='/api/source-imports'){const result=await intake.importPreview(await body(req),session);return json(res,result.replayed?200:201,result);}
                const sourcePath=path.match(/^\/api\/changes\/([a-f0-9-]{36})\/source-imports$/);
                if(req.method==='GET'&&sourcePath)return json(res,200,await intake.list(sourcePath[1]));
            }

            if (workflow && resolution) {
                const page = () => ({offset:Number(url.searchParams.get('offset')??0),limit:Number(url.searchParams.get('limit')??50)});
                if (req.method === 'GET' && path === '/api/resolution-assignees') return json(res,200,await resolution.listAssignees());
                if (req.method === 'GET' && path === '/api/resolutions') return json(res,200,await resolution.list(page()));
                let m=path.match(/^\/api\/changes\/([a-f0-9-]{36})\/resolutions$/);
                if(m&&req.method==='GET')return json(res,200,await resolution.list({changeId:m[1],...page()}));
                m=path.match(/^\/api\/assessments\/([a-f0-9-]{36})\/resolutions$/);
                if(m&&req.method==='POST'){const created=await resolution.create(m[1],await body(req),session);return json(res,created.replayed?200:201,created);}
                m=path.match(/^\/api\/resolutions\/([a-f0-9-]{36})(\/actions|\/export)?$/);
                if(m&&m[2]==='/actions'&&req.method==='POST')return json(res,200,await resolution.act(m[1],await body(req),session));
                if(m&&req.method==='GET'&&m[2]!=='/actions'){
                    if(m[2]==='/export'){res.setHeader('Content-Disposition','attachment; filename="qivvera-resolution-'+m[1]+'.json"');return json(res,200,await resolution.export(m[1]));}
                    return json(res,200,await resolution.get(m[1]));
                }
                // There is deliberately no resolve-by-status, waive, evidence-delete or verdict-edit route.
            }

            if (req.method === 'GET' && path === '/api/workspace')
                return json(res, 200, { applications: await repository.listApplications(), changes: await Promise.all((await repository.listChanges()).map(decorate)), activity: await repository.listActivity(), capabilities: { registry: true, authorityDecisions: workflow, changeRevisions: workflow, verifierExecution: !!assurance?.enabled, evidenceCollection: !!assurance?.enabled, assuranceDisposition: !!assurance?.enabled, assessmentQueue: !!assurance, resolutionWorkflow: !!resolution, githubIntake: !!intake, obligationDrafting: !!repository.drafting, revisionImpact: !!repository.impact, verificationTemplates: !!assurance?.templates }, storage: repository.driver ?? 'local-review', release: PRODUCT_VERSION, revision: releaseRevision, reviewMode: repository.reviewMode ?? 'not-available' });
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
                return json(res, 200, await decorate(c));
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
