import {readFileSync} from 'node:fs';
import {digest} from '../assurance/contracts.mjs';
import {migrateAssurance} from '../assurance/migration.mjs';
import {migrateResolution,requireResolution} from '../resolution/migration.mjs';
const sql=readFileSync(new URL('../../migrations/005_source_intake.sql',import.meta.url),'utf8');
export const intakeChecksum=digest(sql);
export async function migrateIntake(db){
 await migrateAssurance(db);await migrateResolution(db);
 return db.transaction(async c=>{
  if(db.driver==='postgres')await c.query('SELECT pg_advisory_xact_lock(78124422)');
  const rows=(await c.query('SELECT * FROM qivvera_migrations ORDER BY version')).rows;
  if(rows.some(r=>Number(r.version)>5))throw new Error('SCHEMA_NEWER_THAN_APPLICATION');
  const old=rows.find(r=>Number(r.version)===5);
  if(old){if(old.checksum!==intakeChecksum)throw new Error('INTAKE_CHECKSUM_MISMATCH');return;}
  await c.exec(sql);await c.query('INSERT INTO qivvera_migrations(version,checksum,applied_at) VALUES(5,$1,$2)',[intakeChecksum,new Date().toISOString()]);
 });
}
export async function requireIntake(db){await requireResolution(db);return db.transaction(async c=>{
 const rows=(await c.query('SELECT * FROM qivvera_migrations ORDER BY version')).rows;
 if(!rows.some(r=>Number(r.version)===5&&r.checksum===intakeChecksum)||rows.some(r=>Number(r.version)>5))throw new Error('INTAKE_MIGRATION_REQUIRED');
},true);}
