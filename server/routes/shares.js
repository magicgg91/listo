// Lien public d'une liste, côté propriétaire (compte connecté, en ligne) :
//   GET    /api/lists/:id/share   état du lien (ou null s'il n'y en a pas)
//   PUT    /api/lists/:id/share   créer le lien, ou changer sa durée / son
//                                 mot de passe
//   DELETE /api/lists/:id/share   arrêter le lien
//
// Seul le propriétaire de la liste y a accès : un autre membre ou un autre compte
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
import { accountRole, mayShareOwn } from '../../public/js/access.js';

// Noms des messages (public/js/i18n/fr/liens.js), traduits par req.t
const LIST_NOT_FOUND = 'liens.listeIntrouvable';
const BAD_DURATION = 'liens.dureeInvalide';

export function shareRoutes(ctx) {
  const router = express.Router();
  const { shares, audit } = ctx;

  // Trouve la liste et vérifie que le compte en est le propriétaire
  const ownList = (req, res, next) => {
    const list = shares.ownedList(req.user, req.params.id);
    if (!list) return res.status(404).json({ error: req.t(LIST_NOT_FOUND) });
    req.list = list;
    next();
  };

  const who = (req, share) => ({ user: req.user.username, list: req.list.id, share: share.id, ip: req.ip });

  router.get('/lists/:id/share', ownList, (req, res) => {
    res.json({ share: shares.describe(shares.current(req.list.id)) });
  });

  router.put('/lists/:id/share', ownList, async (req, res) => {
    // Un invité ne partage jamais ce qu'il possède : pas de lien public
    // (docs/cadrage-comptes.md) ; il peut arrêter un ancien lien
    if (!mayShareOwn(accountRole(req.user))) return res.status(403).json({ error: req.t('ops.invitePartageInterdit') });
    // Liste d'envies : lien public permis (lecture seule ; la page publique
    // ne lit jamais les réservations, voir routes/public.js)
    const body = req.body ?? {};
    const durationHours = body.durationHours === undefined ? undefined : checkDuration(body.durationHours);
    if (body.durationHours !== undefined && durationHours === undefined) return res.status(400).json({ error: req.t(BAD_DURATION) });
    if (body.protect !== undefined && typeof body.protect !== 'boolean') return res.status(400).json({ error: req.t('liens.protectInvalide') });
    if (body.password !== undefined && !['new', 'none'].includes(body.password)) {
      return res.status(400).json({ error: req.t('liens.passwordInvalide') });
    }

    const existing = shares.current(req.list.id);
    if (!existing) {
      // Création
      const created = await shares.create(req.user, req.list, {
        durationHours: durationHours === undefined ? DEFAULT_DURATION_HOURS : durationHours,
        protect: body.protect === true,
      });
      // Propriétaire devenu invité, sans Listes ou désactivé pendant le
      // calcul du mot de passe : la réponse des contrôles habituels
      if (created?.refusal) return res.status(created.refusal.status).json({ error: req.t(created.refusal.key) });
      if (!created) return res.status(409).json({ error: req.t('liens.dejaActif') });
      audit('public_link_created', { ...who(req, created.share), duration: created.share.expires_at ? `${durationHours ?? DEFAULT_DURATION_HOURS} h` : 'unlimited', password_protected: created.password !== null });
      return res.status(201).json({ share: shares.describe(created.share, { password: created.password }) });
    }

    // Modification d'un lien actif
    if (body.password === 'none' && existing.password_hash === null) {
      return res.status(400).json({ error: req.t('liens.sansMotDePasse') });
    }
    const updated = await shares.update(existing, { durationHours, password: body.password });
    if (!updated) return res.status(409).json({ error: req.t('liens.arrete') });
    if (durationHours !== undefined) audit('public_link_duration_changed', { ...who(req, existing), duration: durationHours === null ? 'unlimited' : `${durationHours} h` });
    if (body.password === 'new') audit('public_link_new_password', who(req, existing));
    if (body.password === 'none') audit('public_link_password_removed', who(req, existing));
    res.json({ share: shares.describe(updated.share, { password: updated.password }) });
  });

  router.delete('/lists/:id/share', ownList, (req, res) => {
    const stopped = shares.stop(req.list.id);
    if (stopped) audit('public_link_stopped', who(req, stopped));
    res.json({ share: null });
  });

  return router;
}
