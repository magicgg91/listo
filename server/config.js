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

    // Commit Git de l'image installée (posé par la construction de l'image,
    // voir le Dockerfile), ou null s'il n'est pas connu
    commit: validCommit(env.LISTO_COMMIT),

    // Vérification de mise à jour (Réglages › À propos, Admin) : le serveur
    // demande à GitHub s'il existe une image plus récente. Activée par
    // défaut ; LISTO_UPDATE_CHECK=off la coupe (aucune demande vers GitHub).
    updateCheck: String(env.LISTO_UPDATE_CHECK ?? '').trim().toLowerCase() !== 'off',

    // Mode scan des listes de courses : le serveur cherche le nom d'un
    // produit dans Open Food Facts à partir de son code-barres. Activé par
    // défaut ; LISTO_PRODUCT_LOOKUP=off le coupe (aucune demande vers Open
    // Food Facts, bouton « Scanner » masqué).
    productLookup: String(env.LISTO_PRODUCT_LOOKUP ?? '').trim().toLowerCase() !== 'off',

    // Contact facultatif ajouté à l'en-tête User-Agent des demandes à Open
    // Food Facts (adresse e-mail ou URL), ou null. Une valeur mal formée est
    // ignorée (voir validContact).
    productContact: validContact(env.LISTO_PRODUCT_CONTACT),
  };
}

// Contact pour Open Food Facts : 1 à 100 caractères imprimables simples
// (lettres sans accent, chiffres, @ . : / - _ + ~ et espaces), sans
// parenthèse ni point-virgule : la valeur va dans un en-tête HTTP, elle ne
// doit rien pouvoir y casser. Toute autre valeur donne null (pas de contact).
export function validContact(value) {
  if (typeof value !== 'string') return null;
  const contact = value.trim();
  return /^[A-Za-z0-9@.:/\-_+~ ]{1,100}$/.test(contact) ? contact : null;
}

// Un commit Git est exactement 40 caractères hexadécimaux. Toute autre
// valeur (vide, trop courte, caractères interdits, texte injecté…) est
// ignorée : elle ne sera jamais affichée.
export function validCommit(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) ? value : null;
}

// Vérifie la configuration avant le démarrage. Renvoie un message clair si
// quelque chose empêche Listo de démarrer, sinon null.
// En production, l'adresse publique doit être en https:// : sans HTTPS, les
// cookies « Secure » ne passent pas, le service worker (hors ligne) ne
// marche pas, et les mots de passe circuleraient en clair.
export function configProblem(config) {
  let url;
  try {
    url = new URL(config.publicUrl);
  } catch {
    return `LISTO_PUBLIC_URL n'est pas une adresse valide (« ${config.publicUrl} »). Exemple : https://listo.exemple.fr`;
  }
  if (config.production && url.protocol !== 'https:') {
    return `En production, LISTO_PUBLIC_URL doit commencer par https:// (actuellement « ${config.publicUrl} »). Corrigez-la dans docker-compose.yml, puis relancez Listo.`;
  }
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) {
    return `PORT invalide (« ${config.port} ») : un nombre entre 1 et 65535 est attendu.`;
  }
  return null;
}
