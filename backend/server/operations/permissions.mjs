/** Read-only audit of the cumulative schema-8 runtime privilege contract. */
import { TABLES, databaseConfig, connectDatabase, beginReadSnapshot, databaseIdentity,
    requireCurrentSchema, digestJSON, releaseIdentity, fail, OperationsError } from './common.mjs';

const permission = (select = false, insert = false, update = [], remove = false) =>
    Object.freeze({ select, insert, update: Object.freeze(update), delete: remove });
const web = Object.fromEntries(TABLES.map(table => [table, permission(true, !['qivvera_migrations', 'assurance_evidence'].includes(table))]));
Object.assign(web, {
    changes: permission(true, true, ['id']),
    obligations: permission(true, true, ['statement', 'source_reference', 'criticality', 'version', 'updated_at']),
    obligation_workflow: permission(true, true, ['source_version', 'review_state', 'last_edited_by', 'proposed_by', 'imported']),
    workspace_sessions: permission(true, true, [], true),
    auth_buckets: permission(true, true, ['attempt_count', 'reset_at'], true),
    assurance_runs: permission(true, true, ['status', 'finished_at', 'failure_code', 'lease_hash']),
    resolution_items: permission(true, true, ['assigned_to', 'action_plan', 'external_reference', 'status', 'version',
        'correction_revision_id', 'correction_obligation_id', 'correction_note', 'correction_proposed_by',
        'correction_proposed_at', 'correction_run_floor', 'linked_run_id', 'verification_snapshot', 'verified_by', 'verified_at', 'updated_at']),
    resolution_challenges: permission(true, true, ['state', 'response', 'responded_by', 'response_reason', 'independent_actor', 'responded_at']),
    source_previews: permission(true, true, ['import_id', 'request_digest'], true),
    source_backoff: permission(true, true, ['retry_after']),
    drafting_runs: permission(true, true, ['status', 'result_snapshot', 'result_digest', 'failure_code', 'completed_at']),
    drafting_suggestions: permission(true, true, ['status', 'version', 'decision_snapshot', 'decision_digest', 'decision_request_digest', 'obligation_id']),
    verification_templates: permission(true, true, ['state', 'state_version', 'archived_by', 'archived_at', 'archive_rationale', 'archive_request_key']),
    // Accounts are administered by the operator; the web runtime only reads them and records sign-in time.
    workspace_users: permission(true, false, ['last_login_at']),
    workspace_user_roles: permission(true, false)
});
const workerReads = new Set(['applications', 'changes', 'change_revisions', 'obligations', 'obligation_workflow',
    'obligation_history', 'qivvera_migrations', 'assurance_plans', 'assurance_runs', 'assurance_evidence']);
const worker = Object.fromEntries(TABLES.map(table => [table, permission(workerReads.has(table), ['assurance_evidence', 'activity'].includes(table))]));
worker.assurance_runs = permission(true, false, ['status', 'started_at', 'finished_at', 'lease_until', 'lease_hash', 'worker_id', 'failure_code']);
export const RUNTIME_PERMISSION_POLICY = Object.freeze({ web: Object.freeze(web), worker: Object.freeze(worker) });

export function validatePermissionInputs({ webConnectionString, workerConnectionString, sslMode = 'verify-full', ca, releaseRevision } = {}) {
    const webConfig = databaseConfig(webConnectionString, { sslMode, ca });
    const workerConfig = databaseConfig(workerConnectionString, { sslMode, ca });
    if (webConfig.identity !== workerConfig.identity) fail('RUNTIME_DATABASE_IDENTITY_MISMATCH');
    if (webConfig.username === workerConfig.username) fail('RUNTIME_ROLES_MUST_BE_DISTINCT');
    return { webConfig, workerConfig, releaseRevision: releaseIdentity(releaseRevision) };
}

