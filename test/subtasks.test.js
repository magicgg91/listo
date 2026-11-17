// Sous-tâches (décisions du 17 novembre 2026) : option de liste (migration
// 31, désactivée au départ), un seul niveau, même liste, jamais de
// répétition pour une sous-tâche ; cocher une principale coche ses
// sous-tâches, décocher une sous-tâche décoche sa principale ; une
// principale supprimée part avec ses sous-tâches et revient avec elles ;
// option coupée : tout à plat, rien d'effacé. Droits vérifiés par le
// serveur ; copie locale (hors ligne) ; Claude ; lien public.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import {
  SUBTASK_NOT_HERE, SUBTASKS_OFF, BAD_PARENT, PARENT_IS_SUBTASK, HAS_SUBTASKS, NOT_OWN_PARENT, SUBTASK_NO_REPEAT,
  nestItems, parentOf, progressOf,
} from '../public/js/subtasks.js';

const uuid = () => crypto.randomUUID();

// Foyer : Guillaume (propriétaire), Léa (« Peut modifier »), Paul (lecture
// seule), Zoé (pas membre) ; « Refonte » (tâches, échéance et sous-tâches
// activées), « Perso » (tâches, sous-tâches désactivées), « Courses »
async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const ids = { lea: 0, paul: 0, zoe: 0 };
  for (const name of ['lea', 'paul', 'zoe']) ids[name] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
  const client = async (name) => {
    const c = app.client();
    await login(c, name, `MotDePasse-${name}`);
    return c;
  };
  const lists = { refonte: uuid(), perso: uuid(), courses: uuid() };
  const items = { authelia: uuid(), lot1: uuid(), lot2: uuid(), beszel: uuid(), lire: uuid(), lait: uuid() };
  const res = await guillaume.post('/api/ops', { ops: [
    { type: 'list.create', listId: lists.refonte, name: 'Refonte', listType: 'tasks', dueEnabled: true, subtasksEnabled: true },
    { type: 'item.create', listId: lists.refonte, itemId: items.authelia, name: 'Authelia' },
    { type: 'item.create', listId: lists.refonte, itemId: items.lot1, name: 'Lot 1', parentId: items.authelia },
    { type: 'item.create', listId: lists.refonte, itemId: items.lot2, name: 'Lot 2', parentId: items.authelia },
    { type: 'item.create', listId: lists.refonte, itemId: items.beszel, name: 'Beszel' },
    { type: 'list.create', listId: lists.perso, name: 'Perso', listType: 'tasks' },
    { type: 'item.create', listId: lists.perso, itemId: items.lire, name: 'Lire' },
    { type: 'list.create', listId: lists.courses, name: 'Courses', listType: 'shopping', subtasksEnabled: true },
    { type: 'item.create', listId: lists.courses, itemId: items.lait, name: 'Lait' },
  ].map((o) => ({ id: uuid(), ...o })) });
  assert.ok(res.body.results.every((r) => r.status === 200), res.text);
  for (const id of Object.values(lists)) {
    const shared = await guillaume.request('PUT', `/api/lists/${id}/members`, { userIds: [ids.lea, ids.paul], access: { [ids.lea]: 'modification', [ids.paul]: 'lecture' } });
    assert.equal(shared.status, 200, shared.text);
  }
  const row = (id) => app.db.prepare('SELECT parent_id, checked, checked_at, deleted_at, due_date FROM items WHERE id = ?').get(id);
  return { app, guillaume, lea: await client('lea'), paul: await client('paul'), zoe: await client('zoe'), ids, lists, items, row };
}

const op = async (client, operation) => {
  const res = await client.post('/api/ops', { ops: [{ id: uuid(), ...operation }] });
  assert.equal(res.status, 200, res.text);
  return res.body.results[0];
};

// --- Serveur ---

