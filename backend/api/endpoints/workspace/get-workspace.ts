import { PRODUCT_VERSION } from '../../../../backend/server/release.mjs';
import { withAssessmentSummary } from '../../common/assessment-summary.js';
import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';

/**
 * GET /api/workspace — the summary the app loads after sign-in: applications, changes (with their latest
 * assessment), recent activity, which features are switched on, and the release.
 */
export const getWorkspace = defineEndpoint({
  async handle({ services: { repository, assurance, resolution, intake, releaseRevision } }) {
    return reply({
      applications: await repository.listApplications(),
      changes: await Promise.all((await repository.listChanges()).map(change => withAssessmentSummary(change, assurance))),
      activity: await repository.listActivity(),
      capabilities: {
        registry: true, authorityDecisions: true, changeRevisions: true,
        verifierExecution: !!assurance?.enabled, evidenceCollection: !!assurance?.enabled, assuranceDisposition: !!assurance?.enabled,
        assessmentQueue: !!assurance, resolutionWorkflow: !!resolution, githubIntake: !!intake, githubWebhooks: !!intake?.webhookEnabled,
        obligationDrafting: !!repository.drafting, revisionImpact: !!repository.impact, verificationTemplates: !!assurance?.templates
      },
      storage: repository.driver, release: PRODUCT_VERSION, revision: releaseRevision, reviewMode: repository.reviewMode ?? 'not-available'
    });
  }
});
