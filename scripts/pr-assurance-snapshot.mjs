/**
 * Generates the static rules snapshot the PR assurance demo assesses against
 * (fixtures/pr-assurance/vendorpay-policies-<commit>.json).
 *
 *   node scripts/pr-assurance-snapshot.mjs <vendorpay-policies dir> <vendorpay-app dir> <out.json> <pr head sha>...
 *
 * The policy selection comes from the policies repository's own `select --json`, run once per PR head;
 * the run stops unless every PR selects exactly the same policies. Rule text, exceptions, the profile
 * and the verifier catalogue are read with that repository's own `yaml` package (run `npm ci` there
 * first), so Qivvera gains no dependency. The policies checkout must be clean: its commit is recorded.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const [policiesDir, appDir, out, ...heads] = process.argv.slice(2).map((a, i) => (i < 3 ? resolve(a) : a));
if (!policiesDir || !appDir || !out || heads.length === 0) {
  console.error('usage: node scripts/pr-assurance-snapshot.mjs <policies dir> <app dir> <out.json> <pr head sha>...');
  process.exit(2);
}
const sha256 = text => createHash('sha256').update(text).digest('hex');
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
const { parse } = createRequire(join(policiesDir, 'package.json'))('yaml');
const readYaml = file => {
  const raw = readFileSync(join(policiesDir, file), 'utf8');
  return { raw, doc: parse(raw), digest: `sha256:${sha256(raw)}` };
};

if (git(policiesDir, 'status', '--porcelain')) throw new Error('The policies checkout has local changes; its commit would not describe it.');
const commit = git(policiesDir, 'rev-parse', 'HEAD');

const selections = heads.map(head => JSON.parse(execFileSync(
  'npx', ['tsx', 'scripts/select.ts', '--repo', 'vendorpay', '--repo-dir', appDir, '--range', `main...${head}`, '--jira', 'VP-184', '--json'],
  { cwd: policiesDir, encoding: 'utf8' })));
const signature = s => JSON.stringify(s.policies.map(p => [p.id, p.version, p.digest]));
if (!selections.every(s => signature(s) === signature(selections[0]))) throw new Error('The PRs select different policies; one static snapshot cannot describe them.');
const [selection] = selections;

const profile = readYaml(`profiles/${selection.profile}.yaml`);
const catalog = readYaml('catalog/verifiers.yaml');
const policies = selection.policies.map(p => {
  const { raw, doc } = readYaml(p.file);
  if (`sha256:${sha256(raw)}` !== p.digest) throw new Error(`${p.file} changed while generating`);
  return {
    id: p.id, title: p.title, version: p.version, authority: p.authority, owner: p.owner, severity: p.severity,
    file: p.file, digest: p.digest, rule: String(doc.rule).trim(), exceptionsAllowed: doc.exceptions?.allowed === true,
    obligations: p.obligations.map(o => ({ id: o.id, statement: o.statement, verifier: o.verifier, check: o.check })),
  };
});

const body = {
  kind: 'qivvera.rules-snapshot/v1',
  source: { repository: 'prcheck-live/vendorpay-policies', commit, selectedFor: heads, generatedBy: 'scripts/pr-assurance-snapshot.mjs' },
  profile: { id: profile.doc.id, title: profile.doc.title, file: `profiles/${selection.profile}.yaml`, digest: profile.digest, rules: profile.doc.disposition },
  verifiers: { file: 'catalog/verifiers.yaml', digest: catalog.digest, catalog: catalog.doc.verifiers },
  policies,
};
const snapshot = { ...body, snapshotDigest: `sha256:${sha256(JSON.stringify(body))}` };
writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`${policies.length} policies, ${policies.reduce((n, p) => n + p.obligations.length, 0)} obligations, policies ${commit.slice(0, 7)} → ${out}`);
