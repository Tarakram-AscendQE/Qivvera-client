import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
function walk(dir) { for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory())
        walk(p);
    else if (/\.(mjs|js)$/.test(e.name)) {
        const r = spawnSync(process.execPath, ['--check', p], { stdio: 'inherit' });
        if (r.status !== 0)
            process.exit(1);
    }
} }
for (const d of ['api', 'backend', 'scripts', 'test', 'fixtures'])
    walk(d);
