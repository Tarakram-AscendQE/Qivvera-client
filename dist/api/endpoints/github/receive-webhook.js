import { deliveryHeaders, WEBHOOK_MAX_BYTES } from '../../../../backend/server/intake/webhook.mjs';
import { readRawBody } from '../../common/body.js';
import { errorBody } from '../../common/errors.js';
import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
const notEnabled = (requestId) => reply(errorBody('NOT_FOUND', 'GitHub webhooks are not enabled.', requestId), 404);
/**
 * POST /api/github/webhook — a GitHub pull_request delivery. GitHub sends no session or Origin, so this
 * runs before those checks and is authenticated only by the HMAC signature over the exact body.
 * Receipt only: it records the event and never imports, executes or writes anything to GitHub.
 */
export const receiveWebhook = defineEndpoint({
    async handle({ services: { intake }, req, requestId }) {
        if (!intake?.webhookEnabled)
            return notEnabled(requestId);
        const raw = await readRawBody(req, WEBHOOK_MAX_BYTES);
        if (!intake.verifyWebhook(raw, req.headers['x-hub-signature-256'])) {
            return reply(errorBody('INVALID_SIGNATURE', 'The webhook signature is not valid.', requestId), 401);
        }
        const delivery = deliveryHeaders(req.headers);
        if (!delivery)
            return reply(errorBody('INVALID_DELIVERY', 'GitHub delivery and event headers are required.', requestId), 400);
        let payload;
        try {
            payload = JSON.parse(raw.toString('utf8'));
        }
        catch {
            return reply(errorBody('INVALID_JSON', 'The request is not valid JSON.', requestId), 400);
        }
        const result = await intake.receiveWebhook({ ...delivery, payload });
        return reply({ received: true, outcome: result.outcome, ...(result.reason ? { reason: result.reason } : {}), requestId }, result.duplicate || delivery.event === 'ping' ? 200 : 202);
    }
});
/** Any other method on the webhook path: 405 when webhooks are enabled, otherwise the path does not exist. */
export const webhookMethodNotAllowed = defineEndpoint({
    async handle({ services: { intake }, requestId }) {
        if (!intake?.webhookEnabled)
            return notEnabled(requestId);
        return reply(errorBody('METHOD_NOT_ALLOWED', 'Use POST.', requestId), 405);
    }
});
