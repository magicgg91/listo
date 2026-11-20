// Routes des notifications push (compte connecté ; montées seulement avec
// LISTO_PUSH=on, sinon toutes répondent « Route inconnue » (404)) :
//   GET    /api/push               clé publique du serveur, état de cet appareil
//   PUT    /api/push/subscription  abonner cet appareil { endpoint, keys }
//   DELETE /api/push/subscription  désabonner cet appareil
//   POST   /api/push/test          notification test, vers cet appareil seulement
//   PUT    /api/push/settings      préférences du compte { changes, due, wishes,
//                                   sharing, detail } (vrai ou faux), tous ses appareils
//   PUT    /api/push/mutes/:listId « Silencer cette liste » { muted } (membres seulement)
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
export const TOO_MANY = 'alertes.tropDeDemandes';
export const TEST_RESULTS = {
  sent: null,
  none: 'alertes.test.inactif',
  expired: 'alertes.test.expire',
  gone: 'alertes.test.inactif',
  refused: 'alertes.test.refuse',
  failed: 'alertes.test.sansReponse',
};

export function pushRoutes(ctx) {
  const router = express.Router();
  const push = ctx.push;
  // Abonnements : 30 changements par heure et par compte ; tests : 10 par heure
  const changes = createUploadCounter({ limit: 30, now: ctx.now });
  const tests = createUploadCounter({ limit: 10, now: ctx.now });
  // Préférences et listes silencées : 120 changements par heure et par compte
  const prefs = createUploadCounter({ limit: 120, now: ctx.now });
  ctx.pushCounters = [changes, tests, prefs];
  const notify = ctx.notify;

  const state = (req) => ({
    publicKey: push.publicKey,
    device: { subscribed: push.subscribed(req.sessionId) },
    settings: notify.settingsOf(req.user.id),
    mutedLists: notify.mutedLists(req.user.id),
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

  router.post('/push/test', async (req, res) => {
    if (!tests.take(req.user.id)) return res.status(429).json({ error: req.t(TOO_MANY) });
    // Dans la langue des notifications de ce compte (celle de son compte, sinon de l'installation)
    const result = await push.sendTest(req.sessionId, userLocale(req.user, ctx.config));
    if (result === 'sent') return res.json({ ok: true });
    res.status(result === 'none' || result === 'gone' || result === 'expired' ? 409 : 502).json({ error: req.t(TEST_RESULTS[result] ?? TEST_RESULTS.failed) });
  });

  return router;
}
