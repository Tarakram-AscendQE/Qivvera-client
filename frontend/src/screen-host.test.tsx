import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LegacyShell } from './legacy-bridge';
import { createScreenHost } from './screen-host';

const shell = vi.fn<LegacyShell>(content => { document.body.innerHTML = `<main>${content}</main>`; });

function Broken(): never {
  throw new Error('Invalid time value');
}

describe('screen host', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders synchronously inside the legacy frame', () => {
    const host = createScreenHost(shell);
    host.show(<h1>Ready</h1>, 'overview', 'Workspace');
    expect(document.querySelector('[data-react-screen] h1')?.textContent).toBe('Ready');
    host.unmount();
    expect(document.querySelector('[data-react-screen]')?.childNodes.length).toBe(0);
  });

  it('throws a rendering error to the legacy router instead of showing a broken screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const host = createScreenHost(shell);
    expect(() => host.show(<Broken />, 'overview', 'Workspace')).toThrow('Invalid time value');
    expect(document.querySelector('[data-react-screen]')?.childNodes.length).toBe(0);
    host.show(<p>Next screen</p>, 'overview', 'Workspace');
    expect(document.querySelector('[data-react-screen] p')?.textContent).toBe('Next screen');
    host.unmount();
  });
});
