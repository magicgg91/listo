// Point de départ de Listo : lit la configuration, ouvre la base, prépare la
// clé de chiffrement, puis démarre le serveur web.
//
// Lancement : npm start (ou « node server/index.js »)

import path from 'node:path';
import { loadConfig, configProblem } from './config.js';
import { openDatabase, schemaVersion } from './db.js';
import { loadOrCreateKey } from './secrets.js';
import { createApp } from './app.js';
import { createJournalFile } from './audit.js';
import { generateSetupCode } from './auth.js';

const config = loadConfig();

// 0. Configuration incorrecte (adresse sans https en production…) : Listo
//    refuse de démarrer, avec un message clair dans docker logs
const problem = configProblem(config);
if (problem) {
  console.error(`Listo ne démarre pas : ${problem}`);
  process.exit(1);
}
// Contact pour Open Food Facts mal formé : ignoré (sans l'afficher), Listo démarre
if (process.env.LISTO_PRODUCT_CONTACT?.trim() && !config.productContact) {
  console.warn('LISTO_PRODUCT_CONTACT ignorée : caractères non permis (lettres sans accent, chiffres, @ . : / - _ + ~ seulement).');
}

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
const { ctx } = app.locals;
const server = app.listen(config.port, () => {
  console.log(`Listo est démarré sur le port ${server.address().port}`);
});

// 6. Sauvegarde de la base chaque nuit vers 3 h (data/backups, voir backup.js)
ctx.backups.start();
console.log(`Sauvegardes nocturnes : ${ctx.backups.dir}`);

// Arrêt propre (docker stop, mise à jour par « docker compose up -d »,
// Ctrl+C) : plus de nouvelle connexion, flux temps réel fermés, requêtes en
// cours terminées, puis la base est fermée avant de quitter. Rien n'est coupé
// au milieu d'une écriture.
let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`Signal ${signal} reçu : arrêt de Listo.`);
  ctx.stop();                    // ménage, sauvegarde programmée, flux temps réel
  server.close(() => {
    db.close();
    console.log('Base fermée. Listo est arrêté.');
    process.exit(0);
  });
  server.closeIdleConnections(); // connexions inactives fermées tout de suite
  // Une requête bloquée ne retient pas l'arrêt plus de 5 secondes (Docker
  // force l'arrêt au bout de 10)
  setTimeout(() => server.closeAllConnections(), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
