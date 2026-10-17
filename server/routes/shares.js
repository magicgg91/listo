// Lien public d'une liste, côté propriétaire (compte connecté, en ligne) :
//   GET    /api/lists/:id/share   état du lien (ou null s'il n'y en a pas)
//   PUT    /api/lists/:id/share   créer le lien, ou changer sa durée / son
//                                 mot de passe
//   DELETE /api/lists/:id/share   arrêter le lien
//
// Seul le propriétaire de la liste y a accès : un invité ou un autre compte
// reçoit la même réponse que pour une liste qui n'existe pas (404).
//
// Corps du PUT (tout est facultatif) :
//   durationHours : 1 à 8760 (365 jours), ou null pour « illimitée ».
//                   À la création : 24 heures si absent. Pour un lien
//                   existant : le délai repart de maintenant.
//   protect       : true pour protéger par mot de passe (création seulement)
//   password      : 'new' (nouveau mot de passe) ou 'none' (le retirer),
//                   pour un lien existant
// Un mot de passe tout juste créé est renvoyé UNE SEULE FOIS (champ
// « password ») : ensuite, plus personne ne peut le relire.

import express from 'express';
import { checkDuration, DEFAULT_DURATION_HOURS } from '../shares.js';

const LIST_NOT_FOUND = 'Liste introuvable.';
const BAD_DURATION = 'Durée invalide : de 1 heure à 365 jours, ou illimitée.';

export function shareRoutes(ctx) {
  const router = express.Router();
  const { shares, audit } = ctx;

  // Trouve la liste et vérifie que le compte en est le propriétaire
  const ownList = (req, res, next) => {
    const list = shares.ownedList(req.user, req.params.id);
    if (!list) return res.status(404).json({ error: LIST_NOT_FOUND });
    req.list = list;
    next();
  };

  const who = (req, share) => ({ utilisateur: req.user.username, liste: req.list.id, partage: share.id, ip: req.ip });

  router.get('/lists/:id/share', ownList, (req, res) => {
    res.json({ share: shares.describe(shares.current(req.list.id)) });
  });

  router.put('/lists/:id/share', ownList, async (req, res) => {
    const body = req.body ?? {};
    const durationHours = body.durationHours === undefined ? undefined : checkDuration(body.durationHours);
    if (body.durationHours !== undefined && durationHours === undefined) return res.status(400).json({ error: BAD_DURATION });
    if (body.protect !== undefined && typeof body.protect !== 'boolean') return res.status(400).json({ error: 'Valeur « protect » invalide.' });
    if (body.password !== undefined && !['new', 'none'].includes(body.password)) {
      return res.status(400).json({ error: 'Valeur « password » invalide (« new » ou « none »).' });
    }

    const existing = shares.current(req.list.id);
    if (!existing) {
      // Création
      const created = await shares.create(req.user, req.list, {
        durationHours: durationHours === undefined ? DEFAULT_DURATION_HOURS : durationHours,
        protect: body.protect === true,
      });
      if (!created) return res.status(409).json({ error: 'Un lien est déjà actif pour cette liste.' });
      audit('lien_public_cree', { ...who(req, created.share), duree: created.share.expires_at ? `${durationHours ?? DEFAULT_DURATION_HOURS} h` : 'illimitée', motDePasse: created.password !== null });
      return res.status(201).json({ share: shares.describe(created.share, { password: created.password }) });
    }

    // Modification d'un lien actif
    if (body.password === 'none' && existing.password_hash === null) {
      return res.status(400).json({ error: "Ce lien n'a pas de mot de passe." });
    }
    const updated = await shares.update(existing, { durationHours, password: body.password });
    if (!updated) return res.status(409).json({ error: 'Ce lien vient d\'être arrêté.' });
    if (durationHours !== undefined) audit('lien_public_duree_changee', { ...who(req, existing), duree: durationHours === null ? 'illimitée' : `${durationHours} h` });
    if (body.password === 'new') audit('lien_public_nouveau_mot_de_passe', who(req, existing));
    if (body.password === 'none') audit('lien_public_mot_de_passe_retire', who(req, existing));
    res.json({ share: shares.describe(updated.share, { password: updated.password }) });
  });

  router.delete('/lists/:id/share', ownList, (req, res) => {
    const stopped = shares.stop(req.list.id);
    if (stopped) audit('lien_public_arrete', who(req, stopped));
    res.json({ share: null });
  });

  return router;
}
