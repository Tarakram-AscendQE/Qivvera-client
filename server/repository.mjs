/** Local review storage adapter. Not an immutable evidence store or a production database service. */
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { InputError, fields } from './errors.mjs';

export { InputError, fields };
function text(value, name, max, required = true) {
  if (!required && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) {
    throw new InputError('INVALID_FIELD', `${name} must contain ${required ? '1' : '0'}–${max} readable characters.`);
  }
  return value.trim();
}
function applicationInput(input) {
  fields(input, ['name', 'description', 'repositoryUrl']);
  const name = text(input.name, 'Application name', 100);
  const description = text(input.description, 'Description', 1000, false);
  const repositoryUrl = text(input.repositoryUrl, 'Repository URL', 500, false);
  if (repositoryUrl) {
    let u; try { u = new URL(repositoryUrl); } catch { throw new InputError('INVALID_URL', 'Use a valid HTTPS repository URL.'); }
    if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.search) throw new InputError('INVALID_URL', 'Use an HTTPS repository URL without credentials or query parameters.');
  }
  return { name, description, repositoryUrl };
}
function changeInput(input) {
  fields(input, ['applicationId', 'title', 'intent', 'sourceRevision', 'producer']);
  const producer = input.producer ?? 'UNSPECIFIED';
  if (!['AI_ASSISTED', 'HUMAN', 'AUTOMATION', 'UNSPECIFIED'].includes(producer)) throw new InputError('INVALID_PRODUCER', 'Choose a supported producer category.');
  const sourceRevision = text(input.sourceRevision, 'Source revision', 64, false);
  if (sourceRevision && !/^[a-fA-F0-9]{7,64}$/.test(sourceRevision)) throw new InputError('INVALID_REVISION', 'Enter a Git commit reference of 7–64 hexadecimal characters, or leave it blank.');
  return {
    applicationId: text(input.applicationId, 'Application', 64), title: text(input.title, 'Change title', 160),
    intent: text(input.intent, 'Business intent', 4000, false), sourceRevision: sourceRevision.toLowerCase(), producer,
  };
}
function obligationInput(input, edit = false) {
  fields(input, edit ? ['statement', 'sourceReference', 'criticality', 'version'] : ['statement', 'sourceReference', 'criticality']);
  const criticality = input.criticality ?? 'MEDIUM';
  if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(criticality)) throw new InputError('INVALID_CRITICALITY', 'Choose a supported proposed criticality.');
  if (edit && (!Number.isInteger(input.version) || input.version < 1)) throw new InputError('INVALID_VERSION', 'A current draft version is required.');
  return { statement: text(input.statement, 'Obligation', 1200), sourceReference: text(input.sourceReference, 'Source reference', 500, false), criticality };
}
const appView = r => r && ({id:r.id,name:r.name,description:r.description,repositoryUrl:r.repository_url,createdAt:r.created_at});
const obligationView = r => r && ({id:r.id,changeId:r.change_id,statement:r.statement,sourceReference:r.source_reference,criticality:r.criticality,authority:'CANDIDATE',state:'NOT_ASSESSED',evidenceCount:0,version:r.version,createdAt:r.created_at,updatedAt:r.updated_at});
const changeView = r => r && ({id:r.id,applicationId:r.application_id,title:r.title,intent:r.intent,sourceRevision:r.source_revision || null,sourceBinding:'DECLARED_NOT_VERIFIED',producer:r.producer,createdAt:r.created_at,assessmentStatus:'NOT_ASSESSED',disposition:null});

let DatabaseSync;
try {
  const sqlite = await import('node:sqlite');
  DatabaseSync = sqlite.DatabaseSync;
} catch {}

