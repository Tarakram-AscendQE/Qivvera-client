import { InputError } from '../../common/errors.js';
import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { rejectQuery } from '../../common/validate.js';

/**
 * GET /api/support-info — allowlisted diagnostics for the Support page (no credentials, accounts or
 * business records). Accepts no query string.
 */
export const supportInfo = defineEndpoint({
  query(_search, url) {
    rejectQuery(url, () => new InputError('SUPPORT_QUERY_UNSUPPORTED', 'Support information does not accept query parameters.', 400));
    return undefined;
  },
  async handle({ services: { readSupport }, session, requestId }) {
    return reply(await readSupport(session, requestId));
  }
});
