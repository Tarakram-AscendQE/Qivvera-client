import { vi } from 'vitest';
import type { LegacyShell } from './legacy-bridge';

/** A stand-in for the legacy shell(): it replaces the whole page with a frame around the content, as the real one does. */
export function fakeShell() {
  return vi.fn<LegacyShell>((content, active = '', label = '') => {
    document.body.innerHTML = `<nav data-active="${active}" data-label="${label}"></nav><main id="main">${content}</main>`;
  });
}

/** A promise the test settles when it chooses, to simulate a late or lost answer. */
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
