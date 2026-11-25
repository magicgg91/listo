// Partage d'une note (étape 3 du cadrage
// docs/cadrage-accueil-notes-notifications.md ; compte connecté, en ligne
// seulement, comme pour les listes) :
//   PUT    /api/notes/:id/members   changer le partage (propriétaire seulement)
//                                  { userIds, access }
//   POST   /api/notes/:id/leave     quitter la note (un membre, pour lui-même)
//   GET    /api/notes/:id/share     état du lien public (ou null)
//   PUT    /api/notes/:id/share     créer le lien, ou changer sa durée / son
//                                  mot de passe (mêmes champs que pour une
//                                  liste, server/routes/shares.js)
//   DELETE /api/notes/:id/share     arrêter le lien
//
// Un invité (docs/cadrage-comptes.md) ne crée ni ne change jamais de lien
// public (403) ; il peut arrêter un ancien lien.
//
// Les droits sont vérifiés par server/notes.js (noteAccess) à chaque
// requête. Lien public : seul le propriétaire y a accès ; un membre, un
// autre compte ou l'Admin reçoivent la même réponse qu'une note inconnue
// (404). Le titre et le texte de la note ne sont jamais écrits dans le
// journal, ni le jeton ou le mot de passe du lien.

import express from 'express';
import { OpError } from '../lists.js';
import { checkDuration, DEFAULT_DURATION_HOURS } from '../shares.js';
import { NOTE_NOT_FOUND } from '../notes.js';
import { accountRole, mayShareOwn } from '../../public/js/access.js';

export function noteRoutes(ctx) {
  const router = express.Router();
  const { audit } = ctx;
  const notes = () => ctx.notes;       // créé par le service des listes (server/lists.js)
  const noteShares = ctx.noteShares;

  // Refus d'une règle (OpError) : son texte, dans la langue de la requête
  const guard = (handler) => async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof OpError) return res.status(err.status).json({ error: req.t(err.key, err.params) });
      throw err;
    }
  };

  router.put('/notes/:id/members', guard((req, res) => {
    res.json({ note: notes().setMembers(req.user, req.params.id, req.body?.userIds, req.body?.access ?? {}) });
  }));

  router.post('/notes/:id/leave', guard((req, res) => {
    res.json(notes().leaveNote(req.user, req.params.id));
  }));

  // --- Lien public ---
  // La note, si le compte en est le propriétaire et qu'elle n'est pas dans
  // la corbeille ; sinon 404, comme une note inconnue (jamais 403 : un
  // membre n'apprend rien de plus)
  const ownNote = (req, res, next) => {
    let found;
    try {
      found = notes().noteFor(req.user, req.params.id);
    } catch (err) {
      if (err instanceof OpError) return res.status(404).json({ error: req.t(NOTE_NOT_FOUND) });
      throw err;
    }
    if (found.access !== 'owner' || found.note.deleted_at) return res.status(404).json({ error: req.t(NOTE_NOT_FOUND) });
    req.note = found.note;
    next();
  };

  const who = (req, share) => ({ user: req.user.username, note: req.note.id, share: share.id, ip: req.ip });

  router.get('/notes/:id/share', ownNote, (req, res) => {
    res.json({ share: noteShares.describe(noteShares.current(req.note.id)) });
  });

  router.put('/notes/:id/share', ownNote, async (req, res) => {
    // Un invité ne partage jamais ce qu'il possède : pas de lien public
    if (!mayShareOwn(accountRole(req.user))) return res.status(403).json({ error: req.t('ops.invitePartageInterdit') });
    const body = req.body ?? {};
    const durationHours = body.durationHours === undefined ? undefined : checkDuration(body.durationHours);
    if (body.durationHours !== undefined && durationHours === undefined) return res.status(400).json({ error: req.t('liens.dureeInvalide') });
    if (body.protect !== undefined && typeof body.protect !== 'boolean') return res.status(400).json({ error: req.t('liens.protectInvalide') });
    if (body.password !== undefined && !['new', 'none'].includes(body.password)) {
      return res.status(400).json({ error: req.t('liens.passwordInvalide') });
    }

    const existing = noteShares.current(req.note.id);
    if (!existing) {
      const created = await noteShares.create(req.user, req.note, {
        durationHours: durationHours === undefined ? DEFAULT_DURATION_HOURS : durationHours,
        protect: body.protect === true,
      });
      if (!created) return res.status(409).json({ error: req.t('liens.dejaActifNote') });
      notes().touchForOwner(req.note); // icône « lien » de la carte
      audit('note_link_created', { ...who(req, created.share), duration: created.share.expires_at ? `${durationHours ?? DEFAULT_DURATION_HOURS} h` : 'unlimited', password_protected: created.password !== null });
      return res.status(201).json({ share: noteShares.describe(created.share, { password: created.password }) });
    }

    if (body.password === 'none' && existing.password_hash === null) {
      return res.status(400).json({ error: req.t('liens.sansMotDePasse') });
    }
    const updated = await noteShares.update(existing, { durationHours, password: body.password });
    if (!updated) return res.status(409).json({ error: req.t('liens.arrete') });
    notes().touchForOwner(req.note);
    if (durationHours !== undefined) audit('note_link_duration_changed', { ...who(req, existing), duration: durationHours === null ? 'unlimited' : `${durationHours} h` });
    if (body.password === 'new') audit('note_link_new_password', who(req, existing));
    if (body.password === 'none') audit('note_link_password_removed', who(req, existing));
    res.json({ share: noteShares.describe(updated.share, { password: updated.password }) });
  });

  router.delete('/notes/:id/share', ownNote, (req, res) => {
    const stopped = noteShares.stop(req.note.id);
    if (stopped) {
      notes().touchForOwner(req.note);
      audit('note_link_stopped', who(req, stopped));
    }
    res.json({ share: null });
  });

  return router;
}
