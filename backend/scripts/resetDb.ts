// Reset the persisted dev database (wipes users + metrics).
import { openDb } from '../src/db.js';

const handle = await openDb();
handle.clear();
handle.persist();
handle.close();
console.log('[db:reset] cleared fluentpath.db');
