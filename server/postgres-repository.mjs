/** PostgreSQL storage adapter for Qivvera Registry. */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

export class InputError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

export function fields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('INVALID_INPUT', 'Send a JSON object.');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new InputError('UNKNOWN_FIELD', `Unexpected field: ${key}`);
}

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

const appView = r => r && ({
  id: r.id, name: r.name, description: r.description,
  repositoryUrl: r.repository_url, createdAt: new Date(r.created_at).toISOString()
});

const obligationView = r => r && ({
  id: r.id, changeId: r.change_id, statement: r.statement, sourceReference: r.source_reference,
  criticality: r.criticality, authority: 'CANDIDATE', state: 'NOT_ASSESSED', evidenceCount: 0,
  version: r.version, createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString()
});

const changeView = r => r && ({
  id: r.id, applicationId: r.application_id, title: r.title, intent: r.intent,
  sourceRevision: r.source_revision || null, sourceBinding: 'DECLARED_NOT_VERIFIED',
  producer: r.producer, createdAt: new Date(r.created_at).toISOString(),
  assessmentStatus: 'NOT_ASSESSED', disposition: null
});

export async function openPostgresRepository(rawConnectionString) {
  // Strip channel_binding if present as it is not supported by pure JS node-postgres
  const connectionString = rawConnectionString.replace(/([?&])channel_binding=[^&]*(&|$)/g, '$1').replace(/[?&]$/, '');
  const needsSsl = connectionString.includes('sslmode=require') || connectionString.includes('neon.tech') || connectionString.includes('supabase.co') || process.env.NODE_ENV === 'production';
  const pool = new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Auto-initialize schema on connection
  const schemaSql = readFileSync(resolve(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(schemaSql);

  const getApp = async (id) => {
    const res = await pool.query('SELECT * FROM applications WHERE id = $1', [id]);
    return appView(res.rows[0]);
  };

  const getChange = async (id) => {
    const changeRes = await pool.query('SELECT * FROM changes WHERE id = $1', [id]);
    if (!changeRes.rows[0]) return null;
    const oblsRes = await pool.query('SELECT * FROM obligations WHERE change_id = $1 ORDER BY created_at, id', [id]);
    return {
      ...changeView(changeRes.rows[0]),
      obligations: oblsRes.rows.map(obligationView)
    };
  };

  const audit = async (client, actor, action, entityId, detail, time) => {
    await client.query(
      'INSERT INTO activity (id, actor, action, entity_id, detail, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [randomUUID(), actor, action, entityId, detail, time]
    );
  };

  return {
    isAsync: true,
    close: async () => pool.end(),
    healthy: async () => {
      try {
        const res = await pool.query('SELECT 1 AS ok');
        return res.rows[0]?.ok === 1;
      } catch { return false; }
    },
    listApplications: async () => {
      const res = await pool.query('SELECT * FROM applications ORDER BY created_at DESC, id');
      return res.rows.map(appView);
    },
    listChanges: async () => {
      const res = await pool.query(`
        SELECT c.*, (SELECT COUNT(*)::int FROM obligations o WHERE o.change_id = c.id) AS obligation_count
        FROM changes c ORDER BY c.created_at DESC, c.id
      `);
      return res.rows.map(r => ({ ...changeView(r), obligationCount: r.obligation_count }));
    },
    getApplication: getApp,
    getChange,
    listActivity: async () => {
      const res = await pool.query('SELECT * FROM activity ORDER BY created_at DESC LIMIT 100');
      return res.rows.map(r => ({
        id: r.id, actor: r.actor, action: r.action, entityId: r.entity_id,
        detail: r.detail, createdAt: new Date(r.created_at).toISOString()
      }));
    },
    createApplication: async (input, actor) => {
      const a = applicationInput(input), id = randomUUID(), now = new Date().toISOString();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const existing = await client.query('SELECT id FROM applications WHERE normalized_name = $1', [a.name.toLocaleLowerCase('en-US')]);
        if (existing.rows.length) throw new InputError('DUPLICATE_APPLICATION', 'An application with this name already exists.', 409);
        await client.query(
          'INSERT INTO applications (id, name, normalized_name, description, repository_url, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [id, a.name, a.name.toLocaleLowerCase('en-US'), a.description, a.repositoryUrl, now]
        );
        await audit(client, actor, 'APPLICATION_CREATED', id, `Registered ${a.name}`, now);
        await client.query('COMMIT');
        return getApp(id);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally { client.release(); }
    },
    createChange: async (input, actor) => {
      const c = changeInput(input), id = randomUUID(), now = new Date().toISOString();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const app = await client.query('SELECT id FROM applications WHERE id = $1', [c.applicationId]);
        if (!app.rows.length) throw new InputError('APPLICATION_NOT_FOUND', 'Select an existing application.', 404);
        await client.query(
          'INSERT INTO changes (id, application_id, title, intent, source_revision, producer, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [id, c.applicationId, c.title, c.intent, c.sourceRevision, c.producer, now]
        );
        await audit(client, actor, 'CHANGE_CREATED', id, `Created ${c.title}`, now);
        await client.query('COMMIT');
        return getChange(id);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally { client.release(); }
    },
    addObligation: async (changeId, input, actor) => {
      const o = obligationInput(input), id = randomUUID(), now = new Date().toISOString();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const change = await client.query('SELECT id FROM changes WHERE id = $1', [changeId]);
        if (!change.rows.length) throw new InputError('CHANGE_NOT_FOUND', 'This change was not found.', 404);
        await client.query(
          'INSERT INTO obligations (id, change_id, statement, source_reference, criticality, version, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, 1, $6, $6)',
          [id, changeId, o.statement, o.sourceReference, o.criticality, now]
        );
        await audit(client, actor, 'OBLIGATION_PROPOSED', id, `Proposed: ${o.statement}`, now);
        await client.query('COMMIT');
        const res = await pool.query('SELECT * FROM obligations WHERE id = $1', [id]);
        return obligationView(res.rows[0]);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally { client.release(); }
    },
    editObligation: async (id, input, actor) => {
      const o = obligationInput(input, true), now = new Date().toISOString();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const oldRes = await client.query('SELECT * FROM obligations WHERE id = $1', [id]);
        const old = oldRes.rows[0];
        if (!old) throw new InputError('OBLIGATION_NOT_FOUND', 'This obligation was not found.', 404);
        if (old.version !== input.version) throw new InputError('VERSION_CONFLICT', 'This draft changed elsewhere. Reload it before saving.', 409);
        await client.query(
          'UPDATE obligations SET statement = $1, source_reference = $2, criticality = $3, version = version + 1, updated_at = $4 WHERE id = $5',
          [o.statement, o.sourceReference, o.criticality, now, id]
        );
        await audit(client, actor, 'OBLIGATION_UPDATED', id, JSON.stringify({ before: obligationView(old), after: { ...o, version: old.version + 1 } }), now);
        await client.query('COMMIT');
        const res = await pool.query('SELECT * FROM obligations WHERE id = $1', [id]);
        return obligationView(res.rows[0]);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally { client.release(); }
    },
    exportWorkspace: async () => {
      const apps = await pool.query('SELECT * FROM applications ORDER BY created_at DESC, id');
      const changes = await pool.query('SELECT * FROM changes ORDER BY created_at DESC, id');
      const act = await pool.query('SELECT * FROM activity ORDER BY created_at DESC LIMIT 100');
      const fullChanges = await Promise.all(changes.rows.map(c => getChange(c.id)));
      return {
        schemaVersion: 1, exportedAt: new Date().toISOString(),
        applications: apps.rows.map(appView), changes: fullChanges,
        activity: act.rows.map(r => ({
          id: r.id, actor: r.actor, action: r.action, entityId: r.entity_id,
          detail: r.detail, createdAt: new Date(r.created_at).toISOString()
        })),
        notice: 'Workspace records only. Sourced from PostgreSQL storage.'
      };
    },
    saveSession: async (tokenHash, email, csrfToken, expiresAt) => {
      await pool.query(
        'INSERT INTO sessions (token_hash, email, csrf_token, expires_at) VALUES ($1, $2, $3, $4) ON CONFLICT (token_hash) DO UPDATE SET expires_at = $4',
        [tokenHash, email, csrfToken, new Date(expiresAt).toISOString()]
      );
    },
    getSession: async (tokenHash) => {
      const res = await pool.query('SELECT * FROM sessions WHERE token_hash = $1 AND expires_at > now()', [tokenHash]);
      if (!res.rows[0]) return null;
      return {
        email: res.rows[0].email,
        csrfToken: res.rows[0].csrf_token,
        expiresAt: new Date(res.rows[0].expires_at).getTime()
      };
    },
    deleteSession: async (tokenHash) => {
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    }
  };
}
