// Routes des projets (compte connecté, mot de passe à jour ; en ligne
// seulement, comme pour les listes et les notes) :
//   PUT  /api/projects/:id/members      changer le partage (propriétaire
//                                       seulement) { userIds, access }, droits
//                                       'modification' | 'contribution' | 'lecture'
//   POST /api/projects/:id/leave        quitter le projet (un membre, pour lui-même)
//   POST /api/projects/deleted/purge    « Vider la corbeille » (onglet
//                                       « Projets ») : { ids } les projets que
//                                       l'écran montrait (propriétaire)
//   POST /api/projects/:id/purge        supprimer définitivement un projet de
//                                       ma corbeille (propriétaire)
//   POST /api/projects/:id/cards/purge  supprimer définitivement des cartes
//                                       supprimées du projet { cardIds }
//                                       (propriétaire du projet)
//   GET  /api/projects/:id/cards/:cardId/history
//                                       historique d'une carte (tout membre,
//                                       Lecture seule compris ; étape 3)
//
// Tout le reste (créer, renommer, colonnes, étiquettes, cartes, corbeille,
// restaurer) passe par la file d'attente (POST /api/ops, server/projects.js),
// hors ligne compris.
//
// Les droits sont vérifiés par server/projects.js (projectAccess) à chaque
// requête : un non-membre et l'Admin reçoivent 404 « Projet introuvable »,
// comme pour un projet qui n'existe pas ; un membre dont le rôle ne suffit
// pas, 403 ; un compte qui a coupé les projets, 403. Rien du contenu d'un
// projet n'est écrit dans le journal.

import express from 'express';
import { OpError } from '../lists.js';

export function projectRoutes(ctx) {
  const router = express.Router();
  const projects = () => ctx.projects; // créé par le service des listes (server/lists.js)

  // Refus d'une règle (OpError) : son texte, dans la langue de la requête
  const guard = (handler) => (req, res) => {
    try {
      handler(req, res);
    } catch (err) {
      if (err instanceof OpError) return res.status(err.status).json({ error: req.t(err.key, err.params) });
      throw err;
    }
  };

  router.put('/projects/:id/members', guard((req, res) => {
    res.json({ project: projects().setMembers(req.user, req.params.id, req.body?.userIds, req.body?.access ?? {}) });
  }));

  router.post('/projects/:id/leave', guard((req, res) => {
    res.json(projects().leaveProject(req.user, req.params.id));
  }));

  // Déclarée avant /projects/:id/purge : « deleted » n'est jamais pris pour
  // l'identifiant d'un projet
  router.post('/projects/deleted/purge', guard((req, res) => {
    res.json(projects().purgeProjects(req.user, req.body?.ids, { emptyTrash: true }));
  }));

  router.post('/projects/:id/purge', guard((req, res) => {
    res.json(projects().purgeProject(req.user, req.params.id));
  }));

  router.post('/projects/:id/cards/purge', guard((req, res) => {
    res.json(projects().purgeCards(req.user, req.params.id, req.body?.cardIds));
  }));

  // Historique d'une carte : lignes construites champ par champ par
  // server/projects.js (cardHistory), jamais un titre ni un texte
  router.get('/projects/:id/cards/:cardId/history', guard((req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(projects().cardHistory(req.user, req.params.id, req.params.cardId));
  }));

  return router;
}
