// Routes des listes et des articles (compte connecté, mot de passe à jour) :
//   GET  /api/lists                 mes listes (celles dont je suis membre)
//   GET  /api/lists/deleted         corbeille : mes listes supprimées depuis
//                                   moins de 30 jours (propriétaire seulement)
//   POST /api/lists/:id/restore     restaurer une de ces listes (propriétaire ;
//                                   en ligne seulement)
//   GET  /api/lists/:id             une liste et ses articles, groupés et triés
//   PUT  /api/lists/:id/members     changer le partage (propriétaire seulement)
//   POST /api/lists/:id/wishes      convertir en liste d'envies, avec son
//                                   destinataire (propriétaire ; en ligne seulement)
//   POST /api/lists/:id/leave       quitter la liste (contributeur ou invité, pour lui-même ;
//                                   en ligne seulement)
//   POST /api/lists/:id/duplicate   dupliquer la liste (propriétaire ou
//                                   contributeur ; en ligne seulement)
//   GET  /api/users                 comptes actifs, pour choisir avec qui partager
//   GET  /api/suggestions?q=la      autocomplétion (dès 2 lettres) ; avec
//                                    &listId=… : vide hors liste de courses
//   GET  /api/sync?since=…          tout ce qui a changé depuis un instant
//   POST /api/ops                   lot d'opérations (créer, modifier, cocher,
//                                   supprimer une liste ou un article)
//
// Les droits sont vérifiés dans lists.js, pour chaque liste et chaque
// article, à chaque requête.

import express from 'express';
import { createListService, MAX_OPS_PER_BATCH, OpError } from '../lists.js';

// Résultat d'une opération pour le téléphone : un refus (code : nom de son
// texte) est dit dans la langue de la requête ; ses valeurs (params) restent
// sur le serveur. Un refus enregistré avant les langues (sans code) est
// renvoyé tel quel.
function localized(req, { params, ...result }) {
  return result.code ? { ...result, error: req.t(result.code, params) } : result;
}

// Date ISO envoyée par le téléphone pour « since » (heure donnée par le serveur)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function listRoutes(ctx) {
  const router = express.Router();
  const service = createListService(ctx);
  ctx.lists = service; // pour le nettoyage périodique (app.js)

  router.get('/lists', (req, res) => {
    res.json({ lists: service.myLists(req.user) });
  });

  // Corbeille : mes listes supprimées depuis moins de 30 jours (propriétaire)
  // ; déclarée avant /lists/:id
  router.get('/lists/deleted', (req, res) => {
    res.json({ lists: service.deletedLists(req.user) });
  });

  router.post('/lists/:id/restore', (req, res) => {
    try {
      res.json(service.restoreList(req.user, req.params.id));
    } catch (err) {
      if (err instanceof OpError) return res.status(err.status).json({ error: req.t(err.key, err.params) });
      throw err;
    }
  });

  router.get('/lists/:id', (req, res) => {
    const result = service.readList(req.user, req.params.id);
    if (!result) return res.status(404).json({ error: req.t('ops.listeIntrouvable') });
    res.json(result);
  });

  router.put('/lists/:id/members', (req, res) => {
    try {
      res.json({ list: service.setMembers(req.user, req.params.id, req.body?.userIds, req.body?.access ?? {}) });
    } catch (err) {
      if (err instanceof OpError) return res.status(err.status).json({ error: req.t(err.key, err.params) });
      throw err;
    }
  });

  router.post('/lists/:id/wishes', (req, res) => {
    try {
      res.json(service.convertToWishes(req.user, req.params.id, req.body ?? {}));
    } catch (err) {
      if (err instanceof OpError) return res.status(err.status).json({ error: req.t(err.key, err.params) });
      throw err;
    }
  });

  router.post('/lists/:id/leave', (req, res) => {
    try {
      res.json(service.leaveList(req.user, req.params.id));
    } catch (err) {
      if (err instanceof OpError) return res.status(err.status).json({ error: req.t(err.key, err.params) });
      throw err;
    }
  });

  router.post('/lists/:id/duplicate', (req, res) => {
    try {
      // Droit vérifié d'abord (un non-membre reçoit « Liste introuvable »),
      // puis le plafond de duplications du compte
      const source = service.listForEditor(req.user, req.params.id);
      if (source.type === 'wishes') return res.status(400).json({ error: req.t('ops.enviesNonDupliquees') });
      if (!ctx.duplicates.take(req.user.id)) {
        return res.status(429).json({ error: req.t('ops.tropDeDuplications') });
      }
      res.status(201).json(service.duplicateList(req.user, req.params.id, { name: req.body?.name, withItems: req.body?.withItems ?? true }));
    } catch (err) {
      if (err instanceof OpError) return res.status(err.status).json({ error: req.t(err.key, err.params) });
      throw err;
    }
  });

  router.get('/users', (req, res) => {
    res.json({ users: service.activeUsers() });
  });

  router.get('/suggestions', (req, res) => {
    const typed = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
    const listId = typeof req.query.listId === 'string' ? req.query.listId : undefined;
    try {
      res.json({ suggestions: service.suggestions(typed, { user: req.user, listId }) });
    } catch (err) {
      if (err instanceof OpError) return res.status(err.status).json({ error: req.t(err.key, err.params) });
      throw err;
    }
  });

  router.get('/sync', (req, res) => {
    const { since } = req.query;
    if (since !== undefined && (typeof since !== 'string' || !ISO_DATE.test(since))) {
      return res.status(400).json({ error: req.t('ops.parametreSinceInvalide') });
    }
    res.json(service.changesSince(req.user, since));
  });

  router.post('/ops', (req, res) => {
    const ops = req.body?.ops;
    if (!Array.isArray(ops) || ops.length === 0 || ops.length > MAX_OPS_PER_BATCH) {
      return res.status(400).json({ error: req.t('ops.lotInvalide', { max: MAX_OPS_PER_BATCH }) });
    }
    res.json({ results: service.applyOps(req.user, ops).map((result) => localized(req, result)) });
  });

  return router;
}
