// Routes d'administration (/api/admin/...), réservées au rôle Admin.
// La vérification du rôle est faite une fois pour toutes en tête du routeur :
// aucune route ajoutée ici ne peut l'oublier.
//
// - Comptes : voir admin-users.js
// - Catégories, magasins, rayons : voir admin-references.js
//
// Ces routes ne donnent jamais accès au contenu des listes des utilisateurs.

import express from 'express';
import { requireAdmin } from '../auth.js';
import { adminUserRoutes } from './admin-users.js';
import { adminReferenceRoutes } from './admin-references.js';

export function adminRoutes(ctx) {
  const router = express.Router();
  router.use(requireAdmin);
  router.use(adminUserRoutes(ctx));
  router.use(adminReferenceRoutes(ctx));
  return router;
}
