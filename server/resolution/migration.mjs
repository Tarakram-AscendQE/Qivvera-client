import {readFileSync} from 'node:fs';
import {digest} from '../assurance/contracts.mjs';
import {requireAssurance} from '../assurance/migration.mjs';
const sql=readFileSync(new URL('../../migrations/004_resolution_workflow.sql',import.meta.url),'utf8');
export const resolutionChecksum=digest(sql);
export async function migrateResolution(db){
  await requireAssurance(db);
  return db.transaction(async c=>{
    if(db.driver==='postgres')await c.query('SELECT pg_advisory_xact_lock(78124422)');
    const versions=(await c.query('SELECT * FROM qivvera_migrations ORDER BY version')).rows;
    if(versions.some(v=>Number(v.version)>6))throw new Error('SCHEMA_NEWER_THAN_APPLICATION');
    const old=versions.find(v=>Number(v.version)===4);
    if(old){if(old.checksum!==resolutionChecksum)throw new Error('RESOLUTION_MIGRATION_CHECKSUM_MISMATCH');return;}
    await c.exec(sql);
    await c.query('INSERT INTO qivvera_migrations(version,checksum,applied_at) VALUES(4,$1,$2)',[resolutionChecksum,new Date().toISOString()]);
  });
}
export async function requireResolution(db){
  await requireAssurance(db);
  return db.transaction(async c=>{
    const versions=(await c.query('SELECT * FROM qivvera_migrations ORDER BY version')).rows;
    if(!versions.some(v=>Number(v.version)===4&&v.checksum===resolutionChecksum)||versions.some(v=>Number(v.version)>6))throw new Error('RESOLUTION_MIGRATION_REQUIRED');
  },true);
}
