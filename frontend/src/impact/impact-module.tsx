import type { LegacyApi, LegacyShell, LegacyState } from '../legacy-bridge';
import { createScreenHost } from '../screen-host';
import { createVisits } from '../visits';
import { ImpactLoading, ImpactPage } from './ImpactPage';
import { parseImpactReport, type ChangeTab } from './report';

export interface ImpactBridge {
  /** The legacy state; `tab` chooses which change tab opens next. */
  readonly S: LegacyState & { tab?: string; session: (LegacyState['session'] & { reviewMode?: string }) | null };
  readonly api: LegacyApi;
  readonly shell: LegacyShell;
  /** The legacy router: re-reads and redraws the current route. */
  readonly route: () => Promise<void>;
}

export interface ImpactUI {
  show(changeId: string, revisionId: string): Promise<void>;
  /** Ends the current visit: late answers from it are ignored. Called when a route starts. */
  invalidate(): void;
  /** Removes the screen; the legacy shell calls it before it replaces the page or ends a session. */
  unmount(): void;
}

/**
 * Built as /impact.js. A read-only explanation of saved revision scope; it never grants authority
 * or queues work. Keeps the factory the legacy shell imports: createImpactUI({S, api, shell, route}).
 */
export function createImpactUI({ S, api, shell, route }: ImpactBridge): ImpactUI {
  const host = createScreenHost(shell);
  const visits = createVisits(S);

  async function show(changeId: string, revisionId: string): Promise<void> {
    const active = visits.begin();
    if (!S.session) return;
    host.show(<ImpactLoading />, 'changes', 'Impact & next checks');
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
        if (!active()) return;
        const blob = new Blob([serialized], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url;
        link.download = `Qivvera-impact-revision-${String(report.selectedRevision.number)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    };
    host.show(<ImpactPage report={report} founderReview={S.session.reviewMode === 'founder-review'} actions={actions} />, 'changes', 'Impact & next checks');
  }

  return { show, invalidate: visits.invalidate, unmount: host.unmount };
}
