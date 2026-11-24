/**
 * EVERY endpoint of the Qivvera API, in one place.
 *
 * Routes are grouped by the step of the request pipeline they run in (see app.ts). Within a group they
 * are matched in the order listed. Each endpoint function lives in its own file under ./endpoints/.
 * To add an endpoint: create the file, then add one line here.
 */
import { get, post, patch, del, type Route } from './common/routing.js';
import { createApplication } from './endpoints/applications/create-application.js';
import { getApplication } from './endpoints/applications/get-application.js';
import { listApplications } from './endpoints/applications/list-applications.js';
import { createChange } from './endpoints/changes/create-change.js';
import { createRevision } from './endpoints/changes/create-revision.js';
import { getChange } from './endpoints/changes/get-change.js';
import { addObligation } from './endpoints/obligations/add-obligation.js';
import { editObligation } from './endpoints/obligations/edit-obligation.js';
import { obligationHistory } from './endpoints/obligations/obligation-history.js';
import { reviewObligation } from './endpoints/obligations/review-obligation.js';
import { currentSession } from './endpoints/session/current-session.js';
import { signIn } from './endpoints/session/sign-in.js';
import { signOut } from './endpoints/session/sign-out.js';
import { supportInfo } from './endpoints/support/support-info.js';
import { health } from './endpoints/system/health.js';
import { exportWorkspace } from './endpoints/workspace/export-workspace.js';
import { getWorkspace } from './endpoints/workspace/get-workspace.js';

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
  del('/api/session', signOut),

  // Workspace, applications, changes, requirements (obligations) and revisions
  get('/api/workspace', getWorkspace),
  get('/api/export', exportWorkspace),
  get('/api/applications', listApplications),
  post('/api/applications', createApplication),
  post('/api/changes', createChange),
  get('/api/applications/:applicationId', getApplication),
  get('/api/changes/:changeId', getChange),
  post('/api/changes/:changeId/obligations', addObligation),
  patch('/api/obligations/:obligationId', editObligation),
  post('/api/obligations/:obligationId/review', reviewObligation),
  get('/api/obligations/:obligationId/history', obligationHistory),
  post('/api/changes/:changeId/revisions', createRevision)
];
