import type { LegacyCan, LegacyShell, LegacyState } from '../legacy-bridge';
import { createScreenHost } from '../screen-host';
import { OverviewPage, type Roles } from './OverviewPage';
import { ActivityPage, ApplicationPage, ApplicationsPage, ChangesPage } from './RegistryPages';
import type { WorkspaceSummary } from './rows';

export interface WorkspaceBridge {
  readonly S: LegacyState;
  readonly shell: LegacyShell;
  readonly can: LegacyCan;
}

export interface WorkspaceUI {
  showOverview(): void;
  showApplications(): void;
  /** The shell shows its own error page when the application does not exist. */
  showApplication(id: string): void;
  showChanges(): void;
  showActivity(): void;
  /** Removes the screen; the legacy shell calls it before it replaces the page or ends a session. */
  unmount(): void;
}

/**
 * Built as /workspace.js: the workspace screens the legacy shell draws from its saved workspace summary.
 * Rendering is synchronous, as before. Buttons keep their data-action attributes, so the legacy click
 * handler still opens the same dialogs until the shell itself moves to React.
 */
export function createWorkspaceUI({ S, shell, can }: WorkspaceBridge): WorkspaceUI {
  const host = createScreenHost(shell);
  const workspace = () => S.workspace as unknown as WorkspaceSummary;
  const roles = (): Roles => ({ author: can('AUTHOR'), authority: can('POLICY_AUTHORITY') });

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
    unmount: host.unmount
  };
}
