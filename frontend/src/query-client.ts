import { QueryClient } from '@tanstack/react-query';

/**
 * Query defaults that keep the legacy behaviour:
 * - no automatic retries: a failed read is shown to the person, who decides whether to try again;
 * - no refetching on focus, reconnect or mount: data changes only when the person refreshes or
 *   navigates, so a displayed record does not silently change under them.
 * Mutations never retry: a lost mutation response has an uncertain outcome (Increment 6 rule).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
      },
      mutations: { retry: false }
    }
  });
}
