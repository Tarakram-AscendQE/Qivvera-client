import type { ReactNode } from 'react';
import type { ChangeRecord } from '../change/types';
import { dialogHost } from '../dialogs/dialog-host';
import { createDraftingUI, type DraftingUI } from '../drafting/drafting-module';
import { createGuideUI, type GuideUI } from '../guide/guide-module';
import { createImpactUI, type ImpactUI } from '../impact/impact-module';
import { createIntakeUI, type IntakeUI } from '../intake/intake-module';
import type { SessionInfo, ShellState, WorkspaceInfo } from '../shell-contract';
import { createResolutionUI, type ResolutionUI } from '../resolution/resolution-module';
import type { ResolutionPage } from '../resolution/parts';
import { createTemplatesUI, type TemplatesUI } from '../templates/templates-module';
import type { ActiveCheck } from '../visits';
import { createWorkspaceUI, type WorkspaceUI } from '../workspace/workspace-module';
import { createApiClient, type ApiError } from './api-client';
import { ErrorPage, StartupErrorPage } from './ErrorPages';
import { Frame } from './Frame';
import { createPageHost } from './page-host';
import { parseRoute, type Route } from './routes';
import { SignInPage } from './SignInPage';

/**
 * Built as /app.js (index.html loads it). The page shell: session start and sign-in, the page frame,
 * hash routing, the shared dialog and toast, and assessment polling. Screens are drawn by the screen
 * modules; buttons that carry data-action or data-resolution are handled here by delegation.
 *
 * Every route start invalidates earlier visits: an answer that arrives after the route, session or
 * dialog changed is ignored, and nothing is retried automatically.
 */

interface Session extends SessionInfo { readonly csrfToken?: unknown }
type Workspace = WorkspaceInfo & { readonly capabilities: Readonly<Record<string, unknown>>; readonly release?: unknown; readonly storage?: unknown };
type Run = { readonly status: string };

/** The shell's state. Screen modules read it; only the shell and the change loaders write it. */
interface AppState extends ShellState {
  session: Session | null;
  workspace: Workspace | null;
  change: ChangeRecord | null;
  tab: string;
  assuranceContext: unknown;
  runs: readonly Run[];
  assuranceError: string | null;
  resolutions?: ResolutionPage | null;
  resolutionError?: string | null;
  sources?: unknown;
  sourceError?: string | null;
}

const root = document.querySelector('#root')!;
const modal = document.querySelector<HTMLDialogElement>('#modal')!;
const toastElement = document.querySelector('#toast')!;
const page = createPageHost(root);
const S: AppState = { session: null, workspace: null, change: null, tab: 'obligations', assuranceContext: null, runs: [], assuranceError: null };
let routeGeneration = 0, renderedGeneration = 0, dialogGeneration = 0;
let pollTimer: ReturnType<typeof setTimeout> | undefined, toastTimer: ReturnType<typeof setTimeout> | undefined;

const can = (role: string): boolean => (S.session?.roles ?? []).includes(role);
const api = createApiClient(S, () => {
  clearSessionView();
  login('Your session ended. Sign in again to continue. Your saved records are retained.');
});

function toast(text: string): void {
  toastElement.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastElement.textContent = ''; }, 5000);
}

/** A check that stays true while the same route, session and route generation are on screen. */
function viewContext(): ActiveCheck {
  const generation = routeGeneration, session = S.session, hash = location.hash;
  return () => !!session && generation === routeGeneration && session === S.session && hash === location.hash;
}

/** Closes the dialog and ends its generation, so a late save cannot act on a newer dialog. */
function closeDialog(): void {
  ++dialogGeneration;
  dialogHost.unmount();
  if (modal.open) modal.close();
  modal.replaceChildren();
}

async function refresh(): Promise<void> {
  const session = S.session, workspace = await api('/api/workspace') as Workspace;
  if (session === S.session) S.workspace = workspace;
}

// Screen modules start on first use in each session and are discarded when the session ends.
let guideUI: GuideUI | null = null, intakeUI: IntakeUI | null = null, draftingUI: DraftingUI | null = null, impactUI: ImpactUI | null = null;
let templatesUI: TemplatesUI | null = null, resolutionUI: ResolutionUI | null = null, workspaceUI: WorkspaceUI | null = null;
const dialogServices = { toast, refresh, route, closeDialog, viewContext, dialogGeneration: () => dialogGeneration };
const guide = () => (guideUI ??= createGuideUI({ S, api, shell }));
const intake = () => (intakeUI ??= createIntakeUI({ S, api, shell, can, ...dialogServices }));
const drafting = () => (draftingUI ??= createDraftingUI({ S, api, shell, can, route, refresh }));
const impact = () => (impactUI ??= createImpactUI({ S, api, shell, route }));
const templates = () => (templatesUI ??= createTemplatesUI({ S, api, shell, can, route, refresh }));
const workspace = () => (workspaceUI ??= createWorkspaceUI({ S, api, shell, can, ...dialogServices, nextDialog: () => ++dialogGeneration, resolutionEnabled: () => !!resolutionUI }));
function resolution(): ResolutionUI {
  if (!resolutionUI) {
    resolutionUI = createResolutionUI({ S, api, can, shell, ...dialogServices });
    resolutionUI.setChangeRenderer(changePage);
  }
  return resolutionUI;
}
function invalidateVisits(): void {
  for (const ui of [draftingUI, impactUI, templatesUI, resolutionUI, intakeUI]) ui?.invalidate();
}

