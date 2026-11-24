/** Same output as the legacy date(): medium date and short time in the viewer's locale. Throws for an invalid date. */
export function formatDate(value: unknown): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value as string | number));
}

/** Same markup as the legacy badge(): a status pill whose text is always plain text. */
export function Badge({ text, kind = '' }: { text: unknown; kind?: string }) {
  return <span className={`pill ${kind}`}>{String(text ?? '')}</span>;
}

/** The legacy short id for an obligation: OBL- and the first 8 characters, upper case. */
export function obligationLabel(id: unknown): string {
  return 'OBL-' + String(id ?? '').slice(0, 8).toUpperCase();
}
