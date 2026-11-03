// Interrupteur « Priorité » de « Modifier la liste » pour une liste
// d'envies (correction du 3 novembre 2026). Constaté sur téléphone : il était
// affiché ACTIVÉ pour toute liste d'envies existante, quel que soit le réglage
// enregistré ; le propriétaire ne pouvait pas désactiver la priorité
// durablement (l'écran réaffichait « activé »), et enregistrer sans y toucher
// réactivait la priorité en base.
// Règle : une liste existante affiche son réglage enregistré ; seules une
// NOUVELLE liste d'envies et une liste en cours de CONVERSION en liste
// d'envies commencent activées (tant que le propriétaire n'y a pas touché).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { priorityAtStart, listOptions, availableSorts, emptyState, loadSync, applyOp, toSnapshot, fromSnapshot } from '../public/js/store.js';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

test('formulaire : valeur de départ de « Priorité » — réglage enregistré pour une liste existante, activée pour une nouvelle liste d\'envies ou une conversion', () => {
  const wishesOff = { id: 'a', type: 'wishes', priorityEnabled: false };
  const wishesOn = { id: 'b', type: 'wishes', priorityEnabled: true };
  const tasksOff = { id: 'c', type: 'tasks', priorityEnabled: false };
  const tasksOn = { id: 'd', type: 'tasks', priorityEnabled: true };
  const shopping = { id: 'e', type: 'shopping', priorityEnabled: false };
  // LE BUG : une liste d'envies enregistrée sans priorité doit s'afficher désactivée
  assert.equal(priorityAtStart(wishesOff, 'wishes'), false);
  assert.equal(priorityAtStart(wishesOn, 'wishes'), true);
  // Nouvelle liste : activée pour les envies seulement
  assert.equal(priorityAtStart(null, 'wishes'), true);
  assert.equal(priorityAtStart(null, 'tasks'), false);
  assert.equal(priorityAtStart(null, 'shopping'), false);
  // Conversion en liste d'envies : activée, quel que soit le réglage d'avant
  assert.equal(priorityAtStart(tasksOff, 'wishes'), true);
  assert.equal(priorityAtStart(shopping, 'wishes'), true);
  // Changer de type sans devenir une liste d'envies : le réglage enregistré, inchangé
  assert.equal(priorityAtStart(tasksOff, 'shopping'), false);
  assert.equal(priorityAtStart(tasksOff, 'tasks'), false);
  assert.equal(priorityAtStart(tasksOn, 'shopping'), true);
  assert.equal(priorityAtStart(tasksOn, 'tasks'), true);
  // Copie d'avant ces réglages (aucune valeur) : activée, comme listOptions
  assert.equal(priorityAtStart({ id: 'f', type: 'wishes' }, 'wishes'), true);
});

