/**
 * EVERY endpoint of the Qivvera API, in one place.
 *
 * Routes are grouped by the step of the request pipeline they run in (see app.ts). Within a group they
 * are matched in the order listed. Each endpoint function lives in its own file under ./endpoints/.
 * To add an endpoint: create the file, then add one line here.
 */
import { get, post, del, type Route } from './common/routing.js';
import { currentSession } from './endpoints/session/current-session.js';
import { signIn } from './endpoints/session/sign-in.js';
import { signOut } from './endpoints/session/sign-out.js';
import { supportInfo } from './endpoints/support/support-info.js';
import { health } from './endpoints/system/health.js';

/** No sign-in, any origin (GET only). */
export const publicRoutes: readonly Route[] = [
  get('/healthz', health),
  get('/readyz', health)
];

/** No sign-in yet; writes must come from the workspace origin. */
export const signInRoutes: readonly Route[] = [
  post('/api/session', signIn)
];

/** Signed in; reads only, so no CSRF token is needed. */
export const sessionRoutes: readonly Route[] = [
  get('/api/session', currentSession),
  get('/api/support-info', supportInfo)
];

/** Signed in; every write carries the CSRF token. */
export const workspaceRoutes: readonly Route[] = [
  del('/api/session', signOut)
];
