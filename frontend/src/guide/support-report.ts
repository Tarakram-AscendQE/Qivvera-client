import { queryOptions } from '@tanstack/react-query';
import type { LegacyApi, Role } from '../legacy-bridge';

export const SUPPORT_SCHEMA = 'qivvera.support-info/1';

const CAPABILITY_KEYS = ['registry', 'authorityReview', 'assessmentQueue', 'configuredTargets', 'multiObligation', 'resolution', 'githubIntake', 'obligationDrafting', 'aiDrafting', 'revisionImpact', 'verificationTemplates'] as const;
const ACTION_KEYS = ['createChange', 'reviewObligations', 'approvePlans', 'requestAssessment', 'importSource', 'manageResolution', 'draftObligations', 'manageVerificationTemplates'] as const;
const ROLES: readonly Role[] = ['AUTHOR', 'POLICY_AUTHORITY', 'VIEWER'];

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];
export type ActionKey = (typeof ACTION_KEYS)[number];

/** A support-info response that passed the schema check. Other fields are still untrusted. */
export interface SupportInfo {
  readonly schema: typeof SUPPORT_SCHEMA;
  readonly [field: string]: unknown;
}

/**
 * The downloadable diagnostic contract. Values the server reports are copied as received (and are
 * displayed only as text); Booleans are true only when the server sent exactly true.
 */
export interface SupportReport {
  schema: typeof SUPPORT_SCHEMA;
  generatedAt: unknown;
  requestId: unknown;
  product: { name: unknown; version: unknown; revision: unknown };
  workspace: { storage: unknown; schemaVersion: unknown; requiredSchemaVersion: unknown; maxSupportedSchemaVersion: unknown; storageCheck: unknown; reviewMode: unknown; secureSession: boolean };
  capabilities: Record<CapabilityKey, boolean>;
  roles: Role[];
  actions: Record<ActionKey, boolean>;
  warnings: { code: unknown; message: unknown; nextStep: unknown }[];
  limitations: { workerStatus: 'not-observed'; githubConnection: 'not-probed'; aiProviderConnection: 'not-probed'; releaseStatus: 'not-evaluated'; notice: string };
}

/** Reads one field of a JSON object; anything that is not an object has no fields. */
function field(source: unknown, key: string): unknown {
  return typeof source === 'object' && source !== null ? (source as Record<string, unknown>)[key] : undefined;
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickBooleans<K extends string>(source: unknown, keys: readonly K[]): Record<K, boolean> {
  return Object.fromEntries(keys.map(key => [key, field(source, key) === true])) as Record<K, boolean>;
}

export function parseSupportInfo(value: unknown): SupportInfo {
  if (field(value, 'schema') !== SUPPORT_SCHEMA) {
    throw new Error('Support details use an unrecognized format. Ask the workspace operator to check the deployed version.');
  }
  return value as SupportInfo;
}

/**
 * Copies only the diagnostic contract. Never spread server fields into the export: a field added
 * on the server later must not reach a downloaded file without a deliberate change here.
 */
export function toSupportReport(info: SupportInfo): SupportReport {
  const product = info['product'];
  const workspace = info['workspace'];
  return {
    schema: SUPPORT_SCHEMA,
    generatedAt: info['generatedAt'],
    requestId: info['requestId'],
    product: { name: field(product, 'name'), version: field(product, 'version'), revision: field(product, 'revision') },
    workspace: {
      storage: field(workspace, 'storage'),
      schemaVersion: field(workspace, 'schemaVersion'),
      requiredSchemaVersion: field(workspace, 'requiredSchemaVersion'),
      maxSupportedSchemaVersion: field(workspace, 'maxSupportedSchemaVersion'),
      storageCheck: field(workspace, 'storageCheck'),
      reviewMode: field(workspace, 'reviewMode'),
      secureSession: field(workspace, 'secureSession') === true
    },
    capabilities: pickBooleans(info['capabilities'], CAPABILITY_KEYS),
    roles: list(info['roles']).filter((role): role is Role => ROLES.includes(role as Role)),
    actions: pickBooleans(info['actions'], ACTION_KEYS),
    warnings: list(info['warnings']).map(warning => ({ code: field(warning, 'code'), message: field(warning, 'message'), nextStep: field(warning, 'nextStep') })),
    limitations: {
      workerStatus: 'not-observed',
      githubConnection: 'not-probed',
      aiProviderConnection: 'not-probed',
      releaseStatus: 'not-evaluated',
      notice: 'Configuration checks do not establish worker or provider availability, evidence correctness, deployment acceptance or release approval.'
    }
  };
}

export function supportQueryOptions(api: LegacyApi) {
  return queryOptions({
    queryKey: ['support-info'],
    queryFn: async () => parseSupportInfo(await api('/api/support-info'))
  });
}

const ROLE_NAMES: Readonly<Record<string, string>> = { AUTHOR: 'Author', POLICY_AUTHORITY: 'Policy Authority', VIEWER: 'Viewer' };
const REVIEW_MODES: Readonly<Record<string, string>> = { independent: 'Independent review', 'founder-review': 'Founder review — same-person decisions permitted', 'not-available': 'Not available' };

export function roleName(role: unknown): string {
  return typeof role === 'string' && Object.hasOwn(ROLE_NAMES, role) ? ROLE_NAMES[role]! : 'Unknown role';
}

export function reviewModeName(mode: unknown): string {
  return typeof mode === 'string' && Object.hasOwn(REVIEW_MODES, mode) ? REVIEW_MODES[mode]! : 'Not available';
}

export const enabledText = (value: boolean): string => (value ? 'Enabled' : 'Not enabled');
export const availabilityText = (value: boolean): string => (value ? 'Available for your role' : 'Not available for your role');

export const CAPABILITY_LABELS: readonly (readonly [string, CapabilityKey])[] = [
  ['Saved records', 'registry'], ['Requirement review', 'authorityReview'], ['Assessment queue', 'assessmentQueue'],
  ['Approved target configuration', 'configuredTargets'], ['Two supported obligation mappings', 'multiObligation'],
  ['Finding resolution', 'resolution'], ['GitHub source intake', 'githubIntake'],
  ['Source-grounded obligation drafting', 'obligationDrafting'], ['Optional AI drafting configuration', 'aiDrafting'],
  ['Declared revision impact', 'revisionImpact'], ['Reusable verification templates', 'verificationTemplates']
];

export const ACTION_LABELS: readonly (readonly [string, ActionKey])[] = [
  ['Create a change', 'createChange'], ['Draft obligations from source', 'draftObligations'],
  ['Review obligations', 'reviewObligations'], ['Approve a verification plan', 'approvePlans'],
  ['Request an assessment', 'requestAssessment'], ['Import source context', 'importSource'],
  ['Work on a resolution', 'manageResolution'], ['Manage verification templates', 'manageVerificationTemplates']
];
