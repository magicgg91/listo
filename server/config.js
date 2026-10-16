// Configuration de Listo, lue dans les variables d'environnement.
//
// Les valeurs par défaut servent au lancement direct sur un ordinateur
// (npm start). Dans Docker, elles sont fixées par docker-compose.yml.
// Aucune de ces variables ne contient de mot de passe ni de clé.

import path from 'node:path';

export function loadConfig(env = process.env) {
  return {
    // Port d'écoute du serveur, à l'intérieur du conteneur
    port: env.PORT !== undefined ? Number(env.PORT) : 3000,

    // Adresse publique de l'application (servira à vérifier l'en-tête Origin)
    publicUrl: env.LISTO_PUBLIC_URL || 'http://localhost:3000',

    // Fichier de la base SQLite (dans le dossier data/)
    dbPath: path.resolve(env.LISTO_DB_PATH || 'data/listo.db'),

    // Fichier de la clé de chiffrement des secrets 2FA (dans le dossier secrets/)
    keyPath: path.resolve(env.LISTO_KEY_PATH || 'secrets/secret.key'),

    // Durée de validité d'une session, en jours (prolongée à chaque visite)
    sessionDays: Number(env.LISTO_SESSION_DAYS) || 30,

    // Vrai en production (cookies « Secure », messages d'erreur réduits…)
    production: env.NODE_ENV === 'production',
  };
}
