// Lien public d'une note (étape 3 du cadrage
// docs/cadrage-accueil-notes-notifications.md, section 3.7) : mêmes
// possibilités et mêmes règles que le lien public d'une liste
// (server/shares.js), dont ce module reprend les outils.
//
// - Jeton : 256 bits aléatoires, dans la même adresse /p/<jeton> que les
//   listes (server/routes/public.js cherche le jeton parmi les liens des
//   listes, puis parmi ceux des notes : les deux tables ne gardent que son
//   empreinte, deux jetons ne se ressemblent jamais). La base garde aussi sa
//   version chiffrée, pour le réafficher au propriétaire : jamais le jeton
//   en clair.
// - Mot de passe facultatif : 16 caractères tirés par Listo, haché avec
//   scrypt, montré une seule fois au propriétaire.
// - Un lien n'est valable que s'il n'est ni arrêté ni expiré, que sa note
//   existe et n'est pas dans la corbeille, et que son propriétaire est
//   actif, n'est pas un invité et a les Notes autorisées. Ce contrôle est refait à chaque requête (validShare), avec
//   l'horloge du serveur. Note mise à la corbeille : le lien ne mène plus à
//   rien ; restaurée, il remarche s'il n'a pas expiré entre-temps. Note
//   effacée : le lien part avec elle.
// - Les cookies de consultation (server/shares.js, createPublicAccess) sont
//   rangés sous la clé « note:<numéro> » (accessKey), jamais sous le seul
//   numéro : un cookie ouvert pour une note n'ouvre jamais la liste qui
//   aurait le même numéro de lien.
// - Le journal cite le numéro du lien, jamais le jeton ni le mot de passe.

import { hashToken } from './auth.js';
import { hashPassword } from './passwords.js';
import { encryptSecret, decryptSecret } from './secrets.js';
import { newShareToken, generateSharePassword, TOKEN_PATTERN, PURGE_AFTER_DAYS } from './shares.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Ligne de la base -> lien d'une note, reconnu comme tel partout
const asNoteShare = (row) => (row ? { ...row, kind: 'note', accessKey: `note:${row.id}` } : null);

