// Routes des listes et des articles (compte connecté, mot de passe à jour) :
//   GET  /api/lists                 mes listes (celles dont je suis membre)
//   GET  /api/lists/deleted         corbeille : mes listes supprimées depuis
//                                   moins de 30 jours (propriétaire seulement)
//   POST /api/lists/:id/restore     restaurer une de ces listes (propriétaire ;
//                                   en ligne seulement)
//   POST /api/lists/:id/purge       supprimer définitivement une de ces listes
//                                   (propriétaire ; en ligne seulement)
//   POST /api/lists/deleted/purge   « Vider la corbeille » : { ids } les listes
//                                   que l'écran montrait (propriétaire ; en ligne)
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
//                                   supprimer une liste ou un article ; notes,
//                                   server/notes.js ; projets, server/projects.js)
//
// Les droits sont vérifiés dans lists.js, pour chaque liste et chaque
// article, à chaque requête.

import express from 'express';
import { createListService, MAX_OPS_PER_BATCH, OpError } from '../lists.js';
import { requestLocale } from '../locale.js';
import { NOTE_SAVES } from '../notes.js';
import { PROJECT_CREATIONS, CARD_SAVES, COMMENT_WRITES } from '../projects.js';

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

  // Corbeille : supprimer définitivement (déclarée avant /lists/:id/purge,
  // pour que « deleted » ne soit jamais pris pour l'identifiant d'une liste)
  router.post('/lists/deleted/purge', (req, res) => {
    try {
      res.json(service.purgeTrash(req.user, req.body?.ids));
    } catch (err) {
      if (err instanceof OpError) return res.status(err.status).json({ error: req.t(err.key, err.params) });
      throw err;
    }
  });

  router.post('/lists/:id/purge', (req, res) => {
    try {
      res.json(service.purgeList(req.user, req.params.id));
    } catch (err) {
      if (err instanceof OpError) return res.status(err.status).json({ error: req.t(err.key, err.params) });
      throw err;
    }
  });

  router.get('/lists/:id', (req, res) => {
    const result = service.readList(req.user, req.params.id, requestLocale(req, ctx.config));
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
      res.json({ suggestions: service.suggestions(typed, { user: req.user, listId, locale: requestLocale(req, ctx.config) }) });
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
    // Plafond des enregistrements de notes (server/notes.js) : tout le lot
    // est refusé (429) et rien n'est appliqué ; le téléphone le garde en file
    // et le renvoie plus tard (une opération refusée une à une serait perdue)
    const saves = ops.filter((op) => NOTE_SAVES.includes(op?.type)).length;
    if (saves && !ctx.noteSaves.take(req.user.id, saves)) {
      return res.status(429).json({ error: req.t('ops.notesTropVite') });
    }
    // Plafond des créations et duplications de projets (20 par heure) : de
    // même, tout le lot est refusé et reste en file
    const creations = ops.filter((op) => PROJECT_CREATIONS.includes(op?.type)).length;
    if (creations && !ctx.projectCreations.take(req.user.id, creations)) {
      return res.status(429).json({ error: req.t('ops.projetsTropVite') });
    }
    // Plafond des enregistrements de la description des cartes (et des
    // cases cochées) : comme les notes, tout le lot reste en file
    const cardSaves = ops.filter((op) => CARD_SAVES.includes(op?.type)).length;
    if (cardSaves && !ctx.cardSaves.take(req.user.id, cardSaves)) {
      return res.status(429).json({ error: req.t('ops.cartesTropVite') });
    }
    // Plafond des commentaires des cartes (120 par heure) : de même
    const commentWrites = ops.filter((op) => COMMENT_WRITES.includes(op?.type)).length;
    if (commentWrites && !ctx.commentWrites.take(req.user.id, commentWrites)) {
      return res.status(429).json({ error: req.t('ops.commentairesTropVite') });
    }
    res.json({ results: service.applyOps(req.user, ops).map((result) => localized(req, result)) });
  });

  return router;
}