test('option : désactivée au départ, activée sur demande, synchronisée avec le lien de chaque sous-tâche', async (t) => {
  const h = await household(t);
  const flags = h.app.db.prepare('SELECT id, subtasks_enabled FROM lists').all();
  assert.equal(flags.find((l) => l.id === h.lists.perso).subtasks_enabled, 0, 'désactivée par défaut');
  assert.equal(flags.find((l) => l.id === h.lists.refonte).subtasks_enabled, 1);
  const sync = (await h.lea.get('/api/sync')).body;
  assert.equal(sync.lists.find((l) => l.id === h.lists.refonte).subtasksEnabled, true);
  assert.equal(sync.lists.find((l) => l.id === h.lists.perso).subtasksEnabled, false);
  assert.equal(sync.items.find((i) => i.id === h.items.lot1).parentId, h.items.authelia);
  assert.equal(sync.items.find((i) => i.id === h.items.authelia).parentId, null);
  // Réglage invalide refusé ; seul le propriétaire change l'option
  assert.equal((await op(h.guillaume, { type: 'list.update', listId: h.lists.perso, subtasksEnabled: 'oui' })).status, 400);
  assert.equal((await op(h.lea, { type: 'list.update', listId: h.lists.perso, subtasksEnabled: true })).status, 403);
});

test('règles : liste de tâches, option activée, même liste, un seul niveau, pas sa propre principale, jamais de répétition ; refus sans rien écrire', async (t) => {
  const h = await household(t);
  const add = (listId, parentId, extra = {}) => op(h.guillaume, { type: 'item.create', listId, itemId: uuid(), name: 'X', parentId, ...extra });
  assert.equal((await add(h.lists.perso, h.items.lire)).error, SUBTASKS_OFF);
  assert.equal((await add(h.lists.courses, h.items.lait)).error, SUBTASK_NOT_HERE, 'jamais dans une liste de courses, même option demandée');
  assert.equal((await add(h.lists.refonte, h.items.lire)).error, BAD_PARENT, 'principale d\'une autre liste');
  assert.equal((await add(h.lists.refonte, uuid())).error, BAD_PARENT);
  assert.equal((await add(h.lists.refonte, 'pas-un-uuid')).error, BAD_PARENT);
  assert.equal((await add(h.lists.refonte, h.items.lot1)).error, PARENT_IS_SUBTASK, 'un seul niveau');
  assert.equal((await add(h.lists.refonte, h.items.authelia, { dueDate: '2030-01-07', repeat: 'week:1' })).error, SUBTASK_NO_REPEAT);
  const move = (itemId, parentId) => op(h.guillaume, { type: 'item.update', itemId, parentId });
  assert.equal((await move(h.items.authelia, h.items.beszel)).error, HAS_SUBTASKS);
  assert.equal((await move(h.items.beszel, h.items.beszel)).error, NOT_OWN_PARENT);
  assert.equal((await move(h.items.beszel, h.items.lot2)).error, PARENT_IS_SUBTASK);
  // Une tâche qui se répète ne devient pas une sous-tâche ; une sous-tâche ne se met pas à se répéter
  await op(h.guillaume, { type: 'item.update', itemId: h.items.beszel, dueDate: '2030-01-07', repeat: 'week:1' });
  assert.equal((await move(h.items.beszel, h.items.authelia)).error, SUBTASK_NO_REPEAT);
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.items.lot1, dueDate: '2030-01-07', repeat: 'week:1' })).error, SUBTASK_NO_REPEAT);
  assert.equal(h.row(h.items.beszel).parent_id, null, 'rien n\'est écrit');
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM items WHERE name = ?').pluck().get('X'), 0);
  // Ranger puis sortir une tâche
  await op(h.guillaume, { type: 'item.update', itemId: h.items.beszel, repeat: null });
  assert.equal((await move(h.items.beszel, h.items.authelia)).status, 200);
  assert.equal(h.row(h.items.beszel).parent_id, h.items.authelia);
  assert.equal((await move(h.items.beszel, null)).status, 200);
  assert.equal(h.row(h.items.beszel).parent_id, null);
});