async function inspectRole(client, label, expected) {
    const identity = await databaseIdentity(client);
    if (identity.database !== expected.database || identity.role !== expected.username || identity.login !== expected.username)
        fail('RUNTIME_LOGIN_IDENTITY_MISMATCH');
    if (identity.version < 160000) fail('PERMISSION_AUDIT_REQUIRES_POSTGRES_16_OR_LATER');
    const violations = [];
    const record = (code, details = {}) => violations.push({ code, ...details });
    // A single snapshot includes migration state, role membership, ownership and all effective grants.
    const schema = (await client.query(`SELECT c.oid,c.relname AS name,c.relowner,c.relrowsecurity,c.relforcerowsecurity
        FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname COLLATE "C"`)).rows;
    const names = schema.map(row => row.name);
    if (JSON.stringify(names) !== JSON.stringify(TABLES)) record('SCHEMA_TABLE_SET_MISMATCH');
    // Only the web role reads all migrations; the restricted worker can read the migration table too.
    await client.query('SAVEPOINT migration_read');
    try { await requireCurrentSchema(client); } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT migration_read');
        if (error instanceof OperationsError) record(error.code);
        else if (error.code === '42501') record('MIGRATION_READ_PERMISSION_MISSING');
        else throw error;
    } finally { await client.query('RELEASE SAVEPOINT migration_read'); }
    const functions = (await client.query(`SELECT COUNT(*)::integer AS count FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'`)).rows[0].count;
    const triggers = (await client.query(`SELECT COUNT(*)::integer AS count FROM pg_catalog.pg_trigger t
        JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND NOT t.tgisinternal`)).rows[0].count;
    if (functions || triggers) record('UNREVIEWED_PUBLIC_EXECUTABLE_OBJECTS');

    const roles = (await client.query(`SELECT r.oid,r.rolname,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls,
        r.oid=current_user::regrole::oid AS is_current,
        pg_catalog.pg_has_role(current_user,r.oid,'MEMBER WITH ADMIN OPTION') AS admin_option
        FROM pg_catalog.pg_roles r WHERE r.oid=current_user::regrole::oid
        OR pg_catalog.pg_has_role(current_user,r.oid,'USAGE') OR pg_catalog.pg_has_role(current_user,r.oid,'SET')
        OR pg_catalog.pg_has_role(current_user,r.oid,'MEMBER WITH ADMIN OPTION') ORDER BY r.oid LIMIT 65`)).rows;
    if (roles.length > 64) { record('ROLE_GRAPH_EXCEEDS_AUDIT_LIMIT'); return { identity, violations, inspectedRoles: roles.length }; }
    const columns = (await client.query(`SELECT c.oid AS table_oid,c.relname AS table_name,a.attnum,a.attname AS name
        FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
        WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname,a.attnum`)).rows;
    for (const role of roles) {
        const via = role.is_current ? 'current-or-inherited' : 'available-role';
        if (role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.rolbypassrls)
            record('PRIVILEGED_RUNTIME_ROLE', { via });
        if (!role.is_current && role.admin_option) record('ROLE_ADMIN_OPTION', { via });
        const ownership = (await client.query(`SELECT
            (SELECT datdba=$1 FROM pg_catalog.pg_database WHERE datname=current_database()) AS database_owner,
            (SELECT nspowner=$1 FROM pg_catalog.pg_namespace WHERE nspname='public') AS schema_owner,
            pg_catalog.has_database_privilege($1::oid,current_database(),'CREATE') AS database_create,
            pg_catalog.has_schema_privilege($1::oid,'public','CREATE') AS schema_create,
            pg_catalog.has_schema_privilege($1::oid,'public','USAGE') AS schema_usage`, [role.oid])).rows[0];
        if (ownership.database_owner || ownership.schema_owner) record('RUNTIME_OWNS_DATABASE_OR_SCHEMA', { via });
        if (ownership.database_create || ownership.schema_create) record('RUNTIME_CAN_CREATE_SCHEMA_OBJECTS', { via });
        if (role.is_current && !ownership.schema_usage) record('MISSING_SCHEMA_USAGE');
        for (const relation of schema) {
            if (Number(relation.relowner) === Number(role.oid)) record('RUNTIME_OWNS_TABLE', { table: relation.name, via });
            if (relation.relrowsecurity || relation.relforcerowsecurity) record('UNREVIEWED_ROW_SECURITY', { table: relation.name });
        }
        const tableRights = (await client.query(`SELECT c.relname AS table_name,
            pg_catalog.has_table_privilege($1::oid,c.oid,'DELETE') AS remove,
            pg_catalog.has_table_privilege($1::oid,c.oid,'TRUNCATE') AS truncate,
            pg_catalog.has_table_privilege($1::oid,c.oid,'TRIGGER') AS trigger,
            pg_catalog.has_table_privilege($1::oid,c.oid,'REFERENCES') AS reference
            ${identity.version >= 170000 ? ",pg_catalog.has_table_privilege($1::oid,c.oid,'MAINTAIN') AS maintain" : ''}
            FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`, [role.oid])).rows;
        for (const row of tableRights) {
            const policy = RUNTIME_PERMISSION_POLICY[label][row.table_name] ?? permission();
            if (row.remove && !policy.delete) record('FORBIDDEN_TABLE_PRIVILEGE', { table: row.table_name, privilege: 'DELETE', via });
            if (role.is_current && policy.delete && !row.remove) record('MISSING_TABLE_PRIVILEGE', { table: row.table_name, privilege: 'DELETE' });
            for (const [key, privilege] of [['truncate','TRUNCATE'],['trigger','TRIGGER'],['reference','REFERENCES'],['maintain','MAINTAIN']])
                if (row[key]) record('FORBIDDEN_TABLE_PRIVILEGE', { table: row.table_name, privilege, via });
        }
        const tablePrivileges = ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES',
            ...(identity.version >= 170000 ? ['MAINTAIN'] : [])];
        const tableGrantOptions = (await client.query(`SELECT c.relname AS table_name,p.privilege,
            pg_catalog.has_table_privilege($1::oid,c.oid,p.privilege || ' WITH GRANT OPTION') AS delegated
            FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
            CROSS JOIN unnest($2::text[]) p(privilege) WHERE n.nspname='public' AND c.relkind='r'`, [role.oid, tablePrivileges])).rows;
        for (const row of tableGrantOptions) if (row.delegated)
            record('FORBIDDEN_TABLE_GRANT_OPTION', { table: row.table_name, privilege: row.privilege, via });
        const rights = (await client.query(`SELECT c.relname AS table_name,a.attname AS name,
            pg_catalog.has_column_privilege($1::oid,c.oid,a.attnum,'SELECT') AS can_select,
            pg_catalog.has_column_privilege($1::oid,c.oid,a.attnum,'INSERT') AS can_insert,
            pg_catalog.has_column_privilege($1::oid,c.oid,a.attnum,'UPDATE') AS can_update,
            pg_catalog.has_column_privilege($1::oid,c.oid,a.attnum,'REFERENCES') AS can_reference
            FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
            JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
            WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname,a.attnum`, [role.oid])).rows;
        for (const column of rights) {
            const policy = RUNTIME_PERMISSION_POLICY[label][column.table_name] ?? permission();
            for (const [key, privilege, allowed] of [['can_select','SELECT',policy.select],['can_insert','INSERT',policy.insert],
                ['can_update','UPDATE',policy.update.includes(column.name)],['can_reference','REFERENCES',false]]) {
                if (column[key] && !allowed) record('FORBIDDEN_COLUMN_PRIVILEGE', { table: column.table_name, column: column.name, privilege, via });
                if (role.is_current && allowed && !column[key]) record('MISSING_COLUMN_PRIVILEGE', { table: column.table_name, column: column.name, privilege });
            }
        }
        const columnGrantOptions = (await client.query(`SELECT c.relname AS table_name,a.attname AS name,p.privilege,
            pg_catalog.has_column_privilege($1::oid,c.oid,a.attnum,p.privilege || ' WITH GRANT OPTION') AS delegated
            FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
            JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
            CROSS JOIN unnest($2::text[]) p(privilege) WHERE n.nspname='public' AND c.relkind='r'`,
        [role.oid, ['SELECT','INSERT','UPDATE','REFERENCES']])).rows;
        for (const row of columnGrantOptions) if (row.delegated)
            record('FORBIDDEN_COLUMN_GRANT_OPTION', { table: row.table_name, column: row.name, privilege: row.privilege, via });
    }
    return { identity, violations, inspectedRoles: roles.length, inspectedTables: schema.length, inspectedColumns: columns.length };
}

