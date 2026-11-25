/**
 * EVERY endpoint of the Qivvera API, in one place.
 *
 * Routes are grouped by the step of the request pipeline they run in (see app.ts). Within a group they
 * are matched in the order listed. Each endpoint function lives in its own file under ./endpoints/.
 * To add an endpoint: create the file, then add one line here.
 *
 * Endpoints in an `onlyWhen(...)` group exist only when that feature is configured, so inside them the
 * feature's repository is always present (hence `services.assurance!`).
 */
import { get, post, patch, del, checkQuery, onlyWhen, type Route } from './common/routing.js';
import { draftSuggestionAction } from './endpoints/drafting/draft-suggestion-action.js';
import { draftingContext } from './endpoints/drafting/drafting-context.js';
import { exportDraftingRun } from './endpoints/drafting/export-drafting-run.js';
import { generateDrafts } from './endpoints/drafting/generate-drafts.js';
import { getDraftingRun } from './endpoints/drafting/get-drafting-run.js';
import { exportImpact } from './endpoints/impact/export-impact.js';
import { getImpact } from './endpoints/impact/get-impact.js';
import { importSource } from './endpoints/intake/import-source.js';
import { listChangeSources } from './endpoints/intake/list-change-sources.js';
import { listSourceRepositories } from './endpoints/intake/list-source-repositories.js';
import { previewSource } from './endpoints/intake/preview-source.js';
import { cancelAssessment } from './endpoints/assurance/cancel-assessment.js';
import { exportAssessment } from './endpoints/assurance/export-assessment.js';
import { getAssessment } from './endpoints/assurance/get-assessment.js';
import { listAssessments } from './endpoints/assurance/list-assessments.js';
import { approvePlan } from './endpoints/assurance/approve-plan.js';
import { assuranceContext } from './endpoints/assurance/assurance-context.js';
import { requestAssessment } from './endpoints/assurance/request-assessment.js';
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
import { createResolution } from './endpoints/resolutions/create-resolution.js';
import { exportResolution } from './endpoints/resolutions/export-resolution.js';
import { getResolution } from './endpoints/resolutions/get-resolution.js';
import { listAssignees } from './endpoints/resolutions/list-assignees.js';
import { listChangeResolutions } from './endpoints/resolutions/list-change-resolutions.js';
import { listResolutions } from './endpoints/resolutions/list-resolutions.js';
import { resolutionAction } from './endpoints/resolutions/resolution-action.js';
import { currentSession } from './endpoints/session/current-session.js';
import { signIn } from './endpoints/session/sign-in.js';
import { signOut } from './endpoints/session/sign-out.js';
import { supportInfo } from './endpoints/support/support-info.js';
import { archiveTemplate } from './endpoints/templates/archive-template.js';
import { createTemplate } from './endpoints/templates/create-template.js';
import { exportTemplate } from './endpoints/templates/export-template.js';
import { getTemplate } from './endpoints/templates/get-template.js';
import { listTemplates } from './endpoints/templates/list-templates.js';
import { reviseTemplate } from './endpoints/templates/revise-template.js';
import { templateListQueryCheck, templateQueryCheck } from './endpoints/templates/template-query.js';
import { health } from './endpoints/system/health.js';
import { exportWorkspace } from './endpoints/workspace/export-workspace.js';
import { getWorkspace } from './endpoints/workspace/get-workspace.js';
import { getPrAssurance } from './endpoints/pr-assurance/get-scenario.js';
import { importPull } from './endpoints/pr-assurance/import-pull.js';
import { startRun } from './endpoints/pr-assurance/start-run.js';
import { getRun } from './endpoints/pr-assurance/get-run.js';
import { syncRun } from './endpoints/pr-assurance/sync-run.js';
import { listRuns } from './endpoints/pr-assurance/list-runs.js';

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
  post('/api/changes/:changeId/revisions', createRevision),

  // Assurance: verification plans and assessment runs (only when assurance is configured).
  // There is no worker claim, completion, evidence-upload or arbitrary URL endpoint.
  ...onlyWhen(({ assurance }) => !!assurance, [
    get('/api/changes/:changeId/assurance-context', assuranceContext),
    post('/api/changes/:changeId/assurance-plan', approvePlan),
    post('/api/changes/:changeId/assessments', requestAssessment),
    get('/api/changes/:changeId/assessments', listAssessments),
    post('/api/assessments/:runId/cancel', cancelAssessment),
    get('/api/assessments/:runId', getAssessment),
    get('/api/assessments/:runId/export', exportAssessment)
  ]),

  // Resolution of findings (only when the resolution workflow is configured).
  // There is deliberately no resolve-by-status, waive, evidence-delete or verdict-edit endpoint.
  ...onlyWhen(({ resolution }) => !!resolution, [
    get('/api/resolution-assignees', listAssignees),
    get('/api/resolutions', listResolutions),
    get('/api/changes/:changeId/resolutions', listChangeResolutions),
    post('/api/assessments/:runId/resolutions', createResolution),
    post('/api/resolutions/:resolutionId/actions', resolutionAction),
    get('/api/resolutions/:resolutionId', getResolution),
    get('/api/resolutions/:resolutionId/export', exportResolution)
  ]),

  // Verification templates (only when templates are configured). Their query rules apply to every
  // method on these paths, before the endpoint is chosen.
  ...onlyWhen(({ assurance }) => !!assurance?.templates, [
    ...checkQuery(['/api/verification-templates'], templateListQueryCheck),
    ...checkQuery(['/api/verification-templates/:templateId', '/api/verification-templates/:templateId/versions', '/api/verification-templates/:templateId/archive', '/api/verification-templates/:templateId/export'], templateQueryCheck),
    get('/api/verification-templates', listTemplates),
    get('/api/verification-templates/:templateId', getTemplate),
    get('/api/verification-templates/:templateId/export', exportTemplate),
    post('/api/verification-templates', createTemplate),
    post('/api/verification-templates/:templateId/versions', reviseTemplate),
    post('/api/verification-templates/:templateId/archive', archiveTemplate)
  ]),

  // Revision impact: read-only comparison with the parent revision (only when configured).
  ...onlyWhen(({ repository }) => !!repository.impact, [
    get('/api/changes/:changeId/impact', getImpact),
    get('/api/changes/:changeId/impact/export', exportImpact)
  ]),

  // Source drafting: drafted candidates and human decisions (only when configured).
  ...onlyWhen(({ repository }) => !!repository.drafting, [
    get('/api/changes/:changeId/drafting', draftingContext),
    post('/api/changes/:changeId/drafting-runs', generateDrafts),
    post('/api/drafting-runs/:runId/suggestions/:suggestionId/actions', draftSuggestionAction),
    get('/api/drafting-runs/:runId', getDraftingRun),
    get('/api/drafting-runs/:runId/export', exportDraftingRun)
  ]),

  // GitHub intake: pull-request source context (only when configured). No GitHub writes.
  ...onlyWhen(({ intake }) => !!intake, [
    get('/api/source-repositories', listSourceRepositories),
    post('/api/source-previews', previewSource),
    post('/api/source-imports', importSource),
    get('/api/changes/:changeId/source-imports', listChangeSources)
  ]),

  // PR assurance demo add-on (only when switched on). The browser sends only a PR number: the
  // repositories, the workflow and every commit are pinned or read from GitHub by the server.
  ...onlyWhen(({ prAssurance }) => !!prAssurance, [
    get('/api/pr-assurance', getPrAssurance),
    post('/api/pr-assurance/pulls/:pullNumber/import', importPull),
    post('/api/pr-assurance/pulls/:pullNumber/runs', startRun),
    get('/api/pr-assurance/pulls/:pullNumber/runs', listRuns),
    get('/api/pr-assurance/runs/:runId', getRun),
    post('/api/pr-assurance/runs/:runId/sync', syncRun)
  ])
];
