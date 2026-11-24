import { describe, expect, it } from 'vitest';
import { parseRoute } from './routes';

const all = { capabilities: { verificationTemplates: true, revisionImpact: true, obligationDrafting: true, resolutionWorkflow: true, githubIntake: true } };
const none = { capabilities: {} };
const id = (n: number) => `${n}`.padStart(8, '0') + '-0000-4000-8000-000000000000';
const [a, b, c, d] = [id(1), id(2), id(3), id(4)];

describe('routes', () => {
  it.each([
    ['', { kind: 'overview' }], ['#/', { kind: 'overview' }], ['#/nowhere', { kind: 'overview' }],
    ['#/guide', { kind: 'guide' }], ['#/support', { kind: 'support' }], ['#/activity', { kind: 'activity' }],
    ['#/applications', { kind: 'applications' }], ['#/applications/app-1', { kind: 'application', id: 'app-1' }],
    ['#/changes', { kind: 'changes' }], ['#/changes/', { kind: 'changes' }],
    ['#/changes/chg-1', { kind: 'change', id: 'chg-1', revisionId: null }],
    ['#/changes/chg-1/revisions/rev-2', { kind: 'change', id: 'chg-1', revisionId: 'rev-2' }],
    ['#/changes/chg-1/revisions', { kind: 'change', id: 'chg-1', revisionId: null }],
    ['#/resolutions', { kind: 'resolution-inbox' }], ['#/resolutions/res-1', { kind: 'resolution', id: 'res-1' }],
    ['#/intake', { kind: 'intake' }],
    ['#/impact/chg-1/rev-1', { kind: 'impact', changeId: 'chg-1', revisionId: 'rev-1' }],
    ['#/drafting/chg-1/rev-1', { kind: 'drafting', changeId: 'chg-1', revisionId: 'rev-1', runId: null, offset: 0 }],
    ['#/drafting/chg-1/rev-1/runs/run-9', { kind: 'drafting', changeId: 'chg-1', revisionId: 'rev-1', runId: 'run-9', offset: 0 }],
    ['#/drafting/chg-1/rev-1/page/20', { kind: 'drafting', changeId: 'chg-1', revisionId: 'rev-1', runId: null, offset: 20 }]
  ])('opens %s', (hash, route) => {
    expect(parseRoute(hash, all)).toEqual(route);
  });

  it.each([
    ['#/verification-templates', { kind: 'list' }],
    ['#/verification-templates/page/40', { kind: 'list', options: { offset: 40, includeArchived: false } }],
    ['#/verification-templates/page/40/all', { kind: 'list', options: { offset: 40, includeArchived: true } }],
    [`#/verification-templates/${a}`, { kind: 'detail', templateId: a, versionId: null }],
    [`#/verification-templates/${a}/versions/${b}`, { kind: 'detail', templateId: a, versionId: b }],
    [`#/template-save/${a}/${b}`, { kind: 'save', changeId: a, revisionId: b, templateId: null }],
    [`#/template-save/${a}/${b}/${c}`, { kind: 'save', changeId: a, revisionId: b, templateId: c }],
    [`#/template-plan/${a}/${b}`, { kind: 'list', options: { changeId: a, revisionId: b } }],
    [`#/template-plan/${a}/${b}/page/10`, { kind: 'list', options: { changeId: a, revisionId: b, offset: 10 } }],
    [`#/template-plan/${a}/${b}/${c}/${d}`, { kind: 'plan', changeId: a, revisionId: b, templateId: c, versionId: d }],
    ['#/verification-templates/page/-1', { kind: 'incomplete' }], ['#/verification-templates/page/1/other', { kind: 'incomplete' }],
    ['#/verification-templates/not-an-id', { kind: 'incomplete' }], [`#/verification-templates/${a}/versions`, { kind: 'incomplete' }],
    [`#/template-save/${a}`, { kind: 'incomplete' }], [`#/template-plan/${a}/${b}/page/x`, { kind: 'incomplete' }],
    [`#/template-plan/${a}/${b}/${c}`, { kind: 'incomplete' }]
  ])('reads the template link %s', (hash, view) => {
    expect(parseRoute(hash, all)).toEqual({ kind: 'templates', view });
  });

  it.each([
    ['#/impact/chg-1', 'This impact link is incomplete. Open Impact & next checks from the change.'],
    ['#/impact/chg-1/rev-1/extra', 'This impact link is incomplete. Open Impact & next checks from the change.'],
    ['#/drafting/chg-1', 'This source-drafting link is incomplete. Open source drafts from the change.'],
    ['#/drafting/chg-1/rev-1/other/x', 'This source-drafting link is incomplete. Open source drafts from the change.'],
    ['#/drafting/chg-1/rev-1/runs', 'This source-drafting link is incomplete. Open source drafts from the change.'],
    ['#/drafting/chg-1/rev-1/page/1/x', 'This source-drafting link is incomplete. Open source drafts from the change.'],
    ['#/drafting/chg-1/rev-1/page/1.5', 'The saved-draft page is invalid. Open source drafts from the change.'],
    ['#/drafting/chg-1/rev-1/page/-3', 'The saved-draft page is invalid. Open source drafts from the change.']
  ])('explains the incomplete link %s', (hash, message) => {
    expect(parseRoute(hash, all)).toEqual({ kind: 'error', message });
  });

  it('explains a feature that is not enabled, and opens the overview for a hidden one', () => {
    expect(parseRoute('#/template-plan/x', none)).toEqual({ kind: 'error', message: 'Verification templates are not enabled in this workspace. Existing verification plans remain available.' });
    expect(parseRoute('#/impact/a/b', none)).toEqual({ kind: 'error', message: 'Revision impact is not available in this workspace. Open the change to inspect its obligations and evidence.' });
    expect(parseRoute('#/drafting/a/b', none)).toEqual({ kind: 'error', message: 'Source drafting is not enabled in this workspace. Manual obligation authoring remains available.' });
    expect(parseRoute('#/resolutions/res-1', none)).toEqual({ kind: 'overview' });
    expect(parseRoute('#/intake', none)).toEqual({ kind: 'overview' });
  });

  it('opens Guide and Support without a workspace summary but fails other routes', () => {
    const missing = null as unknown as typeof all;
    expect(parseRoute('#/guide', missing)).toEqual({ kind: 'guide' });
    expect(parseRoute('#/support', missing)).toEqual({ kind: 'support' });
    expect(() => parseRoute('#/impact/a/b', missing)).toThrow(TypeError);
  });
});
