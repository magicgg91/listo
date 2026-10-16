// Routes publiques de connexion :
//   GET  /api/setup      faut-il créer le premier Admin ?
//   POST /api/setup      créer le premier Admin (avec le code de démarrage)
//   POST /api/login      se connecter (identifiant + mot de passe)
//   POST /api/login/2fa  saisir le code 2FA, si le compte l'a activée
// et la déconnexion (réservée à un visiteur connecté) :
//   POST /api/logout

import express from 'express';
import { hashPassword, verifyPassword, getDummyHash, passwordProblem } from '../passwords.js';
import {
  startSession, endSession, requireAuth, attemptKeys, publicUser, safeEqual, normalizeCode,
} from '../auth.js';
import { checkSecondFactor } from '../twofactor.js';

// Réponses identiques que l'identifiant existe ou non
const BAD_LOGIN = 'Identifiant ou mot de passe incorrect.';
const BLOCKED = 'Trop de tentatives. Réessayez dans 15 minutes.';

// Identifiant : 2 à 50 caractères parmi lettres sans accent, chiffres, . _ -
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{2,50}$/;

const countUsers = (db) => db.prepare('SELECT COUNT(*) FROM users').pluck().get();

export function publicAuthRoutes(ctx) {
  const router = express.Router();
  const { db, limiter, audit } = ctx;
  const findUser = db.prepare('SELECT * FROM users WHERE username = ?');

  // Empreinte factice calculée dès le démarrage, pour que même la toute
  // première tentative avec un identifiant inconnu ne soit pas plus lente
  getDummyHash();

  // Faut-il afficher l'écran de création du premier Admin ?
  router.get('/setup', (req, res) => {
    res.json({ needed: countUsers(db) === 0 });
  });

  // Création du premier Admin. Possible seulement tant qu'aucun compte
  // n'existe, et avec le code de démarrage affiché dans les journaux.
  router.post('/setup', async (req, res) => {
    const { code, username, displayName, password } = req.body ?? {};
    const keys = [`setup:${req.ip}`];

    if (countUsers(db) > 0 || !ctx.setup.code) {
      return res.status(403).json({ error: 'Listo est déjà configuré.' });
    }
    if (limiter.isBlocked(keys)) return res.status(429).json({ error: BLOCKED });
    if (!safeEqual(normalizeCode(code), normalizeCode(ctx.setup.code))) {
      limiter.fail(keys);
      audit('creation_admin_refusee', { raison: 'code de démarrage incorrect', ip: req.ip });
      return res.status(403).json({ error: 'Code de démarrage incorrect.' });
    }
    if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
      return res.status(400).json({ error: 'Identifiant invalide : 2 à 50 caractères (lettres sans accent, chiffres, . _ -).' });
    }
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });
    const name = typeof displayName === 'string' && displayName.trim() ? displayName.trim() : username;
    if (name.length > 100) return res.status(400).json({ error: 'Nom affiché trop long (100 caractères au plus).' });

    const hash = await hashPassword(password);

    // On revérifie qu'aucun compte n'existe au moment d'écrire, dans un bloc
    // indivisible : deux créations simultanées ne peuvent pas réussir toutes
    // les deux.
    const created = db.transaction(() => {
      if (countUsers(db) > 0) return null;
      return db.prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, 'admin')")
        .run(username, name, hash).lastInsertRowid;
    })();
    if (!created) return res.status(403).json({ error: 'Listo est déjà configuré.' });

    ctx.setup.code = null; // le code de démarrage ne servira plus jamais
    audit('creation_admin', { utilisateur: username, ip: req.ip });
    startSession(ctx, res, created);
    res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(created)) });
  });

  // Connexion avec identifiant et mot de passe
  router.post('/login', async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
    }
    const keys = attemptKeys(req, username);
    const user = findUser.get(username);
    // Dans le journal, on ne recopie l'identifiant que s'il existe : s'il
    // n'existe pas, c'est peut-être un mot de passe tapé dans le mauvais champ.
    const who = user ? { utilisateur: user.username } : { utilisateur: '(inconnu)' };

    if (limiter.isBlocked(keys)) {
      audit('connexion_bloquee', { ...who, ip: req.ip });
      return res.status(429).json({ error: BLOCKED });
    }

    // La tentative est comptée comme un échec AVANT la vérification (qui prend
    // un peu de temps) : des dizaines d'essais envoyés en même temps ne peuvent
    // donc pas passer entre les mailles. Le compteur est remis à zéro si la
    // connexion réussit.
    limiter.fail(keys);

    // Le mot de passe est vérifié même si le compte n'existe pas (empreinte
    // factice), pour que la durée de la réponse ne trahisse rien.
    const passwordOk = await verifyPassword(password, user?.password_hash ?? (await getDummyHash()));
    if (!user || !passwordOk || user.active !== 1) {
      audit('connexion_echouee', { ...who, ip: req.ip });
      return res.status(401).json({ error: BAD_LOGIN });
    }

    // Compte avec 2FA : pas de session tant que le code n'est pas donné.
    // La tentative comptée d'avance est retirée (le mot de passe est bon),
    // mais le compteur n'est remis à zéro qu'une fois le code accepté : se
    // reconnecter ne donne donc pas de nouveaux essais de code.
    if (user.totp_enabled === 1) {
      limiter.forgive(keys);
      ctx.pending.start(ctx, res, user.id);
      audit('connexion_code_2fa_demande', { ...who, ip: req.ip });
      return res.json({ twoFactorRequired: true });
    }

    limiter.reset(keys);
    startSession(ctx, res, user.id);
    audit('connexion_reussie', { ...who, ip: req.ip });
    res.json({ user: publicUser(user) });
  });

  // Saisie du code 2FA (ou d'un code de secours) après le mot de passe
  router.post('/login/2fa', (req, res) => {
    const pending = ctx.pending.find(req);
    if (!pending) return res.status(401).json({ error: 'Connexion expirée : saisissez de nouveau votre mot de passe.' });

    // Relu au dernier moment : le compte a pu changer entre-temps
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1 AND totp_enabled = 1').get(pending.userId);
    if (!user) return res.status(401).json({ error: 'Connexion expirée : saisissez de nouveau votre mot de passe.' });

    const keys = attemptKeys(req, user.username);
    if (limiter.isBlocked(keys)) {
      audit('connexion_bloquee', { utilisateur: user.username, ip: req.ip, etape: '2fa' });
      return res.status(429).json({ error: BLOCKED });
    }
    if (!checkSecondFactor(ctx, user, req.body?.code)) {
      limiter.fail(keys);
      audit('connexion_echouee', { utilisateur: user.username, ip: req.ip, etape: '2fa' });
      return res.status(401).json({ error: 'Code incorrect.' });
    }

    ctx.pending.finish(ctx, res, pending.key);
    limiter.reset(keys);
    startSession(ctx, res, user.id);
    audit('connexion_reussie', { utilisateur: user.username, ip: req.ip, etape: '2fa' });
    res.json({ user: publicUser(user) });
  });

  return router;
}

export function logoutRoute(ctx) {
  const router = express.Router();
  router.post('/logout', requireAuth, (req, res) => {
    endSession(ctx, req, res);
    ctx.audit('deconnexion', { utilisateur: req.user.username, ip: req.ip });
    res.status(204).end();
  });
  return router;
}
