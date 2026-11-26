import { field, list } from '../json';
import { text } from '../shell-contract';

/**
 * Where "Run assurance" on a change takes the person: the imported pull request whose head is the
 * change's declared source commit (a 7–40 character prefix), or else the application's pull requests.
 */
export function prAssuranceTarget(applicationId: string, scenario: unknown, sourceRevision: unknown): string {
  const base = `#/pr-assurance/apps/${applicationId}`;
  const revision = text(sourceRevision).toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(revision)) return base;
  const match = list(field(scenario, 'pulls')).find(entry => text(field(field(entry, 'pull'), 'headSha')).toLowerCase().startsWith(revision));
  return match ? `${base}/pulls/${text(field(match, 'number'))}` : base;
}
