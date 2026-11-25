/** Shown inside the frame when a view cannot be opened. "Try again" re-reads the workspace and the view. */
export function ErrorPage({ message }: { message: string }) {
  return (
    <section className="panel error-page">
      <h2>We could not open this view</h2>
      <p role="alert">{message}</p>
      <div className="actions"><button className="button" data-action="retry">Try again</button><a className="button" href="#/overview">Open workspace</a><a className="button" href="#/support">Get support details</a></div>
      <p className="small">If a save was interrupted, check the record before submitting the same action again.</p>
    </section>
  );
}

/** Shown when Qivvera cannot start (before any sign-in). "Try again" restarts it. */
export function StartupErrorPage({ message }: { message: string }) {
  return (
    <main id="main" className="main">
      <section className="panel error-page">
        <h1>Qivvera could not be opened</h1>
        <p role="alert">{message}</p>
        <button className="button primary" data-action="retry">Try again</button>
        <p className="small">Your workspace operator can investigate if the service remains unavailable. No sign-in attempt was submitted.</p>
      </section>
    </main>
  );
}
