import { createElement, Fragment } from 'react';
import { vi } from 'vitest';
import { createPageHost, type PageHost } from './app/page-host';
import type { LegacyShell } from './legacy-bridge';

/**
 * A stand-in for the shell(): like the real one it replaces the page with a frame around the screen,
 * renders synchronously and throws a screen's render error. The page lives in its own element, so a
 * separate <dialog> in the test document is left alone.
 */
export function fakeShell() {
  let host: PageHost | null = null, container: HTMLElement | null = null;
  const shell = vi.fn<LegacyShell>((screen, active = '', label = '') => {
    if (!container?.isConnected) {
      host?.unmount();
      container = document.body.appendChild(document.createElement('div'));
      host = createPageHost(container);
    }
    host!.showScreen(screen, content => createElement(Fragment, null, createElement('nav', { 'data-active': active, 'data-label': label }), createElement('main', { id: 'main' }, content)));
  });
  /** Removes the page, as the real shell does when it draws something else. Tests call it between cases. */
  function reset(): void {
    host?.unmount();
    container?.remove();
    host = container = null;
  }
  return Object.assign(shell, { reset });
}

/** A promise the test settles when it chooses, to simulate a late or lost answer. */
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** The legacy shell services a workspace screen receives, as inert defaults that a test can override. */
export function fakeWorkspaceServices() {
  let generation = 0;
  return {
    api: vi.fn(async () => ({})), refresh: vi.fn(async () => {}), toast: vi.fn(), route: vi.fn(async () => {}),
    closeDialog: vi.fn(() => { generation++; document.querySelector<HTMLDialogElement>('#modal')?.replaceChildren(); }),
    viewContext: () => () => true, nextDialog: () => ++generation, dialogGeneration: () => generation
  };
}
