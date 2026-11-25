import { z } from 'zod';

/** A pull-request number in the path. Which numbers are allowed is decided by the service (#6, #7, #8). */
export const pullParams = z.object({ pullNumber: z.string().regex(/^[1-9][0-9]{0,8}$/).transform(Number) });
