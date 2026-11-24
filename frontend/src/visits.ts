import type { LegacyState } from './legacy-bridge';

/** True while the visit that created it is still the one on screen. */
export type ActiveCheck = () => boolean;

export interface Visits {
  /** Starts a visit bound to the current session, route and generation. */
  begin(): ActiveCheck;
  /** Ends every earlier visit. The legacy shell calls it when a route starts or a session ends. */
  invalidate(): void;
}

/**
 * Binds asynchronous results to the exact displayed route and session (Increment 10 rule): a late
 * response from an earlier visit, route or session must not change what is shown or what is saved.
 */
export function createVisits(S: LegacyState): Visits {
  let generation = 0;
  return {
    begin() {
      const current = ++generation, session = S.session, hash = location.hash;
      return () => !!session && current === generation && session === S.session && hash === location.hash;
    },
    invalidate() {
      generation++;
    }
  };
}
