import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred } from '../test-utils';
import { ErrorPage } from './ErrorPages';
import { Frame } from './Frame';
import { createPageHost, type PageHost } from './page-host';
import { SignInPage } from './SignInPage';

let host: PageHost;
beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  host = createPageHost(document.querySelector('#root')!);
});
afterEach(() => host.unmount());

function Broken(): never {
  throw new Error('Invalid time value');
}

describe('page host', () => {
  it('draws synchronously and replaces the whole page, keeping no state from the previous one', () => {
    host.render(<input aria-label="Name" defaultValue="" />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'typed' } });
    host.render(<input aria-label="Name" defaultValue="" />);
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
  });

  it('throws a screen render error to the caller and draws the frame without the screen', () => {
    const frame = (content: React.ReactNode) => <section aria-label="frame">{content}</section>;
    expect(() => host.showScreen(<Broken />, frame)).toThrow('Invalid time value');
    expect(screen.getByRole('region', { name: 'frame' }).childNodes.length).toBe(0);
    host.showScreen(<p>Next screen</p>, frame);
    expect(screen.getByText('Next screen')).toBeTruthy();
  });
});

describe('frame', () => {
  const workspace = { capabilities: { resolutionWorkflow: true, verificationTemplates: true }, release: '0.11.0', storage: 'postgres' };

  it('marks the current page, shows only enabled sections and names the roles', () => {
    host.render(<Frame active="changes" label="Changes" email="author@example.test" roles={['AUTHOR', 'POLICY_AUTHORITY', 'VIEWER']} workspace={workspace}><p>Body</p></Frame>);
    const links = within(screen.getByRole('navigation', { name: 'Main navigation' })).getAllByRole('link').map(link => [link.textContent, link.getAttribute('aria-current')]);
    expect(links).toEqual([['Workspace', null], ['Applications', null], ['Changes', 'page'], ['Resolutions', null], ['Activity', null], ['Verification templates', null], ['Guide', null], ['Support', null]]);
    expect([...document.querySelectorAll('.nav-label')].map(label => label.textContent)).toEqual(['Work', 'Connect', 'Help']);
    expect(new Set([...document.querySelectorAll('.nav a svg')].map(svg => svg.innerHTML)).size).toBe(8);
    expect(screen.getByText('Author · Policy authority · Viewer')).toBeTruthy();
    expect(screen.getByText('AU')).toBeTruthy();
    expect(screen.getByText('Release 0.11.0 · PostgreSQL')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'How Qivvera decides' }).getAttribute('href')).toBe('#/guide');
    expect(document.querySelector('.breadcrumb')!.textContent).toBe('Qivvera   /   Changes');
    expect(document.querySelector('#main > p')!.textContent).toBe('Body');
  });

  it('shows the error page with retry and support links', () => {
    host.render(<ErrorPage message="Application not found." />);
    expect(screen.getByRole('alert').textContent).toBe('Application not found.');
    expect(screen.getByRole('button', { name: 'Try again' }).dataset['action']).toBe('retry');
  });
});

describe('sign-in', () => {
  it('toggles password visibility', () => {
    host.render(<SignInPage error="" signIn={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: 'Show password' });
    fireEvent.click(toggle);
    expect((document.querySelector('#password') as HTMLInputElement).type).toBe('text');
    expect([toggle.textContent, toggle.getAttribute('aria-label')]).toEqual(['Hide', 'Hide password']);
  });

  it('disables the button while signing in and shows a failure', async () => {
    const attempt = deferred<void>();
    const signIn = vi.fn(() => attempt.promise);
    host.render(<SignInPage error="Your session ended. Please sign in again." signIn={signIn} />);
    expect(screen.getByRole('alert').textContent).toBe('Your session ended. Please sign in again.');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.submit(document.querySelector('#login-form')!);
    const button = document.querySelector<HTMLButtonElement>('[type=submit]')!;
    expect([button.disabled, button.textContent]).toEqual([true, 'Signing in…']);
    expect(signIn).toHaveBeenCalledWith({ email: 'a@example.test', password: 'secret' });
    attempt.reject(new Error('Email or password is incorrect.'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Email or password is incorrect.'));
    expect([button.disabled, button.textContent]).toEqual([false, 'Open workspace →']);
  });

  it('shows nothing when the session ended while signing in, because the API client already redrew the page', async () => {
    host.render(<SignInPage error="" signIn={() => Promise.reject(Object.assign(new Error('stale'), { staleSession: true }))} />);
    fireEvent.submit(document.querySelector('#login-form')!);
    await waitFor(() => expect(document.querySelector<HTMLButtonElement>('[type=submit]')!.disabled).toBe(false));
    expect(screen.getByRole('alert').textContent).toBe('');
  });
});
