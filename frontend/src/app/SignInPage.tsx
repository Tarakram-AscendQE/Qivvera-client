import { useState, type FormEvent } from 'react';
import { isSessionEnded } from '../shell-contract';
import { Logo } from './Logo';

/**
 * Sign-in. `signIn` opens the session and draws the workspace; while it runs the button is disabled.
 * An error is shown unless the API client already replaced this view (ended or stale session).
 */
export function SignInPage({ error, signIn }: { error: string; signIn: (fields: Record<string, string>) => Promise<void> }) {
  const [message, setMessage] = useState(error);
  const [passwordVisible, setPasswordVisible] = useState(false);
  // The first label keeps the non-breaking space of the original markup; after an attempt it is plain.
  const [button, setButton] = useState({ busy: false, label: 'Open workspace \u00a0→' });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    setButton({ busy: true, label: 'Signing in…' });
    try {
      await signIn(fields);
    } catch (failure) {
      if (!isSessionEnded(failure)) setMessage((failure as Error).message);
    } finally {
      setButton({ busy: false, label: 'Open workspace →' });
    }
  }

  return (
    <main className="login-layout" id="main">
      <section className="login-story">
        <div className="brand"><Logo /></div>
        <div className="login-message">
          <div className="eyebrow">Independent Change Assurance</div>
          <h1>Confidence needs<br />more than a<br />green pipeline.</h1>
          <p>Start with the change. Establish what must be true. Keep the evidence — and the uncertainty — visible.</p>
        </div>
        <div className="chain">{'CHANGE \u00a0→\u00a0 OBLIGATIONS \u00a0→\u00a0 EVIDENCE \u00a0→\u00a0 GAPS \u00a0→\u00a0 DISPOSITION'}</div>
      </section>
      <section className="login-panel">
        <form id="login-form" onSubmit={event => void submit(event)}>
          <div className="eyebrow">Your review workspace</div>
          <h2>Welcome to Qivvera</h2>
          <p className="sub">Sign in to organize applications, changes, and assurance obligations.</p>
          <div className="form-error" role="alert">{message}</div>
          <div className="form-field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="username" required /></div>
          <div className="form-field">
            <label htmlFor="password">Password</label>
            <div className="input-with-eye">
              <input id="password" name="password" type={passwordVisible ? 'text' : 'password'} autoComplete="current-password" maxLength={256} required />
              <button type="button" className="eye-btn" id="toggle-password" aria-label={passwordVisible ? 'Hide password' : 'Show password'} onClick={() => setPasswordVisible(visible => !visible)}>{passwordVisible ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          <button className="button primary" type="submit" disabled={button.busy}>{button.label}</button>
          <div className="login-note">Increment 10 · Assurance workflow improvements<br />Review requirements, run supported checks, and inspect scope-bound conclusions. Use non-sensitive review data. For access or password help, contact the workspace operator who provided your account.</div>
        </form>
      </section>
    </main>
  );
}
