import { Component, StrictMode, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

/** Holds a screen. If the screen fails to render it is left out and the failure is passed on. */
class ScreenBoundary extends Component<{ onError: (error: unknown) => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    this.props.onError(error);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface PageHost {
  /** Replaces the whole page. The new page is in the DOM when this returns. */
  render(page: ReactNode): void;
  /**
   * Draws `frame(screen)`. If the screen throws while rendering, the frame is drawn without it and
   * the error is thrown to the caller, which shows its error page instead.
   */
  showScreen(screen: ReactNode, frame: (content: ReactNode) => ReactNode): void;
  unmount(): void;
}

/**
 * One React root for the page. Every render replaces the page completely (a new key), as each
 * screen draw did before: no input value, focus or component state survives from the previous view.
 * Rendering is synchronous, so route and session checks that run right after a draw see the result.
 */
export function createPageHost(container: Element): PageHost {
  const root = createRoot(container, {
    onCaughtError(error, info) {
      // A screen failure is rethrown to the router, which shows it; anything else is reported.
      if (!(info.errorBoundary instanceof ScreenBoundary)) reportError(error);
    }
  });
  let renders = 0;

  function render(page: ReactNode): void {
    const key = ++renders;
    flushSync(() => root.render(<StrictMode key={key}>{page}</StrictMode>));
  }

  function showScreen(screen: ReactNode, frame: (content: ReactNode) => ReactNode): void {
    const failures: unknown[] = [];
    render(frame(<ScreenBoundary onError={error => failures.push(error)}>{screen}</ScreenBoundary>));
    if (failures.length) throw failures[0];
  }

  return { render, showScreen, unmount: () => root.unmount() };
}