export function createNoteShareService(ctx) {
  const { db } = ctx;
  const nowIso = () => new Date(ctx.now()).toISOString();

  const q = {
    // Lien non arrêté d'une note (il peut être expiré)
    openShare: db.prepare('SELECT * FROM note_public_shares WHERE note_id = ? AND revoked_at IS NULL'),
    byId: db.prepare('SELECT * FROM note_public_shares WHERE id = ?'),
    // Lien VALABLE retrouvé par l'empreinte de son jeton : non arrêté, non
    // expiré, note hors corbeille, propriétaire actif (et créateur du lien)
    validByHash: db.prepare(`
      SELECT note_public_shares.* FROM note_public_shares
      JOIN notes ON notes.id = note_public_shares.note_id AND notes.deleted_at IS NULL
      JOIN users ON users.id = notes.owner_id AND users.active = 1
      WHERE note_public_shares.token_hash = :hash
        AND note_public_shares.revoked_at IS NULL
        AND (note_public_shares.expires_at IS NULL OR note_public_shares.expires_at > :now)
        AND note_public_shares.created_by = notes.owner_id
    `),
    revoke: db.prepare('UPDATE note_public_shares SET revoked_at = ? WHERE id = ?'),
  };

  const expiresIn = (hours) => (hours === null ? null : new Date(ctx.now() + hours * HOUR).toISOString());
  const isExpired = (share) => share.expires_at !== null && share.expires_at <= nowIso();

  // Adresse du lien, construite à partir de LISTO_PUBLIC_URL (jamais de
  // l'en-tête Host envoyé par le navigateur)
  const urlOf = (token) => new URL(`/p/${token}`, ctx.config.publicUrl).href;
  const sealContext = (noteId) => `note-share:${noteId}`;
  // Adresse du lien, ou null si elle ne se déchiffre plus (clé de secrets/
  // changée) : il faut alors arrêter le lien et en créer un nouveau
  function readableUrl(share) {
    try {
      return urlOf(decryptSecret(ctx.keys.share, share.token_sealed, sealContext(share.note_id)).toString());
    } catch {
      return null;
    }
  }

  // Lien en cours d'une note (non arrêté, non expiré), ou null
  function current(noteId) {
    const share = q.openShare.get(noteId);
    return share && !isExpired(share) ? asNoteShare(share) : null;
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

  // Crée le lien (note du propriétaire, hors corbeille : vérifié par
  // l'appelant). Un ancien lien expiré (mais pas encore arrêté) est arrêté.
  // Renvoie { share, password }, null si un lien est déjà actif, ou
  // { refusal: { status, key } } si le propriétaire ne peut plus en avoir.
  async function create(user, note, { durationHours, protect }) {
    const password = protect ? generateSharePassword() : null;
    const passwordHash = password ? await hashPassword(password) : null;
    const token = newShareToken();
    const now = nowIso();
    let refusal = null;
    const share = db.transaction(() => {
      // Relu APRÈS le calcul du mot de passe (qui laisse la main) : l'Admin
      // a pu entre-temps faire de lui un invité, lui retirer les Notes ou
      // désactiver son compte (server/features.js)
      refusal = ctx.features?.publicLinkRefusal(user.id, 'notes') ?? null;
      if (refusal) return null;
      const old = q.openShare.get(note.id);
      if (old && !isExpired(old)) return null; // un lien est déjà actif
      if (old) q.revoke.run(now, old.id);
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO note_public_shares (note_id, token_hash, token_sealed, password_hash, expires_at, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(note.id, hashToken(token), encryptSecret(ctx.keys.share, token, sealContext(note.id)), passwordHash,
        expiresIn(durationHours), user.id, now);
      return q.byId.get(lastInsertRowid);
    })();
    if (refusal) return { refusal };
    if (!share) return null;
    return { share: asNoteShare(share), password };
  }

  // Change la durée (le délai repart de maintenant) et/ou le mot de passe :
  // password = 'new' (nouveau) ou 'none' (retiré). Les cookies de
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
      UPDATE note_public_shares SET password_hash = ?, expires_at = ? WHERE id = ? AND revoked_at IS NULL
    `).run(passwordHash, expiresAt, share.id);
    if (!changes) return null; // arrêté entre-temps
    if (password) ctx.publicAccess.revokeShare(`note:${share.id}`);
    return { share: asNoteShare(q.byId.get(share.id)), password: newPassword };
  }

  // Arrête le lien d'une note. Renvoie le lien arrêté ou null.
  function stop(noteId) {
    const share = q.openShare.get(noteId);
    if (!share) return null;
    q.revoke.run(nowIso(), share.id);
    ctx.publicAccess.revokeShare(`note:${share.id}`);
    return asNoteShare(share);
  }

  // Arrête les liens des notes d'un compte (compte désactivé)
  function stopForOwner(userId) {
    const shares = db.prepare(`
      SELECT note_public_shares.* FROM note_public_shares JOIN notes ON notes.id = note_public_shares.note_id
      WHERE notes.owner_id = ? AND note_public_shares.revoked_at IS NULL
    `).all(userId);
    for (const share of shares) {
      q.revoke.run(nowIso(), share.id);
      ctx.publicAccess.revokeShare(`note:${share.id}`);
    }
    return shares.length;
  }

  // Lien en cours d'une note, pour sa carte : { expiresAt } ou null
  function badgeFor(noteId) {
    const share = current(noteId);
    return share ? { expiresAt: share.expires_at } : null;
  }

  // --- Côté visiteur ---
  // Le lien valable correspondant à ce jeton, ou null. Contrôle complet à
  // chaque appel : forme du jeton, arrêt, expiration (horloge du serveur),
  // note dans la corbeille ou effacée, propriétaire désactivé, devenu
  // invité ou sans Notes autorisées (server/features.js, une lecture de sa
  // ligne) : la même réponse qu'un lien inconnu, sans jamais dire pourquoi.
  function validShare(token) {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;
    const share = q.validByHash.get({ hash: hashToken(token), now: nowIso() });
    if (share && ctx.features?.publicLinkRefusal(share.created_by, 'notes')) return null;
    return asNoteShare(share);
  }

  // --- Nettoyage : liens arrêtés ou expirés depuis plus de 30 jours ---
  function purgeOld() {
    const limit = new Date(ctx.now() - PURGE_AFTER_DAYS * DAY).toISOString();
    return db.prepare(`
      DELETE FROM note_public_shares
      WHERE (revoked_at IS NOT NULL AND revoked_at < :limit) OR (expires_at IS NOT NULL AND expires_at < :limit)
    `).run({ limit }).changes;
  }

  return { current, describe, create, update, stop, stopForOwner, badgeFor, validShare, purgeOld };
}
