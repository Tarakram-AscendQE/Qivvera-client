import { QueryClientProvider } from '@tanstack/react-query';
import { list } from '../json';
import type { LegacyShell } from '../legacy-bridge';
import { createQueryClient } from '../query-client';
import { createScreenHost } from '../screen-host';
import { createVisits } from '../visits';
import { IntakePage, type IntakeBridge } from './IntakePage';

export interface IntakeUI {
  show(): Promise<void>;
  /** Ends the current visit: late answers from it are ignored. Called when a route starts. */
  invalidate(): void;
  /** Removes the screen; the legacy shell calls it before it replaces the page or ends a session. */
  unmount(): void;
}

/**
 * Built as /intake.js. Replaces the legacy GitHub intake screen while keeping the factory the legacy
 * shell imports: createIntakeUI({S, api, h, shell, can, openForm, field, toast}).
 * Importing creates source context only; it never accepts requirements or creates evidence.
 */
export function createIntakeUI(bridge: IntakeBridge & { readonly shell: LegacyShell }): IntakeUI {
  const host = createScreenHost(bridge.shell);
  const visits = createVisits(bridge.S);

  async function show(): Promise<void> {
    const active = visits.begin();
    // A new client per visit: nothing from an earlier visit or session is reused.
    const client = createQueryClient();
    const repositories = await client.fetchQuery({ queryKey: ['source-repositories'], queryFn: () => bridge.api('/api/source-repositories') });
    if (!active() || !location.hash.startsWith('#/intake')) return;
    host.show(<QueryClientProvider client={client}><IntakePage bridge={bridge} repositories={list(repositories)} active={active} /></QueryClientProvider>, 'intake', 'GitHub intake');
  }

  return { show, invalidate: visits.invalidate, unmount: host.unmount };
}
