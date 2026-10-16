// Routes du compte connecté :
//   GET  /api/me              qui suis-je ?
//   POST /api/me/password     changer son mot de passe (l'ancien est demandé)
//   POST /api/me/2fa/enable   commencer l'activation de la 2FA (QR code)
//   POST /api/me/2fa/verify   confirmer l'activation avec un premier code
//   POST /api/me/2fa/disable  désactiver sa 2FA (mot de passe + code)

import express from 'express';
import QRCode from 'qrcode';
import { hashPassword, verifyPassword, passwordProblem } from '../passwords.js';
import { startSession, revokeAllSessions, attemptKeys, publicUser } from '../auth.js';
import { generateTotpSecret, toBase32, otpauthUri } from '../totp.js';
import {
  sealTotpSecret, openTotpSecret, useTotpCode, createRecoveryCodes, checkSecondFactor, disableTwoFactor,
} from '../twofactor.js';

const BLOCKED = 'Trop de tentatives. Réessayez dans 15 minutes.';

export function meRoutes(ctx) {
  const router = express.Router();
  const { db, limiter, audit } = ctx;
  const reloadUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

  router.get('/me', (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  // Changement de mot de passe. Toutes les sessions du compte sont fermées
  // (les autres appareils devront se reconnecter), puis une nouvelle session
  // est ouverte pour l'appareil qui a fait le changement.
  router.post('/me/password', async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    const keys = attemptKeys(req, req.user.username);
    if (limiter.isBlocked(keys)) return res.status(429).json({ error: BLOCKED });

    const problem = passwordProblem(newPassword);
    if (problem) return res.status(400).json({ error: problem });

    limiter.fail(keys); // compté d'avance, remis à zéro en cas de succès
    if (!(await verifyPassword(currentPassword, req.user.password_hash))) {
      audit('mot_de_passe_refuse', { utilisateur: req.user.username, ip: req.ip });
      return res.status(403).json({ error: 'Mot de passe actuel incorrect.' });
    }
    limiter.reset(keys);

    // Mot de passe donné par un Admin : il faut vraiment en choisir un autre
    if (req.user.must_change_password === 1 && newPassword === currentPassword) {
      return res.status(400).json({ error: "Choisissez un mot de passe différent de celui donné par l'Admin." });
    }

    const hash = await hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, req.user.id);
    revokeAllSessions(ctx, req.user.id);
    startSession(ctx, res, req.user.id);
    audit('mot_de_passe_change', { utilisateur: req.user.username, ip: req.ip });
    res.json({ ok: true });
  });

  // Étape 1 de l'activation : un nouveau secret est créé (pas encore actif)
  // et renvoyé sous forme de QR code à scanner, et en texte pour une saisie
  // à la main dans l'application d'authentification.
  router.post('/me/2fa/enable', async (req, res) => {
    if (req.user.totp_enabled === 1) return res.status(409).json({ error: 'La double authentification est déjà active.' });
    const secret = generateTotpSecret();
    db.prepare('UPDATE users SET totp_secret = ?, totp_last_step = NULL WHERE id = ?')
      .run(sealTotpSecret(ctx, req.user.id, secret), req.user.id);
    const uri = otpauthUri(secret, req.user.username);
    res.json({ secret: toBase32(secret), uri, qrCode: await QRCode.toDataURL(uri) });
  });

  // Étape 2 de l'activation : le premier code prouve que l'application
  // d'authentification est bien réglée. Les 10 codes de secours sont alors
  // créés et affichés, une seule fois.
  router.post('/me/2fa/verify', (req, res) => {
    const user = reloadUser(req.user.id);
    if (user.totp_enabled === 1) return res.status(409).json({ error: 'La double authentification est déjà active.' });
    if (!user.totp_secret) return res.status(400).json({ error: "Commencez par demander le QR code d'activation." });

    const keys = attemptKeys(req, user.username);
    if (limiter.isBlocked(keys)) return res.status(429).json({ error: BLOCKED });
    if (!useTotpCode(ctx, user.id, openTotpSecret(ctx, user), user.totp_last_step, req.body?.code)) {
      limiter.fail(keys);
      return res.status(400).json({ error: 'Code incorrect. Vérifiez l\'heure du téléphone et réessayez.' });
    }
    limiter.reset(keys);

    db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(user.id);
    const recoveryCodes = createRecoveryCodes(ctx, user.id);
    audit('2fa_activee', { utilisateur: user.username, ip: req.ip });
    res.json({ recoveryCodes });
  });

  // Désactivation de sa propre 2FA : mot de passe ET code (de l'application
  // ou de secours) demandés.
  router.post('/me/2fa/disable', async (req, res) => {
    const { password, code } = req.body ?? {};
    if (req.user.totp_enabled !== 1) return res.status(409).json({ error: "La double authentification n'est pas active." });

    const keys = attemptKeys(req, req.user.username);
    if (limiter.isBlocked(keys)) return res.status(429).json({ error: BLOCKED });
    limiter.fail(keys); // compté d'avance, remis à zéro en cas de succès

    const passwordOk = await verifyPassword(password, req.user.password_hash);
    // Le compte est relu juste avant de vérifier le code (dernier code utilisé)
    const codeOk = passwordOk && checkSecondFactor(ctx, reloadUser(req.user.id), code);
    if (!codeOk) {
      audit('2fa_desactivation_refusee', { utilisateur: req.user.username, ip: req.ip });
      return res.status(403).json({ error: 'Mot de passe ou code incorrect.' });
    }
    limiter.reset(keys);

    disableTwoFactor(ctx, req.user.id);
    audit('2fa_desactivee', { utilisateur: req.user.username, ip: req.ip });
    res.json({ ok: true });
  });

  return router;
}
