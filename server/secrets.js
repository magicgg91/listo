// Clé de chiffrement des secrets de double authentification (2FA).
//
// Au premier démarrage, une clé aléatoire de 256 bits est créée dans
// secrets/secret.key (droits 600 : lisible par Listo seul). Ce dossier est
// séparé de la base : une copie de la base seule ne permet donc pas de lire
// les secrets 2FA. Ensuite, la même clé est relue à chaque démarrage.
//
// La clé est écrite en base64 (une ligne de texte) pour pouvoir la copier
// facilement dans un gestionnaire de mots de passe. Sans elle, les 2FA déjà
// activées ne sont plus lisibles : il faut la sauvegarder une fois, à part.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const KEY_BYTES = 32; // 256 bits, taille de clé d'AES-256-GCM

// Renvoie la clé (32 octets), en la créant si elle n'existe pas encore.
// `created` vaut true si la clé vient d'être générée.
export function loadOrCreateKey(keyPath) {
  if (fs.existsSync(keyPath)) {
    return { key: readKey(keyPath), created: false };
  }

  // Dossier réservé à Listo (droits 700), puis fichier en droits 600.
  // L'option « wx » refuse d'écraser un fichier qui existerait déjà.
  fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });
  const key = crypto.randomBytes(KEY_BYTES);
  fs.writeFileSync(keyPath, key.toString('base64') + '\n', { mode: 0o600, flag: 'wx' });
  return { key, created: true };
}

// Lit et vérifie une clé existante. Une clé abîmée arrête le démarrage avec
// un message clair, plutôt que de la remplacer en silence (ce qui rendrait
// illisibles les 2FA déjà activées).
function readKey(keyPath) {
  const text = fs.readFileSync(keyPath, 'utf8').trim();
  const key = Buffer.from(text, 'base64');
  if (key.length !== KEY_BYTES || key.toString('base64') !== text) {
    throw new Error(
      `La clé ${keyPath} est invalide (256 bits en base64 attendus). ` +
        'Restaurez la copie de sauvegarde de ce fichier.'
    );
  }
  return key;
}

// --- Utilisation de la clé ---
//
// À partir de la clé principale, on dérive (HKDF) des sous-clés distinctes,
// chacune réservée à un usage : on n'emploie jamais la même clé pour deux
// choses différentes.
export function deriveKeys(masterKey) {
  const derive = (usage) => Buffer.from(crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), usage, KEY_BYTES));
  return {
    totp: derive('listo:totp-secret'),    // chiffrement des secrets 2FA
    codes: derive('listo:recovery-codes'), // empreinte des codes de secours
    share: derive('listo:public-share-token'), // jeton des liens publics (réaffichage au propriétaire)
    build: derive('listo:build-id'),       // identifiant opaque de la version installée
  };
}

// Chiffre un secret 2FA avec AES-256-GCM. « context » (ici l'identifiant du
// compte) est lié au chiffrement : un secret recopié sur un autre compte
// devient illisible. Format : v1:iv:étiquette:texte chiffré (en base64).
// Identifiant opaque de la version installée (16 caractères hexadécimaux),
// calculé à partir du commit avec une clé propre à cette installation
// (HMAC-SHA256). Il change à chaque mise à jour, mais ne permet pas de
// retrouver le commit : il peut donc être servi sans compte (js/version.js,
// sw.js), ce qui est nécessaire pour l'ouverture hors ligne.
export function buildId(key, commit) {
  return crypto.createHmac('sha256', key).update(`listo-build:${commit}`).digest('hex').slice(0, 16);
}

export function encryptSecret(key, plaintext, context) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), encrypted].map((part) => (typeof part === 'string' ? part : part.toString('base64'))).join(':');
}

// Déchiffre un secret produit par encryptSecret. Échoue (exception) si la
// clé n'est pas la bonne ou si la valeur a été modifiée.
export function decryptSecret(key, stored, context) {
  const [version, iv, tag, encrypted] = stored.split(':');
  if (version !== 'v1') throw new Error('Format de secret inconnu');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]);
}
