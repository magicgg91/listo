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
