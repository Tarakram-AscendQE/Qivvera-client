import type { ServerResponse } from 'node:http';

/** What an endpoint returns. The router sends it; endpoints never write to the response themselves. */
export interface Reply {
  readonly status: number;
  readonly body: unknown;
  /** Extra response headers, for example Set-Cookie or a download's Content-Disposition. */
  readonly headers?: Readonly<Record<string, string>>;
}

/** A JSON reply with the given status (200 by default). */
export function reply(body: unknown, status = 200, headers?: Readonly<Record<string, string>>): Reply {
  return headers ? { status, body, headers } : { status, body };
}

/** A JSON reply that the browser saves as a file with this name. */
export function download(body: unknown, filename: string): Reply {
  return reply(body, 200, { 'Content-Disposition': `attachment; filename="${filename}"` });
}

/**
 * Writes a JSON response exactly as the API always has: one Content-Type header and the JSON text.
 * (Express's res.json() would add an ETag and other headers that clients have never received.)
 */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export function sendReply(res: ServerResponse, { status, body, headers }: Reply): void {
  for (const [name, value] of Object.entries(headers ?? {})) res.setHeader(name, value);
  sendJson(res, status, body);
}
