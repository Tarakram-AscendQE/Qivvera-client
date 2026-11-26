import { QueryClientProvider } from '@tanstack/react-query';
import { dialogHost } from '../dialogs/dialog-host';
import { list } from '../json';
import type { Shell } from '../shell-contract';
import { createQueryClient } from '../query-client';
import { createVisits } from '../visits';
import { IntakePage, type IntakeBridge } from './IntakePage';

export interface IntakeUI {
  /** Shows intake; with a repository and pull request, previews that pull request straight away (read-only). */
  show(repositoryKey?: string | null, pullNumber?: number | null): Promise<void>;
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

  async function show(repositoryKey: string | null = null, pullNumber: number | null = null): Promise<void> {
    const active = visits.begin();
    // A new client per visit: nothing from an earlier visit or session is reused.
    const client = createQueryClient();
    const repositories = await client.fetchQuery({ queryKey: ['source-repositories'], queryFn: () => bridge.api('/api/source-repositories') });
    if (!active() || !location.hash.startsWith('#/intake')) return;
    bridge.shell(<QueryClientProvider client={client}><IntakePage bridge={bridge} repositories={list(repositories)} active={active} preferred={repositoryKey && pullNumber ? { repositoryKey, pullNumber } : null} /></QueryClientProvider>, 'intake', 'GitHub intake');
  }

  return { show, invalidate: visits.invalidate, unmountDialog: dialogHost.unmount };
}
