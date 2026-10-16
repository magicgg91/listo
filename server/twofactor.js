// Double authentification (2FA) : secret TOTP chiffré et codes de secours.
//
// - Le secret TOTP est chiffré en base (AES-256-GCM) avec une sous-clé tirée
//   de secrets/secret.key.
// - Les 10 codes de secours sont à usage unique. On ne garde que leur
//   empreinte (HMAC-SHA256 avec une sous-clé de secrets/secret.key) : ils ne
//   sont visibles qu'une seule fois, au moment de l'activation.

import crypto from 'node:crypto';
import { encryptSecret, decryptSecret } from './secrets.js';
import { verifyTotp } from './totp.js';

const RECOVERY_COUNT = 10;
const RECOVERY_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'; // sans 0, 1, i, l, o

// Lien entre un secret chiffré et son compte (voir encryptSecret)
const context = (userId) => `user:${userId}`;

// Chiffre le secret TOTP d'un compte, pour le stocker
export function sealTotpSecret(ctx, userId, secret) {
  return encryptSecret(ctx.keys.totp, secret, context(userId));
}

// Déchiffre le secret TOTP stocké d'un compte
export function openTotpSecret(ctx, user) {
  return decryptSecret(ctx.keys.totp, user.totp_secret, context(user.id));
}

// Empreinte d'un code de secours (insensible aux majuscules, tirets, espaces)
function recoveryHash(ctx, code) {
  const normalized = String(code).toLowerCase().replace(/[\s-]/g, '');
  return crypto.createHmac('sha256', ctx.keys.codes).update(normalized).digest('hex');
}

// Crée 10 nouveaux codes de secours (les anciens sont effacés) et les renvoie
// en clair : c'est la seule fois où ils sont visibles.
export function createRecoveryCodes(ctx, userId) {
  const codes = [];
  for (let i = 0; i < RECOVERY_COUNT; i++) {
    let code = '';
    for (let j = 0; j < 10; j++) code += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
    codes.push(`${code.slice(0, 5)}-${code.slice(5)}`); // ex. « k7rm4-xqp9d »
  }
  const insert = ctx.db.prepare('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)');
  ctx.db.transaction(() => {
    ctx.db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
    for (const code of codes) insert.run(userId, recoveryHash(ctx, code));
  })();
  return codes;
}

// Utilise un code de secours : vrai s'il était valide et pas encore utilisé.
// Il est alors marqué comme utilisé et ne marchera plus.
function useRecoveryCode(ctx, userId, code) {
  const wanted = Buffer.from(recoveryHash(ctx, code));
  const rows = ctx.db.prepare('SELECT id, code_hash FROM recovery_codes WHERE user_id = ? AND used_at IS NULL').all(userId);
  // Comparaison en temps constant avec chacun des codes restants
  let match = null;
  for (const row of rows) {
    if (crypto.timingSafeEqual(Buffer.from(row.code_hash), wanted) && match === null) match = row;
  }
  if (!match) return false;
  ctx.db.prepare('UPDATE recovery_codes SET used_at = ? WHERE id = ?').run(new Date(ctx.now()).toISOString(), match.id);
  return true;
}

// Vérifie un code TOTP pour un secret donné. Si le code est accepté, sa
// période est mémorisée : le même code ne pourra plus resservir.
export function useTotpCode(ctx, userId, secret, lastStep, code) {
  const step = verifyTotp(secret, String(code ?? '').replace(/\s/g, ''), ctx.now(), lastStep);
  if (step === null) return false;
  ctx.db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').run(step, userId);
  return true;
}

// Vérifie le second facteur d'un compte qui a activé sa 2FA : un code à
// 6 chiffres de l'application, ou bien un code de secours.
export function checkSecondFactor(ctx, user, code) {
  if (typeof code !== 'string' || code.trim() === '') return false;
  if (/^\s*\d{3}\s?\d{3}\s*$/.test(code)) {
    return useTotpCode(ctx, user.id, openTotpSecret(ctx, user), user.totp_last_step, code);
  }
  return useRecoveryCode(ctx, user.id, code);
}

// Désactive la 2FA d'un compte : secret et codes de secours effacés
export function disableTwoFactor(ctx, userId) {
  ctx.db.transaction(() => {
    ctx.db.prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_last_step = NULL WHERE id = ?').run(userId);
    ctx.db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
  })();
}
