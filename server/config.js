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

    // Accès depuis Claude (serveur MCP et autorisation OAuth, voir
    // docs/mcp-cadrage.md). DÉSACTIVÉ par défaut : seul LISTO_MCP=on
    // l'active. Désactivé, toutes ses adresses (/.well-known/…, /oauth/…,
    // /api/oauth/…) répondent comme une adresse inexistante (404).
    mcp: String(env.LISTO_MCP ?? '').trim().toLowerCase() === 'on',

    // Notifications push (voir server/push.js). DÉSACTIVÉES par défaut :
    // seul LISTO_PUSH=on les active. Désactivées : aucune clé créée, aucune
    // demande vers un service de push, leurs adresses (/api/push/…)
    // répondent comme une adresse inexistante (404).
    push: String(env.LISTO_PUSH ?? '').trim().toLowerCase() === 'on',

    // Clés VAPID des notifications (créées au premier démarrage avec
    // LISTO_PUSH=on), dans le même dossier que la clé de chiffrement
    vapidPath: path.resolve(path.dirname(path.resolve(env.LISTO_KEY_PATH || 'secrets/secret.key')), 'vapid.json'),

    // Connexion avec Authelia (OpenID Connect, voir server/oidc.js).
    // DÉSACTIVÉE par défaut : seul LISTO_OIDC=on l'active. Désactivée, ses
    // adresses (/oidc/…) répondent comme une adresse inexistante (404) et
    // l'écran de connexion ne montre pas de bouton.
    oidc: String(env.LISTO_OIDC ?? '').trim().toLowerCase() === 'on',
    // Connexion par identifiant et mot de passe Listo. Activée par défaut ;
    // LISTO_LOCAL_LOGIN=off la coupe (avec LISTO_OIDC=on seulement) : on
    // n'entre plus que par Authelia, et les sessions ouvertes par mot de
    // passe sont fermées.
    localLogin: String(env.LISTO_LOCAL_LOGIN ?? '').trim().toLowerCase() !== 'off',
    // Adresse d'Authelia (son « issuer »), par exemple https://auth.exemple.fr
    oidcIssuer: String(env.LISTO_OIDC_ISSUER ?? '').trim(),
    // Identifiant de Listo chez Authelia (client_id), « listo » par défaut
    oidcClientId: String(env.LISTO_OIDC_CLIENT_ID ?? '').trim() || 'listo',
    // Nom affiché sur le bouton (« Se connecter avec … »), « Authelia » par défaut
    oidcName: validButtonName(env.LISTO_OIDC_NAME) ?? 'Authelia',
    // Clé secrète du client (JAMAIS dans une variable) : fichier
    // oidc-client-secret, dans le même dossier que la clé de chiffrement
    oidcSecretPath: path.resolve(path.dirname(path.resolve(env.LISTO_KEY_PATH || 'secrets/secret.key')), 'oidc-client-secret'),

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

// Nom du bouton de connexion : 1 à 30 caractères simples (lettres, chiffres,
// espaces, . - ' ), sinon null (le nom par défaut est gardé)
export function validButtonName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return /^[\p{L}\p{N} .'-]{1,30}$/u.test(name) ? name : null;
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
  if (config.localLogin === false && !config.oidc) {
    return 'LISTO_LOCAL_LOGIN=off coupe la connexion par mot de passe : il faut alors LISTO_OIDC=on (connexion avec Authelia), sinon personne ne peut entrer.';
  }
  if (config.oidc) {
    let issuer;
    try {
      issuer = new URL(config.oidcIssuer);
    } catch {
      return `LISTO_OIDC=on demande LISTO_OIDC_ISSUER, l'adresse d'Authelia (actuellement « ${config.oidcIssuer} »). Exemple : https://auth.exemple.fr`;
    }
    if (config.production && issuer.protocol !== 'https:') {
      return `LISTO_OIDC_ISSUER doit commencer par https:// (actuellement « ${config.oidcIssuer} »).`;
    }
    if (issuer.username || issuer.password || issuer.search || issuer.hash) {
      return 'LISTO_OIDC_ISSUER : adresse simple attendue, sans identifiant, ni « ? », ni « # ».';
    }
    if (!/^[A-Za-z0-9._~-]{1,100}$/.test(config.oidcClientId)) {
      return `LISTO_OIDC_CLIENT_ID invalide (« ${config.oidcClientId} ») : lettres sans accent, chiffres, . _ ~ - (100 au plus).`;
    }
  }
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) {
    return `PORT invalide (« ${config.port} ») : un nombre entre 1 et 65535 est attendu.`;
  }
  return null;
}
