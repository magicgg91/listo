// Lien public d'une liste (étape 10) : la seule partie de Listo accessible
// sans compte. Tout est refusé par défaut.
//
// - Jeton : 256 bits aléatoires, dans l'adresse /p/<jeton>. La base ne garde
//   que son empreinte (pour retrouver le lien) et sa version chiffrée (pour
//   le réafficher au propriétaire) : jamais le jeton en clair.
// - Mot de passe facultatif : 16 caractères tirés par Listo, haché avec
//   scrypt, montré une seule fois au propriétaire.
// - Un lien n'est valable que s'il n'est ni arrêté ni expiré, que sa liste
//   existe encore et que son propriétaire est actif. Ce contrôle est refait à
//   chaque requête (validShare), avec l'horloge du serveur.
// - Le journal cite le numéro du partage, jamais le jeton ni le mot de passe.

import crypto from 'node:crypto';
import { hashToken } from './auth.js';
import { hashPassword } from './passwords.js';
import { encryptSecret, decryptSecret } from './secrets.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const DEFAULT_DURATION_HOURS = 24;
export const MAX_DURATION_HOURS = 365 * 24;   // 365 jours
export const PASSWORD_LENGTH = 16;
export const ACCESS_MAX_MS = 12 * HOUR;       // cookie de consultation : 12 heures au plus
export const PURGE_AFTER_DAYS = 30;

// Jeton : 32 octets aléatoires en base64url = 43 caractères
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const newShareToken = () => crypto.randomBytes(32).toString('base64url');

// Familles de caractères du mot de passe. Sans les caractères faciles à
// confondre (0 et O, 1, l et I) ; caractères spéciaux simples à taper sur le
// clavier d'un téléphone.
export const PASSWORD_FAMILIES = {
  lower: 'abcdefghijkmnpqrstuvwxyz',
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  digit: '23456789',
  special: '!?@#-+=*',
};

