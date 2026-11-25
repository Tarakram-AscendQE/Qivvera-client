import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { WorkspaceAuth } from '../../../backend/server/workspace-auth.mjs';
import { refuse } from './errors.js';

const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

/**
 * First in the chain. Gives the request its reference (X-Request-ID, also used in error bodies), sets
 * the security headers every response carries, and normalises the URL once.
 *
 * The URL is resolved against a fixed internal base, as it always was: client-controlled Host and
 * forwarded headers are never used for routing or origin trust, and `..` segments are resolved before
 * routes are matched.
 */
export function securityHeaders(secureCookies: boolean): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const url = new URL(req.url, 'http://internal');
    res.locals.url = url;
    req.url = url.pathname + url.search;
    next();
  };
}

/** Every request other than GET must come from the configured workspace origin (403 ORIGIN_REJECTED). */
export function requireSameOrigin(publicOrigin: string): RequestHandler {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.headers.origin !== publicOrigin) {
      return refuse(res, 403, 'ORIGIN_REJECTED', 'This request did not originate from the configured workspace.');
    }
    next();
  };
}

/** Every request other than GET must carry the session's CSRF token (403 CSRF_REJECTED). Runs after requireSession. */
export function requireCsrf(auth: WorkspaceAuth): RequestHandler {
  return (req, res, next) => {
    if (req.method !== 'GET' && !auth.validCsrf(req, res.locals.session)) {
      return refuse(res, 403, 'CSRF_REJECTED', 'Reload the page before submitting this request.');
    }
    next();
  };
}
