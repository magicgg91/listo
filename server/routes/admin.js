// Routes d'administration (/api/admin/...), réservées au rôle Admin.
// La vérification du rôle est faite une fois pour toutes en tête du routeur :
// aucune route ajoutée ici ne peut l'oublier.
//
// - Comptes : voir admin-users.js
// - Catégories, magasins, rayons : voir admin-references.js
// - Articles (historique des noms saisis, onglet « Articles ») : voir admin-names.js
// - Étiquettes des notes (onglet « Étiquettes ») : voir labels.js
// - Vérification de mise à jour (GET /api/admin/update-check, ?force=1 pour
//   « Vérifier maintenant ») : voir update-check.js
//
// Ces routes ne donnent jamais accès au contenu d'une liste précise (son nom,
// ses membres, ses éléments), ni à celui d'une note. Les noms enregistrés
// sont l'historique commun à tous les comptes, montré avec de simples
// compteurs ; les étiquettes, avec leur nombre de notes.

import express from 'express';
import { requireAdmin } from '../auth.js';
import { adminUserRoutes } from './admin-users.js';
import { adminReferenceRoutes } from './admin-references.js';
import { adminNameRoutes } from './admin-names.js';
import { adminLabelRoutes } from './labels.js';

export function adminRoutes(ctx) {
  const router = express.Router();
  router.use(requireAdmin);
  router.use(adminUserRoutes(ctx));
  router.use(adminReferenceRoutes(ctx));
  router.use(adminNameRoutes(ctx));
  router.use(adminLabelRoutes(ctx)); // jamais le contenu d'une note : des noms et des nombres
  // Jamais d'erreur : en cas de panne, l'état vaut « indisponible »
  router.get('/update-check', async (req, res) => {
    res.json(await ctx.updates.status({ force: req.query.force === '1' }));
  });
  return router;
}
