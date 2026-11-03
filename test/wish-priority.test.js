// Interrupteur « Priorité » des listes d'envies.
// 1. Correction du 3 novembre 2026 : dans « Modifier la liste », il était
//    affiché ACTIVÉ pour toute liste d'envies existante, quel que soit le
//    réglage enregistré ; enregistrer sans y toucher réactivait la priorité.
// 2. Décision du 3 novembre 2026 : la priorité n'est plus activée par défaut
//    pour une liste d'envies. Comme pour une liste de tâches, elle est
//    désactivée à la création ; une conversion garde le réglage actuel de la
//    liste ; une liste existante n'est jamais changée (aucune migration).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { priorityAtStart, listOptions, availableSorts, emptyState, loadSync, applyOp, toSnapshot, fromSnapshot } from '../public/js/store.js';
import { MIGRATIONS } from '../server/db.js';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

test('formulaire : valeur de départ de « Priorité » — désactivée pour toute nouvelle liste (envies comprises), réglage enregistré pour une liste existante ou convertie', () => {
  // Nouvelle liste : désactivée, quel que soit le type (envies comprises)
  assert.equal(priorityAtStart(null), false);
  // Liste existante, liste d'envies comprise (et pendant une conversion) : le réglage enregistré
  assert.equal(priorityAtStart({ id: 'a', type: 'wishes', priorityEnabled: false }), false, 'le bug corrigé : jamais « activée » forcée');
  assert.equal(priorityAtStart({ id: 'b', type: 'wishes', priorityEnabled: true }), true);
  assert.equal(priorityAtStart({ id: 'c', type: 'tasks', priorityEnabled: false }), false);
  assert.equal(priorityAtStart({ id: 'd', type: 'tasks', priorityEnabled: true }), true);
  assert.equal(priorityAtStart({ id: 'e', type: 'shopping', priorityEnabled: false }), false);
  // Copie d'avant ces réglages (aucune valeur) : activée, comme listOptions
  assert.equal(priorityAtStart({ id: 'f', type: 'wishes' }), true);
});

