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

export const BAD_SUBSCRIPTION = 'Abonnement refusé : ce service de notification n\'est pas reconnu.';
export const TAKEN = 'Cet appareil reçoit déjà les notifications d\'un autre compte. Déconnectez ce compte sur cet appareil, puis réessayez.';
export const BAD_SETTINGS = 'Réglage des notifications invalide.';
export const BAD_MUTE = 'Valeur « silencer » invalide (true ou false).';
export const LIST_NOT_FOUND = 'Liste introuvable.';
export const TOO_MANY = 'Trop de demandes. Réessayez dans quelques minutes.';
export const TEST_RESULTS = {
  sent: null,
  none: 'Les notifications ne sont pas activées sur cet appareil.',
  expired: 'L\'abonnement de cet appareil a expiré. Désactivez puis réactivez les notifications.',
  gone: 'Les notifications ne sont pas activées sur cet appareil.',
  refused: 'Le service de notification a refusé l\'envoi. Réessayez plus tard.',
  failed: 'Le service de notification n\'a pas répondu. Réessayez plus tard.',
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
    if (!changes.take(req.user.id)) return res.status(429).json({ error: TOO_MANY });
    const result = push.subscribe(req.user, req.sessionId, req.body);
    if (!result) return res.status(400).json({ error: BAD_SUBSCRIPTION });
    if (result === 'taken') return res.status(409).json({ error: TAKEN });
    res.json(state(req));
  });

  router.delete('/push/subscription', (req, res) => {
    if (!changes.take(req.user.id)) return res.status(429).json({ error: TOO_MANY });
    push.unsubscribe(req.sessionId);
    res.json(state(req));
  });

  router.put('/push/settings', (req, res) => {
    if (!prefs.take(req.user.id)) return res.status(429).json({ error: TOO_MANY });
    const settings = notify.setSettings(req.user.id, req.body);
    if (!settings) return res.status(400).json({ error: BAD_SETTINGS });
    res.json({ settings });
  });

  router.put('/push/mutes/:listId', (req, res) => {
    if (!prefs.take(req.user.id)) return res.status(429).json({ error: TOO_MANY });
    const listId = String(req.params.listId).toLowerCase();
    // Non-membre, liste inconnue ou supprimée : la même réponse
    if (!isUuid(listId) || !notify.isMember(req.user.id, listId)) return res.status(404).json({ error: LIST_NOT_FOUND });
    if (typeof req.body?.muted !== 'boolean') return res.status(400).json({ error: BAD_MUTE });
    notify.setMuted(req.user.id, listId, req.body.muted);
    res.json({ mutedLists: notify.mutedLists(req.user.id) });
  });

  router.post('/push/test', async (req, res) => {
    if (!tests.take(req.user.id)) return res.status(429).json({ error: TOO_MANY });
    const result = await push.sendTest(req.sessionId);
    if (result === 'sent') return res.json({ ok: true });
    res.status(result === 'none' || result === 'gone' || result === 'expired' ? 409 : 502).json({ error: TEST_RESULTS[result] ?? TEST_RESULTS.failed });
  });

  return router;
}
