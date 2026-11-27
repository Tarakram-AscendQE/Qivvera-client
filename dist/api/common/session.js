import { refuse } from './errors.js';
/** Every route after this one needs a signed-in session (401 AUTH_REQUIRED). The session is kept in res.locals. */
export function requireSession(auth) {
    return async (req, res, next) => {
        const session = await auth.session(req);
        if (!session)
            return refuse(res, 401, 'AUTH_REQUIRED', 'Sign in to your workspace.');
        res.locals.session = session;
        next();
    };
}
/** The session fields the browser may see. The session token itself stays in the HttpOnly cookie. */
export function publicSession(session, reviewMode) {
    return { email: session.email, roles: session.roles ?? ['AUTHOR'], csrfToken: session.csrfToken, reviewMode };
}
