/**
 * Server entrypoint. Opens the persisted DB, builds the app, listens on PORT.
 *
 * Durability model: better-sqlite3 commits each mutating request immediately
 * using SQLite WAL mode and full synchronous writes. The persist() call remains
 * as a compatibility no-op before clean shutdown.
 */
import { openDb } from './db.js';
import { createApp } from './app.js';
import { ensureSeeded } from './repo.js';
import { assertSecrets } from './config.js';

const PORT = Number(process.env.PORT ?? 4000);

async function main() {
  // Fail closed: refuse to boot in production without a strong JWT secret or
  // with open CORS. Must run before any token is signed.
  assertSecrets();
  const handle = await openDb();
  // Single-writer seed: creates a default clinician if none exists, through the
  // same connection the server uses (no separate-connection race).
  ensureSeeded(handle);
  const app = createApp(handle);

  let shuttingDown = false;
  const shutdown = (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[fluentpath-backend] ${sig} received, flushing + closing`);
    try {
      handle.persist();
    } catch (e) {
      console.error('[fluentpath-backend] persist failed', e);
    }
    handle.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  app.listen(PORT, () => {
    console.log(`[fluentpath-backend] listening on http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error('[fluentpath-backend] failed to start', err);
  process.exit(1);
});
