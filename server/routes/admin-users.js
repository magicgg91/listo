// Administration des comptes (réservée aux Admin, voir admin.js) :
//   GET    /api/admin/users                 lister les comptes
//   POST   /api/admin/users                 créer un compte
//   PATCH  /api/admin/users/:id             modifier nom affiché, rôle, actif
//   POST   /api/admin/users/:id/password    réinitialiser le mot de passe
//   DELETE /api/admin/users/:id/2fa         désactiver la 2FA (téléphone perdu)
//   DELETE /api/admin/users/:id             supprimer un compte jamais utilisé
//
// Règles de sécurité :
// - un Admin ne peut ni se désactiver, ni se retirer le rôle Admin, ni se
//   supprimer, ni réinitialiser son propre mot de passe ou sa 2FA par ici
//   (il passe par ses réglages, où l'ancien mot de passe est demandé) ;
// - il reste toujours au moins un Admin actif ;
// - aucune de ces routes ne donne accès au contenu des listes.

import express from 'express';
import { hashPassword, passwordProblem } from '../passwords.js';
import { revokeAllSessions } from '../auth.js';
import { disableTwoFactor } from '../twofactor.js';
import { isValidUsername, USERNAME_RULE, cleanName, parseId } from '../validate.js';

const LAST_ADMIN = 'Il doit toujours rester au moins un Admin actif.';

