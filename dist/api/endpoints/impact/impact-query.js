import { InputError } from '../../common/errors.js';
/** Impact needs exactly one query value, `revision`, and nothing else. */
export function readImpactRevision(search) {
    const entries = [...search.entries()];
    const [only] = entries;
    if (entries.length !== 1 || !only || only[0] !== 'revision' || !only[1]) {
        throw new InputError('IMPACT_QUERY_UNSUPPORTED', 'Select exactly one revision. No other query parameters are supported.', 400);
    }
    return only[1];
}
