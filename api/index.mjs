import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPostgresRepository } from '../server/postgres-repository.mjs';
import { openRepository } from '../server/repository.mjs';
import { createApplicationServer } from '../server/app.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
let cachedHandler = null;

async function getHandler() {
  if (cachedHandler) return cachedHandler;

  const origin = process.env.PUBLIC_ORIGIN || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const webRoot = resolve(__dirname, '..', 'web');

  const repository = process.env.DATABASE_URL
    ? await openPostgresRepository(process.env.DATABASE_URL)
    : openRepository(resolve('/tmp', 'qivvera.sqlite'));

  const server = createApplicationServer({
    repository,
    ownerEmail: process.env.OWNER_EMAIL,
    passwordHash: process.env.OWNER_PASSWORD_HASH,
    publicOrigin: origin,
    secureCookies: process.env.NODE_ENV === 'production',
    webRoot
  });

  cachedHandler = server.listeners('request')[0];
  return cachedHandler;
}

export default async function handler(req, res) {
  const handle = await getHandler();
  return handle(req, res);
}

