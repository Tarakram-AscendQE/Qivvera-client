import { describe, expect, it } from 'vitest';
import { parseSupportInfo, reviewModeName, roleName, toSupportReport } from './support-report';

const info = {
  schema: 'qivvera.support-info/1',
  generatedAt: '2026-11-24T10:00:00.000Z',
  requestId: '6f1c1f0e-8a7b-4d0e-9a51-2b5e1f0c9d11',
  product: { name: 'Qivvera', version: '0.11.0', revision: 'a'.repeat(40), buildSecret: 'must-not-export' },
  workspace: { storage: 'postgres', schemaVersion: 8, requiredSchemaVersion: 8, maxSupportedSchemaVersion: 8, storageCheck: 'reachable', reviewMode: 'independent', secureSession: 'true', databaseUrl: 'postgresql://secret' },
  capabilities: { registry: true, authorityReview: 1, assessmentQueue: 'true', futureFeature: true },
  roles: ['AUTHOR', 'ADMIN', 'VIEWER'],
  actions: { createChange: true, reviewObligations: false },
  warnings: [{ code: 'W1', message: 'Check the worker', nextStep: 'Ask the operator', internal: 'secret' }, null],
  accounts: ['owner@example.test'],
  csrfToken: 'token'
};

describe('support report', () => {
  it('copies only the diagnostic contract and never spreads server fields', () => {
    const report = toSupportReport(parseSupportInfo(info));
    expect(report).toEqual({
      schema: 'qivvera.support-info/1',
      generatedAt: info.generatedAt,
      requestId: info.requestId,
      product: { name: 'Qivvera', version: '0.11.0', revision: 'a'.repeat(40) },
      workspace: { storage: 'postgres', schemaVersion: 8, requiredSchemaVersion: 8, maxSupportedSchemaVersion: 8, storageCheck: 'reachable', reviewMode: 'independent', secureSession: false },
      capabilities: { registry: true, authorityReview: false, assessmentQueue: false, configuredTargets: false, multiObligation: false, resolution: false, githubIntake: false, obligationDrafting: false, aiDrafting: false, revisionImpact: false, verificationTemplates: false },
      roles: ['AUTHOR', 'VIEWER'],
      actions: { createChange: true, reviewObligations: false, approvePlans: false, requestAssessment: false, importSource: false, manageResolution: false, draftObligations: false, manageVerificationTemplates: false },
      warnings: [{ code: 'W1', message: 'Check the worker', nextStep: 'Ask the operator' }, { code: undefined, message: undefined, nextStep: undefined }],
      limitations: { workerStatus: 'not-observed', githubConnection: 'not-probed', aiProviderConnection: 'not-probed', releaseStatus: 'not-evaluated', notice: 'Configuration checks do not establish worker or provider availability, evidence correctness, deployment acceptance or release approval.' }
    });
    const exported = JSON.stringify(report);
    for (const forbidden of ['must-not-export', 'postgresql://secret', 'owner@example.test', 'token', 'futureFeature', 'ADMIN', 'internal']) {
      expect(exported).not.toContain(forbidden);
    }
  });

  it('treats missing or malformed sections as absent', () => {
    const report = toSupportReport(parseSupportInfo({ schema: 'qivvera.support-info/1', product: 'x', workspace: null, roles: 'AUTHOR', warnings: {} }));
    expect(report.product).toEqual({ name: undefined, version: undefined, revision: undefined });
    expect(report.workspace.secureSession).toBe(false);
    expect(report.roles).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('rejects an unrecognized format', () => {
    expect(() => parseSupportInfo({ schema: 'qivvera.support-info/2' })).toThrow('Support details use an unrecognized format. Ask the workspace operator to check the deployed version.');
    expect(() => parseSupportInfo(null)).toThrow('unrecognized format');
  });

  it('names only known roles and review modes', () => {
    expect(['AUTHOR', 'POLICY_AUTHORITY', 'VIEWER', 'ADMIN', 'constructor', 7].map(roleName)).toEqual(['Author', 'Policy Authority', 'Viewer', 'Unknown role', 'Unknown role', 'Unknown role']);
    expect(['independent', 'founder-review', 'not-available', 'toString', undefined].map(reviewModeName)).toEqual(['Independent review', 'Founder review — same-person decisions permitted', 'Not available', 'Not available', 'Not available']);
  });
});
