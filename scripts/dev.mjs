/** Local development launcher: loads .env.local, starts the app, prints the URL once it is ready. */
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';

// Node gives each resolved address only 250 ms to connect before trying the next. A remote database
// (for example Neon in the US) can take longer from here, so every address fails together with
// AggregateError [ETIMEDOUT]. Allow 1 s per address for local runs only; hosted runtimes are unchanged.
setDefaultAutoSelectFamilyAttemptTimeout(1000);

try { process.loadEnvFile('.env.local'); }
catch { console.error('DEV_SETUP_REQUIRED: create .env.local (local settings) next to package.json.'); process.exit(1); }

// No database configured: start a temporary local PostgreSQL in Docker (removed when you stop).
if (!process.env.DATABASE_URL) {
  const { startPostgresContainer } = await import('./postgres-container.mjs');
  const container = await startPostgresContainer({ label: 'qivvera-dev', database: 'qivvera' });
  Object.assign(process.env, { DATABASE_URL: container.adminUrl, DATABASE_SSL_MODE: 'disable', QIVVERA_MIGRATE_LOCAL: 'true' });
  // The data (and any GitHub token saved in it) is thrown away on stop, so a throwaway encryption key is enough.
  if (!process.env.QIVVERA_CREDENTIAL_KEY) process.env.QIVVERA_CREDENTIAL_KEY = (await import('node:crypto')).randomBytes(32).toString('base64');
  process.on('exit', container.stop);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(0));
  console.log('  Using a temporary local PostgreSQL (Docker). Its data is removed when you stop.');
}

const url = process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${process.env.PORT ?? 3000}`;
await import('../backend/server/start.mjs');

for (let i = 0; i < 50 && !process.exitCode; i++) {
  try {
    const res = await fetch(`${url}/healthz`);
    if (res.ok) {
      console.log(`\n  Qivvera is running locally\n  ➜  Local:  ${url}\n\n  Press Ctrl+C to stop.\n`);
      break;
    }
  } catch { /* server not listening yet */ }
  await new Promise(r => setTimeout(r, 200));
}
