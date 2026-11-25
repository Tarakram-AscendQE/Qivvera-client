/**
 * Starts a local PostgreSQL 17 for development (Docker, 127.0.0.1 only) and prints its DATABASE_URL.
 * The database lives only while this runs; Ctrl+C stops and removes it.
 *
 *   node scripts/postgres-dev.mjs
 *   DATABASE_URL=<printed URL> DATABASE_SSL_MODE=disable QIVVERA_MIGRATE_LOCAL=true npm start
 */
import { startPostgresContainer } from './postgres-container.mjs';

const container = await startPostgresContainer({ label: 'qivvera-dev', database: 'qivvera' });
console.log(`\n  PostgreSQL is running (data is removed when you stop this).\n  DATABASE_URL=${container.adminUrl}\n  DATABASE_SSL_MODE=disable\n\n  Press Ctrl+C to stop.\n`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { container.stop(); process.exit(0); });
setInterval(() => {}, 1 << 30);
