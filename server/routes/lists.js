// Routes des listes et des articles (compte connecté, mot de passe à jour) :
//   GET  /api/lists                 mes listes (celles dont je suis membre)
//   GET  /api/lists/:id             une liste et ses articles, groupés et triés
//   PUT  /api/lists/:id/members     changer le partage (propriétaire seulement)
//   GET  /api/users                 comptes actifs, pour choisir les invités
//   GET  /api/suggestions?q=la      autocomplétion (dès 2 lettres)
//   GET  /api/sync?since=…          tout ce qui a changé depuis un instant
//   POST /api/ops                   lot d'opérations (créer, modifier, cocher,
//                                   supprimer une liste ou un article)
//
// Les droits sont vérifiés dans lists.js, pour chaque liste et chaque
// article, à chaque requête.

import express from 'express';
import { createListService, MAX_OPS_PER_BATCH, OpError } from '../lists.js';

// Date ISO envoyée par le téléphone pour « since » (heure donnée par le serveur)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function listRoutes(ctx) {
  const router = express.Router();
  const service = createListService(ctx);
  ctx.lists = service; // pour le nettoyage périodique (app.js)

  router.get('/lists', (req, res) => {
    res.json({ lists: service.myLists(req.user) });
  });

  router.get('/lists/:id', (req, res) => {
    const result = service.readList(req.user, req.params.id);
    if (!result) return res.status(404).json({ error: 'Liste introuvable.' });
    res.json(result);
  });

  router.put('/lists/:id/members', (req, res) => {
    try {
      res.json({ list: service.setMembers(req.user, req.params.id, req.body?.userIds) });
    } catch (err) {
      if (err instanceof OpError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  });

  router.get('/users', (req, res) => {
    res.json({ users: service.activeUsers() });
  });

  router.get('/suggestions', (req, res) => {
    const typed = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
    res.json({ suggestions: service.suggestions(typed) });
  });

  router.get('/sync', (req, res) => {
    const { since } = req.query;
    if (since !== undefined && (typeof since !== 'string' || !ISO_DATE.test(since))) {
      return res.status(400).json({ error: 'Paramètre « since » invalide.' });
    }
    res.json(service.changesSince(req.user, since));
  });

  router.post('/ops', (req, res) => {
    const ops = req.body?.ops;
    if (!Array.isArray(ops) || ops.length === 0 || ops.length > MAX_OPS_PER_BATCH) {
      return res.status(400).json({ error: `Lot d'opérations invalide (1 à ${MAX_OPS_PER_BATCH} opérations).` });
    }
    res.json({ results: service.applyOps(req.user, ops) });
  });

  return router;
}
