/** Deployment boundary: template preparation requires the existing generalized assurance service. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAssuranceConfig } from '../backend/server/assurance/config.mjs';

test('templates configuration / existing deployments remain disabled by default', () => {
    assert.equal(loadAssuranceConfig({}).templatesEnabled, false);
    assert.equal(loadAssuranceConfig({ QIVVERA_ASSURANCE_ENABLED: 'true', QIVVERA_GENERALIZATION_ENABLED: 'true' }).templatesEnabled, false);
});

test('templates configuration / both assurance and generalized mappings are required before enabling templates', () => {
    for (const options of [{}, { QIVVERA_ASSURANCE_ENABLED: 'true' }, { QIVVERA_GENERALIZATION_ENABLED: 'true' },
        { QIVVERA_ASSURANCE_ENABLED: 'false', QIVVERA_GENERALIZATION_ENABLED: 'true' }]) {
        assert.throws(() => loadAssuranceConfig({ ...options, QIVVERA_TEMPLATES_ENABLED: 'true' }), /TEMPLATES_REQUIRE_GENERALIZED_ASSURANCE/);
    }
});

test('templates configuration / an explicit compatible configuration enables templates without inventing a target', () => {
    const config = loadAssuranceConfig({ NODE_ENV: 'production', QIVVERA_ASSURANCE_ENABLED: 'true',
        QIVVERA_GENERALIZATION_ENABLED: 'true', QIVVERA_TEMPLATES_ENABLED: 'true' });
    assert.equal(config.enabled, true); assert.equal(config.generalizationEnabled, true);
    assert.equal(config.templatesEnabled, true); assert.deepEqual(config.targets, []);
    assert.equal(config.allowLocalTargets, false);
});
