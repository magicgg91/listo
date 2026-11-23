// Routes de la page Notifications (compte connecté ; toujours montées, même
// sans LISTO_PUSH : la page se remplit sans rien envoyer ailleurs) :
//   GET    /api/inbox          mes lignes, la plus récente en haut, phrases
//                              dans la langue de mon compte (server/inbox.js)
//   POST   /api/inbox/read     marquer lues { ids: [..] } ou { all: true, upTo? }
//   DELETE /api/inbox/:id      effacer une ligne (la mienne seulement : sinon 404)
//   DELETE /api/inbox          tout effacer (?upTo=<date ISO> facultatif ;
//                              l'écran demande confirmation avant)
//
// Hors ligne, le téléphone passe par la file d'attente (POST /api/ops,
// opérations « inbox.read » et « inbox.delete », mêmes contrôles). Personne
// ne lit, ne marque ni n'efface jamais les lignes d'un autre : chaque
// requête ne touche que celles du compte connecté. Protégées par la session
// et la protection CSRF communes à toute l'API (server/app.js).

import express from 'express';
import { parseSelection } from '../inbox.js';

export function inboxRoutes(ctx) {
  const router = express.Router();
  const inbox = ctx.inbox;
  const nowIso = () => new Date(ctx.now()).toISOString();
  const page = (user) => {
    const rows = inbox.rowsFor(user);
    return { rows, unread: rows.filter((row) => !row.read).length, stamp: inbox.stamp(user.id) };
  };

  router.get('/inbox', (req, res) => res.json(page(req.user)));

  router.post('/inbox/read', (req, res) => {
    const selection = parseSelection(req.body, nowIso());
    if (!selection) return res.status(400).json({ error: req.t('ops.inboxInvalide') });
    inbox.markRead(req.user.id, selection);
    res.json(page(req.user));
  });

  router.delete('/inbox/:id', (req, res) => {
    const id = Number(req.params.id);
    // Ligne inconnue ou d'un autre compte : la même réponse
    if (!/^\d{1,15}$/.test(req.params.id) || !inbox.remove(req.user.id, { ids: [id] })) {
      return res.status(404).json({ error: req.t('ops.inboxIntrouvable') });
    }
    res.json(page(req.user));
  });

  router.delete('/inbox', (req, res) => {
    const selection = parseSelection({ all: true, ...(req.query.upTo !== undefined ? { upTo: req.query.upTo } : {}) }, nowIso());
    if (!selection) return res.status(400).json({ error: req.t('ops.inboxInvalide') });
    inbox.remove(req.user.id, selection);
    res.json(page(req.user));
  });

  return router;
}
