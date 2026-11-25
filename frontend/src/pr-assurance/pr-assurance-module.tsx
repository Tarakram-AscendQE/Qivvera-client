import { QueryClientProvider } from '@tanstack/react-query';
import type { Api, Reroute, Shell, ShellState, Toast } from '../shell-contract';
import { createQueryClient } from '../query-client';
import { createVisits } from '../visits';
import { TimelinePage } from './TimelinePage';

export interface PrAssuranceBridge {
  readonly S: ShellState;
  readonly api: Api;
  readonly shell: Shell;
  readonly route: Reroute;
  readonly toast: Toast;
}

export interface PrAssuranceUI {
  show(): Promise<void>;
  /** Ends the current visit: late answers from it are ignored. Called when a route starts. */
  invalidate(): void;
}

/**
 * The PR assurance demo: VendorPay's three pull requests, assessed by Qivvera's own checks on GitHub
 * Actions. The browser only ever sends a pull-request number; the server pins everything else.
 */
export function createPrAssuranceUI(bridge: PrAssuranceBridge): PrAssuranceUI {
  const visits = createVisits(bridge.S);

  async function show(): Promise<void> {
    const active = visits.begin();
    // A new client per visit: nothing from an earlier visit or session is reused.
    const client = createQueryClient();
    const scenario = await client.fetchQuery({ queryKey: ['pr-assurance'], queryFn: () => bridge.api('/api/pr-assurance') });
    if (!active() || location.hash !== '#/pr-assurance') return;
    bridge.shell(<QueryClientProvider client={client}><TimelinePage bridge={bridge} scenario={scenario} active={active} /></QueryClientProvider>, 'pr-assurance', 'PR assurance');
  }

  return { show, invalidate: visits.invalidate };
}
