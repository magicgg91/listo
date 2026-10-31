// Sessions de connexion et contrôles d'accès.
//
// Une session est un jeton aléatoire de 256 bits, donné au navigateur dans un
// cookie. La base ne garde que son empreinte (SHA-256) : même avec une copie
// de la base, on ne peut pas se faire passer pour quelqu'un.
//
// Contrôles faits à chaque requête, côté serveur :
// - requireSameOrigin : une modification doit venir de l'adresse de Listo
//   (en-tête Origin), contre les attaques « CSRF » depuis un autre site ;
// - requireAuth : il faut une session valide, sur un compte actif ;
// - requireAdmin : il faut en plus le rôle Admin.

import crypto from 'node:crypto';

// Noms des cookies de connexion : session, et connexion en attente du code
// 2FA. En production (HTTPS), ils portent le préfixe « __Host- » : le
// navigateur ne les accepte alors que Secure, sur le chemin / et sans
// domaine, si bien qu'un autre sous-domaine ne peut ni les lire ni les
// remplacer. En développement (http), ce préfixe est impossible : noms
// simples. (Le cookie du lien public, listo_lien, a un chemin propre à
// chaque lien : il ne peut pas porter ce préfixe.)
export function cookieNames(config) {
  const prefix = config.production ? '__Host-' : '';
  return { session: `${prefix}listo_session`, pending: `${prefix}listo_2fa` };
}
const DAY = 24 * 60 * 60 * 1000;
const PENDING_MS = 5 * 60 * 1000;            // 5 minutes pour saisir le code 2FA

// --- Outils ---

// Empreinte SHA-256 d'un jeton (c'est elle qui est stockée)
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Nouveau jeton aléatoire de 256 bits
function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// Lit les cookies envoyés par le navigateur (en-tête « Cookie »).
// Un cookie mal encodé (ex. « listo_session=% ») est simplement ignoré :
// la requête est alors traitée comme celle d'un visiteur non connecté.
export function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    try {
      cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // cookie illisible : ignoré
    }
  }
  return cookies;
}

// Compare deux textes secrets en temps constant
export function safeEqual(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a)).digest();
  const hashB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// Clés de limitation des tentatives : l'identifiant visé et l'adresse IP
export function attemptKeys(req, username) {
  const keys = [`ip:${req.ip}`];
  if (username) keys.push(`u:${String(username).toLowerCase()}`);
  return keys;
}

// Données d'un compte renvoyées au téléphone (jamais l'empreinte ni le secret)
// config : pour dire au téléphone si le mode scan (recherche du nom d'un
// produit) est activé sur ce serveur (LISTO_PRODUCT_LOOKUP)
export function publicUser(user, config) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    totpEnabled: user.totp_enabled === 1,
    mustChangePassword: user.must_change_password === 1,
    productLookup: config?.productLookup !== false,
    // Accès depuis Claude (LISTO_MCP=on) : l'adresse à saisir dans Claude,
    // pour afficher l'écran « Connexions Claude » et l'aide ; null sinon
    claudeUrl: config?.mcp ? `${new URL(config.publicUrl).origin}/mcp` : null,
  };
}

// --- Sessions ---

// Options du cookie de session. « Secure » (HTTPS seulement) en production.
function cookieOptions(ctx, maxAge) {
  return { httpOnly: true, secure: ctx.config.production, sameSite: 'lax', path: '/', maxAge };
}

// Ouvre une session pour un compte et envoie le cookie au navigateur
export function startSession(ctx, res, userId) {
  const token = newToken();
  const now = ctx.now();
  const maxAge = ctx.config.sessionDays * DAY;
  ctx.db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), userId, new Date(now + maxAge).toISOString(), new Date(now).toISOString());
  res.cookie(cookieNames(ctx.config).session, token, cookieOptions(ctx, maxAge));
}

// Ferme la session de cette requête (déconnexion)
export function endSession(ctx, req, res) {
  if (req.sessionId) {
    ctx.db.prepare('DELETE FROM sessions WHERE id = ?').run(req.sessionId);
    ctx.events?.disconnectSession(req.sessionId); // flux temps réel coupé
  }
  res.clearCookie(cookieNames(ctx.config).session, cookieOptions(ctx));
}

// Ferme toutes les sessions d'un compte (changement de mot de passe…)
// Les flux temps réel du compte sont coupés aussi, et ses connexions Claude
// révoquées (reason : raison écrite dans le journal).
export function revokeAllSessions(ctx, userId, reason = 'sessions du compte fermées') {
  ctx.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  ctx.events?.disconnectUser(userId);
  ctx.oauth?.revokeAllForUser(userId, reason);
}

// Efface les sessions expirées (appelé au démarrage puis toutes les heures)
export function purgeExpiredSessions(ctx) {
  ctx.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date(ctx.now()).toISOString());
}

