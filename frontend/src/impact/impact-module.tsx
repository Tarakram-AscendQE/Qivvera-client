import { downloadJson } from '../download';
import type { LegacyApi, LegacyRoute, LegacyShell, LegacyState } from '../legacy-bridge';
import { createVisits } from '../visits';
import { ImpactLoading, ImpactPage } from './ImpactPage';
import { parseImpactReport, type ChangeTab } from './report';

export interface ImpactBridge {
  readonly S: LegacyState;
  readonly api: LegacyApi;
  readonly shell: LegacyShell;
  readonly route: LegacyRoute;
}

export interface ImpactUI {
  show(changeId: string, revisionId: string): Promise<void>;
  /** Ends the current visit: late answers from it are ignored. Called when a route starts. */
  invalidate(): void;
}

/**
 * Built as /impact.js. A read-only explanation of saved revision scope; it never grants authority
 * or queues work. Keeps the factory the legacy shell imports: createImpactUI({S, api, shell, route}).
 */
export function createImpactUI({ S, api, shell, route }: ImpactBridge): ImpactUI {
  const visits = createVisits(S);

  async function show(changeId: string, revisionId: string): Promise<void> {
    const active = visits.begin();
    if (!S.session) return;
    shell(<ImpactLoading />, 'changes', 'Impact & next checks');
    const value = await api(`/api/changes/${encodeURIComponent(changeId)}/impact?revision=${encodeURIComponent(revisionId)}`);
    if (!active()) return;
    const report = parseImpactReport(value, changeId, revisionId);
    // The download is the exact snapshot on screen, not a later read.
    const serialized = JSON.stringify(report, null, 2) + '\n';
    const actions = {
      selectTab(tab: ChangeTab) {
        if (active()) S.tab = tab;
      },
      refresh() {
        if (active()) void route();
      },
      download() {
        if (active()) downloadJson(`Qivvera-impact-revision-${String(report.selectedRevision.number)}.json`, serialized);
      }
    };
    shell(<ImpactPage report={report} founderReview={S.session.reviewMode === 'founder-review'} actions={actions} />, 'changes', 'Impact & next checks');
  }

  return { show, invalidate: visits.invalidate };
}
