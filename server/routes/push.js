// Routes des notifications (compte connecté).
//
// Réglages, toujours montés (ils valent pour la page Notifications comme
// pour le téléphone, décision du 23 novembre 2026 ; notificationSettingsRoutes) :
//   GET    /api/push/settings      préférences du compte, listes et notes
//                                   dont les notifications sont coupées
//   PUT    /api/push/settings      préférences du compte { changes, due, wishes,
//                                   sharing, detail } (vrai ou faux), page et appareils
//   PUT    /api/push/mutes/:listId menu de la liste, « Couper les notifications » { muted } (membres seulement)
//   PUT    /api/push/note-mutes/:noteId menu de la note, « Couper les
//                                   notifications » { muted } (ceux qui voient la note)
//
// Cet appareil (montées seulement avec LISTO_PUSH=on, sinon toutes
// répondent « Route inconnue » (404) ; pushRoutes) :
//   GET    /api/push               clé publique du serveur, état de cet appareil
//                                   (et les mêmes réglages que /api/push/settings)
//   PUT    /api/push/subscription  abonner cet appareil { endpoint, keys }
//   DELETE /api/push/subscription  désabonner cet appareil
//   POST   /api/push/test          notification test, vers cet appareil seulement
//
// « Cet appareil » : la session de la requête. Protégées par la session et
// la protection CSRF communes à toute l'API (server/app.js), et limitées en
// fréquence par compte. Ni l'adresse d'abonnement ni les clés ne sont
// écrites dans les journaux.

import express from 'express';
import { createUploadCounter } from '../photos.js';
import { isUuid } from '../lists.js';
import { userLocale } from '../locale.js';

// Messages : noms des textes (public/js/i18n/fr/alertes.js), écrits dans
// la langue de la requête (req.t)
export const BAD_SUBSCRIPTION = 'alertes.abonnementRefuse';
export const TAKEN = 'alertes.autreCompte';
export const BAD_SETTINGS = 'alertes.reglageInvalide';
export const BAD_MUTE = 'alertes.silencerInvalide';
export const LIST_NOT_FOUND = 'alertes.listeIntrouvable';
export const NOTE_NOT_FOUND = 'alertes.noteIntrouvable';
export const TOO_MANY = 'alertes.tropDeDemandes';
export const TEST_RESULTS = {
  sent: null,
  none: 'alertes.test.inactif',
  expired: 'alertes.test.expire',
  gone: 'alertes.test.inactif',
  refused: 'alertes.test.refuse',
  failed: 'alertes.test.sansReponse',
};

// Réglages du compte : page Notifications et téléphone (toujours montées)
export function notificationSettingsRoutes(ctx) {
  const router = express.Router();
  // Préférences et listes silencées : 120 changements par heure et par compte
  const prefs = createUploadCounter({ limit: 120, now: ctx.now });
  ctx.pushCounters.push(prefs);
  const notify = ctx.notify;

  router.get('/push/settings', (req, res) => res.json(settingsState(notify, req.user.id)));

  router.put('/push/settings', (req, res) => {
    if (!prefs.take(req.user.id)) return res.status(429).json({ error: req.t(TOO_MANY) });
    const settings = notify.setSettings(req.user.id, req.body);
    if (!settings) return res.status(400).json({ error: req.t(BAD_SETTINGS) });
    res.json({ settings });
  });

  router.put('/push/mutes/:listId', (req, res) => {
    if (!prefs.take(req.user.id)) return res.status(429).json({ error: req.t(TOO_MANY) });
    const listId = String(req.params.listId).toLowerCase();
    // Non-membre, liste inconnue ou supprimée : la même réponse
    if (!isUuid(listId) || !notify.isMember(req.user.id, listId)) return res.status(404).json({ error: req.t(LIST_NOT_FOUND) });
    if (typeof req.body?.muted !== 'boolean') return res.status(400).json({ error: req.t(BAD_MUTE) });
    notify.setMuted(req.user.id, listId, req.body.muted);
    res.json({ mutedLists: notify.mutedLists(req.user.id) });
  });

  router.put('/push/note-mutes/:noteId', (req, res) => {
    if (!prefs.take(req.user.id)) return res.status(429).json({ error: req.t(TOO_MANY) });
    const noteId = String(req.params.noteId).toLowerCase();
    // Note inconnue, dans la corbeille, ou qu'on ne voit pas : la même réponse
    if (!isUuid(noteId) || !notify.seesNote(req.user.id, noteId)) return res.status(404).json({ error: req.t(NOTE_NOT_FOUND) });
    if (typeof req.body?.muted !== 'boolean') return res.status(400).json({ error: req.t(BAD_MUTE) });
    notify.setNoteMuted(req.user.id, noteId, req.body.muted);
    res.json({ mutedNotes: notify.mutedNotes(req.user.id) });
  });

  return router;
}

// Réglages lus par l'écran (champ par champ)
const settingsState = (notify, userId) => ({
  settings: notify.settingsOf(userId),
  mutedLists: notify.mutedLists(userId),
  mutedNotes: notify.mutedNotes(userId),
});

// Cet appareil (LISTO_PUSH=on seulement)
export function pushRoutes(ctx) {
  const router = express.Router();
  const push = ctx.push;
  // Abonnements : 30 changements par heure et par compte ; tests : 10 par heure
  const changes = createUploadCounter({ limit: 30, now: ctx.now });
  const tests = createUploadCounter({ limit: 10, now: ctx.now });
  ctx.pushCounters.push(changes, tests);
  const notify = ctx.notify;

  const state = (req) => ({
    publicKey: push.publicKey,
    device: { subscribed: push.subscribed(req.sessionId) },
    ...settingsState(notify, req.user.id),
  });

  router.get('/push', (req, res) => res.json(state(req)));

  router.put('/push/subscription', (req, res) => {
    if (!changes.take(req.user.id)) return res.status(429).json({ error: req.t(TOO_MANY) });
    const result = push.subscribe(req.user, req.sessionId, req.body);
    if (!result) return res.status(400).json({ error: req.t(BAD_SUBSCRIPTION) });
    if (result === 'taken') return res.status(409).json({ error: req.t(TAKEN) });
    res.json(state(req));
  });

  router.delete('/push/subscription', (req, res) => {
    if (!changes.take(req.user.id)) return res.status(429).json({ error: req.t(TOO_MANY) });
    push.unsubscribe(req.sessionId);
    res.json(state(req));
  });

  router.post('/push/test', async (req, res) => {
    if (!tests.take(req.user.id)) return res.status(429).json({ error: req.t(TOO_MANY) });
    // Dans la langue des notifications de ce compte (celle de son compte, sinon de l'installation)
    const result = await push.sendTest(req.sessionId, userLocale(req.user, ctx.config));
    if (result === 'sent') return res.json({ ok: true });
    res.status(result === 'none' || result === 'gone' || result === 'expired' ? 409 : 502).json({ error: req.t(TEST_RESULTS[result] ?? TEST_RESULTS.failed) });
  });

  return router;
}