export async function auditRuntimePermissions(input = {}) {
    const validated = validatePermissionInputs(input); let webClient, workerClient;
    try {
        webClient = await connectDatabase(validated.webConfig);
        workerClient = await connectDatabase(validated.workerConfig);
        await beginReadSnapshot(webClient); await beginReadSnapshot(workerClient);
        const webResult = await inspectRole(webClient, 'web', validated.webConfig);
        const workerResult = await inspectRole(workerClient, 'worker', validated.workerConfig);
        if (webResult.identity.database !== workerResult.identity.database || webResult.identity.address !== workerResult.identity.address ||
            webResult.identity.port !== workerResult.identity.port || webResult.identity.role === workerResult.identity.role)
            fail('RUNTIME_DATABASE_IDENTITY_MISMATCH');
        const roleReport = result => ({ passed: result.violations.length === 0, inspectedRoles: result.inspectedRoles,
            inspectedTables: result.inspectedTables ?? 0, inspectedColumns: result.inspectedColumns ?? 0, violations: result.violations });
        return { schema: 'qivvera.runtime-permissions/1', observedAt: new Date().toISOString(),
            releaseRevision: validated.releaseRevision, schemaVersion: 7, readOnly: true,
            identityDigest: digestJSON({ database: validated.webConfig.identity, web: webResult.identity.role, worker: workerResult.identity.role }),
            passed: webResult.violations.length === 0 && workerResult.violations.length === 0,
            roles: { web: roleReport(webResult), worker: roleReport(workerResult) },
            scope: 'Current schema-8 public-table runtime profile, effective grants, reachable roles and ownership.',
            limitations: ['Role/password/provider administration is not changed or certified.',
                'External schemas, provider policy, backups, network controls and hosted application behavior require separate acceptance.'],
            releaseAcceptance: 'not-evaluated' };
    } finally {
        for (const client of [workerClient, webClient]) if (client) {
            await client.query('ROLLBACK').catch(() => {}); await client.end().catch(() => {});
        }
    }
}