function clearSessionView(): void {
  Object.assign(S, { session: null, workspace: null, change: null, assuranceContext: null, runs: [], resolutions: null, sources: [], assuranceError: null, sourceError: null });
  invalidateVisits();
  guideUI = intakeUI = draftingUI = impactUI = templatesUI = resolutionUI = workspaceUI = null;
  clearTimeout(pollTimer);
  clearTimeout(toastTimer);
  ++routeGeneration;
  dialogHost.unmount();
  if (modal.open) modal.close();
  modal.replaceChildren();
  toastElement.textContent = '';
}

/** Draws a screen in the page frame. A screen that fails to render throws, and the route shows its error page. */
function shell(screen: ReactNode, active = 'overview', label = 'Workspace'): void {
  renderedGeneration = routeGeneration;
  const session = S.session as Session;
  const email = session.email;
  page.showScreen(screen, content => <Frame active={active} label={label} email={email} roles={session.roles} workspace={S.workspace}>{content}</Frame>);
}

function errorPage(message: string): void {
  shell(<ErrorPage message={message} />);
}

function login(error = ''): void {
  page.render(<SignInPage error={error} signIn={async fields => {
    S.session = await api('/api/session', { method: 'POST', data: fields }) as Session;
    await refresh();
    await route();
  }} />);
}

function pollAssessment(): void {
  pollTimer = setTimeout(() => {
    if (modal.open || document.hidden) pollAssessment();
    else void route();
  }, 2500);
}

function changePage(): void {
  workspace().showChange(!!resolutionUI);
}

/** Reads the change, its assurance context, resolution items and sources, then draws the change page. */
async function showChange(target: Extract<Route, { kind: 'change' }>, current: () => boolean): Promise<void> {
  const change = await api(`/api/changes/${encodeURIComponent(target.id)}${target.revisionId ? '?revision=' + encodeURIComponent(target.revisionId) : ''}`) as ChangeRecord & { assuranceError?: { message?: string } };
  if (!current()) return;
  Object.assign(S, { change, runs: [], assuranceContext: null, assuranceError: change.assuranceError?.message ?? null, resolutions: null, resolutionError: null });
  // Capabilities are read after each answer: a workspace refresh may have replaced them meanwhile.
  if (S.workspace!.capabilities?.['assessmentQueue']) {
    try {
      const [context, runs] = await Promise.all([api(`/api/changes/${change.id}/assurance-context?revision=${change.revision.id}`), api(`/api/changes/${change.id}/assessments?revision=${change.revision.id}`)]);
      if (!current()) return;
      Object.assign(S, { assuranceContext: context, runs, assuranceError: null });
    } catch (failure) {
      const error = failure as ApiError;
      if (error.status === 401 || error.staleSession) throw error;
      if (!current()) return;
      S.assuranceError = error.message;
    }
  }
  if (S.workspace!.capabilities['resolutionWorkflow']) {
    await resolution().loadChange();
    if (!current()) return;
  }
  S.sources = [];
  S.sourceError = null;
  if (S.workspace!.capabilities['githubIntake']) {
    try {
      const sources = await api(`/api/changes/${change.id}/source-imports`);
      if (!current()) return;
      S.sources = sources;
    } catch (failure) {
      const error = failure as ApiError;
      if (error.status === 401 || error.staleSession) throw error;
      if (!current()) return;
      S.sourceError = error.message;
    }
  }
  changePage();
  if (S.runs.some(run => ['QUEUED', 'RUNNING'].includes(run.status))) pollAssessment();
}

