import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  location.hash = '';
});

// jsdom may not implement the native modal dialog; the product relies on showModal()/close() only.
const dialogPrototype = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
if (typeof dialogPrototype.showModal !== 'function') {
  dialogPrototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  dialogPrototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
}
