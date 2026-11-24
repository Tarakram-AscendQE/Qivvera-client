import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { openRepository } from '../backend/server/repository.mjs';
import { openDatabase, migrateDatabase } from '../backend/server/workflow-store.mjs';
import { contractCases, fixtureData, author, reviewer, owner, act } from './workflow-contract.mjs';
for (const [name, fn] of contractCases())
    test(`workflow / ${name}`, async (t) => { const r = await openWorkflowRepository({ migrate: true }); t.after(() => r.close()); await fn(r); });
test('workflow / founder-review is explicit and records non-independent decisions', async (t) => { const r = await openWorkflowRepository({ migrate: true, reviewMode: 'founder-review' }); t.after(() => r.close()); const { o } = await fixtureData(r, owner); const s = await r.transitionObligation(o.id, act(o, 'SUBMIT'), owner); const a = await r.transitionObligation(o.id, act(s, 'ACCEPT'), owner); assert.equal(a.independentActor, false); const h = await r.getObligationHistory(o.id); assert.equal(h.at(-1).independentActor, false); assert.equal(h.at(-1).snapshot.state, 'NOT_ASSESSED'); });
test('workflow / additive migration preserves existing records and requires source review', async (t) => { const dir = mkdtempSync(join(tmpdir(), 'qivvera-migration-')), path = join(dir, 'db.sqlite'); t.after(() => rmSync(dir, { recursive: true, force: true })); const old = openRepository(path); const app = old.createApplication({ name: 'Existing app' }, 'old@example.test'); const c = old.createChange({ applicationId: app.id, title: 'Existing change', sourceRevision: 'abcdef1' }, 'old@example.test'); const o = old.addObligation(c.id, { statement: 'Existing rule', sourceReference: 'BR-17' }, 'old@example.test'); old.close(); let r = await openWorkflowRepository({ path, migrate: true }); const saved = await r.getChange(c.id); assert.equal(saved.obligations[0].id, o.id); assert.equal(saved.obligations[0].imported, true); assert.equal(saved.obligations[0].proposedBy, 'legacy-import'); await assert.rejects(r.transitionObligation(o.id, act(saved.obligations[0], 'SUBMIT'), author), e => e.code === 'IMPORTED_REVIEW_REQUIRED'); const d = await r.editObligation(o.id, { statement: 'Existing rule', sourceReference: 'BR-17', sourceVersion: '1', criticality: 'HIGH', revisionId: saved.revision.id, version: o.version }, author); assert.equal(d.imported, false); assert.equal(d.proposedBy, author.email); const pending = await r.transitionObligation(o.id, act(d, 'SUBMIT'), author); await r.transitionObligation(o.id, act(pending, 'ACCEPT'), reviewer); await r.close(); r = await openWorkflowRepository({ path, migrate: true }); assert.equal((await r.getChange(c.id)).obligations[0].authority, 'AUTHORITATIVE'); assert.equal((await r.getChange(c.id)).revisions.length, 1); await r.close(); });
test('workflow / migration checksum change is rejected', async () => { const db = await openDatabase(); try {
    await migrateDatabase(db);
    await db.transaction(c => c.query("UPDATE qivvera_migrations SET checksum='changed' WHERE version=2"));
    await assert.rejects(migrateDatabase(db), /CHECKSUM/);
}
finally {
    await db.close();
} });
test('workflow / unknown newer schema is not silently downgraded', async () => { const db = await openDatabase(); try {
    await migrateDatabase(db);
    await db.transaction(c => c.query("INSERT INTO qivvera_migrations VALUES (99,'future','2026-01-01')"));
    await assert.rejects(migrateDatabase(db), /NEWER/);
}
finally {
    await db.close();
} });
test('workflow / unmigrated startup fails instead of showing empty success', async () => { await assert.rejects(openWorkflowRepository({ migrate: false })); });
