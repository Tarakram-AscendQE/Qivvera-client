/**
 * What an endpoint can use. The server builds one `Services` object at start-up and every endpoint
 * receives it in its context, so endpoints never create repositories or read configuration themselves.
 *
 * The repositories are the existing JavaScript modules in backend/server. Their methods validate input
 * and throw InputError with the exact messages clients see, so the types here describe only the calls
 * endpoints make. Results are sent to the client unchanged, so most are `unknown`.
 */
import type { SupportReader } from '../../../backend/server/support-info.mjs';
import type { WorkspaceAuth, WorkspaceSession } from '../../../backend/server/workspace-auth.mjs';
import type { AssetMap } from './assets.js';

export type Session = WorkspaceSession;

/** A record a write may return again (same request key): `replayed` turns 201 Created into 200 OK. */
export interface MaybeReplayed {
  readonly replayed?: boolean;
}

/** A change as stored (only the fields the API layer reads). */
export interface ChangeRecord {
  readonly id: string;
  readonly revision: { readonly id: string };
  readonly obligations?: readonly { readonly id: string }[];
}

/** An assessment run (only the fields the change summary reads). */
export interface AssessmentRun {
  readonly id: string;
  readonly status: string;
  readonly applicability: string;
  readonly evidenceIntegrity?: string;
  readonly disposition?: unknown;
  readonly case?: { readonly findings: readonly { readonly obligationId: string; readonly state: string; readonly evidenceIds: readonly unknown[] }[] } | null;
}

export interface PageOptions {
  readonly offset: number;
  readonly limit: number;
}

/** backend/server/workflow-repository.mjs: applications, changes, obligations, revisions. */
export interface WorkflowRepository {
  readonly workflow: true;
  readonly driver?: string;
  readonly reviewMode?: string;
  readonly impact?: ImpactReader;
  readonly drafting?: DraftingService;
  healthy(): Promise<boolean>;
  listApplications(): Promise<unknown>;
  listChanges(): Promise<readonly ChangeRecord[]>;
  listActivity(): Promise<unknown>;
  exportWorkspace(): Promise<unknown>;
  createApplication(input: unknown, actor: Session): Promise<unknown>;
  createChange(input: unknown, actor: Session): Promise<unknown>;
  getApplication(id: string): Promise<unknown>;
  getChange(id: string, revisionId?: string): Promise<ChangeRecord | null>;
  addObligation(changeId: string, input: unknown, actor: Session): Promise<unknown>;
  editObligation(id: string, input: unknown, actor: Session): Promise<unknown>;
  transitionObligation(id: string, input: unknown, actor: Session): Promise<unknown>;
  getObligationHistory(id: string): Promise<unknown>;
  createRevision(changeId: string, input: unknown, actor: Session): Promise<unknown>;
}

/** backend/server/impact: read-only comparison of a revision with its parent. */
export interface ImpactReader {
  get(changeId: string, revisionId: string): Promise<unknown>;
}

/** backend/server/drafting: source-grounded drafts and their human decisions. */
export interface DraftingService {
  getContext(changeId: string, revisionId: string | undefined, page: PageOptions): Promise<unknown>;
  generate(changeId: string, input: unknown, session: Session): Promise<MaybeReplayed>;
  act(runId: string, suggestionId: string, input: unknown, session: Session): Promise<unknown>;
  get(runId: string): Promise<unknown>;
}

/** backend/server/assurance/repository.mjs: plans, assessment runs and their evidence. */
export interface AssuranceRepository {
  readonly enabled?: boolean;
  readonly templates?: TemplateRepository;
  listRuns(changeId: string, revisionId: string | null): Promise<readonly AssessmentRun[]>;
  getContext(changeId: string, revisionId: string | null): Promise<unknown>;
  approvePlan(changeId: string, input: unknown, session: Session): Promise<MaybeReplayed>;
  requestRun(changeId: string, input: unknown, session: Session): Promise<unknown>;
  cancel(runId: string, session: Session): Promise<unknown>;
  getRun(runId: string): Promise<unknown>;
}

/** backend/server/templates: versioned verification templates. */
export interface TemplateRepository {
  list(options: { readonly offset: number; readonly limit: number; readonly includeArchived: boolean }): Promise<unknown>;
  get(templateId: string, options: { readonly versionId: string | null }): Promise<unknown>;
  create(input: unknown, session: Session): Promise<MaybeReplayed>;
  revise(templateId: string, input: unknown, session: Session): Promise<MaybeReplayed>;
  archive(templateId: string, input: unknown, session: Session): Promise<unknown>;
}

/** backend/server/resolution/repository.mjs: tracking findings to a verified correction. */
export interface ResolutionRepository {
  listAssignees(): Promise<unknown>;
  list(options: PageOptions & { readonly changeId?: string }): Promise<unknown>;
  create(runId: string, input: unknown, session: Session): Promise<MaybeReplayed>;
  act(resolutionId: string, input: unknown, session: Session): Promise<unknown>;
  get(resolutionId: string): Promise<unknown>;
  export(resolutionId: string): Promise<unknown>;
}

/** backend/server/intake/repository.mjs: GitHub pull-request source context. */
export interface IntakeRepository {
  listRepositories(): Promise<unknown>;
  preview(input: unknown, session: Session): Promise<unknown>;
  importPreview(input: unknown, session: Session): Promise<MaybeReplayed>;
  list(changeId: string): Promise<unknown>;
}

export interface Services {
  readonly repository: WorkflowRepository;
  /** Optional features: null when not configured, and then their routes do not exist (404). */
  readonly assurance: AssuranceRepository | null;
  readonly resolution: ResolutionRepository | null;
  readonly intake: IntakeRepository | null;
  readonly auth: WorkspaceAuth;
  readonly readSupport: SupportReader;
  readonly assets: AssetMap;
  /** The only origin allowed to send writes (exact, from configuration). */
  readonly publicOrigin: string;
  /** True when hosted over HTTPS: adds Strict-Transport-Security and secure cookies. */
  readonly secureCookies: boolean;
  /** The deployed Git commit, or 'unrecorded'. */
  readonly releaseRevision: string;
}
