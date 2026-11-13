import { resolve } from 'node:path';
import { loadConfig } from './config.mjs';
import { openWorkflowRepository } from './workflow-repository.mjs';
import { createApplicationServer } from './app.mjs';
let repository;
try {
    const cfg = loadConfig();
    repository = await openWorkflowRepository(cfg.database);
    const server = createApplicationServer({ repository, accounts: cfg.accounts, publicOrigin: cfg.publicOrigin, secureCookies: cfg.hosted, releaseRevision: cfg.releaseRevision, webRoot: resolve('web') });
    server.listen(cfg.port, cfg.host, () => console.log(`Qivvera registry 0.3.0 started; assurance execution is not enabled.`));
    let closing = false;
    for (const signal of ['SIGTERM', 'SIGINT'])
        process.on(signal, () => { if (closing)
            return; closing = true; const timer = setTimeout(() => process.exit(1), 10000); timer.unref(); server.close(async () => { await repository.close(); process.exit(0); }); });
}
catch (e) {
    console.error('QIVVERA_STARTUP_FAILED: verify deployment configuration and migration.');
    if (repository)
        await repository.close();
    process.exitCode = 1;
}
