/** Types for errors.mjs, used by the TypeScript API layer (backend/api). */
export declare class InputError extends Error {
  constructor(code: string, message: string, status?: number);
  readonly code: string;
  readonly status: number;
}
/** Throws INVALID_INPUT unless `value` is a JSON object, and UNKNOWN_FIELD for a key not in `allowed`. */
export declare function fields(value: unknown, allowed: readonly string[]): asserts value is Record<string, unknown>;
