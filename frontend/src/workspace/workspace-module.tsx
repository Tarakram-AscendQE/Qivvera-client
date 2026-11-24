import { ChangePage } from '../change/ChangePage';
import type { ChangeView } from '../change/types';
import type { ReactNode } from 'react';
import { dialogHost } from '../dialogs/dialog-host';
import type { DialogEnvironment } from '../dialogs/FormDialog';
import { HistoryDialog, NewApplicationDialog, NewChangeDialog, NewRevisionDialog, ObligationDialog, ReviewDialog, type HistoryEvent, type ReviewAction } from '../dialogs/RecordDialogs';
import type { LegacyApi, LegacyCan, LegacyRefresh, LegacyRoute, LegacyShell, LegacyState, LegacyToast } from '../legacy-bridge';
import type { ActiveCheck } from '../visits';
import { createScreenHost } from '../screen-host';
import { OverviewPage, type Roles } from './OverviewPage';
import { ActivityPage, ApplicationPage, ApplicationsPage, ChangesPage } from './RegistryPages';
import type { WorkspaceSummary } from './rows';

export interface WorkspaceBridge {
  readonly S: LegacyState;
  readonly shell: LegacyShell;
  readonly can: LegacyCan;
  readonly api: LegacyApi;
  readonly refresh: LegacyRefresh;
  readonly toast: LegacyToast;
  readonly route: LegacyRoute;
  /** The legacy closeDialog(): ends the current dialog generation and empties the dialog. */
  readonly closeDialog: () => void;
  /** The legacy viewContext(): true while the visible view is the one that asked. */
  readonly viewContext: () => ActiveCheck;
  /** Starts a new dialog generation (a dialog that loads first claims its place before reading). */
  readonly nextDialog: () => number;
  readonly dialogGeneration: () => number;
}

export interface WorkspaceUI {
  showOverview(): void;
  showApplications(): void;
  /** The shell shows its own error page when the application does not exist. */
  showApplication(id: string): void;
  showChanges(): void;
  showActivity(): void;
  /** Draws S.change on the selected tab. Until resolution moves, the shell passes that tab's HTML from resolution.js. */
  showChange(resolutionHtml: string): void;
  openNewApplication(): void;
  openNewChange(applicationId?: string): void;
  openNewRevision(): void;
  /** Proposes a new obligation, or revises the one with this id. */
  openObligation(id?: string): void;
  openReview(id: string, action: ReviewAction): void;
  showObligationHistory(id: string): Promise<void>;
  /** Removes a React dialog; the legacy closeDialog() calls it before it empties the dialog element. */
  unmountDialog(): void;
  /** Removes the screen; the legacy shell calls it before it replaces the page or ends a session. */
  unmount(): void;
}

/**
 * Built as /workspace.js: the workspace screens the legacy shell draws from its saved workspace summary.
 * Rendering is synchronous, as before. Buttons keep their data-action attributes, so the legacy click
 * handler still opens the same dialogs until the shell itself moves to React.
 */
export function createWorkspaceUI(bridge: WorkspaceBridge): WorkspaceUI {
  const { S, shell, can, api } = bridge;
  const host = createScreenHost(shell);
  const workspace = () => S.workspace as unknown as WorkspaceSummary;
  const roles = (): Roles => ({ author: can('AUTHOR'), authority: can('POLICY_AUTHORITY') });
  const state = S as LegacyState & { change: ChangeView['change']; session: { email: unknown }; tab?: string };

  /** The legacy openForm() sequence: bind to the visible view, close any open dialog, then open this one. */
  function openForm(render: (env: DialogEnvironment) => ReactNode, active: ActiveCheck = bridge.viewContext()): void {
    bridge.closeDialog();
    const generation = bridge.dialogGeneration();
    const modal = document.querySelector<HTMLDialogElement>('#modal');
    dialogHost.show(render({
      active, present: () => active() && !!modal?.open && bridge.dialogGeneration() === generation,
      close: bridge.closeDialog, refresh: bridge.refresh, toast: bridge.toast, route: bridge.route
    }));
  }
  const obligation = (id: string) => state.change.obligations.find(candidate => candidate.id === id);

  return {
    showOverview() {
      host.show(<OverviewPage workspace={workspace()} roles={roles()} />, 'overview', 'Workspace');
    },
    showApplications() {
      host.show(<ApplicationsPage workspace={workspace()} roles={roles()} />, 'applications', 'Applications');
    },
    showApplication(id) {
      const app = workspace().applications.find(candidate => candidate.id === id);
      if (!app) throw new Error('Application not found.');
      host.show(<ApplicationPage app={app} workspace={workspace()} roles={roles()} />, 'applications', String(app.name));
    },
    showChanges() {
      host.show(<ChangesPage workspace={workspace()} roles={roles()} />, 'changes', 'Changes');
    },
    showActivity() {
      host.show(<ActivityPage workspace={workspace()} />, 'activity', 'Activity');
    },
    showChange(resolutionHtml) {
      const shellState = S as unknown as { change: ChangeView['change']; session: ChangeView['session']; tab: string; runs: ChangeView['runs']; assuranceContext: ChangeView['context']; assuranceError: string | null; sources?: ChangeView['sources'] | null; sourceError?: string | null };
      const view: ChangeView = {
        change: state.change, workspace: workspace() as ChangeView['workspace'], session: shellState.session, roles: roles(), tab: shellState.tab,
        runs: shellState.runs, context: shellState.assuranceContext, assuranceError: shellState.assuranceError,
        sources: shellState.sources ?? [], sourceError: shellState.sourceError ?? null, resolutionHtml
      };
      host.show(<ChangePage view={view} />, 'changes', String(shellState.change.title));
    },
    openNewApplication() {
      openForm(env => <NewApplicationDialog env={env} api={api} />);
    },
    openNewChange(applicationId = '') {
      const active = bridge.viewContext();
      openForm(env => <NewChangeDialog env={env} api={api} applications={workspace().applications} selected={applicationId} openObligations={() => { if (active()) state.tab = 'obligations'; }} />, active);
    },
    openNewRevision() {
      const active = bridge.viewContext(), change = state.change;
      openForm(env => <NewRevisionDialog env={env} api={api} change={change} openObligations={() => { if (active()) state.tab = 'obligations'; }} />, active);
    },
    openObligation(id) {
      const change = state.change, existing = id ? obligation(id) ?? null : null;
      openForm(env => <ObligationDialog env={env} api={api} change={change} obligation={existing} />);
    },
    openReview(id, action) {
      const change = state.change, target = obligation(id);
      if (!target) return;
      const own = [target.proposedBy, target.lastEditedBy].includes(state.session.email);
      openForm(env => <ReviewDialog env={env} api={api} change={change} obligation={target} action={action} own={own} />);
    },
    async showObligationHistory(id) {
      const active = bridge.viewContext(), dialog = bridge.nextDialog();
      const events = await api(`/api/obligations/${obligation(id)?.id}/history`) as HistoryEvent[];
      if (!active() || dialog !== bridge.dialogGeneration()) return;
      dialogHost.show(<HistoryDialog events={events} close={bridge.closeDialog} />);
    },
    unmountDialog: dialogHost.unmount,
    unmount: host.unmount
  };
}
