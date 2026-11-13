/** Compatibility export for the deployed storage module path.
 * Hosted runtime now uses the shared workflow repository and explicit migrations.
 * Caller must pass a server-established actor object, not a client email string.
 */
import { openWorkflowRepository } from './workflow-repository.mjs';
export { InputError, fields } from './errors.mjs';
export async function openPostgresRepository(connectionString, options = {}) {
    return openWorkflowRepository({ ...options, driver: 'postgres', connectionString, migrate: options.migrate === true });
}
