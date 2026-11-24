import { StrictMode, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { LegacyShell } from './legacy-bridge';

const CONTAINER_ATTRIBUTE = 'data-react-screen';

export interface ScreenHost {
  /**
   * Draws the legacy frame and renders the screen inside it before returning. An error while
   * rendering is thrown to the caller, so the legacy router shows its error page, as before.
   */
  show(screen: ReactNode, active: string, label: string): void;
  /** Removes the screen. The legacy shell calls this before it replaces the page or ends a session. */
  unmount(): void;
}

/**
 * Hosts one React screen at a time inside the legacy page frame.
 *
 * Rendering is synchronous (flushSync) so the screen is in the DOM when show() returns, exactly
 * like the legacy string screens. Route-generation and session checks in the legacy shell rely on
 * that ordering.
 */
export function createScreenHost(shell: LegacyShell): ScreenHost {
  let root: Root | null = null;

  function unmount(): void {
    const current = root;
    root = null;
    current?.unmount();
  }

  function show(screen: ReactNode, active: string, label: string): void {
    unmount();
    shell(`<div ${CONTAINER_ATTRIBUTE}></div>`, active, label);
    const container = document.querySelector(`[${CONTAINER_ATTRIBUTE}]`);
    if (!container) throw new Error('The page frame did not provide a place for this screen. Reload the page.');
    let rendering = true;
    const failures: unknown[] = [];
    const next = createRoot(container, {
      onUncaughtError(error) {
        if (rendering) failures.push(error);
        else reportError(error);
      }
    });
    flushSync(() => next.render(<StrictMode>{screen}</StrictMode>));
    rendering = false;
    if (failures.length) {
      next.unmount();
      throw failures[0];
    }
    root = next;
  }

  return { show, unmount };
}