test('droits : lecture seule refusée (403), non-membre comme une liste inexistante (404)', async (t) => {
  const h = await household(t);
  assert.equal((await op(h.paul, { type: 'item.create', listId: h.lists.refonte, itemId: uuid(), name: 'X', parentId: h.items.authelia })).status, 403);
  assert.equal((await op(h.paul, { type: 'item.update', itemId: h.items.beszel, parentId: h.items.authelia })).status, 403);
  assert.equal((await op(h.zoe, { type: 'item.update', itemId: h.items.beszel, parentId: h.items.authelia })).status, 404);
  assert.equal((await op(h.zoe, { type: 'item.check', itemId: h.items.authelia, checked: true })).status, 404);
  assert.equal(h.row(h.items.lot1).checked, 0);
  // Une personne « Peut modifier » range et coche comme le propriétaire
  assert.equal((await op(h.lea, { type: 'item.update', itemId: h.items.beszel, parentId: h.items.authelia })).status, 200);
});

test('cocher : la principale coche ses sous-tâches à faire ; décocher une sous-tâche ou en ajouter une décoche la principale ; jamais cochée toute seule', async (t) => {
  const h = await household(t);
  await op(h.guillaume, { type: 'item.check', itemId: h.items.lot1, checked: true });
  const before = h.row(h.items.lot1).checked_at;
  await op(h.guillaume, { type: 'item.check', itemId: h.items.lot2, checked: true });
  assert.equal(h.row(h.items.authelia).checked, 0, 'toutes les sous-tâches cochées : la principale reste à faire');
  await op(h.guillaume, { type: 'item.check', itemId: h.items.lot2, checked: false });
  const res = await op(h.guillaume, { type: 'item.check', itemId: h.items.authelia, checked: true });
  assert.deepEqual(res.children, [h.items.lot2], 'seules les sous-tâches cochées ici (pour « Annuler »)');
  assert.equal(h.row(h.items.lot2).checked, 1);
  assert.equal(h.row(h.items.lot1).checked_at, before, 'une sous-tâche déjà cochée garde sa date');
  // Décocher une sous-tâche décoche la principale
  await op(h.lea, { type: 'item.check', itemId: h.items.lot2, checked: false });
  assert.equal(h.row(h.items.authelia).checked, 0);
  assert.equal(h.row(h.items.lot1).checked, 1, 'les autres sous-tâches ne bougent pas');
  // Nouvelle sous-tâche sous une principale cochée : la principale se décoche
  await op(h.guillaume, { type: 'item.check', itemId: h.items.authelia, checked: true });
  await op(h.guillaume, { type: 'item.create', listId: h.lists.refonte, itemId: uuid(), name: 'Lot 3', parentId: h.items.authelia });
  assert.equal(h.row(h.items.authelia).checked, 0);
  // Tâche à faire rangée sous une principale cochée : idem ; tâche cochée : rien
  await op(h.guillaume, { type: 'item.check', itemId: h.items.authelia, checked: true });
  await op(h.guillaume, { type: 'item.check', itemId: h.items.beszel, checked: true });
  await op(h.guillaume, { type: 'item.update', itemId: h.items.beszel, parentId: h.items.authelia });
  assert.equal(h.row(h.items.authelia).checked, 1);
  await op(h.guillaume, { type: 'item.update', itemId: h.items.beszel, parentId: null });
  await op(h.guillaume, { type: 'item.check', itemId: h.items.beszel, checked: false });
  await op(h.guillaume, { type: 'item.update', itemId: h.items.beszel, parentId: h.items.authelia });
  assert.equal(h.row(h.items.authelia).checked, 0);
});

