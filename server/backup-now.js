// Sauvegarde de la base à la demande, en plus de celle de chaque nuit.
// Utile juste avant une mise à jour ou une restauration :
//   docker exec listo node server/backup-now.js
// La copie est faite et contrôlée exactement comme la nuit (voir backup.js),
// dans data/backups, sans arrêter Listo.

import path from 'node:path';
import Database from 'better-sqlite3';
import { loadConfig } from './config.js';
import { createBackups } from './backup.js';
import { createAudit, createJournalFile } from './audit.js';

const config = loadConfig();
const dataDir = path.dirname(config.dbPath);
let db;
try {
  db = new Database(config.dbPath, { fileMustExist: true });
} catch {
  console.error(`Sauvegarde impossible : base introuvable (${config.dbPath}).`);
  process.exit(1);
}
db.pragma('busy_timeout = 5000');
const audit = createAudit({ file: createJournalFile({ path: path.join(dataDir, 'journal.log') }) });
const result = createBackups({ db, dir: path.join(dataDir, 'backups'), audit }).run();
db.close();
console.log(result.ok ? `Sauvegarde créée : ${result.file}` : `Sauvegarde ratée : ${result.error}`);
process.exit(result.ok ? 0 : 1);
