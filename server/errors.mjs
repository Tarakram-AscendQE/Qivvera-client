export class InputError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

export function fields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('INVALID_INPUT', 'Send a JSON object.');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new InputError('UNKNOWN_FIELD', `Unexpected field: ${key}`);
}

