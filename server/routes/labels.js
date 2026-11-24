// Étiquettes des notes (24 novembre 2026, migration 42 ; règles dans
// server/labels.js et public/js/labels.js) :
//   POST   /api/labels              créer une étiquette (tout compte connecté)
//                                   { name, color } ; nom déjà pris
//                                   (majuscules et accents ignorés) :
//                                   l'étiquette existante (200, existing: true)
//   GET    /api/admin/labels        toutes, avec leur nombre de notes (Admin)
//   PATCH  /api/admin/labels/:id    renommer, changer la couleur (Admin)
//                                   { name?, color? }
//   DELETE /api/admin/labels/:id    supprimer (Admin) : retirée de ses notes,
//                                   sans toucher aux notes
//
// Les routes /api/admin/… sont montées par server/routes/admin.js, derrière
// requireAdmin : un compte qui n'est pas Admin reçoit le même refus que pour
// le reste de l'Administration. Poser une étiquette sur une note passe par
// la file d'attente (opération « note.labels », server/notes.js).

import express from 'express';
import { OpError } from '../lists.js';

// Refus d'une règle (OpError) : son texte, dans la langue de la requête
const guard = (handler) => (req, res) => {
  try {
    handler(req, res);
  } catch (err) {
    if (err instanceof OpError) return res.status(err.status).json({ error: req.t(err.key, err.params) });
    throw err;
  }
};

export function labelRoutes(ctx) {
  const router = express.Router();
  router.post('/labels', guard((req, res) => {
    const result = ctx.labels.create(req.user, req.body ?? {});
    res.status(result.existing ? 200 : 201).json(result);
  }));
  return router;
}

// (montées sous /api/admin, après requireAdmin)
export function adminLabelRoutes(ctx) {
  const router = express.Router();
  router.get('/labels', (req, res) => {
    res.json({ items: ctx.labels.adminList() });
  });
  router.patch('/labels/:id', guard((req, res) => {
    res.json({ item: ctx.labels.update(req.user, req.params.id, req.body ?? {}, req.ip) });
  }));
  router.delete('/labels/:id', guard((req, res) => {
    res.json(ctx.labels.remove(req.user, req.params.id, req.ip));
  }));
  return router;
}
