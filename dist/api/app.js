import express, {} from 'express';
import { handleErrors, notFound } from './common/errors.js';
import { serveAssets } from './common/assets.js';
import { routerFor } from './common/routing.js';
import { requireCsrf, requireSameOrigin, securityHeaders } from './common/security.js';
import { requireSession } from './common/session.js';
import { publicRoutes, sessionRoutes, signInRoutes, webhookRoutes, workspaceRoutes } from './routes.js';
/**
 * The Express application. Every request passes these steps in order; the first that answers wins.
 *
 *   1. security headers, request reference, URL normalised
 *   2. public routes (/healthz, /readyz)        — no sign-in
 *   3. GitHub webhook (POST /api/github/webhook)  — no sign-in or origin; HMAC signature only
 *   3b. web root files (index.html, app.js, ...) — no sign-in
 *   4. writes must come from the workspace origin            → 403 ORIGIN_REJECTED
 *   5. sign-in route (POST /api/session)
 *   6. sign-in required                                       → 401 AUTH_REQUIRED
 *   7. session routes (GET /api/session, GET /api/support-info)
 *   8. writes must carry the CSRF token                       → 403 CSRF_REJECTED
 *   9. workspace routes (everything else in routes.ts)
 *  10. not found                                              → 404 NOT_FOUND
 *  11. errors: InputError → its status and message; anything else → 500 INTERNAL_ERROR
 */
export function createExpressApp(services) {
    const app = express();
    // Same responses as before: no X-Powered-By or ETag headers; '/a/' is not '/a' and '/A' is not '/a'.
    // Settings: https://expressjs.com/en/5x/api/application#application-settings
    app.disable('x-powered-by');
    app.set('etag', false);
    app.set('case sensitive routing', true);
    app.set('strict routing', true);
    app.use(securityHeaders(services.secureCookies));
    app.use(routerFor(publicRoutes, services));
    app.use(routerFor(webhookRoutes, services));
    app.use(serveAssets(services.assets));
    app.use(requireSameOrigin(services.publicOrigin));
    app.use(routerFor(signInRoutes, services));
    app.use(requireSession(services.auth));
    app.use(routerFor(sessionRoutes, services));
    app.use(requireCsrf(services.auth));
    app.use(routerFor(workspaceRoutes, services));
    app.use(notFound);
    app.use(handleErrors);
    return app;
}
