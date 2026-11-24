import { StrictMode, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Renders React dialogs inside the page's one native <dialog id="modal"> (index.html). The native
 * element gives modal focus containment, Esc and aria-modal; browser suites select it as `dialog`.
 * The legacy shell's closeDialog() calls unmount() before it empties the element.
 */
export interface DialogHost {
  /** Replaces any open dialog and opens this one; the content is in the DOM when this returns. */
  show(content: ReactNode): void;
  unmount(): void;
}

let root: Root | null = null;

function unmount(): void {
  const current = root;
  root = null;
  current?.unmount();
}

function show(content: ReactNode): void {
  const modal = document.querySelector<HTMLDialogElement>('#modal');
  if (!modal) throw new Error('The page has no dialog element. Reload the page.');
  unmount();
  modal.replaceChildren();
  const next = createRoot(modal);
  flushSync(() => next.render(<StrictMode>{content}</StrictMode>));
  root = next;
  if (!modal.open) modal.showModal();
}

/** One host for the page's single dialog element, shared by every React screen module. */
export const dialogHost: DialogHost = { show, unmount };
