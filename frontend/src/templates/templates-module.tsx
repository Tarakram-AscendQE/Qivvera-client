import { downloadJson } from '../download';
import type { LegacyApi, LegacyCan, LegacyRefresh, LegacyRoute, LegacyShell, LegacyState } from '../legacy-bridge';
import { createVisits, type ActiveCheck } from '../visits';
import { DetailView, ListView, PlanView, SaveView, type Destination, type TemplateList, type TemplateReport } from './TemplatePages';
import type { TemplateActions } from './shared';

export interface TemplatesBridge {
  readonly S: LegacyState;
  readonly api: LegacyApi;
  readonly shell: LegacyShell;
  readonly can: LegacyCan;
  readonly route: LegacyRoute;
  readonly refresh: LegacyRefresh;
}

export interface TemplatesUI {
  showList(options?: { offset?: number; includeArchived?: boolean; changeId?: string | null; revisionId?: string | null }): Promise<void>;
  showDetail(templateId: string, versionId?: string | null): Promise<void>;
  showSave(changeId: string, revisionId: string, templateId?: string | null): Promise<void>;
  showPlan(changeId: string, revisionId: string, templateId: string, versionId: string): Promise<void>;
  /** Ends the current visit: late answers from it are ignored. Called when a route starts. */
  invalidate(): void;
}

const id = (value: unknown): string => encodeURIComponent(String(value));

/** Accepts only the template version the link names, in the expected format. */
function inspect(value: unknown, templateId: string, versionId: string | null = null): TemplateReport {
  const report = value as Partial<TemplateReport> | null;
  if (report?.schema !== 'qivvera.verification-template/1' || report.family?.id !== templateId || !Array.isArray(report.history) ||
      !Array.isArray(report.version?.snapshot?.entries) || (versionId && report.version.id !== versionId)) {
    throw new Error('The saved template does not match this link. Reload the template before continuing.');
  }
  return report as TemplateReport;
}

/**
 * Built as /templates.js. Versioned preparation references; every reuse requires a fresh plan
 * decision. Keeps the factory the legacy shell imports: createTemplatesUI({S, api, shell, can, route, refresh}).
 */
export function createTemplatesUI({ S, api, shell, can, route, refresh }: TemplatesBridge): TemplatesUI {
  const visits = createVisits(S);
  const founderReview = () => S.session?.reviewMode === 'founder-review';

  function actionsFor(active: ActiveCheck): TemplateActions {
    return {
      active,
      selectTab(tab) { if (active()) S.tab = tab; },
      reload() { if (active()) void route(); },
      refreshWorkspace: refresh,
      route
    };
  }

  /** The change and its assurance context, which must both describe exactly this revision. */
  async function destination(changeId: string, revisionId: string): Promise<Destination> {
    const [change, context] = await Promise.all([api(`/api/changes/${id(changeId)}?revision=${id(revisionId)}`), api(`/api/changes/${id(changeId)}/assurance-context?revision=${id(revisionId)}`)]) as [Destination['change'], Destination['context'] | null];
    if (change.id !== changeId || change.revision.id !== revisionId || context?.scope?.changeId !== changeId || context.scope.revisionId !== revisionId) {
      throw new Error('The verification context does not match this revision. Reload the change.');
    }
    return { change, context };
  }

  async function showList({ offset = 0, includeArchived = false, changeId = null, revisionId = null }: { offset?: number; includeArchived?: boolean; changeId?: string | null; revisionId?: string | null } = {}): Promise<void> {
    const active = visits.begin();
    // Large saved histories: ask for a smaller page when the server reports its read limit.
    async function readPage(): Promise<TemplateList | null> {
      for (const limit of [20, 5, 1]) {
        if (!active()) return null;
        try {
          const result = await api(`/api/verification-templates?offset=${offset}&limit=${limit}&includeArchived=${includeArchived}`) as TemplateList;
          if (!active()) return null;
          return result;
        } catch (error) {
          if (!active()) return null;
          if ((error as { code?: unknown }).code === 'TEMPLATE_READ_LIMIT' && limit !== 1) continue;
          throw error;
        }
      }
      return null;
    }
    const [list, dest] = await Promise.all([readPage(), changeId && revisionId ? destination(changeId, revisionId) : Promise.resolve(null)]);
    if (!active()) return;
    if (!Array.isArray(list?.items)) throw new Error('The template list could not be read. Reload this view.');
    shell(<ListView list={list} dest={dest} includeArchived={includeArchived} changeId={changeId} revisionId={revisionId} canPolicy={can('POLICY_AUTHORITY')} founderReview={founderReview()} actions={actionsFor(active)} />, 'verification-templates', 'Verification templates');
  }

  async function showDetail(templateId: string, versionId: string | null = null): Promise<void> {
    const active = visits.begin();
    const value = await api(`/api/verification-templates/${id(templateId)}${versionId ? '?version=' + id(versionId) : ''}`);
    if (!active()) return;
    const report = inspect(value, templateId, versionId);
    const download = () => {
      if (active()) downloadJson(`Qivvera-template-${report.family.id}-v${report.version.number}.json`, JSON.stringify(report, null, 2) + '\n');
    };
    shell(<DetailView report={report} templateId={templateId} canPolicy={can('POLICY_AUTHORITY')} founderReview={founderReview()} changes={S.workspace?.changes ?? []} api={api} actions={actionsFor(active)} download={download} />, 'verification-templates', 'Template version');
  }

  async function showSave(changeId: string, revisionId: string, templateId: string | null = null): Promise<void> {
    const active = visits.begin();
    const [dest, previousValue] = await Promise.all([destination(changeId, revisionId), templateId ? api(`/api/verification-templates/${id(templateId)}`) : Promise.resolve(null)]);
    if (!active()) return;
    const { change, context } = dest, plan = context.plan, snapshot = plan?.snapshot;
    const previous = previousValue && templateId ? inspect(previousValue, templateId) : null;
    const allowed = can('POLICY_AUTHORITY') && !!change.isCurrentRevision && !!context.isCurrent && !!plan?.current && snapshot?.schema === 'qivvera.assurance-plan/2' && (!previous || previous.family.state === 'ACTIVE');
    shell(<SaveView dest={dest} previous={previous} allowed={allowed} changeId={changeId} revisionId={revisionId} templateId={templateId} founderReview={founderReview()} api={api} actions={actionsFor(active)} />, 'verification-templates', 'Save template');
  }

  async function showPlan(changeId: string, revisionId: string, templateId: string, versionId: string): Promise<void> {
    const active = visits.begin();
    const [dest, value] = await Promise.all([destination(changeId, revisionId), api(`/api/verification-templates/${id(templateId)}?version=${id(versionId)}`)]);
    if (!active()) return;
    const report = inspect(value, templateId, versionId);
    shell(<PlanView report={report} dest={dest} changeId={changeId} revisionId={revisionId} templateId={templateId} versionId={versionId} canPolicy={can('POLICY_AUTHORITY')} founderReview={founderReview()} api={api} actions={actionsFor(active)} />, 'changes', 'Review template mappings');
  }

  return { showList, showDetail, showSave, showPlan, invalidate: visits.invalidate };
}
