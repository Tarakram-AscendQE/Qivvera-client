import { text } from '../legacy-bridge';
import { shortRevision } from '../workspace/rows';
import { AssuranceTab, EvidenceTab } from './AssuranceTabs';
import { AssessmentBanner, NextStep, RunButton } from './Guidance';
import { HistoryTab, ObligationsTab, OverviewTab, RevisionsTab } from './RecordTabs';
import type { ChangeView } from './types';

function TabBody({ view }: { view: ChangeView }) {
  switch (view.tab) {
    case 'overview': return <OverviewTab view={view} />;
    case 'obligations': return <ObligationsTab view={view} />;
    case 'assurance': return <AssuranceTab view={view} />;
    case 'evidence': return <EvidenceTab view={view} />;
    case 'revisions': return <RevisionsTab view={view} />;
    case 'history': return <HistoryTab view={view} />;
    // resolution.js still renders this tab (already escaped there) until resolution moves to React.
    case 'resolutions': return <div data-legacy-html="" dangerouslySetInnerHTML={{ __html: view.resolutionHtml }} />;
    default: return null;
  }
}

/** One change revision: its declared context, requirements, plan, evidence and history. Buttons act through data-action. */
export function ChangePage({ view }: { view: ChangeView }) {
  const { change, workspace } = view, current = !!change.isCurrentRevision, canEdit = view.roles.author && current;
  const application = workspace.applications.find(app => app.id === change.applicationId);
  const tabs = ['overview', 'obligations', 'assurance', 'evidence', ...(workspace.capabilities['resolutionWorkflow'] ? ['resolutions'] : []), 'revisions', 'history'];
  return (
    <>
      <a className="back" href="#/changes">← Changes</a><div className="heading"><div><div className="eyebrow">{text(application?.name)} / Change</div><h1>{text(change.title)}</h1><p className="small muted">Revision {text(change.revision.number)} · <span className="mono">{shortRevision(change.sourceRevision)}</span> · Declared, not verified</p></div><div className="actions">{workspace.capabilities['revisionImpact'] ? <a className="button" href={`#/impact/${change.id}/${change.revision.id}`}>Impact &amp; next checks</a> : null}<button className="button" data-action="new-revision" disabled={!canEdit}>+ New revision</button><RunButton view={view} /></div></div>
      {!current ? <div className="notice warning"><strong>Historical revision · read-only</strong><span><a href={`#/changes/${change.id}`}>Open current revision →</a></span></div> : null}
      {view.session.reviewMode === 'founder-review' ? <div className="notice warning"><strong>Founder-review mode</strong><span>Same-person decisions are permitted and labelled. They do not establish independent approval.</span></div> : null}
      <AssessmentBanner view={view} /><NextStep view={view} />
      <nav className="tabs" aria-label="Change sections">{tabs.map(tab => <button key={tab} data-action="tab" data-tab={tab} aria-current={view.tab === tab ? 'true' : 'false'} className={view.tab === tab ? 'active' : ''}>{tab[0]!.toUpperCase() + tab.slice(1)}</button>)}</nav>
      <TabBody view={view} />
    </>
  );
}