// Lit la session de la requête, si elle existe. Remplit req.user et
// req.sessionId. La session est « glissante » : chaque jour d'utilisation la
// prolonge de nouveau de 30 jours (une fois par jour au plus, pour ne pas
// écrire dans la base à chaque requête).
export function loadSession(ctx) {
  const findSession = ctx.db.prepare(`
    SELECT sessions.id AS session_id, sessions.expires_at, users.*
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ? AND sessions.expires_at > ? AND users.active = 1
  `);
  const extend = ctx.db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?');

  return (req, res, next) => {
    // Déjà lue pour cette requête (lot d'opérations) : une seule lecture
    if (req.sessionLoaded) return next();
    req.sessionLoaded = true;
    const token = parseCookies(req.headers.cookie)[cookieNames(ctx.config).session];
    if (!token) return next();
    const now = ctx.now();
    const row = findSession.get(hashToken(token), new Date(now).toISOString());
    if (!row) return next();

    const maxAge = ctx.config.sessionDays * DAY;
    if (Date.parse(row.expires_at) - now < maxAge - DAY) {
      extend.run(new Date(now + maxAge).toISOString(), row.session_id);
      res.cookie(cookieNames(ctx.config).session, token, cookieOptions(ctx, maxAge));
    }
    req.sessionId = row.session_id;
    req.user = row;
    next();
  };
}

// --- Contrôles d'accès ---

// Refuse un visiteur non connecté (401)
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Connexion requise.' });
  next();
}

// Mot de passe choisi par un Admin (création du compte ou réinitialisation) :
// tant que l'utilisateur ne l'a pas changé, il ne peut que voir son compte,
// changer son mot de passe ou se déconnecter (403 partout ailleurs).
const ALLOWED_BEFORE_CHANGE = new Set(['GET /me', 'POST /me/password', 'POST /logout']);
export function requirePasswordChanged(req, res, next) {
  if (req.user.must_change_password === 1 && !ALLOWED_BEFORE_CHANGE.has(`${req.method} ${req.path}`)) {
    return res.status(403).json({ error: 'Changez votre mot de passe avant de continuer.', mustChangePassword: true });
  }
  next();
}

// Refuse un compte qui n'est pas Admin (403)
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  next();
}

// Protection CSRF : une requête qui modifie des données (POST, PUT, PATCH,
// DELETE) doit porter un en-tête Origin égal à l'adresse publique de Listo.
// Les navigateurs ajoutent cet en-tête tout seuls et un autre site ne peut
// pas le falsifier.
export function requireSameOrigin(publicUrl) {
  const allowed = new URL(publicUrl).origin;
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('origin') !== allowed) {
      return res.status(403).json({ error: 'Requête refusée : origine inconnue.' });
    }
    next();
  };
}

// --- Connexion en attente du code 2FA ---
//
// Après un mot de passe correct sur un compte avec 2FA, aucune session n'est
// ouverte : on donne seulement un jeton temporaire (5 minutes, cookie
// listo_2fa, ou __Host-listo_2fa en production) qui permet de saisir le code.
// Gardé en mémoire uniquement. Le cookie est sur le chemin / (exigé par le
// préfixe __Host-), mais seule la route du code 2FA le lit.

export function createPendingLogins(now, config) {
  const pending = new Map(); // empreinte du jeton -> { userId, expiresAt }
  const name = cookieNames(config).pending;
  const options = { httpOnly: true, secure: config.production, sameSite: 'strict', path: '/' };

  return {
    // Crée une connexion en attente et envoie son cookie
    start(ctx, res, userId) {
      const token = newToken();
      pending.set(hashToken(token), { userId, expiresAt: now() + PENDING_MS });
      res.cookie(name, token, { ...options, maxAge: PENDING_MS });
    },

    // Renvoie { key, userId } pour la requête, ou null si absent ou expiré
    find(req) {
      const token = parseCookies(req.headers.cookie)[name];
      if (!token) return null;
      const key = hashToken(token);
      const entry = pending.get(key);
      if (!entry || entry.expiresAt <= now()) {
        pending.delete(key);
        return null;
      }
      return { key, userId: entry.userId };
    },

    // Termine une connexion en attente (code accepté)
    finish(ctx, res, key) {
      pending.delete(key);
      res.clearCookie(name, options);
    },

    // Supprime les connexions en attente expirées
    prune() {
      for (const [key, entry] of pending) if (entry.expiresAt <= now()) pending.delete(key);
    },
  };
}

// --- Code de démarrage (création du premier Admin) ---

// Code à usage unique, 12 caractères faciles à recopier (ex. « K7RM-4XQP-9DHT »)
export function generateSetupCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans I, L, O, 0, 1 (confusions)
  let code = '';
  for (let i = 0; i < 12; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  return code.match(/.{4}/g).join('-');
}

// Met un code saisi en forme : majuscules, sans tirets ni espaces
export function normalizeCode(code) {
  return String(code ?? '').toUpperCase().replace(/[\s-]/g, '');
}
