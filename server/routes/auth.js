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
  startSession, endSession, requireAuth, attemptKeys, publicUser, safeEqual, normalizeCode, passwordLoginAllowed,
} from '../auth.js';
import { checkSecondFactor } from '../twofactor.js';
import { isValidUsername, USERNAME_RULE, cleanName } from '../validate.js';

// Réponses identiques que l'identifiant existe ou non (noms des textes)
const BAD_LOGIN = 'comptes.connexion.incorrecte';
const BLOCKED = 'comptes.tropDeTentatives';
// Mot de passe juste, compte « … seulement » : « Ce compte se connecte avec … »
const SSO_ONLY = 'comptes.connexion.fournisseurSeulement';


const countUsers = (db) => db.prepare('SELECT COUNT(*) FROM users').pluck().get();

export function publicAuthRoutes(ctx) {
  const router = express.Router();
  const { db, limiter, audit } = ctx;
  const findUser = db.prepare('SELECT * FROM users WHERE username = ?');

  // Empreinte factice calculée dès le démarrage, pour que même la toute
  // première tentative avec un identifiant inconnu ne soit pas plus lente
  getDummyHash();

  // Faut-il afficher l'écran de création du premier Admin ?
  // oidc : le bouton « Se connecter avec … » (LISTO_OIDC=on seulement), son
  // nom seul
  // localLogin : identifiant et mot de passe proposés (LISTO_LOCAL_LOGIN)
  // lang : langue par défaut de l'installation (LISTO_LANG), utilisée quand
  // ni le compte ni le navigateur n'en donnent une ; currency : monnaie du
  // prix des envies (LISTO_CURRENCY)
  router.get('/setup', (req, res) => {
    res.json({
      needed: countUsers(db) === 0,
      oidc: ctx.oidc ? { name: ctx.config.oidcName } : null,
      localLogin: ctx.config.localLogin !== false,
      lang: ctx.config.lang ?? 'fr',
      currency: ctx.config.currency ?? 'EUR',
    });
  });

  // Création du premier Admin. Possible seulement tant qu'aucun compte
  // n'existe, et avec le code de démarrage affiché dans les journaux.
  router.post('/setup', async (req, res) => {
    const { code, username, displayName, password } = req.body ?? {};
    const keys = [`setup:${req.ip}`];

    // code : reconnu par l'écran de création (retour à la connexion), quelle que soit la langue
    if (countUsers(db) > 0 || !ctx.setup.code) {
      return res.status(403).json({ error: req.t('comptes.dejaConfigure'), code: 'comptes.dejaConfigure' });
    }
    if (limiter.isBlocked(keys)) return res.status(429).json({ error: req.t(BLOCKED) });
    if (!safeEqual(normalizeCode(code), normalizeCode(ctx.setup.code))) {
      limiter.fail(keys);
      audit('first_admin_creation_refused', { reason: 'wrong setup code', ip: req.ip });
      return res.status(403).json({ error: req.t('comptes.codeDemarrage.incorrect') });
    }
    if (!isValidUsername(username)) return res.status(400).json({ error: req.t(USERNAME_RULE) });
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: req.t(problem.key, problem.params) });
    const name = displayName === undefined || displayName === '' ? username : cleanName(displayName);
    if (!name) return res.status(400).json({ error: req.t('comptes.nomAffiche.invalide') });

    const hash = await hashPassword(password);

    // On revérifie qu'aucun compte n'existe au moment d'écrire, dans un bloc
    // indivisible : deux créations simultanées ne peuvent pas réussir toutes
    // les deux.
    const created = db.transaction(() => {
      if (countUsers(db) > 0) return null;
      return db.prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, 'admin')")
        .run(username, name, hash).lastInsertRowid;
    })();
    if (!created) return res.status(403).json({ error: req.t('comptes.dejaConfigure'), code: 'comptes.dejaConfigure' });

    ctx.setup.code = null; // le code de démarrage ne servira plus jamais
    audit('first_admin_created', { user: username, ip: req.ip });
    startSession(ctx, res, created);
    res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(created), ctx.config, { method: 'password' }) });
  });

  // Connexion avec identifiant et mot de passe
  router.post('/login', async (req, res) => {
    // Connexion par mot de passe coupée (LISTO_LOCAL_LOGIN=off)
    if (ctx.config.localLogin === false) {
      return res.status(403).json({ error: req.t('comptes.connexion.motDePasseDesactive', { provider: ctx.config.oidcName }) });
    }
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ error: req.t('comptes.connexion.requis') });
    }
    const keys = attemptKeys(req, username);
    const user = findUser.get(username);
    // Dans le journal, on ne recopie l'identifiant que s'il existe : s'il
    // n'existe pas, c'est peut-être un mot de passe tapé dans le mauvais champ.
    const who = user ? { user: user.username } : { user: '(unknown)' };

    if (limiter.isBlocked(keys)) {
      audit('login_blocked', { ...who, ip: req.ip });
      return res.status(429).json({ error: req.t(BLOCKED) });
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
      audit('login_failure', { ...who, ip: req.ip });
      return res.status(401).json({ error: req.t(BAD_LOGIN) });
    }

    // Compte « … seulement » (choisi par l'Admin, passwordLoginAllowed) : le
    // mot de passe est juste, mais ce compte se connecte avec le fournisseur
    // d'identité. Ni session, ni étape du code à 6 chiffres. La tentative
    // reste comptée (mêmes limites qu'un échec). Un mauvais mot de passe a
    // reçu plus haut exactement la réponse habituelle : rien ne distingue
    // ce compte tant que le mot de passe n'est pas le bon.
    // code : reconnu par l'écran de connexion (message sans champ en erreur)
    // Le compte est relu après le calcul du mot de passe (qui prend un peu de
    // temps) : un Admin qui vient de le passer en « … seulement » ou de le
    // désactiver pendant ce temps est pris en compte (sinon une session par
    // mot de passe serait ouverte sur un état dépassé)
    const current = findUser.get(username);
    if (!current || current.active !== 1) {
      audit('login_failure', { ...who, ip: req.ip });
      return res.status(401).json({ error: req.t(BAD_LOGIN) });
    }
    if (!passwordLoginAllowed(current, ctx.config)) {
      audit('password_login_refused', { ...who, reason: 'account signs in with the identity provider only', ip: req.ip });
      return res.status(403).json({ error: req.t(SSO_ONLY, { provider: ctx.config.oidcName }), code: SSO_ONLY });
    }

    // Compte avec 2FA : pas de session tant que le code n'est pas donné.
    // La tentative comptée d'avance est retirée (le mot de passe est bon),
    // mais le compteur n'est remis à zéro qu'une fois le code accepté : se
    // reconnecter ne donne donc pas de nouveaux essais de code.
    if (user.totp_enabled === 1) {
      limiter.forgive(keys);
      ctx.pending.start(ctx, res, user.id);
      audit('login_2fa_code_requested', { ...who, ip: req.ip });
      return res.json({ twoFactorRequired: true });
    }

    limiter.reset(keys);
    startSession(ctx, res, user.id);
    audit('login_success', { ...who, ip: req.ip });
    res.json({ user: publicUser(user, ctx.config, { method: 'password' }) });
  });

  // Saisie du code 2FA (ou d'un code de secours) après le mot de passe
  router.post('/login/2fa', (req, res) => {
    const pending = ctx.pending.find(req);
    if (!pending) return res.status(401).json({ error: req.t('comptes.connexion.expiree') });

    // Relu au dernier moment : le compte a pu changer entre-temps (et passer
    // en « … seulement » : une connexion commencée par mot de passe s'arrête)
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1 AND totp_enabled = 1').get(pending.userId);
    if (!user) return res.status(401).json({ error: req.t('comptes.connexion.expiree') });
    if (pending.method !== 'oidc' && !passwordLoginAllowed(user, ctx.config)) {
      ctx.pending.finish(ctx, res, pending.key);
      audit('password_login_refused', { user: user.username, reason: 'account signs in with the identity provider only', ip: req.ip, step: '2fa' });
      return res.status(403).json({ error: req.t(SSO_ONLY, { provider: ctx.config.oidcName }), code: SSO_ONLY });
    }

    const keys = attemptKeys(req, user.username);
    if (limiter.isBlocked(keys)) {
      audit('login_blocked', { user: user.username, ip: req.ip, step: '2fa' });
      return res.status(429).json({ error: req.t(BLOCKED) });
    }
    if (!checkSecondFactor(ctx, user, req.body?.code)) {
      limiter.fail(keys);
      audit('login_failure', { user: user.username, ip: req.ip, step: '2fa' });
      return res.status(401).json({ error: req.t('comptes.code.incorrect') });
    }

    ctx.pending.finish(ctx, res, pending.key);
    limiter.reset(keys);
    // Même méthode que le début de la connexion (mot de passe, ou fournisseur d'identité
    // quand le fournisseur d'identité n'a pas fait la double authentification)
    startSession(ctx, res, user.id, { method: pending.method });
    audit('login_success', { user: user.username, ip: req.ip, step: '2fa', ...(pending.method === 'oidc' ? { method: 'oidc' } : {}) });
    res.json({ user: publicUser(user, ctx.config, { method: pending.method }) });
  });

  return router;
}

export function logoutRoute(ctx) {
  const router = express.Router();
  router.post('/logout', requireAuth, (req, res) => {
    endSession(ctx, req, res);
    ctx.audit('logout', { user: req.user.username, ip: req.ip });
    res.status(204).end();
  });
  return router;
}
