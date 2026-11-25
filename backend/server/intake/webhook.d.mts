/** Types for webhook.mjs, used by the TypeScript API layer (backend/api). */
import type { IncomingHttpHeaders } from 'node:http';

export declare const WEBHOOK_MAX_BYTES: number;
export declare const PULL_REQUEST_ACTIONS: readonly string[];
export interface GitHubDelivery {
  readonly deliveryId: string;
  readonly event: string;
}
/** The delivery GUID and event name, or null when either header is missing or malformed. */
export declare function deliveryHeaders(headers: IncomingHttpHeaders): GitHubDelivery | null;
