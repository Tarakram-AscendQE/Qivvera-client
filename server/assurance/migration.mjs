import {readFileSync} from 'node:fs';
import {digest} from './contracts.mjs';
const sql=readFileSync(new URL('../../migrations/003_assurance_runs.sql',import.meta.url),'utf8');
export const assuranceChecksum=digest(sql);
export async function migrateAssurance(db) {
  await db.transaction(async c=>{
    if(db.driver==='postgres') await c.query('SELECT pg_advisory_xact_lock(78124422)');
    const versions=(await c.query('SELECT * FROM qivvera_migrations ORDER BY version')).rows;
    if(!versions.some(v=>Number(v.version)===2)||versions.some(v=>Number(v.version)>5)) throw new Error('BASE_WORKFLOW_SCHEMA_REQUIRED');
    const prior=versions.find(v=>Number(v.version)===3);
    if(prior){if(prior.checksum!==assuranceChecksum) throw new Error('ASSURANCE_MIGRATION_CHECKSUM_MISMATCH');return;}
    await c.exec(sql);
    await c.query('INSERT INTO qivvera_migrations(version,checksum,applied_at) VALUES(3,$1,$2)',[assuranceChecksum,new Date().toISOString()]);
  });
}
export async function requireAssurance(db){await db.transaction(async c=>{
  const versions=(await c.query('SELECT * FROM qivvera_migrations ORDER BY version')).rows;
  if(!versions.some(v=>Number(v.version)===3&&v.checksum===assuranceChecksum)||versions.some(v=>Number(v.version)>5)) throw new Error('ASSURANCE_MIGRATION_REQUIRED');
},true);}
