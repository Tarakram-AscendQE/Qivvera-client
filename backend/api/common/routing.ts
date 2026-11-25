import { Router, type Request, type Response } from 'express';
import type { z } from 'zod';
import { readJsonBody, DEFAULT_BODY_LIMIT } from './body.js';
import { sendReply, type Reply } from './respond.js';
import type { Services, Session } from './services.js';

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** Everything an endpoint function receives. */
export interface EndpointContext<Params, Query, S extends Session | null> {
  readonly services: Services;
  /** Path parameters, already checked by the endpoint's `params` schema. */
  readonly params: Params;
  /** Query values, already read and checked by the endpoint's `query` function. */
  readonly query: Query;
  /** The signed-in session (null only for endpoints that run before sign-in is required). */
  readonly session: S;
  /** The request reference, also sent as X-Request-ID. */
  readonly requestId: string;
  /** The raw request, for the few endpoints that need a header or the client address. */
  readonly req: Request;
  /** Reads the JSON request body (16 KB unless `maxBytes` says otherwise). */
  readBody(maxBytes?: number): Promise<unknown>;
}

/**
 * One endpoint: optional checks for path parameters and query string, and the function that handles it.
 * Each endpoint lives in its own file under backend/api/endpoints/ and is listed in backend/api/routes.ts.
 */
export interface Endpoint<Params = Record<string, never>, Query = undefined, S extends Session | null = Session> {
  /** Zod schema for path parameters. If they do not match, the path is not this endpoint (404 NOT_FOUND). */
  readonly params?: z.ZodType<Params>;
  // Method syntax (not arrow properties) lets one route list hold endpoints of different types.
  /** Reads and checks the query string; throws InputError for an unsupported query. */
  query?(search: URLSearchParams, url: URL): Query;
  handle(context: EndpointContext<Params, Query, S>): Promise<Reply>;
}

/** Use this to declare an endpoint; it only fixes the types. */
export function defineEndpoint<Params = Record<string, never>, Query = undefined, S extends Session | null = Session>(
  endpoint: Endpoint<Params, Query, S>
): Endpoint<Params, Query, S> {
  return endpoint;
}

type AnyEndpoint = Endpoint<unknown, unknown, Session | null>;

/**
 * A query-string rule for a whole path, checked for every method before the endpoint is chosen
 * (verification-template paths reject unsupported queries even for a method they do not serve).
 */
export interface QueryCheck {
  /** Path parameters that must match for the rule to apply (as for an endpoint). */
  readonly params?: z.ZodType<unknown>;
  check(search: URLSearchParams, method: string): void;
}

interface RouteBase {
  /** Express path, for example '/api/changes/:changeId/obligations'. Strict and case-sensitive. */
  readonly path: string;
  /** Only registered when this returns true, for example when an optional feature is configured. */
  readonly enabled?: (services: Services) => boolean;
}
export type Route = (RouteBase & { readonly method: Method; readonly endpoint: AnyEndpoint }) | (RouteBase & { readonly method: 'ANY'; readonly check: QueryCheck });

export const get = (path: string, endpoint: AnyEndpoint): Route => ({ method: 'GET', path, endpoint });
export const post = (path: string, endpoint: AnyEndpoint): Route => ({ method: 'POST', path, endpoint });
export const patch = (path: string, endpoint: AnyEndpoint): Route => ({ method: 'PATCH', path, endpoint });
export const del = (path: string, endpoint: AnyEndpoint): Route => ({ method: 'DELETE', path, endpoint });
/** Applies a query rule to every request on these paths, whatever the method. */
export const checkQuery = (paths: readonly string[], check: QueryCheck): Route[] => paths.map(path => ({ method: 'ANY', path, check }));

/** Marks a group of routes as available only when a feature is configured. */
export function onlyWhen(enabled: (services: Services) => boolean, routes: readonly Route[]): Route[] {
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
export function routerFor(routes: readonly Route[], services: Services): Router {
  const router = Router({ strict: true, caseSensitive: true });
  const byPath = new Map<string, Route[]>();
  for (const route of routes) {
    if (route.enabled && !route.enabled(services)) continue;
    byPath.set(route.path, [...(byPath.get(route.path) ?? []), route]);
  }
  for (const [path, pathRoutes] of byPath) {
    router.all(path, async (req: Request, res: Response, next) => {
      if (req.path.includes('%')) return next();
      const url: URL = res.locals.url;
      for (const rule of pathRoutes) {
        if (rule.method === 'ANY' && (!rule.check.params || rule.check.params.safeParse({ ...req.params }).success)) rule.check.check(url.searchParams, req.method);
      }
      const route = pathRoutes.find(candidate => candidate.method === req.method);
      if (!route || route.method === 'ANY') return next();
      const { endpoint } = route;
      let params: unknown = {};
      if (endpoint.params) {
        const checked = endpoint.params.safeParse({ ...req.params });
        if (!checked.success) return next();
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
