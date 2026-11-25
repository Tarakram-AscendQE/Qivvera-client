import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { assessEvidence, compareAssessments, validateSnapshot } from '../dist/core/pr-assurance.js';

const sha256 = text => createHash('sha256').update(text).digest('hex');
const snapshot = JSON.parse(readFileSync(new URL('../fixtures/pr-assurance/vendorpay-policies-e408884.json', import.meta.url), 'utf8'));
/** Evidence measured by prcheck-verifiers for the three PR commits (docs/results), byte for byte. */
const recorded = commit => readFileSync(new URL(`../fixtures/pr-assurance/evidence/${commit}.json`, import.meta.url), 'utf8');
const assess = (evidenceText, expectedCommit, evidenceSha256 = sha256(evidenceText)) =>
  assessEvidence({ snapshot, evidenceText, evidenceSha256, expectedCommit, sha256 });
/** Recorded evidence with one change applied, re-serialised (so it has a new, valid digest). */
const edited = (commit, change) => { const e = JSON.parse(recorded(commit)); change(e); return JSON.stringify(e, null, 2); };
const violated = result => result.rules.flatMap(r => r.obligations).filter(o => o.state === 'VIOLATED').map(o => o.id);
const broken = result => result.rules.filter(r => r.broken).map(r => r.id);

test('the snapshot holds 6 policies and 14 obligations, each backed by a catalogued check', () => {
  validateSnapshot(snapshot);
  assert.equal(snapshot.policies.length, 6);
  assert.equal(snapshot.policies.flatMap(p => p.obligations).length, 14);
});

test('a snapshot whose profile changed is refused until the decision rules are reviewed', () => {
  const changed = { ...snapshot, profile: { ...snapshot.profile, digest: `sha256:${'0'.repeat(64)}` } };
  assert.throws(() => validateSnapshot(changed), /PROFILE_NOT_SUPPORTED/);
});

test('PR #6 (af51c26): NOT READY, rules FIN-001 and FIN-002 broken by three violated obligations', () => {
  const result = assess(recorded('af51c26'), 'af51c26');
  assert.equal(result.ok, true);
  assert.equal(result.disposition, 'NOT_READY');
  assert.deepEqual(broken(result), ['FIN-001', 'FIN-002']);
  assert.deepEqual(violated(result), ['FIN-001.1', 'FIN-002.1', 'FIN-002.3']);
  assert.equal(result.summary, 'NOT READY · 2 rules broken · 11 of 14 obligations supported');
});

test('PR #7 (ae50deb): NOT READY, only FIN-002 still broken', () => {
  const result = assess(recorded('ae50deb'), 'ae50deb');
  assert.equal(result.disposition, 'NOT_READY');
  assert.deepEqual(broken(result), ['FIN-002']);
  assert.deepEqual(violated(result), ['FIN-002.1', 'FIN-002.3']);
  assert.equal(result.summary, 'NOT READY · 1 rule broken · 12 of 14 obligations supported');
});

test('PR #8 code (3f6e20d): READY, every obligation supported', () => {
  const result = assess(recorded('3f6e20d'), '3f6e20d');
  assert.equal(result.disposition, 'READY');
  assert.deepEqual(broken(result), []);
  assert.equal(result.summary, 'READY · no rules broken · 14 of 14 obligations supported');
});

test('a violated obligation carries what the report needs: check, observed failure, owner', () => {
  const result = assess(recorded('af51c26'), 'af51c26');
  const rule = result.rules.find(r => r.id === 'FIN-001');
  const obligation = rule.obligations.find(o => o.id === 'FIN-001.1');
  assert.equal(rule.owner, '@qivvra-demo/finance-controls');
  assert.equal(obligation.check, 'V2/bank-change-self-approval-blocked');
  assert.match(obligation.checkDescription, /403/);
  assert.match(obligation.reason, /Expected: 403\nReceived: 200/);
  assert.equal(obligation.observation.selfApprovalStatus, 200);
});

test('the proof names the commit, the verifiers and the run times from the evidence', () => {
  const result = assess(recorded('af51c26'), 'af51c26');
  assert.deepEqual(result.proof, {
    commit: 'af51c26', environmentConfirmed: true, verifiersCommit: 'dfaa599',
    startedAt: '2026-11-01T05:17:30.058Z', finishedAt: '2026-11-01T05:17:41.117Z',
    rulesCommit: snapshot.source.commit, snapshotDigest: snapshot.snapshotDigest,
  });
});

test('evidence whose text no longer matches its published SHA-256 is refused', () => {
  const original = recorded('af51c26');
  const result = assess(original.replace('"VIOLATED"', '"SUPPORTED"'), 'af51c26', sha256(original));
  assert.deepEqual([result.ok, result.reason], [false, 'EVIDENCE_DIGEST_MISMATCH']);
});

test('evidence about another commit is refused, even when intact', () => {
  const result = assess(recorded('af51c26'), 'ae50deb');
  assert.deepEqual([result.ok, result.reason], [false, 'EVIDENCE_FOR_ANOTHER_COMMIT']);
});

test('evidence of an unknown kind is refused', () => {
  const result = assess(edited('af51c26', e => { e.kind = 'qivvra.evidence/v2'; }), 'af51c26');
  assert.deepEqual([result.ok, result.reason], [false, 'EVIDENCE_KIND_UNSUPPORTED']);
});

test('text that is not evidence JSON is refused', () => {
  assert.equal(assess('not json', 'af51c26').reason, 'EVIDENCE_MALFORMED');
  assert.equal(assess(edited('af51c26', e => { e.checks['V1/qe-runs-head-commit'].state = 'PASSED'; }), 'af51c26').reason, 'EVIDENCE_MALFORMED');
});

test('when the environment was not confirmed, nothing but V1 counts: INDETERMINATE, never READY', () => {
  const result = assess(edited('3f6e20d', e => { e.environmentConfirmed = false; }), '3f6e20d');
  assert.equal(result.disposition, 'INDETERMINATE');
  const states = result.rules.flatMap(r => r.obligations).map(o => [o.id, o.state]);
  assert.deepEqual(states.filter(([, s]) => s !== 'NOT_ASSESSED'), [['PLT-001.1', 'SUPPORTED']]);
});

test('an obligation with no check result is INSUFFICIENT and the change is NOT READY', () => {
  const result = assess(edited('3f6e20d', e => { delete e.checks['V5/bank-change-audited']; }), '3f6e20d');
  assert.equal(result.disposition, 'NOT_READY');
  assert.deepEqual(broken(result), ['CMP-001']);
  assert.equal(result.rules[0].obligations[0].state, 'INSUFFICIENT');
});

test('a check not assessed on a high-severity rule matches no profile rule, so it fails closed', () => {
  const result = assess(edited('3f6e20d', e => {
    Object.assign(e.checks['V4/logs-masked'], { state: 'NOT_ASSESSED', outcome: 'skipped', reason: 'no LOG_PATH' });
  }), '3f6e20d');
  assert.equal(result.disposition, 'INDETERMINATE');
  assert.match(result.dispositionReason, /SEC-001\.3/);
});

test('comparing PR #7 with PR #6: FIN-001 fixed, FIN-002 still broken', () => {
  const previous = assess(recorded('af51c26'), 'af51c26');
  const current = assess(recorded('ae50deb'), 'ae50deb');
  assert.deepEqual(compareAssessments(previous, current), { fixed: ['FIN-001'], stillBroken: ['FIN-002'], newlyBroken: [] });
  assert.equal(compareAssessments(null, current), null);
});
