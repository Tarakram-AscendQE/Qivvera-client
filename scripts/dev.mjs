/** Local development launcher: loads .env.local, starts the app, prints the URL once it is ready. */
try { process.loadEnvFile('.env.local'); }
catch { console.error('DEV_SETUP_REQUIRED: create .env.local (local settings) next to package.json.'); process.exit(1); }

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
