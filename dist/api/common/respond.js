/** A JSON reply with the given status (200 by default). */
export function reply(body, status = 200, headers) {
    return headers ? { status, body, headers } : { status, body };
}
/** A JSON reply that the browser saves as a file with this name. */
export function download(body, filename) {
    return reply(body, 200, { 'Content-Disposition': `attachment; filename="${filename}"` });
}
/**
 * Writes a JSON response exactly as the API always has: one Content-Type header and the JSON text.
 * (Express's res.json() would add an ETag and other headers that clients have never received.)
 */
export function sendJson(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
}
export function sendReply(res, { status, body, headers }) {
    for (const [name, value] of Object.entries(headers ?? {}))
        res.setHeader(name, value);
    sendJson(res, status, body);
}
