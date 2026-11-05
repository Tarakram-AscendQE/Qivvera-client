import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';
import { createApplicationServer } from './app.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

try { process.loadEnvFile(resolve(rootDir, '.env')); } catch {}

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');

let rawOrigin = process.env.PUBLIC_ORIGIN || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${port}`);
if (rawOrigin && !rawOrigin.startsWith('http://') && !rawOrigin.startsWith('https://')) {
  rawOrigin = 'https://' + rawOrigin;
}
let origin = '';
try {
  origin = new URL(rawOrigin).origin;
} catch {
  origin = `http://localhost:${port}`;
}

function resolvePasswordHash(raw, fallback) {
  if (!raw || typeof raw !== 'string') return fallback;
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  if (/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(trimmed)) return trimmed;
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(trimmed, salt, 64).toString('hex')}`;
}

const defaultHash = 'scrypt:f07b5fc4f5e96ecda7346566ff5fe913:be6f14e94cd848089b0a56002c39c00ae87dbafd4b4ba0edb15d7242116877715e51819d16801585779ae4c8ae7bc8f970b2444eda38c8a1cfd88c4ebf023c5b'; // Qivvera@2026
const legacyHash = 'scrypt:a132aff8fd2c7cb21fae0f7f162ac649:bae8d82a1712fe5401c0ac22542602bdbbb162e935bf403f3ac12b087976454b539a2a2b9f3aceb0da9552b46910cdd5f11fdc80813b13752db895f767a8dd22'; // Qivvra@2026

const databaseUrl = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_O9fmbwS5UNgW@ep-cold-bar-bdb5agm0-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require';
const ownerEmail = process.env.OWNER_EMAIL || 'qivvera@admin.com';
const passwordHash = resolvePasswordHash(process.env.OWNER_PASSWORD_HASH || process.env.OWNER_PASSWORD, defaultHash);

const accounts = [
  { email: 'qivvera@admin.com', passwordHash: defaultHash },
  { email: 'qivvra@admin.com', passwordHash: defaultHash },
  { email: 'admin@qivvera.com', passwordHash: defaultHash },
  { email: 'admin@qivvra.com', passwordHash: legacyHash }
];
if (ownerEmail && passwordHash) {
  accounts.push({ email: ownerEmail, passwordHash });
}

let repository;
if (databaseUrl) {
  const { openPostgresRepository } = await import('./postgres-repository.mjs');
  repository = await openPostgresRepository(databaseUrl);
} else {
  const { openRepository } = await import('./repository.mjs');
  repository = openRepository(process.env.DATABASE_PATH ? resolve(process.env.DATABASE_PATH) : resolve(rootDir, 'data/qivvera.sqlite'));
}

const server = createApplicationServer({
  repository,
  ownerEmail,
  passwordHash,
  accounts,
  publicOrigin: origin,
  webRoot: resolve(rootDir, 'web')
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

server.listen(port,host,()=>console.log(`Qivvera registry listening on ${origin} using ${process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite'}`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>{repository.close();process.exit(0);}));
