import { useState, type ReactNode } from 'react';
import { text } from '../shell-contract';
import { Logo } from './Logo';

/** One stroke icon per section (24 × 24, 1.8 px stroke), drawn so no two sections share a symbol. */
const ICONS: Record<string, ReactNode> = {
  overview: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  applications: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  changes: <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M6 8v4a4 4 0 0 0 4 4h6" /></>,
  resolutions: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />,
  activity: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  intake: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="8" r="2" /><path d="M6 7v10M18 10c0 4-6 3-12 7" /></>,
  'verification-templates': <><path d="M8 3h8l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M4 7v13a1 1 0 0 0 1 1M11 12h6M11 16h6" /></>,
  guide: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /></>,
  support: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" /></>
};

function NavIcon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name] ?? ICONS['overview']}</svg>;
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

type Link = readonly [id: string, title: string];

/** The signed-in page: grouped navigation, identity and sign-out, and the page content. */
export function Frame({ active, label, email, roles, workspace, children }: FrameProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const on = (name: string) => !!workspace?.capabilities[name];
  const groups: readonly (readonly [string, readonly Link[]])[] = [
    ['Work', [['overview', 'Workspace'], ['applications', 'Applications'], ['changes', 'Changes'], ...(on('resolutionWorkflow') ? [['resolutions', 'Resolutions'] as Link] : []), ['activity', 'Activity']]],
    ['Connect', [...(on('githubIntake') ? [['intake', 'GitHub intake'] as Link] : []), ...(on('verificationTemplates') ? [['verification-templates', 'Verification templates'] as Link] : [])]],
    ['Help', [['guide', 'Guide'], ['support', 'Support']]]
  ];
  return (
    <div className={`layout${menuOpen ? ' menu-open' : ''}`} onKeyDown={event => { if (menuOpen && event.key === 'Escape') setMenuOpen(false); }}>
      {menuOpen ? <button type="button" className="scrim" aria-label="Close navigation" tabIndex={-1} onClick={() => setMenuOpen(false)} /> : null}
      <aside className="sidebar" id="sidebar">
        <div className="brand"><Logo /></div>
        <nav className="nav" aria-label="Main navigation">
          {groups.filter(([, links]) => links.length).map(([group, links]) => (
            <div className="nav-group" key={group}>
              <div className="nav-label">{group}</div>
              {links.map(([id, title]) => <a href={`#/${id}`} className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined} key={id} onClick={() => setMenuOpen(false)}><NavIcon name={id} />{title}</a>)}
            </div>
          ))}
        </nav>
        <p className="sidebar-foot">{`Release ${text(workspace?.release ?? '0.11.0')} · ${workspace?.storage === 'postgres' ? 'PostgreSQL' : 'Local review'}`}</p>
      </aside>
      <div className="right">
        <header className="topbar">
          <button className="menu-button" type="button" aria-label="Open navigation" aria-controls="sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <div className="breadcrumb">{'Qivvera   /   '}<strong>{label}</strong></div>
          <a className="decides-link" href="#/guide">How Qivvera decides</a>
          <div className="identity">
            <div className="avatar" aria-hidden="true">{email.slice(0, 2).toUpperCase()}</div>
            <div className="email"><span>{email}</span><small>{(roles ?? []).map(roleName).join(' · ')}</small></div>
            <button className="link-button" data-action="logout">Sign out</button>
          </div>
        </header>
        <main id="main" className="main">
          {children}
        </main>
      </div>
    </div>
  );
}
