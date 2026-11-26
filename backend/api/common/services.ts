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
  /** Always 'postgres': PostgreSQL is the only database. */
  readonly driver: 'postgres';
  readonly reviewMode?: string;
  readonly impact?: ImpactReader;
  readonly drafting?: DraftingService;
  healthy(): Promise<boolean>;
  listApplications(): Promise<unknown>;
  listChanges(): Promise<readonly ChangeRecord[]>;
  listActivity(): Promise<unknown>;
  exportWorkspace(): Promise<unknown>;
  /** `within` runs on the same transaction after the application row is written (used to save its GitHub connection). */
  createApplication(input: unknown, actor: Session, options?: { within?: (client: unknown, application: { id: string }) => Promise<void> }): Promise<unknown>;
  createChange(input: unknown, actor: Session): Promise<unknown>;
  getApplication(id: string): Promise<unknown>;
  /** Hide or show an application; history is never removed. */
  archiveApplication(id: string, input: unknown, actor: Session): Promise<unknown>;
  restoreApplication(id: string, input: unknown, actor: Session): Promise<unknown>;
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
  /** Open pull requests of the application's connected repositories, with their import state. */
  listPulls(applicationId: string, session: Session): Promise<unknown>;
  /** True when a webhook secret is configured (schema 9). */
  readonly webhookEnabled: boolean;
  /** Constant-time HMAC SHA-256 check of the exact body against X-Hub-Signature-256. */
  verifyWebhook(raw: Buffer, signature: string | string[] | undefined): boolean;
  /** Stores one verified delivery (idempotent by delivery ID) and the events it records. */
  receiveWebhook(delivery: { readonly deliveryId: string; readonly event: string; readonly payload: unknown }): Promise<{ readonly outcome: string; readonly reason?: string; readonly duplicate?: boolean }>;
  /** The latest webhook event per pull request for one application. */
  listSourceEvents(applicationId: string, session: Session): Promise<unknown>;
}

/** A GitHub connection as pages see it: repositories, their ids and the rules source. Never the token. */
export interface PrAssuranceConnection {
  readonly applicationId: string;
  readonly app: { readonly repository: string; readonly repositoryId: number };
  readonly tests: { readonly repository: string; readonly repositoryId: number; readonly ref: string };
  readonly profiles: { readonly repository: string; readonly repositoryId: number; readonly commit: string };
  readonly rules: unknown;
  readonly configuredBy: string;
  readonly configuredAt: string;
}

/** Checked with GitHub; `save` encrypts the token for the new application id and writes on the caller's transaction. */
export interface PreparedConnection {
  readonly summary: unknown;
  save(client: unknown, applicationId: string): Promise<void>;
}

/** backend/server/pr-assurance/service.mjs: PR assurance per application (each with its own GitHub token). */
export interface PrAssuranceService {
  readonly credentialsReady: boolean;
  prepareConnection(input: unknown, session: Session, role?: string): Promise<PreparedConnection>;
  connect(applicationId: string, input: unknown, session: Session): Promise<unknown>;
  connections(): Promise<Map<string, PrAssuranceConnection>>;
  overview(applications: readonly { readonly id: string; readonly name?: unknown; readonly description?: unknown; readonly archived?: boolean }[], session: Session): Promise<unknown>;
  scenario(application: { readonly id: string; readonly name?: unknown }, session: Session): Promise<unknown>;
  githubPulls(applicationId: string, session: Session): Promise<unknown>;
  importPull(applicationId: string, pullNumber: number, session: Session): Promise<unknown>;
  startRun(applicationId: string, pullNumber: number, input: unknown, session: Session): Promise<unknown>;
  getRun(runId: string, session: Session): Promise<unknown>;
  syncRun(runId: string, session: Session): Promise<unknown>;
  listRuns(applicationId: string, pullNumber: number, session: Session): Promise<unknown>;
}

export interface Services {
  readonly repository: WorkflowRepository;
  /** Optional features: null when not configured, and then their routes do not exist (404). */
  readonly assurance: AssuranceRepository | null;
  readonly resolution: ResolutionRepository | null;
  readonly intake: IntakeRepository | null;
  readonly prAssurance: PrAssuranceService | null;
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
