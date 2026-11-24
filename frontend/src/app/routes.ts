/**
 * The hash routes. parseRoute() turns `location.hash` into one route; the shell then loads and draws it.
 * Links that are malformed, incomplete or name a disabled feature become an `error` route with the
 * message the person sees. Unknown paths open the workspace overview.
 */
export type Route =
  | { readonly kind: 'guide' }
  | { readonly kind: 'support' }
  | { readonly kind: 'templates'; readonly view: TemplatesView }
  | { readonly kind: 'impact'; readonly changeId: string; readonly revisionId: string }
  | { readonly kind: 'drafting'; readonly changeId: string; readonly revisionId: string; readonly runId: string | null; readonly offset: number }
  | { readonly kind: 'resolution-inbox' }
  | { readonly kind: 'resolution'; readonly id: string }
  | { readonly kind: 'intake' }
  | { readonly kind: 'applications' }
  | { readonly kind: 'application'; readonly id: string }
  | { readonly kind: 'changes' }
  | { readonly kind: 'change'; readonly id: string; readonly revisionId: string | null }
  | { readonly kind: 'activity' }
  | { readonly kind: 'overview' }
  | { readonly kind: 'error'; readonly message: string };

export type TemplatesView =
  | { readonly kind: 'list'; readonly options?: { readonly offset?: number; readonly includeArchived?: boolean; readonly changeId?: string; readonly revisionId?: string } }
  | { readonly kind: 'detail'; readonly templateId: string; readonly versionId: string | null }
  | { readonly kind: 'save'; readonly changeId: string; readonly revisionId: string; readonly templateId: string | null }
  | { readonly kind: 'plan'; readonly changeId: string; readonly revisionId: string; readonly templateId: string; readonly versionId: string }
  /** The template link is incomplete. The templates module still starts, as it did before. */
  | { readonly kind: 'incomplete' };

/** The workspace fields routing reads. Capabilities are read only for the routes that need them. */
export interface RoutingWorkspace {
  readonly capabilities: Readonly<Record<string, unknown>>;
}

const validId = (value: string | undefined): value is string => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
const pageOffset = (value: string | undefined): number | null => (/^\d+$/.test(value ?? '') && Number.isSafeInteger(Number(value)) ? Number(value) : null);

function templatesView(p: readonly string[]): TemplatesView {
  if (p[0] === 'verification-templates') {
    if (p.length === 1) return { kind: 'list' };
    const offset = pageOffset(p[2]);
    if (p[1] === 'page' && [3, 4].includes(p.length) && offset !== null && (p.length === 3 || p[3] === 'all')) return { kind: 'list', options: { offset, includeArchived: p[3] === 'all' } };
    if (validId(p[1]) && (p.length === 2 || (p.length === 4 && p[2] === 'versions' && validId(p[3])))) return { kind: 'detail', templateId: p[1], versionId: p[3] ?? null };
  } else if (p[0] === 'template-save') {
    if (validId(p[1]) && validId(p[2]) && (p.length === 3 || (p.length === 4 && validId(p[3])))) return { kind: 'save', changeId: p[1], revisionId: p[2], templateId: p[3] ?? null };
  } else if (validId(p[1]) && validId(p[2])) {
    const offset = pageOffset(p[4]);
    if (p.length === 3) return { kind: 'list', options: { changeId: p[1], revisionId: p[2] } };
    if (p.length === 5 && p[3] === 'page' && offset !== null) return { kind: 'list', options: { changeId: p[1], revisionId: p[2], offset } };
    if (p.length === 5 && validId(p[3]) && validId(p[4])) return { kind: 'plan', changeId: p[1], revisionId: p[2], templateId: p[3], versionId: p[4] };
  }
  return { kind: 'incomplete' };
}

/**
 * Reads `workspace.capabilities` only where the route depends on it, so (as before) Guide and
 * Support still open when the workspace summary is missing, and other routes fail with a message.
 */
export function parseRoute(hash: string, workspace: RoutingWorkspace): Route {
  const p = hash.replace(/^#\/?/, '').split('/');
  const [section, first, second, third, fourth] = p;
  if (section === 'guide') return { kind: 'guide' };
  if (section === 'support') return { kind: 'support' };
  if (section === 'verification-templates' || section === 'template-save' || section === 'template-plan') {
    if (!workspace.capabilities['verificationTemplates']) return { kind: 'error', message: 'Verification templates are not enabled in this workspace. Existing verification plans remain available.' };
    return { kind: 'templates', view: templatesView(p) };
  }
  if (section === 'impact') {
    if (!workspace.capabilities['revisionImpact']) return { kind: 'error', message: 'Revision impact is not available in this workspace. Open the change to inspect its obligations and evidence.' };
    if (p.length !== 3 || !first || !second) return { kind: 'error', message: 'This impact link is incomplete. Open Impact & next checks from the change.' };
    return { kind: 'impact', changeId: first, revisionId: second };
  }
  if (section === 'drafting') {
    if (!workspace.capabilities['obligationDrafting']) return { kind: 'error', message: 'Source drafting is not enabled in this workspace. Manual obligation authoring remains available.' };
    if (!first || !second || (third && !['runs', 'page'].includes(third)) || (third && !fourth) || p.length > 5) return { kind: 'error', message: 'This source-drafting link is incomplete. Open source drafts from the change.' };
    const offset = third === 'page' ? Number(fourth) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0) return { kind: 'error', message: 'The saved-draft page is invalid. Open source drafts from the change.' };
    return { kind: 'drafting', changeId: first, revisionId: second, runId: third === 'runs' ? fourth! : null, offset };
  }
  if (section === 'resolutions' && workspace.capabilities['resolutionWorkflow']) return first ? { kind: 'resolution', id: first } : { kind: 'resolution-inbox' };
  if (section === 'intake' && workspace.capabilities['githubIntake']) return { kind: 'intake' };
  if (section === 'applications') return first ? { kind: 'application', id: first } : { kind: 'applications' };
  if (section === 'changes') return first ? { kind: 'change', id: first, revisionId: second === 'revisions' && third ? third : null } : { kind: 'changes' };
  if (section === 'activity') return { kind: 'activity' };
  return { kind: 'overview' };
}