export function openRepository(path) {
  if (!DatabaseSync) throw new Error('SQLite is not available in this Node runtime. Use PostgreSQL with DATABASE_URL.');
  if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true,mode:0o700});
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 1) { db.close(); throw new Error('Database schema is newer than this application.'); }
  if (version === 0) db.exec(`BEGIN;
    CREATE TABLE applications (id TEXT PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL UNIQUE, description TEXT NOT NULL, repository_url TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE changes (id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id), title TEXT NOT NULL, intent TEXT NOT NULL, source_revision TEXT NOT NULL, producer TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE obligations (id TEXT PRIMARY KEY, change_id TEXT NOT NULL REFERENCES changes(id), statement TEXT NOT NULL, source_reference TEXT NOT NULL, criticality TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE activity (id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, entity_id TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX changes_application ON changes(application_id);
    CREATE INDEX obligations_change ON obligations(change_id);
    CREATE INDEX activity_time ON activity(created_at);
    PRAGMA user_version = 1;
    COMMIT;`);
  const tx = fn => { db.exec('BEGIN IMMEDIATE'); try {const v=fn(); db.exec('COMMIT'); return v;} catch(e) {db.exec('ROLLBACK'); throw e;} };
  const audit = (actor,action,entityId,detail,time) => db.prepare('INSERT INTO activity VALUES (?,?,?,?,?,?)').run(randomUUID(), actor, action, entityId, detail, time);
  const getApp = id => appView(db.prepare('SELECT * FROM applications WHERE id=?').get(id));
  const getChange = id => {
    const row = db.prepare('SELECT * FROM changes WHERE id=?').get(id);
    if (!row) return null;
    return {...changeView(row), obligations:db.prepare('SELECT * FROM obligations WHERE change_id=? ORDER BY created_at,id').all(id).map(obligationView)};
  };
  return {
    close: () => db.close(),
    healthy: () => db.prepare('SELECT 1 AS ok').get().ok === 1,
    listApplications: () => db.prepare('SELECT * FROM applications ORDER BY created_at DESC,id').all().map(appView),
    listChanges: () => db.prepare('SELECT c.*, (SELECT COUNT(*) FROM obligations o WHERE o.change_id=c.id) AS obligation_count FROM changes c ORDER BY c.created_at DESC,c.id').all().map(r=>({...changeView(r),obligationCount:r.obligation_count})),
    getApplication:getApp, getChange,
    listActivity: () => db.prepare('SELECT * FROM activity ORDER BY created_at DESC,rowid DESC LIMIT 100').all().map(r=>({id:r.id,actor:r.actor,action:r.action,entityId:r.entity_id,detail:r.detail,createdAt:r.created_at})),
    createApplication(input, actor) {
      const a=applicationInput(input), id=randomUUID(), now=new Date().toISOString();
      return tx(()=>{
        if(db.prepare('SELECT id FROM applications WHERE normalized_name=?').get(a.name.toLocaleLowerCase('en-US'))) throw new InputError('DUPLICATE_APPLICATION','An application with this name already exists.',409);
        db.prepare('INSERT INTO applications VALUES (?,?,?,?,?,?)').run(id,a.name,a.name.toLocaleLowerCase('en-US'),a.description,a.repositoryUrl,now);
        audit(actor,'APPLICATION_CREATED',id,`Registered ${a.name}`,now); return getApp(id);
      });
    },
    createChange(input, actor) {
      const c=changeInput(input), id=randomUUID(), now=new Date().toISOString();
      return tx(()=>{
        if(!getApp(c.applicationId)) throw new InputError('APPLICATION_NOT_FOUND','Select an existing application.',404);
        db.prepare('INSERT INTO changes VALUES (?,?,?,?,?,?,?)').run(id,c.applicationId,c.title,c.intent,c.sourceRevision,c.producer,now);
        audit(actor,'CHANGE_CREATED',id,`Created ${c.title}`,now); return getChange(id);
      });
    },
    addObligation(changeId,input,actor) {
      const o=obligationInput(input), id=randomUUID(), now=new Date().toISOString();
      return tx(()=>{
        if(!getChange(changeId)) throw new InputError('CHANGE_NOT_FOUND','This change was not found.',404);
        db.prepare('INSERT INTO obligations VALUES (?,?,?,?,?,?,?,?)').run(id,changeId,o.statement,o.sourceReference,o.criticality,1,now,now);
        audit(actor,'OBLIGATION_PROPOSED',id,`Proposed: ${o.statement}`,now);
        return obligationView(db.prepare('SELECT * FROM obligations WHERE id=?').get(id));
      });
    },
    editObligation(id,input,actor) {
      const o=obligationInput(input,true), now=new Date().toISOString();
      return tx(()=>{
        const old=db.prepare('SELECT * FROM obligations WHERE id=?').get(id);
        if(!old) throw new InputError('OBLIGATION_NOT_FOUND','This obligation was not found.',404);
        if(old.version!==input.version) throw new InputError('VERSION_CONFLICT','This draft changed elsewhere. Reload it before saving.',409);
        db.prepare('UPDATE obligations SET statement=?,source_reference=?,criticality=?,version=version+1,updated_at=? WHERE id=?').run(o.statement,o.sourceReference,o.criticality,now,id);
        audit(actor,'OBLIGATION_UPDATED',id,JSON.stringify({before:obligationView(old),after:{...o,version:old.version+1}}),now);
        return obligationView(db.prepare('SELECT * FROM obligations WHERE id=?').get(id));
      });
    },
    exportWorkspace() {
      return {schemaVersion:1,exportedAt:new Date().toISOString(),applications:this.listApplications(),changes:this.listChanges().map(c=>getChange(c.id)),activity:this.listActivity(),notice:'Workspace records only. Not an assurance-evidence bundle. Activity is limited to the latest 100 entries.'};
    },
  };
}
