import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplicationServer } from '../server/app.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
let cachedHandler = null;

const DEFAULT_DB_URL = 'postgresql://neondb_owner:npg_O9fmbwS5UNgW@ep-cold-bar-bdb5agm0-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEFAULT_EMAIL = 'admin@qivvra.com';
const DEFAULT_HASH = 'scrypt:a132aff8fd2c7cb21fae0f7f162ac649:bae8d82a1712fe5401c0ac22542602bdbbb162e935bf403f3ac12b087976454b539a2a2b9f3aceb0da9552b46910cdd5f11fdc80813b13752db895f767a8dd22';

async function getHandler() {
  if (cachedHandler) return cachedHandler;

  let rawOrigin = process.env.PUBLIC_ORIGIN || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  if (rawOrigin && !rawOrigin.startsWith('http://') && !rawOrigin.startsWith('https://')) {
    rawOrigin = 'https://' + rawOrigin;
  }
  let origin = '';
  try {
    origin = new URL(rawOrigin).origin;
  } catch {
    origin = 'http://localhost:3000';
  }
  const webRoot = resolve(__dirname, '..', 'web');

  const databaseUrl = process.env.DATABASE_URL || DEFAULT_DB_URL;
  const ownerEmail = process.env.OWNER_EMAIL || DEFAULT_EMAIL;
  const passwordHash = process.env.OWNER_PASSWORD_HASH || DEFAULT_HASH;

  const { openPostgresRepository } = await import('../server/postgres-repository.mjs');
  const repository = await openPostgresRepository(databaseUrl);

  const server = createApplicationServer({
    repository,
    ownerEmail,
    passwordHash,
    publicOrigin: origin,
    secureCookies: false,
    webRoot
  });

  cachedHandler = server.listeners('request')[0];
  return cachedHandler;
}

process.on('uncaughtException', (err) => {
  console.error('SERVERLESS UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('SERVERLESS UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

export default async function handler(req, res) {
  try {
    const handle = await getHandler();
    return handle(req, res);
  } catch (err) {
    console.error('Serverless function invocation error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'SERVER_ERROR', message: err.message, stack: err.stack }));
  }
}
