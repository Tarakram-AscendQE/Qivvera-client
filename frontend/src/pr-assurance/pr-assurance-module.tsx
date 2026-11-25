import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { field, list } from '../json';
import type { Api, Reroute, Shell, ShellState, Toast } from '../shell-contract';
import { createQueryClient } from '../query-client';
import { createVisits } from '../visits';
import { PullPage, RunPage } from './PullPage';
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
  showPull(number: number): Promise<void>;
  showRun(runId: string): Promise<void>;
  /** Ends the current visit: late answers from it are ignored. Called when a route starts. */
  invalidate(): void;
}

/**
 * The PR assurance demo: VendorPay's three pull requests, assessed by Qivvera's own checks on GitHub
 * Actions. The browser only ever sends a pull-request number and a request key; the server pins
 * everything else.
 */
export function createPrAssuranceUI(bridge: PrAssuranceBridge): PrAssuranceUI {
  const visits = createVisits(bridge.S);

  /** Reads everything first, then draws, but only if this visit is still the one on screen. */
  async function visit(hash: string, read: (client: ReturnType<typeof createQueryClient>) => Promise<(active: () => boolean) => ReactNode>): Promise<void> {
    const active = visits.begin();
    // A new client per visit: nothing from an earlier visit or session is reused.
    const client = createQueryClient();
    const draw = await read(client);
    if (!active() || location.hash !== hash) return;
    bridge.shell(<QueryClientProvider client={client}>{draw(active)}</QueryClientProvider>, 'pr-assurance', 'PR assurance');
  }
  const get = (client: ReturnType<typeof createQueryClient>, path: string) => client.fetchQuery({ queryKey: [path], queryFn: () => bridge.api(path) });

  return {
    show: () => visit('#/pr-assurance', async client => {
      const scenario = await get(client, '/api/pr-assurance');
      return active => <TimelinePage bridge={bridge} scenario={scenario} active={active} />;
    }),

    showPull: number => visit(`#/pr-assurance/pulls/${number}`, async client => {
      const [scenario, history] = await Promise.all([get(client, '/api/pr-assurance'), get(client, `/api/pr-assurance/pulls/${number}/runs`)]);
      const latest = list(history)[0];
      const view = latest ? await get(client, `/api/pr-assurance/runs/${String(field(latest, 'id'))}`) : null;
      return active => <PullPage bridge={bridge} number={number} scenario={scenario} history={list(history)} latest={view} active={active} />;
    }),

    showRun: runId => visit(`#/pr-assurance/runs/${runId}`, async client => {
      const view = await get(client, `/api/pr-assurance/runs/${runId}`);
      return active => <RunPage bridge={bridge} view={view} active={active} />;
    }),

    invalidate: visits.invalidate
  };
}
