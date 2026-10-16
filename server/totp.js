// Codes de double authentification (TOTP, norme RFC 6238), calculés avec le
// module crypto de Node.
//
// Principe : le téléphone et le serveur partagent un secret. Toutes les
// 30 secondes, chacun calcule un code à 6 chiffres à partir de ce secret et de
// l'heure. Si les deux codes sont égaux, la personne a bien son téléphone.
// Compatible avec toutes les applications d'authentification (Aegis,
// Google Authenticator, 2FAS, Bitwarden…).

import crypto from 'node:crypto';

const PERIOD = 30;  // durée de validité d'un code, en secondes
const DIGITS = 6;   // nombre de chiffres du code
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// Nouveau secret aléatoire de 160 bits (taille recommandée par la norme)
export function generateTotpSecret() {
  return crypto.randomBytes(20);
}

// Écrit un secret en « base32 » : c'est la forme que les applications
// d'authentification attendent (lettres majuscules et chiffres 2 à 7).
export function toBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

// Numéro de la période de 30 secondes pour un instant donné (en millisecondes)
export function totpStep(timeMs) {
  return Math.floor(timeMs / 1000 / PERIOD);
}

// Code à 6 chiffres pour un secret et une période donnés
export function totpCode(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const number = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(number).padStart(DIGITS, '0');
}

// Vérifie un code saisi. On accepte la période actuelle, la précédente et la
// suivante (l'horloge du téléphone peut avoir quelques secondes d'écart).
// lastStep est la période du dernier code accepté : un code de cette période
// ou d'une période plus ancienne est refusé (pas de réutilisation).
// Renvoie la période reconnue, ou null si le code est refusé.
export function verifyTotp(secret, code, timeMs, lastStep = null) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const current = totpStep(timeMs);
  let found = null;
  // On compare toujours les trois codes, en temps constant, sans s'arrêter
  // au premier : la durée de la vérification ne donne aucun indice.
  for (const step of [current - 1, current, current + 1]) {
    const expected = Buffer.from(totpCode(secret, step));
    const matches = crypto.timingSafeEqual(expected, Buffer.from(code));
    if (matches && (lastStep === null || step > lastStep) && found === null) found = step;
  }
  return found;
}

// Adresse « otpauth:// » contenue dans le QR code à scanner
export function otpauthUri(secret, username) {
  const label = encodeURIComponent(`Listo:${username}`);
  const params = new URLSearchParams({
    secret: toBase32(secret),
    issuer: 'Listo',
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params}`;
}
