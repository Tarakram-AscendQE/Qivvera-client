import type { WorkspaceChange } from './rows';

/**
 * Where a change stands, derived only from the workspace summary (counts and the latest current
 * assessment). It is a reading aid: it never claims readiness that the disposition does not state.
 */
export type Tone = 'ready' | 'not-ready' | 'gap' | 'waiting' | 'active' | 'draft';

export interface Stage {
  /** 1 Describe · 2 Requirements · 3 Plan & check · 4 Result (the change page's steps). */
  readonly step: 1 | 2 | 3 | 4;
  /** Short status shown in a pill. */
  readonly status: string;
  readonly tone: Tone;
  /** What the stage is, in a few words ("Requirements · 2 in review"). */
  readonly detail: string;
  /** Who acts next: 'AUTHOR', 'POLICY_AUTHORITY', 'EITHER' or null (nobody / operator). */
  readonly waitingOn: 'AUTHOR' | 'POLICY_AUTHORITY' | 'EITHER' | null;
}

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export function changeStage(change: WorkspaceChange): Stage {
  const total = count(change.obligationCount), accepted = count(change.acceptedCount), inReview = count(change.inReviewCount), drafts = count(change.draftCount);
  const status = change.assessmentStatus;
  if (change.assuranceError) return { step: 4, status: 'Assurance unavailable', tone: 'gap', detail: 'Saved assessment inputs need the operator', waitingOn: null };
  if (change.disposition === 'READY') return { step: 4, status: 'Ready', tone: 'ready', detail: 'Result · every required item supported', waitingOn: null };
  if (change.disposition === 'NOT_READY') return { step: 4, status: 'Not ready', tone: 'not-ready', detail: 'Result · a required item failed', waitingOn: 'AUTHOR' };
  if (change.disposition === 'INDETERMINATE') return { step: 4, status: 'Can’t decide yet', tone: 'gap', detail: 'Result · gaps remain', waitingOn: 'EITHER' };
  if (status === 'QUEUED' || status === 'RUNNING') return { step: 3, status: status === 'QUEUED' ? 'Check queued' : 'Check running', tone: 'active', detail: 'Plan & check · worker is busy', waitingOn: null };
  if (change.latestAssessment?.applicability === 'STALE_INPUTS') return { step: 3, status: 'Re-check needed', tone: 'waiting', detail: 'Plan & check · inputs changed', waitingOn: 'EITHER' };
  if (!total) return { step: 2, status: 'No requirements', tone: 'draft', detail: 'Requirements · none yet', waitingOn: 'AUTHOR' };
  if (drafts) return { step: 2, status: 'Draft', tone: 'draft', detail: `Requirements · ${drafts} ${drafts === 1 ? 'draft' : 'drafts'}`, waitingOn: 'AUTHOR' };
  if (inReview) return { step: 2, status: 'Waiting for review', tone: 'waiting', detail: `Requirements · ${inReview} in review`, waitingOn: 'POLICY_AUTHORITY' };
  if (!accepted) return { step: 2, status: 'Nothing accepted', tone: 'gap', detail: 'Requirements · all rejected', waitingOn: 'AUTHOR' };
  return { step: 3, status: 'Ready to plan and check', tone: 'waiting', detail: 'Plan & check · approve a plan, then run it', waitingOn: 'EITHER' };
}

export const waitingOnLabel = (value: Stage['waitingOn']): string =>
  value === 'AUTHOR' ? 'Author' : value === 'POLICY_AUTHORITY' ? 'Policy Authority' : value === 'EITHER' ? 'Author or Policy Authority' : '—';

/** True when the signed-in roles can take the next step. */
export function isMyTurn(stage: Stage, roles: { readonly author: boolean; readonly authority: boolean }): boolean {
  if (stage.waitingOn === 'AUTHOR') return roles.author;
  if (stage.waitingOn === 'POLICY_AUTHORITY') return roles.authority;
  if (stage.waitingOn === 'EITHER') return roles.author || roles.authority;
  return false;
}
