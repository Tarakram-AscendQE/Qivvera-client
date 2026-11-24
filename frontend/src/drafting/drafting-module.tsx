import type { Api, Can, Refresh, Reroute, Shell, ShellState } from '../shell-contract';
import { createVisits } from '../visits';
import { createNoticeStore, RunView, SourceView, type DraftChange, type DraftContext, type DraftingView, type DraftRun, type NoticeStore } from './DraftingPages';

export interface DraftingBridge {
  readonly S: ShellState;
  readonly api: Api;
  readonly shell: Shell;
  readonly can: Can;
  readonly route: Reroute;
  readonly refresh: Refresh;
}

export interface DraftingUI {
  show(changeId: string, revisionId: string, options?: { runId?: string | null; offset?: number }): Promise<void>;
  /** Ends the current visit: late answers from it are ignored. Called when a route starts. */
  invalidate(): void;
}

/**
 * Source drafting prepares human-reviewed candidates; source and model text are always data.
 */
export function createDraftingUI({ S, api, shell, can, route, refresh }: DraftingBridge): DraftingUI {
  const visits = createVisits(S);

  function renderRun(run: unknown, view: DraftingView, message = ''): NoticeStore | null {
    if (!view.active()) return null;
    const notices = createNoticeStore();
    shell(<RunView run={run as DraftRun} view={view} message={message} notices={notices} actions={{ redraw: (next, text) => renderRun(next, view, text), refreshWorkspace: refresh }} />, 'changes', 'Review source drafts');
    return notices;
  }

  async function show(changeId: string, revisionId: string, { runId = null, offset = 0 }: { runId?: string | null; offset?: number } = {}): Promise<void> {
    const active = visits.begin();
    const [changeValue, contextValue, runValue] = await Promise.all([
      api(`/api/changes/${encodeURIComponent(changeId)}?revision=${encodeURIComponent(revisionId)}`),
      api(`/api/changes/${encodeURIComponent(changeId)}/drafting?revision=${encodeURIComponent(revisionId)}&offset=${offset}&limit=10`),
      runId ? api(`/api/drafting-runs/${encodeURIComponent(runId)}`) : Promise.resolve(null)
    ]);
    if (!active()) return;
    const change = changeValue as DraftChange, context = contextValue as DraftContext, run = runValue as DraftRun | null;
    if (context.changeId !== changeId || context.revisionId !== revisionId || change.id !== changeId || change.revision.id !== revisionId) {
      throw new Error('The drafting view does not match the selected revision. Reload the change before continuing.');
    }
    if (run && (run.changeId !== changeId || run.revisionId !== revisionId)) {
      throw new Error('This saved drafting run belongs to another change or revision. Open it from its original change.');
    }
    const view: DraftingView = {
      change, context, changeId, revisionId, active, api, canAuthor: can('AUTHOR'), email: S.session?.email,
      openObligations() { if (active()) S.tab = 'obligations'; },
      reload() { if (active()) void route(); }
    };
    if (run) renderRun(run, view);
    else shell(<SourceView view={view} />, 'changes', 'Source drafts');
  }

  return { show, invalidate: visits.invalidate };
}
