/** Reads one field of a JSON object; anything that is not an object has no fields. */
export function field(source: unknown, key: string): unknown {
  return typeof source === 'object' && source !== null ? (source as Record<string, unknown>)[key] : undefined;
}

/** The label for a known value, or undefined. Only the table's own keys match (never `constructor`, ...). */
export function lookup(table: Readonly<Record<string, string>>, value: unknown): string | undefined {
  return typeof value === 'string' && Object.hasOwn(table, value) ? table[value] : undefined;
}

/** A JSON array, or an empty list for anything else. */
export function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}
