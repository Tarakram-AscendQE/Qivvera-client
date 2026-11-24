import { QueryClientProvider } from '@tanstack/react-query';
import type { ScreenServices } from '../shell-contract';
import { createQueryClient } from '../query-client';
import { GuidePage } from './GuidePage';
import { SupportPage } from './SupportPage';
import { supportQueryOptions } from './support-report';

export interface GuideUI {
  showGuide(): void;
  showSupport(): Promise<void>;
}

/**
 * The Guide and Support screens.
 * Product guidance is read-only. It never sets authority, evidence or disposition.
 */
export function createGuideUI({ S, api, shell }: ScreenServices): GuideUI {

  function showGuide(): void {
    const session = S.session;
    if (!session || !location.hash.startsWith('#/guide')) return;
    shell(<GuidePage roles={session.roles ?? []} />, 'guide', 'Product guide');
  }

  async function showSupport(): Promise<void> {
    const session = S.session;
    // A new client per visit: support details are never reused across visits or sessions.
    const client = createQueryClient();
    // Read before showing the screen, as before. A failure reaches the router's error page.
    await client.fetchQuery(supportQueryOptions(api));
    // A late answer must not replace a newer view or a different session's view.
    if (!session || S.session !== session || location.hash.replace(/\/$/, '') !== '#/support') return;
    shell(<QueryClientProvider client={client}><SupportPage api={api} /></QueryClientProvider>, 'support', 'Support');
  }

  return { showGuide, showSupport };
}