test('formulaire : la valeur de départ vient de priorityAtStart (plus aucune valeur forcée) ; seul un changement de l\'interrupteur est envoyé', () => {
  const form = code('public/js/screens/list-form.js');
  assert.match(form, /if \(!priorityChosen\) optionsCard\.set\('priority', priorityAtStart\(list, listType\)\);/);
  assert.doesNotMatch(form, /isWishList\(listType\) \|\| Boolean\(list && listOptionsOf\(list\)\.priority\)/);
  // Valeur de départ du formulaire : la même règle, pas seulement le réglage enregistré
  assert.match(form, /let options = \{ priority: priorityAtStart\(list, listType\), due: list \? listOptionsOf\(list\)\.due : false \};/);
  // « Modifier la liste » : priorityEnabled seulement si l'interrupteur a changé
  assert.match(form, /if \(withPriority && !convert && options\.priority !== saved\.priority\) switches\.priorityEnabled = options\.priority;/);
  assert.match(read('public/sw.js'), /const VERSION = `v61-/);
});

async function household(t) {
  const app = await startTestApp(t);
  const owner = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  const marieId = await addUser(app.db, { username: 'marie', password: 'MotDePasse-marie' });
  const paulId = await addUser(app.db, { username: 'paul', password: 'MotDePasse-paul' });
  const marie = app.client();
  await login(marie, 'marie', 'MotDePasse-marie');
  const paul = app.client();
  await login(paul, 'paul', 'MotDePasse-paul');
  const ops = (client, list) => client.post('/api/ops', { ops: list.map((op) => ({ id: uuid(), ...op })) });
  return { app, owner, marie, paul, leaId, marieId, paulId, ops };
}
const itemOf = async (client, listId, name) => (await client.get('/api/sync')).body.items.find((i) => i.listId === listId && i.name === name);

test('serveur : liste d\'envies — désactiver et réactiver la priorité, valeurs conservées ; contributeur oui, lecteur non ; rien n\'est forcé', async (t) => {
  const h = await household(t);
  const ids = { off: uuid(), on: uuid(), velo: uuid(), lampe: uuid() };
  const res = await h.ops(h.owner, [
    { type: 'list.create', listId: ids.off, name: 'Sans priorité', listType: 'wishes', forUserId: h.leaId, priorityEnabled: false },
    { type: 'item.create', listId: ids.off, itemId: ids.velo, name: 'Vélo' },
    { type: 'list.create', listId: ids.on, name: 'Avec priorité', listType: 'wishes', forUserId: h.leaId },
    { type: 'item.create', listId: ids.on, itemId: ids.lampe, name: 'Lampe' },
  ]);
  assert.ok(res.body.results.every((r) => r.status === 200), JSON.stringify(res.body));
  // Création : désactivée si demandé, activée par défaut
  assert.equal((await h.owner.get(`/api/lists/${ids.off}`)).body.list.priorityEnabled, false);
  assert.equal((await h.owner.get(`/api/lists/${ids.on}`)).body.list.priorityEnabled, true);
  // Désactivée : la priorité d'un souhait est refusée (le champ est caché)
  assert.equal((await h.ops(h.owner, [{ type: 'item.update', itemId: ids.velo, priority: 'high' }])).body.results[0].status, 400);
  // Membres : Marie « Peut modifier », Paul « Lecture seule »
  await h.owner.request('PUT', `/api/lists/${ids.on}/members`, { userIds: [h.leaId, h.marieId, h.paulId], access: { [h.leaId]: 'modification', [h.marieId]: 'modification', [h.paulId]: 'lecture' } });
  // Activée : contributrice oui, lecteur non
  assert.equal((await h.ops(h.marie, [{ type: 'item.update', itemId: ids.lampe, priority: 'high' }])).body.results[0].status, 200);
  assert.equal((await h.ops(h.paul, [{ type: 'item.update', itemId: ids.lampe, priority: 'low' }])).body.results[0].status, 403);
  assert.equal((await itemOf(h.owner, ids.on, 'Lampe')).priority, 'high');
  // Le propriétaire désactive : enregistré ; la priorité du souhait est gardée en base (cachée)
  assert.equal((await h.ops(h.owner, [{ type: 'list.update', listId: ids.on, priorityEnabled: false }])).body.results[0].status, 200);
  assert.equal((await h.owner.get(`/api/lists/${ids.on}`)).body.list.priorityEnabled, false);
  assert.equal(h.app.db.prepare('SELECT priority FROM items WHERE id = ?').pluck().get(ids.lampe), 'high');
  // Une autre modification de la liste (le nom) ne touche pas au réglage
  assert.equal((await h.ops(h.owner, [{ type: 'list.update', listId: ids.on, name: 'Noël' }])).body.results[0].status, 200);
  assert.equal((await h.owner.get(`/api/lists/${ids.on}`)).body.list.priorityEnabled, false);
  // Réactivée : la priorité revient
  await h.ops(h.owner, [{ type: 'list.update', listId: ids.on, priorityEnabled: true }]);
  assert.equal((await itemOf(h.owner, ids.on, 'Lampe')).priority, 'high');
  // Le réglage reste au propriétaire
  assert.equal((await h.ops(h.marie, [{ type: 'list.update', listId: ids.on, priorityEnabled: false }])).body.results[0].status, 403);
  // Conversion : activée par défaut
  const tasks = uuid();
  await h.ops(h.owner, [{ type: 'list.create', listId: tasks, name: 'Maison', listType: 'tasks' }]);
  assert.equal((await h.owner.get(`/api/lists/${tasks}`)).body.list.priorityEnabled, false);
  assert.equal((await h.owner.post(`/api/lists/${tasks}/wishes`, { forUserId: h.leaId })).status, 200);
  assert.equal((await h.owner.get(`/api/lists/${tasks}`)).body.list.priorityEnabled, true);
});

test('téléphone : champ, pastille et tri suivent le réglage enregistré ; copie locale et hors ligne', () => {
  const list = { id: 'L', name: 'Noël', type: 'wishes', priorityEnabled: false, dueEnabled: false, ownerId: 1, members: [] };
  const item = { id: 'I', listId: 'L', name: 'Vélo', checked: false, priority: 'high', updatedAt: '2026-11-03T10:00:00.000Z' };
  let state = loadSync(emptyState(), { lists: [list], items: [item], listIds: ['L'], stores: [], aisles: [], history: [], serverTime: '2026-11-03T10:00:00.000Z' });
  // Désactivée : ni champ ni pastille (listOptions), pas de tri « Par priorité »
  assert.deepEqual(listOptions(state.lists.get('L')), { priority: false, due: false });
  assert.deepEqual(availableSorts(state.lists.get('L')), ['alpha']);
  // Activée hors ligne par le propriétaire (file d'attente) : appliquée tout de suite à la copie locale
  applyOp(state, { id: 'op1', type: 'list.update', listId: 'L', priorityEnabled: true }, { user: { id: 1 }, now: '2026-11-03T10:00:30.000Z' });
  assert.deepEqual(listOptions(state.lists.get('L')), { priority: true, due: false });
  assert.deepEqual(availableSorts(state.lists.get('L')), ['alpha', 'priority']);
  // Gardée telle quelle dans la copie locale (rechargement hors ligne)
  const reloaded = fromSnapshot(toSnapshot(state, '2026-11-03T10:01:00.000Z'));
  assert.equal(reloaded.lists.get('L').priorityEnabled, true);
  assert.equal(reloaded.items.get('I').priority, 'high', 'valeur du souhait conservée');
  // Formulaire rouvert hors ligne : le réglage de la copie locale
  assert.equal(priorityAtStart(reloaded.lists.get('L'), 'wishes'), true);
  // Désactivée de nouveau : la valeur du souhait reste (cachée)
  state = reloaded;
  applyOp(state, { id: 'op2', type: 'list.update', listId: 'L', priorityEnabled: false }, { user: { id: 1 }, now: '2026-11-03T10:02:00.000Z' });
  assert.equal(priorityAtStart(state.lists.get('L'), 'wishes'), false);
  assert.equal(state.items.get('I').priority, 'high');
});
