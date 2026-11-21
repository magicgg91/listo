// Point de départ de Listo : lit la configuration, ouvre la base, prépare la
// clé de chiffrement, puis démarre le serveur web.
//
// Lancement : npm start (ou « node server/index.js »)

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, configProblem, consoleLocale } from './config.js';
import { openDatabase, schemaVersion, clearStartingData } from './db.js';
import { loadOrCreateKey } from './secrets.js';
import { createApp } from './app.js';
import { createJournalFile } from './audit.js';
import { generateSetupCode } from './auth.js';
import { preparePushKeys } from './push.js';
import { translate } from '../public/js/i18n.js';

const config = loadConfig();
// Langue des messages de la console : celle de l'installation (LISTO_LANG,
// public/js/i18n/fr/demarrage.js), le français si elle n'est pas valable
const lang = consoleLocale(config);

// 0. Configuration incorrecte (adresse sans https en production…) : Listo
//    refuse de démarrer, avec un message clair dans docker logs
const problem = configProblem(config);
if (problem) {
  console.error(translate(lang, 'demarrage.refus', { problem }));
  process.exit(1);
}
// Contact pour Open Food Facts mal formé : ignoré (sans l'afficher), Listo démarre
if (process.env.LISTO_PRODUCT_CONTACT?.trim() && !config.productContact) {
  console.warn(translate(lang, 'demarrage.contactIgnore'));
}

// 1. Base de données (créée au premier démarrage, mise à jour ensuite).
// Base toute neuve : aucun magasin ni rayon au départ, quelle que soit la
// langue ; une base existante ne change jamais.
const freshDatabase = !fs.existsSync(config.dbPath);
const db = openDatabase(config.dbPath, { locale: lang });
if (freshDatabase) clearStartingData(db);
console.log(translate(lang, 'demarrage.base', { path: config.dbPath, version: schemaVersion(db) }));

// 2. Clé de chiffrement des secrets 2FA (créée au premier démarrage)
const { key, created } = loadOrCreateKey(config.keyPath, { locale: lang });
if (created) {
  console.log(translate(lang, 'demarrage.cle.creee', { path: config.keyPath }));
  console.log(translate(lang, 'demarrage.cle.copie'));
} else {
  console.log(translate(lang, 'demarrage.cle.chargee', { path: config.keyPath }));
}

// 2 bis. Notifications push (LISTO_PUSH=on seulement) : clés VAPID créées au
//    premier démarrage dans le dossier secrets/. Fonction coupée : rien
//    n'est lu ni créé. Jamais la clé elle-même dans les journaux.
let vapidKeys = null;
try {
  const prepared = preparePushKeys(config);
  if (prepared) {
    vapidKeys = prepared.keys;
    if (prepared.created) {
      console.log(translate(lang, 'demarrage.push.creees', { path: config.vapidPath }));
      console.log(translate(lang, 'demarrage.push.copie'));
    } else {
      console.log(translate(lang, 'demarrage.push.chargees', { path: config.vapidPath }));
    }
  }
} catch (err) {
  console.error(translate(lang, 'demarrage.refus', { problem: err.message }));
  process.exit(1);
}

// 2 ter. Connexion avec le fournisseur d'identité (LISTO_OIDC=on seulement) : la clé secrète
//    du client est lue dans secrets/oidc-client-secret (jamais dans une
//    variable). Absente ou vide : Listo ne démarre pas, avec un message clair.
//    Jamais la clé elle-même dans les journaux.
let oidcClientSecret = '';
if (config.oidc) {
  try {
    oidcClientSecret = fs.readFileSync(config.oidcSecretPath, 'utf8').trim();
  } catch {
    oidcClientSecret = '';
  }
  if (!oidcClientSecret) {
    console.error(translate(lang, 'demarrage.refus', { problem: translate(lang, 'demarrage.oidc.secretManquant', { path: config.oidcSecretPath }) }));
    process.exit(1);
  }
  console.log(translate(lang, 'demarrage.oidc.active', { name: config.oidcName, issuer: config.oidcIssuer }));
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
  console.log(translate(lang, 'demarrage.code.titre'));
  console.log('');
  console.log(`      ${setupCode}`);
  console.log('');
  console.log(translate(lang, 'demarrage.code.consigne')); // deux lignes
  console.log('==============================================================');
  console.log('');
}

// 4. Journal de sécurité, aussi écrit dans data/journal.log (à côté de la base)
const journalPath = path.join(path.dirname(config.dbPath), 'journal.log');
const journalFile = createJournalFile({ path: journalPath, locale: lang });
console.log(translate(lang, 'demarrage.journal', { path: journalPath }));

// 5. Serveur web
const app = createApp({ db, config, masterKey: key, setupCode, journalFile, vapidKeys, oidcClientSecret });
const { ctx } = app.locals;
const server = app.listen(config.port, () => {
  console.log(translate(lang, 'demarrage.port', { port: server.address().port }));
});

// 6. Sauvegarde de la base chaque nuit vers 3 h (data/backups, voir backup.js)
ctx.backups.start();
console.log(translate(lang, 'demarrage.sauvegardes', { path: ctx.backups.dir }));

// Arrêt propre (docker stop, mise à jour par « docker compose up -d »,
// Ctrl+C) : plus de nouvelle connexion, flux temps réel fermés, requêtes en
// cours terminées, puis la base est fermée avant de quitter. Rien n'est coupé
// au milieu d'une écriture.
let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(translate(lang, 'demarrage.signal', { signal }));
  ctx.stop();                    // ménage, sauvegarde programmée, flux temps réel
  server.close(() => {
    db.close();
    console.log(translate(lang, 'demarrage.arret'));
    process.exit(0);
  });
  server.closeIdleConnections(); // connexions inactives fermées tout de suite
  // Une requête bloquée ne retient pas l'arrêt plus de 5 secondes (Docker
  // force l'arrêt au bout de 10)
  setTimeout(() => server.closeAllConnections(), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
