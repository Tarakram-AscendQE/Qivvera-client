import { z } from 'zod';
import { InputError } from '../../common/errors.js';
import { idParams, onlyKnownQueryKeys, readQuery, wholeNumberText } from '../../common/validate.js';
const unsupported = () => new InputError('TEMPLATE_QUERY_UNSUPPORTED', 'Use only the supported query fields once. Mutations do not accept query parameters.', 400);
/** Every verification-template path: the template list accepts offset/limit/includeArchived, a template accepts version, writes accept none. */
export const templateListQueryCheck = {
    check(search, method) {
        if (!onlyKnownQueryKeys(search, method === 'GET' ? ['offset', 'limit', 'includeArchived'] : []))
            throw unsupported();
    }
};
export const templateQueryCheck = {
    params: idParams('templateId'),
    check(search, method) {
        if (!onlyKnownQueryKeys(search, method === 'GET' ? ['version'] : []))
            throw unsupported();
    }
};
/** The template list's paging and archive filter (20 per page by default). */
export function readTemplateListQuery(search) {
    const values = readQuery(search, z.object({ offset: wholeNumberText.optional(), limit: wholeNumberText.optional(), includeArchived: z.enum(['true', 'false']).optional() }), () => new InputError('TEMPLATE_QUERY_UNSUPPORTED', 'Use nonnegative whole-number pagination and true or false for includeArchived.', 400));
    return { offset: Number(values.offset ?? 0), limit: Number(values.limit ?? 20), includeArchived: values.includeArchived === 'true' };
}
/** The `version` a template link names, or null for the latest. */
export function readTemplateVersion(search) {
    return { versionId: search.get('version') };
}
