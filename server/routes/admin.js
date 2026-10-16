// Routes d'administration (/api/admin/...), réservées au rôle Admin.
// La vérification du rôle est faite une fois pour toutes en tête du routeur :
// aucune route ajoutée ici ne peut l'oublier.
//
// Pour l'instant (étape 2) :
//   DELETE /api/admin/users/:id/2fa   désactiver la 2FA d'un compte (téléphone
//                                     et codes de secours perdus)
// Le reste de l'administration arrive à l'étape 3.

import express from 'express';
import { requireAdmin } from '../auth.js';
import { disableTwoFactor } from '../twofactor.js';

export function adminRoutes(ctx) {
  const router = express.Router();
  const { db, audit } = ctx;

  router.use(requireAdmin);

  router.delete('/users/:id/2fa', (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) {
      // Pour soi-même, on passe par ses réglages (mot de passe et code demandés)
      return res.status(400).json({ error: 'Désactivez votre propre 2FA depuis vos réglages.' });
    }
    const user = Number.isInteger(id) ? db.prepare('SELECT id, username FROM users WHERE id = ?').get(id) : null;
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });

    disableTwoFactor(ctx, user.id);
    audit('admin_2fa_desactivee', { admin: req.user.username, utilisateur: user.username, ip: req.ip });
    res.json({ ok: true });
  });

  return router;
}
