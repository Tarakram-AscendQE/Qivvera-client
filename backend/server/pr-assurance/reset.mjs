/**
 * Operator-only reset of the PR assurance demo data, so a demo can start with nothing imported.
 *
 * The app itself never deletes runs: history is kept by design and protected by triggers. This is a
 * deliberate database-owner action outside the app. It empties exactly the three demo tables (pulls,
 * runs, run events) with TRUNCATE, which row triggers do not see, and leaves the add-on's version
 * ledger, its history rules and every other table untouched.
 */
import { requirePrAssurance } from './migration.mjs';

const TABLES = { pulls: 'pr_assurance_pulls', runs: 'pr_assurance_runs', events: 'pr_assurance_run_events' };

async function counts(c) {
    const row = (await c.query(`SELECT (SELECT count(*)::int FROM ${TABLES.pulls}) AS pulls,
        (SELECT count(*)::int FROM ${TABLES.runs}) AS runs, (SELECT count(*)::int FROM ${TABLES.events}) AS events`)).rows[0];
    return { pulls: row.pulls, runs: row.runs, events: row.events };
}

/** How many demo rows exist (read-only). */
export async function countDemoData(db) {
    await requirePrAssurance(db);
    return db.transaction(counts, true);
}

/** Empties the demo tables in one transaction; returns how many rows were removed. */
export async function resetDemoData(db) {
    await requirePrAssurance(db);
    return db.transaction(async c => {
        const removed = await counts(c);
        await c.query(`TRUNCATE ${TABLES.events}, ${TABLES.runs}, ${TABLES.pulls}`);
        return removed;
    });
}
