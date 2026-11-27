import { InputError } from '../../common/errors.js';
import { rejectQuery } from '../../common/validate.js';
/** Drafting run records accept no query string. */
export function noDraftingRunQuery(_search, url) {
    rejectQuery(url, () => new InputError('DRAFTING_QUERY_UNSUPPORTED', 'Drafting records do not accept query parameters.'));
    return undefined;
}
