import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
/** The web root files (built into frontend/public by `npm run build`). */
const WEB_FILES = [
    ['index.html', 'text/html'], ['app.js', 'text/javascript'], ['app.css', 'text/css'], ['workflow.css', 'text/css'],
    ['assurance.css', 'text/css'], ['resolution.css', 'text/css'], ['theme.css', 'text/css'], ['logo.svg', 'image/svg+xml'],
    ['inter.woff2', 'font/woff2'], ['INTER-LICENSE.txt', 'text/plain']
];
const REQUIRED = new Set(['index.html', 'app.js', 'app.css']);
/** Loads the web root. Start-up fails if index.html, app.js or app.css is missing; other files are optional. */
export function loadAssets(webRoot) {
    const assets = new Map();
    for (const [name, type] of WEB_FILES) {
        try {
            assets.set(name === 'index.html' ? '/' : '/' + name, [readFileSync(resolve(webRoot, name)), type.startsWith('font/') ? type : type + '; charset=utf-8']);
        }
        catch {
            if (REQUIRED.has(name))
                throw new Error('REQUIRED_ASSET_MISSING');
        }
    }
    return assets;
}
/** Serves the web root files to GET requests, before any session check (the sign-in page needs them). */
export function serveAssets(assets) {
    return (req, res, next) => {
        const asset = req.method === 'GET' ? assets.get(req.path) : undefined;
        if (!asset)
            return next();
        res.writeHead(200, { 'Content-Type': asset[1] });
        res.end(asset[0]);
    };
}