export function adminUserRoutes(ctx) {
  const router = express.Router();
  const { db, audit } = ctx;

  const findUser = db.prepare('SELECT * FROM users WHERE id = ?');
  // Nombre d'Admin actifs autres que le compte indiqué
  const otherActiveAdmins = db.prepare("SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1 AND id != ?").pluck();
  // Un compte est « utilisé » s'il possède une liste, a créé un article ou
  // est membre d'une liste
  const accountUsed = db.prepare(`
    SELECT EXISTS (SELECT 1 FROM lists WHERE owner_id = :id)
        OR EXISTS (SELECT 1 FROM items WHERE created_by = :id)
        OR EXISTS (SELECT 1 FROM list_members WHERE user_id = :id)
        OR EXISTS (SELECT 1 FROM lists WHERE for_user_id = :id)
        OR EXISTS (SELECT 1 FROM reservations WHERE user_id = :id)
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
  });

  // Retrouve le compte de l'adresse (:id), ou répond 404
  function target(req, res) {
    const id = parseId(req.params.id);
    const user = id && findUser.get(id);
    if (!user) res.status(404).json({ error: 'Compte introuvable.' });
    return user || null;
  }

  // Vrai si retirer ce compte des Admin actifs en laisserait zéro
  const isLastActiveAdmin = (user) => user.role === 'admin' && user.active === 1 && otherActiveAdmins.get(user.id) === 0;

  // Liste des comptes, par identifiant
  router.get('/users', (req, res) => {
    const users = db.prepare('SELECT * FROM users ORDER BY username COLLATE NOCASE').all();
    res.json({ users: users.map(describe) });
  });

  // Création d'un compte. Le mot de passe initial est choisi par l'Admin :
  // l'utilisateur devra le changer à sa première connexion.
  router.post('/users', async (req, res) => {
    const { username, displayName, role = 'user', password } = req.body ?? {};
    if (!isValidUsername(username)) return res.status(400).json({ error: USERNAME_RULE });
    const name = displayName === undefined || displayName === '' ? username : cleanName(displayName);
    if (!name) return res.status(400).json({ error: 'Nom affiché invalide (1 à 100 caractères).' });
    if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Rôle invalide (admin ou user).' });
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });

    const hash = await hashPassword(password);
    // L'identifiant est unique sans tenir compte des majuscules (COLLATE
    // NOCASE dans la base) ; la vérification se fait au moment d'écrire.
    let id;
    try {
      id = db.prepare('INSERT INTO users (username, display_name, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)')
        .run(username, name, hash, role).lastInsertRowid;
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Cet identifiant existe déjà.' });
      throw err;
    }
    audit('admin_compte_cree', { admin: req.user.username, utilisateur: username, role, ip: req.ip });
    res.status(201).json({ user: describe(findUser.get(id)) });
  });

  // Modification : nom affiché, rôle, actif (désactiver ou réactiver)
  router.patch('/users/:id', (req, res) => {
    const user = target(req, res);
    if (!user) return;
    const { displayName, role, active } = req.body ?? {};
    if (displayName === undefined && role === undefined && active === undefined) {
      return res.status(400).json({ error: 'Rien à modifier.' });
    }

    const changes = {};
    if (displayName !== undefined) {
      changes.display_name = cleanName(displayName);
      if (!changes.display_name) return res.status(400).json({ error: 'Nom affiché invalide (1 à 100 caractères).' });
    }
    if (role !== undefined) {
      if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Rôle invalide (admin ou user).' });
      changes.role = role;
    }
    if (active !== undefined) {
      if (typeof active !== 'boolean') return res.status(400).json({ error: 'Valeur « active » invalide (true ou false).' });
      changes.active = active ? 1 : 0;
    }

    const losesAdmin = changes.role === 'user' || changes.active === 0;
    if (losesAdmin && user.id === req.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas vous désactiver ni vous retirer le rôle Admin.' });
    }
    if (losesAdmin && isLastActiveAdmin(user)) return res.status(409).json({ error: LAST_ADMIN });

    db.prepare(`UPDATE users SET
        display_name = COALESCE(:display_name, display_name),
        role = COALESCE(:role, role),
        active = COALESCE(:active, active)
      WHERE id = :id`).run({ display_name: null, role: null, active: null, ...changes, id: user.id });

    // Un compte désactivé est déconnecté partout, tout de suite
    if (changes.active === 0) revokeAllSessions(ctx, user.id, 'compte désactivé');
    // … et les liens publics de ses listes sont arrêtés
    const stoppedLinks = changes.active === 0 ? ctx.shares.stopForOwner(user.id) : 0;

    // Journal : une ligne par changement réel
    const who = { admin: req.user.username, utilisateur: user.username, ip: req.ip };
    if (changes.display_name !== undefined && changes.display_name !== user.display_name) {
      audit('admin_compte_renomme', { ...who, ancien: user.display_name, nouveau: changes.display_name });
    }
    if (changes.role !== undefined && changes.role !== user.role) audit('admin_role_change', { ...who, role: changes.role });
    if (changes.active === 0 && user.active === 1) audit('admin_compte_desactive', who);
    if (stoppedLinks) audit('lien_public_arrete', { ...who, nombre: stoppedLinks, raison: 'compte désactivé' });
    if (changes.active === 1 && user.active === 0) audit('admin_compte_reactive', who);

    res.json({ user: describe(findUser.get(user.id)) });
  });

  // Réinitialisation du mot de passe d'un autre compte : toutes ses sessions
  // sont fermées et il devra changer ce mot de passe à sa prochaine connexion.
  router.post('/users/:id/password', async (req, res) => {
    const user = target(req, res);
    if (!user) return;
    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'Changez votre propre mot de passe depuis vos réglages.' });
    }
    const problem = passwordProblem(req.body?.password);
    if (problem) return res.status(400).json({ error: problem });

    const hash = await hashPassword(req.body.password);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hash, user.id);
    revokeAllSessions(ctx, user.id, "mot de passe réinitialisé par l'Admin");
    audit('admin_mot_de_passe_reinitialise', { admin: req.user.username, utilisateur: user.username, ip: req.ip });
    res.json({ user: describe(findUser.get(user.id)) });
  });

  // Désactivation de la 2FA d'un autre compte (téléphone et codes perdus)
  router.delete('/users/:id/2fa', (req, res) => {
    const user = target(req, res);
    if (!user) return;
    if (user.id === req.user.id) {
      // Pour soi-même, on passe par ses réglages (mot de passe et code demandés)
      return res.status(400).json({ error: 'Désactivez votre propre 2FA depuis vos réglages.' });
    }
    disableTwoFactor(ctx, user.id);
    audit('admin_2fa_desactivee', { admin: req.user.username, utilisateur: user.username, ip: req.ip });
    res.json({ user: describe(findUser.get(user.id)) });
  });

  // Suppression d'un compte, seulement s'il n'a jamais servi (aucune liste,
  // aucun article, membre d'aucune liste). Sinon : le désactiver.
  router.delete('/users/:id', (req, res) => {
    const user = target(req, res);
    if (!user) return;
    if (user.id === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
    if (isLastActiveAdmin(user)) return res.status(409).json({ error: LAST_ADMIN });
    if (accountUsed.get({ id: user.id }) === 1) {
      return res.status(409).json({ error: 'Ce compte a déjà servi : il peut être désactivé, pas supprimé.' });
    }
    // Ses sessions et codes de secours sont effacés avec lui (ON DELETE CASCADE)
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    audit('admin_compte_supprime', { admin: req.user.username, utilisateur: user.username, ip: req.ip });
    res.status(204).end();
  });

  return router;
}
