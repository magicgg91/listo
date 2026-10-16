// Point de départ de Listo : lit la configuration, ouvre la base, prépare la
// clé de chiffrement, puis démarre le serveur web.
//
// Lancement : npm start (ou « node server/index.js »)

import { loadConfig } from './config.js';
import { openDatabase, schemaVersion } from './db.js';
import { loadOrCreateKey } from './secrets.js';
import { createApp } from './app.js';

const config = loadConfig();

// 1. Base de données (créée au premier démarrage, mise à jour ensuite)
const db = openDatabase(config.dbPath);
console.log(`Base de données : ${config.dbPath} (schéma version ${schemaVersion(db)})`);

// 2. Clé de chiffrement des secrets 2FA (créée au premier démarrage)
const { created } = loadOrCreateKey(config.keyPath);
if (created) {
  console.log(`Clé de chiffrement créée : ${config.keyPath}`);
  console.log('  Pensez à en garder une copie à part (gestionnaire de mots de passe).');
} else {
  console.log(`Clé de chiffrement chargée : ${config.keyPath}`);
}

// 3. Serveur web
const app = createApp({ db });
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
