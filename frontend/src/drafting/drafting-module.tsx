import type { LegacyApi, LegacyShell, LegacyState } from '../legacy-bridge';
import { createScreenHost } from '../screen-host';
import { createVisits } from '../visits';
import { createNoticeStore, RunView, SourceView, type DraftChange, type DraftContext, type DraftingView, type DraftRun, type NoticeStore } from './DraftingPages';

export interface DraftingBridge {
  /** The legacy state; `tab` chooses which change tab opens next. */
  readonly S: LegacyState & { tab?: string };
  readonly api: LegacyApi;
  readonly shell: LegacyShell;
  readonly can: (role: string) => boolean;
  /** The legacy router: re-reads and redraws the current route. */
  readonly route: () => Promise<void>;
  /** Re-reads the workspace summary (counts in the navigation and overview). */
  readonly refresh: () => Promise<void>;
}

export interface DraftingUI {
  show(changeId: string, revisionId: string, options?: { runId?: string | null; offset?: number }): Promise<void>;
  /** Ends the current visit: late answers from it are ignored. Called when a route starts. */
  invalidate(): void;
  /** Removes the screen; the legacy shell calls it before it replaces the page or ends a session. */
  unmount(): void;
}

/**
 * Built as /drafting.js. Drafting prepares human-reviewed candidates; source and model text are
 * always data. Keeps the factory the legacy shell imports: createDraftingUI({S, api, shell, can, route, refresh}).
 */
export function createDraftingUI({ S, api, shell, can, route, refresh }: DraftingBridge): DraftingUI {
  const host = createScreenHost(shell);
  const visits = createVisits(S);

  function renderRun(run: unknown, view: DraftingView, message = ''): NoticeStore | null {
    if (!view.active()) return null;
    const notices = createNoticeStore();
    host.show(<RunView run={run as DraftRun} view={view} message={message} notices={notices} actions={{ redraw: (next, text) => renderRun(next, view, text), refreshWorkspace: refresh }} />, 'changes', 'Review source drafts');
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
    else host.show(<SourceView view={view} />, 'changes', 'Source drafts');
  }

  return { show, invalidate: visits.invalidate, unmount: host.unmount };
}
