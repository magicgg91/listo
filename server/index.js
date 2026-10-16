// Point de départ de Listo : lit la configuration, ouvre la base, prépare la
// clé de chiffrement, puis démarre le serveur web.
//
// Lancement : npm start (ou « node server/index.js »)

import path from 'node:path';
import { loadConfig } from './config.js';
import { openDatabase, schemaVersion } from './db.js';
import { loadOrCreateKey } from './secrets.js';
import { createApp } from './app.js';
import { createJournalFile } from './audit.js';
import { generateSetupCode } from './auth.js';

const config = loadConfig();

// 1. Base de données (créée au premier démarrage, mise à jour ensuite)
const db = openDatabase(config.dbPath);
console.log(`Base de données : ${config.dbPath} (schéma version ${schemaVersion(db)})`);

// 2. Clé de chiffrement des secrets 2FA (créée au premier démarrage)
const { key, created } = loadOrCreateKey(config.keyPath);
if (created) {
  console.log(`Clé de chiffrement créée : ${config.keyPath}`);
  console.log('  Pensez à en garder une copie à part (gestionnaire de mots de passe).');
} else {
  console.log(`Clé de chiffrement chargée : ${config.keyPath}`);
}

// 3. Tant qu'aucun compte n'existe : code de démarrage à usage unique, à
//    saisir pour créer le compte Admin. Il n'est affiché qu'ici, dans les
//    journaux du conteneur (docker logs listo). Un nouveau code est tiré à
//    chaque démarrage, tant que le compte Admin n'a pas été créé.
let setupCode = null;
if (db.prepare('SELECT COUNT(*) FROM users').pluck().get() === 0) {
  setupCode = generateSetupCode();
  console.log('');
  console.log('==============================================================');
  console.log("  Aucun compte n'existe encore. Code de démarrage :");
  console.log('');
  console.log(`      ${setupCode}`);
  console.log('');
  console.log("  Saisissez-le à l'écran de première connexion pour créer le");
  console.log("  compte Admin. Il ne sert qu'une fois.");
  console.log('==============================================================');
  console.log('');
}

// 4. Journal de sécurité, aussi écrit dans data/journal.log (à côté de la base)
const journalPath = path.join(path.dirname(config.dbPath), 'journal.log');
const journalFile = createJournalFile({ path: journalPath });
console.log(`Journal de sécurité : ${journalPath}`);

// 5. Serveur web
const app = createApp({ db, config, masterKey: key, setupCode, journalFile });
const server = app.listen(config.port, () => {
  console.log(`Listo est démarré sur le port ${server.address().port}`);
});

// Arrêt propre (docker stop, Ctrl+C) : on finit les requêtes en cours et on
// ferme la base avant de quitter.
function shutdown(signal) {
  console.log(`Signal ${signal} reçu : arrêt de Listo.`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  // Les connexions qui restent ouvertes (plus tard : flux temps réel) sont
  // coupées pour ne pas bloquer l'arrêt.
  server.closeAllConnections();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
