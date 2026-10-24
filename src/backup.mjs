import path from 'node:path';
import { loadConfig } from './config.mjs';
import { openDatabase } from './db/index.mjs';

const config = loadConfig();
const db = openDatabase(config.dataDir);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(config.dataDir, 'backups', `hayz-${stamp}.sqlite`);
db.backupTo(dest);
db.close();
console.log(dest);
