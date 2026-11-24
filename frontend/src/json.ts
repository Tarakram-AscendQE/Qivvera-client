/** Reads one field of a JSON object; anything that is not an object has no fields. */
export function field(source: unknown, key: string): unknown {
  return typeof source === 'object' && source !== null ? (source as Record<string, unknown>)[key] : undefined;
}

/** A JSON array, or an empty list for anything else. */
export function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}
