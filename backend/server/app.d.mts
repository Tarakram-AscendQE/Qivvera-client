import type { RequestListener } from 'node:http';

/** Types for app.mjs: the old request router, used only as the fallback while endpoints move to backend/api. */
export declare function createLegacyRequestHandler(options: object): RequestListener;
