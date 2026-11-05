import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';
import { createApplicationServer } from '../server/app.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
let cachedHandler = null;

function resolvePasswordHash(raw, fallback) {
  if (!raw || typeof raw !== 'string') return fallback;
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  if (/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(trimmed)) return trimmed;
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(trimmed, salt, 64).toString('hex')}`;
}

const DEFAULT_DB_URL = 'postgresql://neondb_owner:npg_O9fmbwS5UNgW@ep-cold-bar-bdb5agm0-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEFAULT_HASH = 'scrypt:f07b5fc4f5e96ecda7346566ff5fe913:be6f14e94cd848089b0a56002c39c00ae87dbafd4b4ba0edb15d7242116877715e51819d16801585779ae4c8ae7bc8f970b2444eda38c8a1cfd88c4ebf023c5b'; // Qivvera@2026
const LEGACY_HASH = 'scrypt:a132aff8fd2c7cb21fae0f7f162ac649:bae8d82a1712fe5401c0ac22542602bdbbb162e935bf403f3ac12b087976454b539a2a2b9f3aceb0da9552b46910cdd5f11fdc80813b13752db895f767a8dd22'; // Qivvra@2026
const DEFAULT_EMAIL = 'qivvera@admin.com';

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
  const passwordHash = resolvePasswordHash(process.env.OWNER_PASSWORD_HASH || process.env.OWNER_PASSWORD, DEFAULT_HASH);

  const accounts = [
    { email: 'qivvera@admin.com', passwordHash: DEFAULT_HASH },
    { email: 'qivvra@admin.com', passwordHash: DEFAULT_HASH },
    { email: 'admin@qivvera.com', passwordHash: DEFAULT_HASH },
    { email: 'admin@qivvra.com', passwordHash: LEGACY_HASH }
  ];
  if (ownerEmail && passwordHash) {
    accounts.push({ email: ownerEmail, passwordHash });
  }

  const { openPostgresRepository } = await import('../server/postgres-repository.mjs');
  const repository = await openPostgresRepository(databaseUrl);

  const server = createApplicationServer({
    repository,
    ownerEmail,
    passwordHash,
    accounts,
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