test('principale qui se répète : cochée, elle revient à sa date suivante avec toutes ses sous-tâches décochées', async (t) => {
  const h = await household(t);
  const menage = uuid();
  const steps = [uuid(), uuid()];
  await op(h.guillaume, { type: 'item.create', listId: h.lists.refonte, itemId: menage, name: 'Ménage', dueDate: '2030-01-07', repeat: 'week:1' });
  for (const id of steps) await op(h.guillaume, { type: 'item.create', listId: h.lists.refonte, itemId: id, name: 'Étape', parentId: menage });
  await op(h.guillaume, { type: 'item.check', itemId: steps[0], checked: true });
  const res = await op(h.guillaume, { type: 'item.check', itemId: menage, checked: true, nextDue: '2030-01-14' });
  assert.equal(res.repeated, '2030-01-14');
  assert.deepEqual([h.row(menage).checked, h.row(menage).due_date], [0, '2030-01-14']);
  assert.deepEqual(steps.map((id) => h.row(id).checked), [0, 0]);
});

test('supprimer : la principale part avec ses sous-tâches, « Annuler » ramène le groupe ; une sous-tâche seule revient sans principale supprimée', async (t) => {
  const h = await household(t);
  await op(h.guillaume, { type: 'item.delete', itemId: h.items.authelia });
  for (const id of [h.items.authelia, h.items.lot1, h.items.lot2]) assert.ok(h.row(id).deleted_at, id);
  assert.equal(h.row(h.items.beszel).deleted_at, null);
  const res = await op(h.guillaume, { type: 'item.restore', itemId: h.items.authelia });
  assert.deepEqual(res.children.sort(), [h.items.lot1, h.items.lot2].sort());
  for (const id of [h.items.authelia, h.items.lot1, h.items.lot2]) assert.equal(h.row(id).deleted_at, null, id);
  assert.equal(h.row(h.items.lot1).parent_id, h.items.authelia, 'toujours rangée');
  // Une sous-tâche supprimée seule, puis sa principale : elle revient seule, comme une tâche ordinaire
  await op(h.guillaume, { type: 'item.delete', itemId: h.items.lot1 });
  await op(h.guillaume, { type: 'item.delete', itemId: h.items.authelia });
  await op(h.guillaume, { type: 'item.restore', itemId: h.items.lot1 });
  assert.deepEqual([h.row(h.items.lot1).deleted_at, h.row(h.items.lot1).parent_id], [null, null]);
  assert.ok(h.row(h.items.authelia).deleted_at);
});

test('« Retirer les terminés » : une sous-tâche cochée sous une principale à faire reste à sa place', async (t) => {
  const h = await household(t);
  await op(h.guillaume, { type: 'item.check', itemId: h.items.lot1, checked: true });
  await op(h.guillaume, { type: 'item.check', itemId: h.items.beszel, checked: true });
  const res = await op(h.guillaume, { type: 'list.removeChecked', listId: h.lists.refonte });
  assert.equal(res.removed, 1);
  assert.equal(h.row(h.items.lot1).deleted_at, null);
  assert.ok(h.row(h.items.beszel).deleted_at);
  // Principale cochée (donc tout son groupe) : retirée avec ses sous-tâches
  await op(h.guillaume, { type: 'item.check', itemId: h.items.authelia, checked: true });
  assert.equal((await op(h.guillaume, { type: 'list.removeChecked', listId: h.lists.refonte })).removed, 3);
});

