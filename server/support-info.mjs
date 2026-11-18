import { PRODUCT_VERSION, MAX_SUPPORTED_SCHEMA_VERSION } from './release.mjs';

const allowedRoles = ['AUTHOR', 'POLICY_AUTHORITY', 'VIEWER'];
const warning = (code, message, nextStep) => ({ code, message, nextStep });

/** A bounded, read-only configuration snapshot. Never inspect business records or contact a provider. */
export function createSupportReader({ repository, assurance, resolution, intake, accounts = [], releaseRevision, secureCookies }) {
    const workflow = repository.workflow === true;
    const capabilities = Object.freeze({
        registry: true,
        authorityReview: workflow,
        assessmentQueue: workflow && !!assurance,
        configuredTargets: workflow && assurance?.enabled === true,
        multiObligation: workflow && !!assurance && assurance.generalizationEnabled === true,
        resolution: workflow && !!resolution,
        githubIntake: workflow && !!intake,
        obligationDrafting: workflow && !!repository.drafting,
        aiDrafting: workflow && repository.drafting?.methods?.openai === true,
        revisionImpact: workflow && !!repository.impact,
    });
    const requiredSchemaVersion = capabilities.obligationDrafting ? 6 : capabilities.githubIntake || capabilities.multiObligation ? 5 : capabilities.resolution ? 4 : capabilities.assessmentQueue ? 3 : workflow ? 2 : null;
    // Account identities are compared only here; neither identities nor counts enter the response.
    const named = accounts.map(a => ({ email: typeof a.email === 'string' ? a.email.trim().toLowerCase() : '', roles: Array.isArray(a.roles) ? a.roles : [] }));
    const authors = named.filter(a => a.email && a.roles.includes('AUTHOR'));
    const authorities = named.filter(a => a.email && a.roles.includes('POLICY_AUTHORITY'));
    const everyAuthorHasReviewer = authors.every(a => authorities.some(p => p.email !== a.email));
    const revision = typeof releaseRevision === 'string' && /^[a-f0-9]{40}$/i.test(releaseRevision) ? releaseRevision.toLowerCase() : 'unrecorded';
    const storage = ['postgres', 'sqlite'].includes(repository.driver) ? repository.driver : 'unknown';
    const reviewMode = ['independent', 'founder-review'].includes(repository.reviewMode) ? repository.reviewMode : 'not-available';

    return async (session, requestId) => {
        let schemaVersion = null, storageCheck = 'unavailable';
        try {
            if (typeof repository.getSchemaVersion === 'function') {
                const observed = await repository.getSchemaVersion();
                schemaVersion = Number.isSafeInteger(observed) && observed >= 0 ? observed : null;
                storageCheck = 'reachable';
            } else if (await repository.healthy()) {
                storageCheck = 'reachable';
            }
        } catch { /* Return a fixed diagnostic without database errors, URLs or credentials. */ }
        const roles = allowedRoles.filter(role => session.roles?.includes(role));
        const author = roles.includes('AUTHOR'), authority = roles.includes('POLICY_AUTHORITY');
        const warnings = [];
        if (storageCheck === 'unavailable') warnings.push(warning('STORAGE_UNAVAILABLE', 'The storage check could not be completed.', 'Give this support reference to the deployment owner. Reload saved records before retrying a change.'));
        else if (workflow && schemaVersion === null) warnings.push(warning('SCHEMA_UNAVAILABLE', 'The applied schema version could not be observed.', 'Ask the deployment owner to verify the migration record. This page does not apply migrations.'));
        else if (schemaVersion > MAX_SUPPORTED_SCHEMA_VERSION) warnings.push(warning('SCHEMA_TOO_NEW', 'The database schema is newer than this application supports.', 'Ask the deployment owner to use the compatible reviewed application. Do not roll back the database from this page.'));
        else if (requiredSchemaVersion !== null && schemaVersion !== null && schemaVersion < requiredSchemaVersion) warnings.push(warning('SCHEMA_TOO_OLD', 'An enabled feature needs a later database schema.', 'Ask the deployment owner to verify the approved migration and configuration before using that feature.'));
        if (storage === 'sqlite') warnings.push(warning('LOCAL_REVIEW_STORAGE', 'This workspace uses local review storage.', 'The deployment owner must validate the approved PostgreSQL deployment before hosted early access.'));
        if (revision === 'unrecorded') warnings.push(warning('REVISION_UNRECORDED', 'The deployed source revision is not recorded as a full Git commit.', 'Ask the deployment owner to record the exact deployed commit in protected release configuration.'));
        if (reviewMode === 'founder-review') warnings.push(warning('FOUNDER_REVIEW_MODE', 'This workspace permits founder review and does not establish independent human approval.', 'Keep this limitation visible. Use the approved independent-review configuration when a different reviewer is required.'));
        if (workflow && !authors.length) warnings.push(warning('AUTHOR_UNAVAILABLE', 'No configured identity can create changes or propose obligations.', 'Ask the workspace owner to provision a named Author through the protected account configuration.'));
        if (workflow && !authorities.length) warnings.push(warning('POLICY_AUTHORITY_UNAVAILABLE', 'No configured identity can make policy review decisions.', 'Ask the workspace owner to provision a named Policy Authority through the protected account configuration.'));
        else if (workflow && reviewMode === 'independent' && !everyAuthorHasReviewer) warnings.push(warning('DISTINCT_REVIEWER_UNAVAILABLE', 'At least one configured Author has no different configured Policy Authority.', 'Ask the workspace owner to provision a different reviewer. Eligibility is still checked against each record and its contributors.'));
        if (!capabilities.assessmentQueue) warnings.push(warning('ASSURANCE_DISABLED', 'Assessment execution is not configured in this workspace.', 'You can prepare changes and review obligations. Ask the deployment owner to configure the supported assessment service when needed.'));
        else {
            if (!capabilities.configuredTargets) warnings.push(warning('TARGETS_UNAVAILABLE', 'The assessment service has no configured targets.', 'Ask the deployment owner to register an approved test target matching the application and source revision.'));
            if (!capabilities.multiObligation) warnings.push(warning('GENERALIZATION_DISABLED', 'Only the single-obligation approval-separation profile is enabled.', 'Ask the deployment owner to enable the reviewed multi-obligation configuration on both web and worker if it is needed.'));
            warnings.push(warning('WORKER_NOT_OBSERVED', 'This page does not observe whether the separate worker is running.', 'If an assessment remains queued, give the deployment owner its assessment ID and support reference. A configured queue is not proof of a running worker.'));
        }
        if (!capabilities.resolution) warnings.push(warning('RESOLUTION_DISABLED', 'The finding-resolution workflow is not configured.', 'Ask the deployment owner to enable the reviewed resolution workflow when the team is ready to use it.'));
        if (!capabilities.githubIntake) warnings.push(warning('GITHUB_INTAKE_DISABLED', 'GitHub source intake is not configured.', 'An Author can register source context manually. The deployment owner can configure an authorized repository for reviewed import.'));
        return {
            schema: 'qivvera.support-info/1',
            generatedAt: new Date().toISOString(),
            requestId,
            product: { name: 'Qivvera', version: PRODUCT_VERSION, revision },
            workspace: { storage, schemaVersion, requiredSchemaVersion, maxSupportedSchemaVersion: MAX_SUPPORTED_SCHEMA_VERSION, storageCheck, reviewMode, secureSession: secureCookies === true },
            capabilities: { ...capabilities },
            roles,
            actions: {
                createChange: author,
                reviewObligations: workflow && authority,
                approvePlans: capabilities.configuredTargets && authority,
                requestAssessment: capabilities.configuredTargets && (author || authority),
                importSource: capabilities.githubIntake && author,
                manageResolution: capabilities.resolution && (author || authority),
                draftObligations: capabilities.obligationDrafting && author,
            },
            authorizationNotice: 'These are role and configuration hints. Each action still requires its current record, permitted transition and applicable authority checks.',
            warnings,
            limitations: {
                workerStatus: 'not-observed',
                githubConnection: 'not-probed',
                aiProviderConnection: 'not-probed',
                releaseStatus: 'not-evaluated',
                schemaCheck: 'version-observed-only',
                notice: 'Configuration checks do not establish worker availability, evidence correctness, migration checksum integrity, deployment acceptance or release approval.',
            },
        };
    };
}
