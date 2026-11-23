// Administration des comptes (réservée aux Admin, voir admin.js) :
//   GET    /api/admin/users                 lister les comptes
//   POST   /api/admin/users                 créer un compte
//   PATCH  /api/admin/users/:id             modifier nom affiché, rôle, actif
//   POST   /api/admin/users/:id/password    réinitialiser le mot de passe
//   DELETE /api/admin/users/:id/2fa         désactiver la 2FA (téléphone perdu)
//   DELETE /api/admin/users/:id             supprimer un compte jamais utilisé
//   DELETE /api/admin/users/:id/authelia    délier le compte de son compte chez le fournisseur d'identité
// Demandes de compte (connexion avec le fournisseur d'identité, LISTO_OIDC=on seulement) :
//   POST   /api/admin/account-requests/:id/accept   accepter (le compte est créé)
//   POST   /api/admin/account-requests/:id/refuse   refuser (gardée 30 jours)
// (la liste des demandes en attente arrive avec GET /api/admin/users)
//
// Règles de sécurité :
// - un Admin ne peut ni se désactiver, ni se retirer le rôle Admin, ni se
//   supprimer, ni réinitialiser son propre mot de passe ou sa 2FA par ici
//   (il passe par ses réglages, où l'ancien mot de passe est demandé) ;
// - il reste toujours au moins un Admin actif ;
// - aucune de ces routes ne donne accès au contenu des listes.

import crypto from 'node:crypto';
import express from 'express';
import { hashPassword, passwordProblem } from '../passwords.js';
import { revokeAllSessions } from '../auth.js';
import { disableTwoFactor } from '../twofactor.js';
import { isValidUsername, USERNAME_RULE, cleanName, parseId } from '../validate.js';

const LAST_ADMIN = 'comptes.dernierAdmin'; // nom du texte

