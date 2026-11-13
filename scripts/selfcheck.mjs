import { readFileSync } from 'node:fs';
const p = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))), l = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
if (p.name !== l.name || p.version !== l.version || !p.private)
    throw new Error('PACKAGE_IDENTITY_MISMATCH');
for (const group of ['dependencies', 'devDependencies']) {
    if (JSON.stringify(p[group]) !== JSON.stringify(l.packages[''][group]))
        throw new Error('LOCK_ROOT_MISMATCH');
    for (const [name, version] of Object.entries(p[group]))
        if (l.packages['node_modules/' + name]?.version !== version)
            throw new Error('DEPENDENCY_VERSION_MISMATCH');
}
for (const [key, pkg] of Object.entries(l.packages))
    if (key && (!pkg.integrity || !pkg.resolved))
        throw new Error('DEPENDENCY_IDENTITY_MISSING');
console.log('Manifest, pinned versions, and existing registry integrity metadata agree. This is not a fresh install verification.');
