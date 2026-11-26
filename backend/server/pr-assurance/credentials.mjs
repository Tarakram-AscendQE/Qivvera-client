/**
 * Encryption of each application's GitHub token at rest: AES-256-GCM with a 32-byte key from
 * QIVVERA_CREDENTIAL_KEY (base64). The key never reaches the database, a response or a log.
 *
 * The application id is authenticated data, so a ciphertext copied onto another application's row
 * does not decrypt. The stored key id is a one-way fingerprint of the key: when the deployer replaces
 * the key, tokens saved with the old one are reported as needing to be entered again, not as corrupt.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { InputError } from '../workflow-input.mjs';

export const CREDENTIAL_KEY_ENV = 'QIVVERA_CREDENTIAL_KEY';
const FORMAT = 'v1';
const aad = applicationId => Buffer.from(`qivvera-github-token:${FORMAT}:${applicationId}`, 'utf8');
const AGAIN = 'Enter the token again in the application\'s GitHub settings.';

/**
 * The sealer for the key in the environment, or null when none is set. A malformed key throws, so the
 * server does not start with a key it cannot use.
 */
export function loadCredentialKey(env = process.env) {
    const raw = typeof env[CREDENTIAL_KEY_ENV] === 'string' ? env[CREDENTIAL_KEY_ENV].trim() : '';
    if (!raw) return null;
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32 || key.toString('base64') !== raw) throw new Error('INVALID_CREDENTIAL_KEY');
    const keyId = `k:${createHash('sha256').update('qivvera-credential-key-id\0').update(key).digest('hex').slice(0, 16)}`;

    return Object.freeze({
        keyId,
        /** { ciphertext, keyId } for this application's token. */
        seal(token, applicationId) {
            const nonce = randomBytes(12);
            const cipher = createCipheriv('aes-256-gcm', key, nonce);
            cipher.setAAD(aad(applicationId));
            const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
            return { ciphertext: [FORMAT, nonce, cipher.getAuthTag(), body].map(p => (typeof p === 'string' ? p : p.toString('base64'))).join('.'), keyId };
        },
        /** The token, or an InputError that says to enter it again; never the reason in detail. */
        open({ ciphertext, keyId: storedKeyId }, applicationId) {
            if (storedKeyId !== keyId) throw new InputError('GITHUB_TOKEN_KEY_CHANGED', `This application's GitHub token was saved with an encryption key this server no longer has. ${AGAIN}`, 409);
            const [format, nonce, tag, body] = String(ciphertext).split('.');
            try {
                if (format !== FORMAT) throw new Error('format');
                const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64'));
                decipher.setAAD(aad(applicationId));
                decipher.setAuthTag(Buffer.from(tag, 'base64'));
                return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
            } catch {
                throw new InputError('GITHUB_TOKEN_UNREADABLE', `This application's stored GitHub token could not be decrypted. ${AGAIN}`, 409);
            }
        },
    });
}

/** Raised when a token must be encrypted or decrypted but the deployer has not set a key. */
export const keyMissing = () => new InputError('CREDENTIAL_KEY_NOT_CONFIGURED', `GitHub tokens cannot be stored or used: ask the deployer to set ${CREDENTIAL_KEY_ENV}.`, 503);