export function adminUserRoutes(ctx) {
  const router = express.Router();
  const { db, audit } = ctx;

  const findUser = db.prepare('SELECT * FROM users WHERE id = ?');
  // Nombre d'Admin actifs autres que le compte indiqué
  const otherActiveAdmins = db.prepare("SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1 AND id != ?").pluck();
  // Un compte est « utilisé » s'il possède une liste, a créé un article, est
  // membre d'une liste ou destinataire d'une liste d'envies. Une réservation
  // n'en fait pas partie (elle s'efface avec le compte) : l'administration ne
  // laisse ainsi rien deviner des réservations.
  const accountUsed = db.prepare(`
    SELECT EXISTS (SELECT 1 FROM lists WHERE owner_id = :id)
        OR EXISTS (SELECT 1 FROM items WHERE created_by = :id)
        OR EXISTS (SELECT 1 FROM list_members WHERE user_id = :id)
        OR EXISTS (SELECT 1 FROM lists WHERE for_user_id = :id)
        OR EXISTS (SELECT 1 FROM notes WHERE owner_id = :id)
        OR EXISTS (SELECT 1 FROM note_members WHERE user_id = :id)
  `).pluck();

  // Ce qu'un Admin voit d'un compte : jamais d'empreinte, de secret ni de liste
  const describe = (user) => ({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    active: user.active === 1,
    totpEnabled: user.totp_enabled === 1,
    mustChangePassword: user.must_change_password === 1,
    createdAt: user.created_at,
    inUse: accountUsed.get({ id: user.id }) === 1,
    // Relié à un compte chez le fournisseur d'identité (oui ou non seulement, jamais son identifiant interne)
    authelia: user.oidc_sub != null,
  });

  // Demandes de compte en attente (connexion avec le fournisseur d'identité) : ce que la
  // personne a donné chez le fournisseur d'identité, jamais son identifiant interne
  const pendingRequests = db.prepare("SELECT id, username, display_name, created_at FROM account_requests WHERE status = 'pending' ORDER BY created_at, id");
  const describeRequest = (request) => ({ id: request.id, username: request.username, displayName: request.display_name, createdAt: request.created_at });

  // Retrouve le compte de l'adresse (:id), ou répond 404
  function target(req, res) {
    const id = parseId(req.params.id);
    const user = id && findUser.get(id);
    if (!user) res.status(404).json({ error: req.t('comptes.introuvable') });
    return user || null;
  }

  // Vrai si retirer ce compte des Admin actifs en laisserait zéro
  const isLastActiveAdmin = (user) => user.role === 'admin' && user.active === 1 && otherActiveAdmins.get(user.id) === 0;

  // Liste des comptes, par identifiant
  router.get('/users', (req, res) => {
    const users = db.prepare('SELECT * FROM users ORDER BY username COLLATE NOCASE').all();
    res.json({
      users: users.map(describe),
      oidc: Boolean(ctx.oidc),
      localLogin: ctx.config.localLogin !== false,
      accountRequests: ctx.oidc ? pendingRequests.all().map(describeRequest) : [],
    });
  });

  // Demande acceptée : le compte est créé, relié au compte chez le fournisseur d'identité de la
  // demande. L'Admin peut corriger l'identifiant et le nom proposés.
  router.post('/account-requests/:id/accept', async (req, res) => {
    if (!ctx.oidc) return res.status(404).json({ error: req.t('comptes.routeInconnue') });
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: req.t('comptes.demande.introuvable') });
    const { username, displayName, role = 'user' } = req.body ?? {};
    if (!isValidUsername(username)) return res.status(400).json({ error: req.t(USERNAME_RULE) });
    const name = cleanName(displayName);
    if (!name) return res.status(400).json({ error: req.t('comptes.nomAffiche.invalide') });
    if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: req.t('comptes.role.invalide') });
    const result = await ctx.oidc.acceptRequest(id, { username, displayName: name, role });
    if (result.key) return res.status(result.status).json({ error: req.t(result.key, result.params) });
    audit('account_request_accepted', { admin: req.user.username, user: username, role });
    res.status(201).json({ user: describe(findUser.get(result.id)) });
  });

  // Demande refusée : gardée 30 jours, pour qu'une nouvelle connexion ne la
  // refasse pas aussitôt (voir oidc.js)
  router.post('/account-requests/:id/refuse', (req, res) => {
    if (!ctx.oidc) return res.status(404).json({ error: req.t('comptes.routeInconnue') });
    const id = parseId(req.params.id);
    const done = id && db.prepare("UPDATE account_requests SET status = 'refused', refused_at = ? WHERE id = ? AND status = 'pending'")
      .run(new Date(ctx.now()).toISOString(), id).changes;
    if (!done) return res.status(404).json({ error: req.t('comptes.demande.introuvable') });
    audit('account_request_refused', { admin: req.user.username });
    res.status(204).end();
  });

  // Délier un compte de son compte chez le fournisseur d'identité : le prochain compte du
  // fournisseur d'identité du même identifiant pourra de nouveau l'ouvrir (compte recréé chez le fournisseur d'identité…)
  router.delete('/users/:id/authelia', (req, res) => {
    const user = target(req, res);
    if (!user) return;
    db.prepare('UPDATE users SET oidc_sub = NULL WHERE id = ?').run(user.id);
    audit('account_unlinked_oidc', { admin: req.user.username, user: user.username });
    res.json({ user: describe(findUser.get(user.id)) });
  });

  // Création d'un compte. Le mot de passe initial est choisi par l'Admin :
  // l'utilisateur devra le changer à sa première connexion.
  router.post('/users', async (req, res) => {
    const { username, displayName, role = 'user', password } = req.body ?? {};
    if (!isValidUsername(username)) return res.status(400).json({ error: req.t(USERNAME_RULE) });
    const name = displayName === undefined || displayName === '' ? username : cleanName(displayName);
    if (!name) return res.status(400).json({ error: req.t('comptes.nomAffiche.invalide') });
    if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: req.t('comptes.role.invalide') });
    // Connexion par mot de passe coupée (LISTO_LOCAL_LOGIN=off) : pas de
    // mot de passe provisoire ; la personne entrera avec le fournisseur d'identité (même
    // identifiant), le compte a un mot de passe aléatoire que personne ne connaît
    const local = ctx.config.localLogin !== false;
    if (local) {
      const problem = passwordProblem(password);
      if (problem) return res.status(400).json({ error: req.t(problem.key, problem.params) });
    }
    const hash = await hashPassword(local ? password : crypto.randomBytes(32).toString('base64url'));
    // L'identifiant est unique sans tenir compte des majuscules (COLLATE
    // NOCASE dans la base) ; la vérification se fait au moment d'écrire.
    let id;
    try {
      id = db.prepare('INSERT INTO users (username, display_name, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, ?)')
        .run(username, name, hash, role, local ? 1 : 0).lastInsertRowid;
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: req.t('comptes.identifiant.existe') });
      throw err;
    }
    audit('admin_account_created', { admin: req.user.username, user: username, role, ip: req.ip });
    res.status(201).json({ user: describe(findUser.get(id)) });
  });

  // Modification : nom affiché, rôle, actif (désactiver ou réactiver)
  router.patch('/users/:id', (req, res) => {
    const user = target(req, res);
    if (!user) return;
    const { displayName, role, active } = req.body ?? {};
    if (displayName === undefined && role === undefined && active === undefined) {
      return res.status(400).json({ error: req.t('comptes.rienAModifier') });
    }

    const changes = {};
    if (displayName !== undefined) {
      changes.display_name = cleanName(displayName);
      if (!changes.display_name) return res.status(400).json({ error: req.t('comptes.nomAffiche.invalide') });
    }
    if (role !== undefined) {
      if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: req.t('comptes.role.invalide') });
      changes.role = role;
    }
    if (active !== undefined) {
      if (typeof active !== 'boolean') return res.status(400).json({ error: req.t('comptes.actif.invalide') });
      changes.active = active ? 1 : 0;
    }

    const losesAdmin = changes.role === 'user' || changes.active === 0;
    if (losesAdmin && user.id === req.user.id) {
      return res.status(400).json({ error: req.t('comptes.soiMeme.desactiver') });
    }
    if (losesAdmin && isLastActiveAdmin(user)) return res.status(409).json({ error: req.t(LAST_ADMIN) });

    db.prepare(`UPDATE users SET
        display_name = COALESCE(:display_name, display_name),
        role = COALESCE(:role, role),
        active = COALESCE(:active, active)
      WHERE id = :id`).run({ display_name: null, role: null, active: null, ...changes, id: user.id });

    // Un compte désactivé est déconnecté partout, tout de suite
    if (changes.active === 0) revokeAllSessions(ctx, user.id, 'account disabled');
    // … et les liens publics de ses listes et de ses notes sont arrêtés
    const stoppedLinks = changes.active === 0 ? ctx.shares.stopForOwner(user.id) : 0;
    const stoppedNoteLinks = changes.active === 0 ? ctx.noteShares.stopForOwner(user.id) : 0;

    // Journal : une ligne par changement réel
    const who = { admin: req.user.username, user: user.username, ip: req.ip };
    if (changes.display_name !== undefined && changes.display_name !== user.display_name) {
      audit('admin_account_renamed', { ...who, old: user.display_name, new: changes.display_name });
    }
    if (changes.role !== undefined && changes.role !== user.role) audit('admin_role_changed', { ...who, role: changes.role });
    if (changes.active === 0 && user.active === 1) audit('admin_account_disabled', who);
    if (stoppedLinks) audit('public_link_stopped', { ...who, count: stoppedLinks, reason: 'account disabled' });
    if (stoppedNoteLinks) audit('note_link_stopped', { ...who, count: stoppedNoteLinks, reason: 'account disabled' });
    if (changes.active === 1 && user.active === 0) audit('admin_account_reactivated', who);

    res.json({ user: describe(findUser.get(user.id)) });
  });

  // Réinitialisation du mot de passe d'un autre compte : toutes ses sessions
  // sont fermées et il devra changer ce mot de passe à sa prochaine connexion.
  router.post('/users/:id/password', async (req, res) => {
    if (ctx.config.localLogin === false) return res.status(403).json({ error: req.t('comptes.motDePasse.desactiveServeur') });
    const user = target(req, res);
    if (!user) return;
    if (user.id === req.user.id) {
      return res.status(400).json({ error: req.t('comptes.soiMeme.motDePasse') });
    }
    const problem = passwordProblem(req.body?.password);
    if (problem) return res.status(400).json({ error: req.t(problem.key, problem.params) });

    const hash = await hashPassword(req.body.password);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hash, user.id);
    revokeAllSessions(ctx, user.id, 'password reset by the admin');
    audit('admin_password_reset', { admin: req.user.username, user: user.username, ip: req.ip });
    res.json({ user: describe(findUser.get(user.id)) });
  });

  // Désactivation de la 2FA d'un autre compte (téléphone et codes perdus)
  router.delete('/users/:id/2fa', (req, res) => {
    const user = target(req, res);
    if (!user) return;
    if (user.id === req.user.id) {
      // Pour soi-même, on passe par ses réglages (mot de passe et code demandés)
      return res.status(400).json({ error: req.t('comptes.soiMeme.deuxFacteurs') });
    }
    disableTwoFactor(ctx, user.id);
    audit('admin_2fa_disabled', { admin: req.user.username, user: user.username, ip: req.ip });
    res.json({ user: describe(findUser.get(user.id)) });
  });

  // Suppression d'un compte, seulement s'il n'a jamais servi (aucune liste,
  // aucun article, membre d'aucune liste, aucune note). Sinon : le désactiver.
  router.delete('/users/:id', (req, res) => {
    const user = target(req, res);
    if (!user) return;
    if (user.id === req.user.id) return res.status(400).json({ error: req.t('comptes.soiMeme.supprimer') });
    if (isLastActiveAdmin(user)) return res.status(409).json({ error: req.t(LAST_ADMIN) });
    if (accountUsed.get({ id: user.id }) === 1) {
      return res.status(409).json({ error: req.t('comptes.dejaServi') });
    }
    // Ses sessions et codes de secours sont effacés avec lui (ON DELETE CASCADE)
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    audit('admin_account_deleted', { admin: req.user.username, user: user.username, ip: req.ip });
    res.status(204).end();
  });

  return router;
}