test('formulaire : aucune valeur forcée ni liée au type ; création sans priorité sauf choix ; seul un changement de l\'interrupteur est envoyé ; conversion avec le réglage affiché', () => {
  const form = code('public/js/screens/list-form.js');
  assert.match(form, /let options = \{ priority: priorityAtStart\(list\), due: list \? listOptionsOf\(list\)\.due : false \};/);
  // Le type choisi ne touche plus l'interrupteur (plus de valeur posée par l'écran)
  assert.doesNotMatch(form, /optionsCard\.set\(|priorityChosen|card\.set =/);
  assert.doesNotMatch(form, /isWishList\(listType\) \|\| Boolean/);
  // Création : priorityEnabled n'est vrai que si le propriétaire l'a activé
  assert.match(form, /priorityEnabled: withPriority && options\.priority, dueEnabled: withDue && options\.due/);
  // Conversion : le réglage affiché (celui de la liste, ou changé à la main)
  assert.match(form, /priorityEnabled: options\.priority,\n\s+\}\);/);
  // « Modifier la liste » : priorityEnabled seulement si l'interrupteur a changé
  assert.match(form, /if \(withPriority && !convert && options\.priority !== saved\.priority\) switches\.priorityEnabled = options\.priority;/);
  // Les autres chemins de création : rien n'active la priorité d'office
  assert.match(read('public/js/actions.js'), /export async function createList\(\{ name, listType, storeId, priorityEnabled = false,/);
  assert.match(read('public/js/store.js'), /priorityEnabled: op\.priorityEnabled === true, \/\/ désactivées sauf demande/);
  assert.doesNotMatch(read('server/mcp-tools.js'), /list\.create/, 'Claude ne crée pas de liste');
  assert.match(read('public/sw.js'), /const VERSION = `v6[2-9]-/);
  // Aucune migration ne touche au réglage des listes existantes
  assert.ok(!MIGRATIONS.slice(19).some((m) => /priority_enabled/.test(String(m))));
});

test('serveur : une conversion garde le réglage actuel (tâches avec priorité : gardée ; courses : sans) ; le propriétaire peut le changer en convertissant ; listes d\'envies existantes inchangées', async (t) => {
  const h = await household(t);
  const ids = { tasksOn: uuid(), tasksOff: uuid(), shopping: uuid(), choice: uuid(), wishOn: uuid(), wishOff: uuid() };
  await h.ops(h.owner, [
    { type: 'list.create', listId: ids.tasksOn, name: 'Bricolage', listType: 'tasks', priorityEnabled: true },
    { type: 'list.create', listId: ids.tasksOff, name: 'Ménage', listType: 'tasks' },
    { type: 'list.create', listId: ids.shopping, name: 'Courses', listType: 'shopping' },
    { type: 'list.create', listId: ids.choice, name: 'Jardin', listType: 'tasks' },
    { type: 'list.create', listId: ids.wishOn, name: 'Envies (avec)', listType: 'wishes', priorityEnabled: true },
    { type: 'list.create', listId: ids.wishOff, name: 'Envies (sans)', listType: 'wishes', priorityEnabled: false },
  ]);
  const enabled = (id) => h.app.db.prepare('SELECT priority_enabled FROM lists WHERE id = ?').pluck().get(id);
  assert.equal((await h.owner.post(`/api/lists/${ids.tasksOn}/wishes`, { forUserId: h.leaId })).status, 200);
  assert.equal((await h.owner.post(`/api/lists/${ids.tasksOff}/wishes`, {})).status, 200);
  assert.equal((await h.owner.post(`/api/lists/${ids.shopping}/wishes`, { forName: 'Lucas' })).status, 200);
  assert.equal((await h.owner.post(`/api/lists/${ids.choice}/wishes`, { priorityEnabled: true })).status, 200);
  assert.deepEqual([enabled(ids.tasksOn), enabled(ids.tasksOff), enabled(ids.shopping), enabled(ids.choice)], [1, 0, 0, 1]);
  for (const id of [ids.tasksOn, ids.tasksOff, ids.shopping, ids.choice]) assert.equal(h.app.db.prepare('SELECT type FROM lists WHERE id = ?').pluck().get(id), 'wishes');
  // Les listes d'envies existantes ne bougent pas (ni par une conversion, ni au redémarrage)
  assert.deepEqual([enabled(ids.wishOn), enabled(ids.wishOff)], [1, 0]);
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

test('serveur : liste d\'envies — créée sans priorité par défaut, activée sur demande ; désactiver et réactiver, valeurs conservées ; contributeur oui, lecteur non', async (t) => {
  const h = await household(t);
  const ids = { off: uuid(), on: uuid(), velo: uuid(), lampe: uuid() };
  const res = await h.ops(h.owner, [
    { type: 'list.create', listId: ids.off, name: 'Sans priorité', listType: 'wishes', forUserId: h.leaId },
    { type: 'item.create', listId: ids.off, itemId: ids.velo, name: 'Vélo' },
    { type: 'list.create', listId: ids.on, name: 'Avec priorité', listType: 'wishes', forUserId: h.leaId, priorityEnabled: true },
    { type: 'item.create', listId: ids.on, itemId: ids.lampe, name: 'Lampe' },
  ]);
  assert.ok(res.body.results.every((r) => r.status === 200), JSON.stringify(res.body));
  // Création : désactivée sans rien demander (envies comprises), activée sur demande
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
  // Activée par le propriétaire sur une liste d'envies créée sans : la priorité se choisit
  assert.equal((await h.ops(h.owner, [{ type: 'list.update', listId: ids.off, priorityEnabled: true }])).body.results[0].status, 200);
  assert.equal((await h.ops(h.owner, [{ type: 'item.update', itemId: ids.velo, priority: 'high' }])).body.results[0].status, 200);
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
