import test from 'node:test';
import assert from 'node:assert/strict';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { openDatabase, migrateDatabase } from '../backend/server/workflow-store.mjs';
import { contractCases, fixtureData, author, reviewer, owner, act } from './workflow-contract.mjs';
import { testDatabase } from './postgres-test-database.mjs';
for (const [name, fn] of contractCases())
    test(`workflow / ${name}`, async (t) => { const r = await openWorkflowRepository({ ...await testDatabase(), migrate: true }); t.after(() => r.close()); await fn(r); });
test('workflow / founder-review is explicit and records non-independent decisions', async (t) => { const r = await openWorkflowRepository({ ...await testDatabase(), migrate: true, reviewMode: 'founder-review' }); t.after(() => r.close()); const { o } = await fixtureData(r, owner); const s = await r.transitionObligation(o.id, act(o, 'SUBMIT'), owner); const a = await r.transitionObligation(o.id, act(s, 'ACCEPT'), owner); assert.equal(a.independentActor, false); const h = await r.getObligationHistory(o.id); assert.equal(h.at(-1).independentActor, false); assert.equal(h.at(-1).snapshot.state, 'NOT_ASSESSED'); });
test('workflow / migration checksum change is rejected', async () => { const db = await openDatabase(await testDatabase()); try {
    await migrateDatabase(db);
    await db.transaction(c => c.query("UPDATE qivvera_migrations SET checksum='changed' WHERE version=2"));
    await assert.rejects(migrateDatabase(db), /CHECKSUM/);
}
finally {
    await db.close();
} });
test('workflow / unknown newer schema is not silently downgraded', async () => { const db = await openDatabase(await testDatabase()); try {
    await migrateDatabase(db);
    await db.transaction(c => c.query("INSERT INTO qivvera_migrations VALUES (99,'future','2026-01-01')"));
    await assert.rejects(migrateDatabase(db), /NEWER/);
}
finally {
    await db.close();
} });
test('workflow / unmigrated startup fails instead of showing empty success', async () => { await assert.rejects(openWorkflowRepository({ ...await testDatabase(), migrate: false })); });
