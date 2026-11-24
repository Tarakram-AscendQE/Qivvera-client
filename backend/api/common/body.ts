import type { IncomingMessage } from 'node:http';
import { InputError } from './errors.js';

/** The default request-body limit; some endpoints allow 32 KB. */
export const DEFAULT_BODY_LIMIT = 16384;

const tooLarge = (maxBytes: number) => new InputError('BODY_TOO_LARGE', `Request exceeds ${maxBytes / 1024} KB.`, 413);
const invalidJson = () => new InputError('INVALID_JSON', 'The request is not valid JSON.');

/**
 * Reads a JSON request body. Rules clients rely on:
 * - Content-Type must be application/json (415 JSON_REQUIRED);
 * - the body may not exceed `maxBytes` (413 BODY_TOO_LARGE), checked from Content-Length and while reading;
 * - the text must be valid JSON (400 INVALID_JSON);
 * - a body already parsed by a serverless adapter (req.body) gets the same size and JSON checks.
 */
export function readJsonBody(req: IncomingMessage & { body?: unknown }, maxBytes = DEFAULT_BODY_LIMIT): Promise<unknown> {
  if ((req.headers['content-type'] ?? '').split(';')[0]!.trim() !== 'application/json') {
    return Promise.reject(new InputError('JSON_REQUIRED', 'Send JSON.', 415));
  }
  if (Number(req.headers['content-length'] ?? 0) > maxBytes) {
    req.resume();
    return Promise.reject(tooLarge(maxBytes));
  }
  if (req.body !== undefined) return Promise.resolve().then(() => parsedBody(req.body, maxBytes));
  return new Promise((accept, reject) => {
    let size = 0, chunks: Buffer[] = [], oversize = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        if (!oversize) reject(tooLarge(maxBytes));
        oversize = true;
        chunks = [];
      } else if (!oversize) chunks.push(chunk);
    });
    req.on('end', () => {
      if (oversize) return;
      try {
        accept(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(invalidJson());
      }
    });
    req.on('error', reject);
    req.on('aborted', () => reject(new InputError('REQUEST_ABORTED', 'The request was interrupted.')));
  });
}

function parsedBody(raw: unknown, maxBytes: number): unknown {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : raw;
  if (typeof text !== 'string') {
    if (Buffer.byteLength(JSON.stringify(text)) > maxBytes) throw tooLarge(maxBytes);
    return text;
  }
  if (Buffer.byteLength(text) > maxBytes) throw tooLarge(maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw invalidJson();
  }
}
