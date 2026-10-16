// Tests des briques de sécurité, prises une par une : mots de passe, codes
// TOTP, limitation des tentatives, chiffrement des secrets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { hashPassword, verifyPassword, passwordProblem } from '../server/passwords.js';
import { totpCode, verifyTotp, totpStep, toBase32 } from '../server/totp.js';
import { createLimiter } from '../server/limiter.js';
import { deriveKeys, encryptSecret, decryptSecret } from '../server/secrets.js';

test('mot de passe : scrypt, empreinte salée, vérification', async () => {
  const hash = await hashPassword('correct horse battery');
  assert.match(hash, /^scrypt\$32768\$8\$1\$/);
  assert.ok(!hash.includes('correct horse battery'));
  assert.notEqual(hash, await hashPassword('correct horse battery'), 'le sel doit changer à chaque fois');
  assert.equal(await verifyPassword('correct horse battery', hash), true);
  assert.equal(await verifyPassword('correct horse batterie', hash), false);
  assert.equal(await verifyPassword('x', 'empreinte abîmée'), false);
});

test('mot de passe : 10 caractères minimum (accents comptés comme un caractère)', () => {
  assert.match(passwordProblem('court'), /au moins 10/);
  assert.match(passwordProblem('éééééééé'), /au moins 10/); // 8 caractères, 16 octets
  assert.equal(passwordProblem('dixcaracts'), null);
  assert.match(passwordProblem(undefined), /manquant/);
});

test('TOTP : codes de référence de la norme RFC 6238', () => {
  const secret = Buffer.from('12345678901234567890');
  assert.equal(totpCode(secret, totpStep(59 * 1000)), '287082');
  assert.equal(totpCode(secret, totpStep(1111111109 * 1000)), '081804');
  assert.equal(totpCode(secret, totpStep(1234567890 * 1000)), '005924');
  assert.equal(toBase32(secret), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
});

test("TOTP : tolérance d'une période, refus d'un code déjà utilisé", () => {
  const secret = crypto.randomBytes(20);
  const now = Date.now();
  const step = totpStep(now);
  assert.equal(verifyTotp(secret, totpCode(secret, step), now), step);
  assert.equal(verifyTotp(secret, totpCode(secret, step - 1), now), step - 1); // 30 s de retard
  assert.equal(verifyTotp(secret, totpCode(secret, step - 2), now), null);    // trop vieux
  // Le code de la période déjà utilisée (ou plus ancienne) est refusé
  assert.equal(verifyTotp(secret, totpCode(secret, step), now, step), null);
  assert.equal(verifyTotp(secret, totpCode(secret, step - 1), now, step), null);
  assert.equal(verifyTotp(secret, 'abcdef', now), null);
});

test('limitation : bloqué au 5e échec, débloqué 15 minutes plus tard', () => {
  const clock = { now: 0 };
  const limiter = createLimiter({ now: () => clock.now });
  const keys = ['u:guillaume'];
  for (let i = 0; i < 4; i++) limiter.fail(keys);
  assert.equal(limiter.isBlocked(keys), false);
  limiter.fail(keys); // 5e échec
  assert.equal(limiter.isBlocked(keys), true);
  clock.now += 15 * 60 * 1000 - 1;
  assert.equal(limiter.isBlocked(keys), true);
  clock.now += 1;
  assert.equal(limiter.isBlocked(keys), false);
});

test("limitation : une tentative correcte comptée d'avance peut être retirée", () => {
  const limiter = createLimiter({ now: () => 0 });
  const keys = ['u:marie'];
  for (let i = 0; i < 5; i++) limiter.fail(keys); // le 5e déclenche le blocage…
  limiter.forgive(keys);                           // …mais c'était le bon mot de passe
  assert.equal(limiter.isBlocked(keys), false);
  limiter.fail(keys);
  assert.equal(limiter.isBlocked(keys), true);
});

test('limitation : les échecs de plus de 15 minutes ne comptent plus', () => {
  const clock = { now: 0 };
  const limiter = createLimiter({ now: () => clock.now });
  for (let i = 0; i < 4; i++) limiter.fail(['ip:1']);
  clock.now += 15 * 60 * 1000 + 1;
  limiter.fail(['ip:1']);
  assert.equal(limiter.isBlocked(['ip:1']), false);
});

test('chiffrement du secret 2FA : AES-256-GCM, lié au compte et à la clé', () => {
  const keys = deriveKeys(crypto.randomBytes(32));
  const secret = crypto.randomBytes(20);
  const sealed = encryptSecret(keys.totp, secret, 'user:1');
  assert.ok(!sealed.includes(toBase32(secret)));
  assert.deepEqual(decryptSecret(keys.totp, sealed, 'user:1'), secret);
  assert.throws(() => decryptSecret(keys.totp, sealed, 'user:2'));                       // autre compte
  assert.throws(() => decryptSecret(deriveKeys(crypto.randomBytes(32)).totp, sealed, 'user:1')); // autre clé
  assert.notDeepEqual(keys.totp, keys.codes);
});
