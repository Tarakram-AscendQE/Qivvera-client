import { QueryClientProvider } from '@tanstack/react-query';
import { dialogHost } from '../dialogs/dialog-host';
import { list } from '../json';
import type { Shell } from '../shell-contract';
import { createQueryClient } from '../query-client';
import { createVisits } from '../visits';
import { IntakePage, type IntakeBridge } from './IntakePage';

export interface IntakeUI {
  show(): Promise<void>;
  /** Ends the current visit: late answers from it are ignored. Called when a route starts. */
  invalidate(): void;
  /** Removes a React dialog; the shell's closeDialog() calls it before it empties the dialog element. */
  unmountDialog(): void;
}

/**
 * The GitHub intake screen and its import dialog.
 * Importing creates source context only; it never accepts requirements or creates evidence.
 */
export function createIntakeUI(bridge: IntakeBridge & { readonly shell: Shell }): IntakeUI {
  const visits = createVisits(bridge.S);

  async function show(): Promise<void> {
    const active = visits.begin();
    // A new client per visit: nothing from an earlier visit or session is reused.
    const client = createQueryClient();
    const repositories = await client.fetchQuery({ queryKey: ['source-repositories'], queryFn: () => bridge.api('/api/source-repositories') });
    if (!active() || !location.hash.startsWith('#/intake')) return;
    bridge.shell(<QueryClientProvider client={client}><IntakePage bridge={bridge} repositories={list(repositories)} active={active} /></QueryClientProvider>, 'intake', 'GitHub intake');
  }

  return { show, invalidate: visits.invalidate, unmountDialog: dialogHost.unmount };
}
