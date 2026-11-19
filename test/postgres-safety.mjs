/** Safety gate for destructive integration fixtures. No connection is made by this module. */
export function requireDisposablePostgresURL(raw) {
    const refuse = () => { throw new Error('TEST_DATABASE_URL must name an explicit disposable loopback qivvera_test_* PostgreSQL database without query options or fragments.'); };
    if (typeof raw !== 'string' || !raw || raw.trim() !== raw || /[\u0000-\u0020\u007f?#]/u.test(raw)) refuse();
    let url;
    try { url = new URL(raw); } catch { refuse(); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname.toLowerCase()) ||
        !/^\/qivvera_test_[a-z0-9_]+$/.test(url.pathname) ||
        url.pathname.length > 64 || !url.username || url.search || url.hash) refuse();
    try {
        if (/[\u0000-\u001f\u007f]/u.test(decodeURIComponent(url.username) + decodeURIComponent(url.password))) refuse();
    } catch { refuse(); }
    if (url.port && (!Number.isInteger(Number(url.port)) || Number(url.port) < 1 || Number(url.port) > 65535)) refuse();
    return url.toString();
}