test('option coupée : tout à plat (ni cocher ni supprimer en groupe), lien gardé en base ; remise : regroupé', async (t) => {
  const h = await household(t);
  await op(h.guillaume, { type: 'list.update', listId: h.lists.refonte, subtasksEnabled: false });
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.items.beszel, parentId: h.items.authelia })).error, SUBTASKS_OFF);
  await op(h.guillaume, { type: 'item.check', itemId: h.items.authelia, checked: true });
  assert.equal(h.row(h.items.lot1).checked, 0, 'pas de coché en groupe');
  await op(h.guillaume, { type: 'item.check', itemId: h.items.authelia, checked: false });
  // Une sous-tâche peut se répéter tant que tout est à plat
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.items.lot1, dueDate: '2030-01-07', repeat: 'week:1' })).status, 200);
  await op(h.guillaume, { type: 'item.update', itemId: h.items.lot1, repeat: null });
  await op(h.guillaume, { type: 'item.delete', itemId: h.items.authelia });
  assert.equal(h.row(h.items.lot1).deleted_at, null, 'pas de suppression en groupe');
  await op(h.guillaume, { type: 'item.restore', itemId: h.items.authelia });
  assert.equal(h.row(h.items.lot1).parent_id, h.items.authelia, 'rien n\'est effacé');
  await op(h.guillaume, { type: 'list.update', listId: h.lists.refonte, subtasksEnabled: true });
  await op(h.guillaume, { type: 'item.check', itemId: h.items.authelia, checked: true });
  assert.equal(h.row(h.items.lot1).checked, 1, 'regroupé de nouveau');
});

test('dupliquer : les sous-tâches suivent leur principale (nouveaux identifiants), option copiée', async (t) => {
  const h = await household(t);
  const res = await h.guillaume.post(`/api/lists/${h.lists.refonte}/duplicate`, { name: 'Refonte (copie)', withItems: true });
  assert.equal(res.status, 201, res.text);
  const copy = res.body.list;
  assert.equal(copy.subtasksEnabled, true);
  const rows = h.app.db.prepare('SELECT id, name, parent_id FROM items WHERE list_id = ?').all(copy.id);
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(byName['Lot 1'].parent_id, byName.Authelia.id);
  assert.equal(byName['Lot 2'].parent_id, byName.Authelia.id);
  assert.equal(byName.Beszel.parent_id, null);
  assert.ok(!Object.values(h.items).includes(byName.Authelia.id));
});

// --- Règles partagées (téléphone, page publique) ---

test('regroupement : une sous-tâche se range sous une principale présente et de premier niveau, sinon elle est à plat', () => {
  const item = (id, parentId = null, extra = {}) => ({ id, listId: 'L', parentId, checked: false, ...extra });
  const items = [item('a'), item('b', 'a', { checked: true }), item('c', 'a'), item('d', 'b'), item('e', 'absent'), item('f', 'f')];
  const { tops, childrenOf } = nestItems(items, true);
  assert.deepEqual(tops.map((i) => i.id), ['a', 'd', 'e', 'f'], 'd : sa principale est une sous-tâche ; e : principale absente ; f : elle-même');
  assert.deepEqual(childrenOf.get('a').map((i) => i.id), ['b', 'c']);
  assert.deepEqual(progressOf(childrenOf.get('a')), { done: 1, total: 2 });
  assert.deepEqual(nestItems(items, false).tops.map((i) => i.id), ['a', 'b', 'c', 'd', 'e', 'f'], 'option coupée : à plat');
  assert.equal(parentOf(item('x', 'a', { listId: 'M' }), new Map(items.map((i) => [i.id, i]))), null, 'jamais une principale d\'une autre liste');
});

// --- Copie locale du téléphone (hors ligne) : mêmes règles que le serveur ---

