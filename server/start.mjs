import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplicationServer } from './app.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

try { process.loadEnvFile(resolve(rootDir, '.env')); } catch {}

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');

const rawOrigin = process.env.PUBLIC_ORIGIN ?? `http://localhost:${port}`;
const origin = rawOrigin.replace(/\/+$/, '');

const databaseUrl = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_O9fmbwS5UNgW@ep-cold-bar-bdb5agm0-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require';
const ownerEmail = process.env.OWNER_EMAIL || 'admin@qivvra.com';
const passwordHash = process.env.OWNER_PASSWORD_HASH || 'scrypt:a132aff8fd2c7cb21fae0f7f162ac649:bae8d82a1712fe5401c0ac22542602bdbbb162e935bf403f3ac12b087976454b539a2a2b9f3aceb0da9552b46910cdd5f11fdc80813b13752db895f767a8dd22';

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
