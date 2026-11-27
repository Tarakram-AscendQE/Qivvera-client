import { Router } from 'express';
import { readJsonBody, DEFAULT_BODY_LIMIT } from './body.js';
import { sendReply } from './respond.js';
/** Use this to declare an endpoint; it only fixes the types. */
export function defineEndpoint(endpoint) {
    return endpoint;
}
export const get = (path, endpoint) => ({ method: 'GET', path, endpoint });
export const post = (path, endpoint) => ({ method: 'POST', path, endpoint });
export const patch = (path, endpoint) => ({ method: 'PATCH', path, endpoint });
export const del = (path, endpoint) => ({ method: 'DELETE', path, endpoint });
/** Applies a query rule to every request on these paths, whatever the method. */
export const checkQuery = (paths, check) => paths.map(path => ({ method: 'ANY', path, check }));
/** Marks a group of routes as available only when a feature is configured. */
export function onlyWhen(enabled, routes) {
    return routes.map(route => ({ ...route, enabled }));
}
/**
 * Builds an Express router for a list of routes, in list order.
 *
 * Each path is registered with `router.all()` and the method is checked here, so a GET route does not
 * also answer HEAD and no automatic OPTIONS reply is sent: like before, any other method falls through
 * to the next step (normally 404 NOT_FOUND). A path containing a percent-escape never names a record,
 * so it also falls through instead of being decoded into a valid-looking id.
 */
export function routerFor(routes, services) {
    const router = Router({ strict: true, caseSensitive: true });
    const byPath = new Map();
    for (const route of routes) {
        if (route.enabled && !route.enabled(services))
            continue;
        byPath.set(route.path, [...(byPath.get(route.path) ?? []), route]);
    }
    for (const [path, pathRoutes] of byPath) {
        router.all(path, async (req, res, next) => {
            if (req.path.includes('%'))
                return next();
            const url = res.locals.url;
            for (const rule of pathRoutes) {
                if (rule.method === 'ANY' && (!rule.check.params || rule.check.params.safeParse({ ...req.params }).success))
                    rule.check.check(url.searchParams, req.method);
            }
            const route = pathRoutes.find(candidate => candidate.method === req.method);
            if (!route || route.method === 'ANY')
                return next();
            const { endpoint } = route;
            let params = {};
            if (endpoint.params) {
                const checked = endpoint.params.safeParse({ ...req.params });
                if (!checked.success)
                    return next();
                params = checked.data;
            }
            const query = endpoint.query ? endpoint.query(url.searchParams, url) : undefined;
            sendReply(res, await endpoint.handle({
                services, params, query, req,
                session: res.locals.session ?? null,
                requestId: res.locals.requestId,
                readBody: (maxBytes = DEFAULT_BODY_LIMIT) => readJsonBody(req, maxBytes)
            }));
        });
    }
    return router;
}