async function show(target: Route, current: () => boolean): Promise<void> {
  switch (target.kind) {
    case 'guide': return guide().showGuide();
    case 'support': return guide().showSupport();
    case 'templates': {
      const ui = templates(), view = target.view;
      if (view.kind === 'list') return ui.showList(view.options);
      if (view.kind === 'detail') return ui.showDetail(view.templateId, view.versionId);
      if (view.kind === 'save') return ui.showSave(view.changeId, view.revisionId, view.templateId);
      if (view.kind === 'plan') return ui.showPlan(view.changeId, view.revisionId, view.templateId, view.versionId);
      return errorPage('This verification-template link is incomplete. Open a template from the saved list or a current verification plan.');
    }
    case 'impact': return impact().show(target.changeId, target.revisionId);
    case 'drafting': return drafting().show(target.changeId, target.revisionId, { runId: target.runId, offset: target.offset });
    case 'resolution-inbox': return resolution().showInbox();
    case 'resolution': return resolution().showItem(target.id);
    case 'intake': return intake().show();
    case 'applications': return workspace().showApplications();
    case 'application':
      if (!S.workspace!.applications.some(application => application.id === target.id)) return errorPage('Application not found.');
      return workspace().showApplication(target.id);
    case 'changes': return workspace().showChanges();
    case 'change': return showChange(target, current);
    case 'activity': return workspace().showActivity();
    case 'overview': return workspace().showOverview();
    case 'error': return errorPage(target.message);
  }
}

/** Reads and draws the view for the current hash. A newer route, or a session change, makes this one obsolete. */
async function route(): Promise<void> {
  const generation = ++routeGeneration;
  invalidateVisits();
  closeDialog();
  clearTimeout(pollTimer);
  if (!S.session) return login();
  try {
    await show(parseRoute(location.hash, S.workspace!), () => generation === routeGeneration);
  } catch (failure) {
    const error = failure as ApiError;
    if (error.staleSession || generation !== routeGeneration) return;
    if (error.status === 401) {
      clearSessionView();
      return login('Your session ended. Please sign in again.');
    }
    errorPage(error.message);
  }
}

async function handleAction(button: HTMLElement, active: ActiveCheck): Promise<void> {
  const data = button.dataset, ui = workspace;
  switch (data['action']) {
    case 'configure-plan': ui().openPlan(); break;
    case 'run-assurance': ui().openRequestAssessment(); break;
    case 'refresh-assurance': await route(); break;
    case 'open-assessment': await ui().showAssessment(data['id']!); break;
    case 'cancel-assessment':
      await api(`/api/assessments/${data['id']}/cancel`, { method: 'POST', data: {} });
      if (active()) await route();
      break;
    case 'logout':
      clearTimeout(pollTimer);
      await api('/api/session', { method: 'DELETE' });
      clearSessionView();
      login();
      break;
    case 'new-application': ui().openNewApplication(); break;
    case 'new-change': ui().openNewChange(data['app']); break;
    case 'new-revision': ui().openNewRevision(); break;
    case 'review-submit': ui().openReview(data['id']!, 'SUBMIT'); break;
    case 'review-withdraw': ui().openReview(data['id']!, 'WITHDRAW'); break;
    case 'review-decision': ui().openReview(data['id']!, 'DECISION'); break;
    case 'obligation-history': await ui().showObligationHistory(data['id']!); break;
    case 'new-obligation': ui().openObligation(); break;
    case 'edit-obligation': ui().openObligation(data['id']); break;
    case 'tab': S.tab = data['tab']!; changePage(); break;
    case 'retry':
      if (S.session) {
        await refresh();
        if (active()) await route();
      } else await start();
      break;
  }
}

// Buttons on the page act through data-action / data-resolution. A click on a page drawn for an
// earlier route is ignored (except sign-out); an error is shown only while its view is current.
root.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLElement>('[data-action],[data-resolution]');
  if (!button || (renderedGeneration !== routeGeneration && button.dataset['action'] !== 'logout')) return;
  const active = viewContext();
  void (async () => {
    try {
      if (button.dataset['resolution']) await resolutionUI?.handle(button);
      else await handleAction(button, active);
    } catch (failure) {
      const error = failure as ApiError;
      if ((active() || button.dataset['action'] === 'logout') && !error.sessionExpired && !error.staleSession) toast(error.message);
    }
  })();
});
modal.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLElement>('[data-resolution]');
  if (!button) return;
  void (async () => {
    try {
      await resolutionUI?.handle(button);
    } catch (failure) {
      const error = failure as ApiError;
      if (!error.sessionExpired && !error.staleSession) toast(error.message);
    }
  })();
});
modal.addEventListener('cancel', () => { ++dialogGeneration; });
window.addEventListener('hashchange', () => void route());

/** Opens the existing session, or shows sign-in. Nothing is submitted on the person's behalf. */
async function start(): Promise<void> {
  try {
    S.session = await api('/api/session') as Session;
    await refresh();
    await route();
  } catch (failure) {
    const error = failure as ApiError;
    if (error.sessionExpired || error.staleSession) return;
    if (error.status === 401) {
      clearSessionView();
      login();
      return;
    }
    if (S.session) {
      errorPage(error.message);
      return;
    }
    page.render(<StartupErrorPage message={error.message} />);
  }
}

void start();