test('copie locale : les mêmes gestes donnent le même résultat que sur le serveur (cocher, décocher, ajouter, supprimer, « Annuler », retirer les terminés)', async (t) => {
  const { emptyState, loadSync, applyOp, computeListView, listOptions } = await import('../public/js/store.js');
  const h = await household(t);
  const state = emptyState();
  loadSync(state, (await h.guillaume.get('/api/sync')).body);
  const me = (await h.guillaume.get('/api/me')).body.user;
  assert.equal(listOptions(state.lists.get(h.lists.refonte)).subtasks, true);
  assert.equal(listOptions(state.lists.get(h.lists.perso)).subtasks, false);
  const lot3 = uuid();
  const steps = [
    { type: 'item.check', itemId: h.items.lot1, checked: true },
    { type: 'item.check', itemId: h.items.authelia, checked: true },
    { type: 'item.check', itemId: h.items.lot2, checked: false },
    { type: 'item.check', itemId: h.items.authelia, checked: true },
    { type: 'item.create', listId: h.lists.refonte, itemId: lot3, name: 'Lot 3', parentId: h.items.authelia },
    { type: 'item.check', itemId: h.items.beszel, checked: true },
    { type: 'list.removeChecked', listId: h.lists.refonte },
    { type: 'item.delete', itemId: h.items.authelia },
    { type: 'item.restore', itemId: h.items.authelia },
  ];
  for (const step of steps) {
    applyOp(state, step, { user: me, now: new Date().toISOString() });
    assert.equal((await op(h.guillaume, step)).status, 200, step.type);
    const server = h.app.db.prepare('SELECT id, checked, parent_id FROM items WHERE list_id = ? AND deleted_at IS NULL ORDER BY id').all(h.lists.refonte)
      .map((r) => [r.id, r.checked === 1, r.parent_id]);
    const local = [...state.items.values()].filter((i) => i.listId === h.lists.refonte).sort((a, b) => a.id.localeCompare(b.id))
      .map((i) => [i.id, i.checked, i.parentId]);
    assert.deepEqual(local, server, `après ${JSON.stringify(step)}`);
  }
  // Affichage : seules les principales sont groupées ; sous-tâches à part
  const view = computeListView(state, h.lists.refonte);
  const shown = view.groups.flatMap((g) => g.items.map((i) => i.id));
  assert.ok(shown.includes(h.items.authelia) && !shown.includes(h.items.lot1));
  assert.deepEqual(view.subtasks.get(h.items.authelia).map((i) => i.name), ['Lot 3', 'Lot 1', 'Lot 2'], 'à faire, puis cochées (ordre alphabétique)');
});

test('copie locale : principale qui se répète, sous-tâches décochées ; option coupée, tout à plat', async () => {
  const { emptyState, applyOp, computeListView } = await import('../public/js/store.js');
  const state = emptyState();
  const user = { id: 1, username: 'g', displayName: 'G' };
  const now = '2030-01-07T10:00:00.000Z';
  applyOp(state, { type: 'list.create', listId: 'L', name: 'Maison', listType: 'tasks', dueEnabled: true, subtasksEnabled: true }, { user, now });
  applyOp(state, { type: 'item.create', listId: 'L', itemId: 'm', name: 'Ménage', dueDate: '2030-01-07', repeat: 'week:1' }, { user, now });
  applyOp(state, { type: 'item.create', listId: 'L', itemId: 's', name: 'Sol', parentId: 'm' }, { user, now });
  applyOp(state, { type: 'item.check', itemId: 's', checked: true }, { user, now });
  applyOp(state, { type: 'item.check', itemId: 'm', checked: true, nextDue: '2030-01-14' }, { user, now });
  assert.deepEqual([state.items.get('m').dueDate, state.items.get('m').checked, state.items.get('s').checked], ['2030-01-14', false, false]);
  applyOp(state, { type: 'list.update', listId: 'L', subtasksEnabled: false }, { user, now });
  const flat = computeListView(state, 'L');
  assert.deepEqual(flat.groups.flatMap((g) => g.items.map((i) => i.id)).sort(), ['m', 's']);
  assert.equal(flat.subtasks.size, 0);
  applyOp(state, { type: 'item.check', itemId: 'm', checked: true, nextDue: '2030-01-21' }, { user, now });
  applyOp(state, { type: 'item.check', itemId: 's', checked: true }, { user, now });
  applyOp(state, { type: 'item.delete', itemId: 'm' }, { user, now });
  assert.ok(state.items.has('s'), 'option coupée : pas de suppression en groupe');
  assert.equal(state.items.get('s').parentId, 'm', 'le lien est gardé');
});
