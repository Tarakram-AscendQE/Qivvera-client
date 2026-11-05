import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRepository } from './repository.mjs';
import { createApplicationServer } from './app.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

try { process.loadEnvFile(resolve(rootDir, '.env')); } catch {}

const host=process.env.HOST??'0.0.0.0',port=Number(process.env.PORT??5000);
if(!Number.isInteger(port)||port<1||port>65535) throw new Error('Invalid PORT.');

const origin=process.env.PUBLIC_ORIGIN??`http://localhost:${port}`;

let repository;
if (process.env.DATABASE_URL) {
  const { openPostgresRepository } = await import('./postgres-repository.mjs');
  repository = await openPostgresRepository(process.env.DATABASE_URL);
} else {
  repository = openRepository(process.env.DATABASE_PATH ? resolve(process.env.DATABASE_PATH) : resolve(rootDir, 'data/qivvera.sqlite'));
}

const server=createApplicationServer({
  repository,
  ownerEmail:process.env.OWNER_EMAIL,
  passwordHash:process.env.OWNER_PASSWORD_HASH,
  publicOrigin:origin,
  webRoot:resolve(rootDir, 'web')
});
server.listen(port,host,()=>console.log(`Qivvera registry listening on ${origin} using ${process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite'}`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>{repository.close();process.exit(0);}));
