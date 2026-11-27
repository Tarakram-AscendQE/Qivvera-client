import { InputError } from './errors.js';
const INTEGRITY_FAILED_MESSAGE = 'Saved assurance inputs are missing or inconsistent. No conclusion is available for this change. Ask the workspace operator to inspect the original records.';
/**
 * Adds the latest assessment's status and per-obligation findings to a change, for the workspace list
 * and the change page. Only a current, completed run whose evidence digest matches gives a disposition;
 * otherwise every obligation reads NOT_ASSESSED. Without assurance the change is returned unchanged.
 *
 * If the saved assurance inputs fail their integrity check, the change is still shown, marked
 * ASSURANCE_UNAVAILABLE, instead of failing the whole page. The strict assurance endpoints still refuse
 * the affected plan or run.
 */
export async function withAssessmentSummary(change, assurance) {
    if (!change || !assurance)
        return change;
    let runs;
    try {
        runs = await assurance.listRuns(change.id, change.revision.id);
    }
    catch (error) {
        if (!(error instanceof InputError) || error.code !== 'ASSURANCE_INTEGRITY_FAILED')
            throw error;
        return {
            ...change, disposition: null, assessmentStatus: 'ASSURANCE_UNAVAILABLE', latestAssessment: null,
            assuranceError: { code: 'ASSURANCE_INTEGRITY_FAILED', message: INTEGRITY_FAILED_MESSAGE },
            ...(change.obligations ? { obligations: change.obligations.map(o => ({ ...o, state: 'NOT_ASSESSED', evidenceCount: 0 })) } : {})
        };
    }
    const latest = runs[0];
    if (!latest)
        return change;
    const current = latest.applicability === 'CURRENT';
    const assessed = current && latest.status === 'COMPLETED' && latest.evidenceIntegrity === 'DIGEST_MATCH';
    return {
        ...change, assessmentStatus: current ? latest.status : 'NOT_ASSESSED', disposition: assessed ? latest.disposition : null,
        latestAssessment: { id: latest.id, status: latest.status, applicability: latest.applicability },
        ...(change.obligations ? {
            obligations: change.obligations.map(o => {
                const finding = assessed ? latest.case?.findings.find(f => f.obligationId === o.id) : null;
                return { ...o, state: finding && finding.state !== 'EXCLUDED' ? finding.state : 'NOT_ASSESSED', evidenceCount: finding?.evidenceIds.length ?? 0 };
            })
        } : {})
    };
}
