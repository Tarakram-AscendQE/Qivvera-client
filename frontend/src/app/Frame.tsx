import type { ReactNode } from 'react';
import { text } from '../legacy-bridge';
import { Logo } from './Logo';

const ICONS: Record<string, ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  applications: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h4" /></>,
  changes: <><path d="M6 3v12a5 5 0 0 0 5 5h7M6 7h12M15 4l3 3-3 3" /><circle cx="6" cy="3" r="1" /></>,
  activity: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l4 2" /></>
};

function NavIcon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[name] ?? ICONS['overview']}</svg>;
}

const roleName = (role: string): string => (role === 'POLICY_AUTHORITY' ? 'Policy authority' : role === 'AUTHOR' ? 'Author' : 'Viewer');

export interface FrameWorkspace {
  readonly capabilities: Readonly<Record<string, unknown>>;
  readonly release?: unknown;
  readonly storage?: unknown;
}

export interface FrameProps {
  /** The navigation entry to mark as the current page. */
  readonly active: string;
  /** The breadcrumb text for this page. */
  readonly label: string;
  readonly email: string;
  readonly roles?: readonly string[] | undefined;
  readonly workspace: FrameWorkspace | null | undefined;
  readonly children: ReactNode;
}

/** The signed-in page: navigation, identity and sign-out, the page content, and the scope reminder. */
export function Frame({ active, label, email, roles, workspace, children }: FrameProps) {
  const links: [string, string][] = [
    ['overview', 'Workspace'], ['applications', 'Applications'], ['changes', 'Changes'],
    ...(workspace?.capabilities['resolutionWorkflow'] ? [['resolutions', 'Resolutions'] as [string, string]] : []),
    ...(workspace?.capabilities['githubIntake'] ? [['intake', 'GitHub intake'] as [string, string]] : []),
    ...(workspace?.capabilities['verificationTemplates'] ? [['verification-templates', 'Verification templates'] as [string, string]] : []),
    ['activity', 'Activity'], ['guide', 'Guide'], ['support', 'Support']
  ];
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand"><Logo /></div>
        <div className="label">Assurance workspace</div>
        <nav className="nav" aria-label="Main navigation">
          {links.map(([id, title]) => <a href={`#/${id}`} className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined} key={id}><NavIcon name={id} />{title}</a>)}
        </nav>
        <div className="sidebar-foot">
          <span className="workspace-tag">REVIEW WORKSPACE</span>
          <p>Independent assurance.<br />Explicit uncertainty.</p>
          <p>{`Release ${text(workspace?.release ?? '0.11.0')} · ${workspace?.storage === 'postgres' ? 'PostgreSQL' : 'Local review'}`}</p>
        </div>
      </aside>
      <div className="right">
        <header className="topbar">
          <div className="breadcrumb">{'Qivvera \u00a0 / \u00a0 '}<strong>{label}</strong></div>
          <div className="identity">
            <div className="avatar">{email.slice(0, 2).toUpperCase()}</div>
            <div className="email"><span>{email}</span><small>{(roles ?? []).map(roleName).join(' · ')}</small></div>
            <button className="link-button" data-action="logout">Sign out</button>
          </div>
        </header>
        <main id="main" className="main">
          {children}
          <footer className="footer"><span>Qivvera · Independent Change Assurance</span><span>Acceptance is not verification. Assessments are bound to their declared scope.</span></footer>
        </main>
      </div>
    </div>
  );
}