// Mot de passe de 16 caractères : un de chaque famille (garantie), le reste
// tiré dans l'ensemble, puis mélange de Fisher-Yates. crypto.randomInt tire
// sans biais : chaque caractère et chaque position ont la même chance.
export function generateSharePassword(randomInt = crypto.randomInt) {
  const families = Object.values(PASSWORD_FAMILIES);
  const all = families.join('');
  const chars = families.map((family) => family[randomInt(family.length)]);
  while (chars.length < PASSWORD_LENGTH) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// Durée demandée par le propriétaire : nombre d'heures (1 à 365 jours), ou
// null pour « illimitée ». Renvoie undefined si la valeur est invalide.
export function checkDuration(value) {
  if (value === null) return null;
  if (Number.isInteger(value) && value >= 1 && value <= MAX_DURATION_HOURS) return value;
  return undefined;
}

export function createShareService(ctx) {
  const { db } = ctx;
  const nowIso = () => new Date(ctx.now()).toISOString();

  const q = {
    // Liste non supprimée dont le compte est le propriétaire
    ownedList: db.prepare('SELECT * FROM lists WHERE id = ? AND owner_id = ? AND deleted_at IS NULL'),
    // Lien non arrêté d'une liste (il peut être expiré)
    openShare: db.prepare('SELECT * FROM public_shares WHERE list_id = ? AND revoked_at IS NULL'),
    // Lien VALABLE retrouvé par l'empreinte de son jeton : non arrêté, non
    // expiré, liste non supprimée, propriétaire actif (et créateur du lien)
    validByHash: db.prepare(`
      SELECT public_shares.* FROM public_shares
      JOIN lists ON lists.id = public_shares.list_id AND lists.deleted_at IS NULL
        AND lists.type != 'wishes' -- jamais de lien public pour une liste d'envies (même réponse qu'un lien inconnu)
      JOIN users ON users.id = lists.owner_id AND users.active = 1
      WHERE public_shares.token_hash = :hash
        AND public_shares.revoked_at IS NULL
        AND (public_shares.expires_at IS NULL OR public_shares.expires_at > :now)
        AND public_shares.created_by = lists.owner_id
    `),
    revoke: db.prepare('UPDATE public_shares SET revoked_at = ? WHERE id = ?'),
    touchList: db.prepare('UPDATE lists SET updated_at = ? WHERE id = ?'),
  };

  const expiresIn = (hours) => (hours === null ? null : new Date(ctx.now() + hours * HOUR).toISOString());
  const isExpired = (share) => share.expires_at !== null && share.expires_at <= nowIso();

  // Adresse du lien, construite à partir de LISTO_PUBLIC_URL (jamais de
  // l'en-tête Host envoyé par le navigateur)
  const urlOf = (token) => new URL(`/p/${token}`, ctx.config.publicUrl).href;
  const tokenOf = (share) => decryptSecret(ctx.keys.share, share.token_sealed, `share:${share.list_id}`).toString();
  // Adresse du lien, ou null si elle ne se déchiffre plus (clé de
  // secrets/ changée) : le lien marche encore, mais il faut l'arrêter et en
  // créer un nouveau pour retrouver son adresse
  function readableUrl(share) {
    try {
      return urlOf(tokenOf(share));
    } catch {
      return null;
    }
  }

  // La liste a changé (pour l'icône « lien » de Mes listes) : les téléphones
  // l'apprennent à leur prochaine synchronisation
  function listChanged(listId) {
    q.touchList.run(nowIso(), listId);
    ctx.events?.notifyList(listId);
  }

  // --- Côté propriétaire ---

  // La liste, si le compte en est le propriétaire ; sinon null
  function ownedList(user, listId) {
    if (typeof listId !== 'string') return null;
    return q.ownedList.get(listId.toLowerCase(), user.id) ?? null;
  }

  // Lien en cours d'une liste (non arrêté, non expiré), ou null
  function current(listId) {
    const share = q.openShare.get(listId);
    return share && !isExpired(share) ? share : null;
  }

  // État du lien envoyé au propriétaire (jamais l'empreinte du mot de passe)
  function describe(share, { password } = {}) {
    if (!share) return null;
    return {
      id: share.id,
      url: readableUrl(share),
      expiresAt: share.expires_at,
      protected: share.password_hash !== null,
      createdAt: share.created_at,
      ...(password ? { password } : {}),
    };
  }

  // Crée le lien. Un ancien lien expiré (mais pas encore arrêté) est arrêté.
  async function create(user, list, { durationHours, protect }) {
    const password = protect ? generateSharePassword() : null;
    const passwordHash = password ? await hashPassword(password) : null;
    const token = newShareToken();
    const now = nowIso();
    const share = db.transaction(() => {
      const old = q.openShare.get(list.id);
      if (old && !isExpired(old)) return null; // un lien est déjà actif
      if (old) q.revoke.run(now, old.id);
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO public_shares (list_id, token_hash, token_sealed, password_hash, expires_at, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(list.id, hashToken(token), encryptSecret(ctx.keys.share, token, `share:${list.id}`), passwordHash,
        expiresIn(durationHours), user.id, now);
      return db.prepare('SELECT * FROM public_shares WHERE id = ?').get(lastInsertRowid);
    })();
    if (!share) return null;
    listChanged(list.id); // après l'écriture
    return { share, password };
  }

  // Change la durée (le délai repart de maintenant) et/ou le mot de passe :
  // password = 'new' (nouveau mot de passe) ou 'none' (retiré). Les cookies de
  // consultation ouverts avec l'ancien mot de passe ne marchent plus.
  async function update(share, { durationHours, password }) {
    let newPassword = null;
    let passwordHash = share.password_hash;
    if (password === 'new') {
      newPassword = generateSharePassword();
      passwordHash = await hashPassword(newPassword);
    } else if (password === 'none') {
      passwordHash = null;
    }
    const expiresAt = durationHours === undefined ? share.expires_at : expiresIn(durationHours);
    const { changes } = db.prepare(`
      UPDATE public_shares SET password_hash = ?, expires_at = ? WHERE id = ? AND revoked_at IS NULL
    `).run(passwordHash, expiresAt, share.id);
    if (!changes) return null; // arrêté entre-temps
    if (password) ctx.publicAccess.revokeShare(share.id);
    listChanged(share.list_id);
    return { share: db.prepare('SELECT * FROM public_shares WHERE id = ?').get(share.id), password: newPassword };
  }

  // Arrête le lien d'une liste, sans autre effet (liste supprimée : appelé
  // pendant la suppression). Renvoie le lien arrêté ou null.
  function stopForList(listId) {
    const share = q.openShare.get(listId);
    if (!share) return null;
    q.revoke.run(nowIso(), share.id);
    ctx.publicAccess.revokeShare(share.id);
    return share;
  }

  // Arrête le lien d'une liste (le propriétaire le demande)
  function stop(listId) {
    const share = stopForList(listId);
    if (share) listChanged(listId);
    return share;
  }

  // Arrête les liens des listes d'un compte (compte désactivé)
  function stopForOwner(userId) {
    const shares = db.prepare(`
      SELECT public_shares.* FROM public_shares JOIN lists ON lists.id = public_shares.list_id
      WHERE lists.owner_id = ? AND public_shares.revoked_at IS NULL
    `).all(userId);
    for (const share of shares) {
      q.revoke.run(nowIso(), share.id);
      ctx.publicAccess.revokeShare(share.id);
    }
    return shares.length;
  }

  // Lien en cours d'une liste du compte, pour Mes listes : { expiresAt } ou null
  function badgeFor(listId) {
    const share = current(listId);
    return share ? { expiresAt: share.expires_at } : null;
  }

  // --- Côté visiteur ---

  // Le lien valable correspondant à ce jeton, ou null. Contrôle complet à
  // chaque appel : forme du jeton, arrêt, expiration (horloge du serveur),
  // liste supprimée, propriétaire désactivé.
  function validShare(token) {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;
    return q.validByHash.get({ hash: hashToken(token), now: nowIso() }) ?? null;
  }

  // --- Nettoyage ---

  // Supprime les liens arrêtés ou expirés depuis plus de 30 jours
  function purgeOld() {
    const limit = new Date(ctx.now() - PURGE_AFTER_DAYS * DAY).toISOString();
    return db.prepare(`
      DELETE FROM public_shares
      WHERE (revoked_at IS NOT NULL AND revoked_at < :limit) OR (expires_at IS NOT NULL AND expires_at < :limit)
    `).run({ limit }).changes;
  }

  return { ownedList, current, describe, create, update, stop, stopForList, stopForOwner, badgeFor, validShare, purgeOld };
}

// --- Cookies de consultation ---
//
// Après un mot de passe correct, le visiteur reçoit un jeton aléatoire (cookie
// listo_lien) qui vaut pour CE lien seulement, 12 heures au plus et jamais
// après l'expiration du lien. Gardés en mémoire seulement (empreinte du
// jeton) : un redémarrage de Listo les efface, il suffit alors de ressaisir
// le mot de passe. Un nouveau mot de passe, son retrait ou l'arrêt du lien
// les efface aussi.

export const ACCESS_COOKIE = 'listo_lien';
const MAX_ACCESS_ENTRIES = 2000; // plafond de mémoire

export function createPublicAccess(now = Date.now) {
  const entries = new Map(); // empreinte du jeton -> { shareId, expiresAt }

  function prune() {
    for (const [key, entry] of entries) if (entry.expiresAt <= now()) entries.delete(key);
  }

  return {
    // Ouvre un accès ; renvoie { token, maxAge } (maxAge en millisecondes)
    grant(share) {
      const t = now();
      let expiresAt = t + ACCESS_MAX_MS;
      if (share.expires_at !== null) expiresAt = Math.min(expiresAt, Date.parse(share.expires_at));
      if (entries.size >= MAX_ACCESS_ENTRIES) prune();
      // Toujours plein : on oublie les plus anciens (le visiteur ressaisira)
      while (entries.size >= MAX_ACCESS_ENTRIES) entries.delete(entries.keys().next().value);
      const token = crypto.randomBytes(32).toString('base64url');
      entries.set(hashToken(token), { shareId: share.id, expiresAt });
      return { token, maxAge: expiresAt - t };
    },

    // Vrai si ce cookie ouvre bien CE lien, et n'a pas expiré
    allows(token, share) {
      if (typeof token !== 'string' || !token) return false;
      const key = hashToken(token);
      const entry = entries.get(key);
      if (!entry) return false;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return false;
      }
      return entry.shareId === share.id;
    },

    // Efface tous les accès d'un lien
    revokeShare(shareId) {
      for (const [key, entry] of entries) if (entry.shareId === shareId) entries.delete(key);
    },

    prune,
    size: () => entries.size,
  };
}
