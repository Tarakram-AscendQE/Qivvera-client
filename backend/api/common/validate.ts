import { z } from 'zod';
import { InputError } from './errors.js';

/**
 * A record id in a URL path: 36 characters of lower-case hex digits and dashes (the UUID text form).
 * A path whose id does not match is not a route at all, so it gets the normal 404 NOT_FOUND.
 */
export const recordId = z.string().regex(/^[a-f0-9-]{36}$/);

/** Path parameters made of record ids, for example `idParams('changeId')` for `/api/changes/:changeId`. */
export function idParams<const K extends string>(...names: K[]) {
  return z.strictObject(Object.fromEntries(names.map(name => [name, recordId])) as { [P in K]: typeof recordId });
}

/** An optional query value: present text, or absent. */
export const optionalText = z.string().optional();

/**
 * Reads the named query values the way the API always has (`URLSearchParams.get`: the first value,
 * absent → undefined; other keys are ignored) and checks them with the Zod schema. `invalid` builds the
 * InputError the client receives when the check fails, so each endpoint keeps its documented message.
 */
export function readQuery<S extends z.ZodObject>(search: URLSearchParams, schema: S, invalid?: () => InputError): z.infer<S> {
  const values = Object.fromEntries(Object.keys(schema.shape).map(key => [key, search.get(key) ?? undefined]));
  const result = schema.safeParse(values);
  if (result.success) return result.data;
  throw invalid?.() ?? new InputError('QUERY_UNSUPPORTED', 'This query is not supported.');
}

/** For endpoints that accept no query string at all: throws `invalid()` when one is present. */
export function rejectQuery(url: URL, invalid: () => InputError): void {
  if (url.search) throw invalid();
}

/** Every query key appears at most once, has a value, and is one of `allowed`. */
export function onlyKnownQueryKeys(search: URLSearchParams, allowed: readonly string[]): boolean {
  const entries = [...search.entries()];
  return entries.every(([key, value]) => allowed.includes(key) && value !== '') && new Set(entries.map(([key]) => key)).size === entries.length;
}

/** A non-negative whole number written without a leading zero ("0", "20"). */
export const wholeNumberText = z.string().regex(/^(0|[1-9][0-9]*)$/);
