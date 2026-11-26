import { z } from 'zod';
import { InputError } from '../../common/errors.js';
import type { WorkflowRepository } from '../../common/services.js';
import { idParams } from '../../common/validate.js';

/** An application id in the path. */
export const applicationParams = idParams('applicationId');

/** An application id and a pull-request number in the path. Which PRs exist is decided by the application's repository. */
export const pullParams = idParams('applicationId').extend({ pullNumber: z.string().regex(/^[1-9][0-9]{0,8}$/).transform(Number) });

/** The registered application, or 404 APPLICATION_NOT_FOUND. */
export async function requireApplication(repository: WorkflowRepository, id: string): Promise<{ id: string; name?: unknown; archived?: boolean }> {
  const application = await repository.getApplication(id) as { id: string; name?: unknown; archived?: boolean } | null;
  if (!application) throw new InputError('APPLICATION_NOT_FOUND', 'Application not found.', 404);
  return application;
}
