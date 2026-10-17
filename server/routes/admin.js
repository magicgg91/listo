// Routes d'administration (/api/admin/...), réservées au rôle Admin.
// La vérification du rôle est faite une fois pour toutes en tête du routeur :
// aucune route ajoutée ici ne peut l'oublier.
//
// - Comptes : voir admin-users.js
// - Catégories, magasins, rayons : voir admin-references.js
// - Noms enregistrés (historique des noms saisis) : voir admin-names.js
// - Vérification de mise à jour (GET /api/admin/update-check, ?force=1 pour
//   « Vérifier maintenant ») : voir update-check.js
//
// Ces routes ne donnent jamais accès au contenu d'une liste précise (son nom,
// ses membres, ses éléments). Les noms enregistrés sont l'historique commun
// à tous les comptes, montré avec de simples compteurs.

import express from 'express';
import { requireAdmin } from '../auth.js';
import { adminUserRoutes } from './admin-users.js';
import { adminReferenceRoutes } from './admin-references.js';
import { adminNameRoutes } from './admin-names.js';

export function adminRoutes(ctx) {
  const router = express.Router();
  router.use(requireAdmin);
  router.use(adminUserRoutes(ctx));
  router.use(adminReferenceRoutes(ctx));
  router.use(adminNameRoutes(ctx));
  // Jamais d'erreur : en cas de panne, l'état vaut « indisponible »
  router.get('/update-check', async (req, res) => {
    res.json(await ctx.updates.status({ force: req.query.force === '1' }));
  });
  return router;
}
