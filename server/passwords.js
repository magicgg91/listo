// Hachage des mots de passe avec scrypt (module crypto intégré à Node).
//
// Un mot de passe n'est jamais stocké : on garde seulement son « empreinte »,
// calculée avec un sel aléatoire propre à chaque compte. scrypt est volontairement
// lent et gourmand en mémoire, ce qui rend très coûteux de deviner un mot de
// passe à partir de son empreinte.
//
// Format stocké : scrypt$N$r$p$sel$empreinte (sel et empreinte en base64)

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

// Réglages de scrypt : N = coût (2^15), r = taille de bloc, p = parallélisme.
// Avec ces valeurs, un calcul prend environ 32 Mo de mémoire.
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

// Longueurs acceptées pour un mot de passe (en caractères)
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

// Vérifie la longueur d'un nouveau mot de passe. Renvoie un message d'erreur,
// ou null si le mot de passe convient.
export function passwordProblem(password) {
  if (typeof password !== 'string') return 'Mot de passe manquant.';
  const length = [...password].length; // compte les caractères, accents compris
  if (length < PASSWORD_MIN) return `Le mot de passe doit faire au moins ${PASSWORD_MIN} caractères.`;
  if (length > PASSWORD_MAX) return `Le mot de passe doit faire au plus ${PASSWORD_MAX} caractères.`;
  return null;
}

// Calcule l'empreinte à stocker pour un mot de passe
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password.normalize('NFC'), salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEMORY });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

// Vérifie un mot de passe saisi contre une empreinte stockée.
// La comparaison se fait en temps constant (timingSafeEqual) : sa durée ne
// révèle rien sur la ressemblance entre les deux.
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [algo, n, r, p, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password.normalize('NFC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: MAX_MEMORY,
  });
  return crypto.timingSafeEqual(actual, expected);
}

// Empreinte d'un mot de passe aléatoire, utilisée quand l'identifiant saisi
// n'existe pas : on fait quand même le calcul, pour que la réponse prenne le
// même temps que l'identifiant existe ou non.
let dummyHash = null;
export async function getDummyHash() {
  dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyHash;
}
