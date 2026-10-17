// Sauvegarde de la base à la demande, en plus de celle de chaque nuit.
// Utile juste avant une mise à jour ou une restauration :
//   docker exec -u node listo node server/backup-now.js
// (« -u node » : la copie appartient à Listo, comme celles de la nuit)
// La copie est faite et contrôlée exactement comme la nuit (voir backup.js),
// dans data/backups, sans arrêter Listo.

import path from 'node:path';
import Database from 'better-sqlite3';
import { loadConfig } from './config.js';
import { createBackups } from './backup.js';
import { createAudit, createJournalFile } from './audit.js';

// Lancée en administrateur (root), la copie et son dossier n'appartiendraient
// plus à Listo, qui ne pourrait plus y écrire ses sauvegardes de la nuit
if (process.getuid?.() === 0) {
  console.error('Sauvegarde non faite : lancez cette commande avec « -u node » :');
  console.error('  docker exec -u node listo node server/backup-now.js');
  process.exit(1);
}

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
