// Offline seed tool: create the default clinician if it doesn't exist.
//
// NOTE: in normal dev the server already auto-seeds a clinician on startup.
// Run this script only to (re)seed a database that no running server is using.
import { openDb } from '../src/db.js';
import { ensureSeeded } from '../src/repo.js';

const handle = await openDb();
ensureSeeded(handle);
handle.close();
console.log('[seed] done (clinician ensured via env: CLINICIAN_EMAIL / CLINICIAN_PASSWORD)');
