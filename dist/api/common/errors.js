import { InputError } from '../../../backend/server/errors.mjs';
import { sendJson } from './respond.js';
export { InputError, fields } from '../../../backend/server/errors.mjs';
/** The error body every endpoint uses: a machine code, a message for people, and the request reference. */
export function errorBody(code, message, requestId) {
    return { error: code, message, requestId };
}
/** Sends one of the fixed refusals (wrong origin, no session, CSRF, not found) in the standard shape. */
export function refuse(res, status, code, message) {
    sendJson(res, status, errorBody(code, message, res.locals.requestId));
}
/** Last in the chain: no endpoint matched this method and path. */
export function notFound(_req, res) {
    refuse(res, 404, 'NOT_FOUND', 'This capability is not available in this release.');
}
/**
 * Express error handler (four arguments; Express 5 sends rejected promises here:
 * https://expressjs.com/en/guide/error-handling.html#errors-in-asynchronous-code).
 * An InputError is the client's fault and is shown as-is. Anything else is logged without request data
 * and answered with a generic message, because the outcome of a write may be unknown.
 */
export function handleErrors(error, _req, res, next) {
    if (res.headersSent)
        return next(error);
    if (error instanceof InputError)
        return refuse(res, error.status, error.code, error.message);
    console.error(JSON.stringify({ event: 'request_failed', requestId: res.locals.requestId }));
    refuse(res, 500, 'INTERNAL_ERROR', 'The request could not be confirmed. Reload saved records before retrying.');
}
