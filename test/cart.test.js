// Zone des articles cochés (« Dans le panier » / « Terminés ») : date du
// coché, opérations « tout décocher » (list.uncheckAll) et « retirer les
// cochés » (list.removeChecked), droits, synchronisation, temps réel, rejeu,
// plus de 100 cochés, ordre de la zone, page publique, vocabulaire.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { splitDone } from '../public/js/sorting.js';
import { emptyState, loadSync, computeListView, applyOp } from '../public/js/store.js';
import { doneZoneWords, countItems } from '../public/js/words.js';

const uuid = () => crypto.randomUUID();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Admin + Marie (propriétaire) + Paul (invité) + Léa (sans accès)
async function household(t) {
  const app = await startTestApp(t);
  await setupAdmin(app, { username: 'admin' });
  const clients = {};
  const ids = {};
  for (const name of ['marie', 'paul', 'lea']) {
    ids[name] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    clients[name] = app.client();
    await login(clients[name], name, `MotDePasse-${name}`);
  }
  const tick = () => { app.clock.now += 1000; };
  const h = { app, ...clients, ids, tick };
  h.listId = await newList(h, h.marie);
  await h.marie.request('PUT', `/api/lists/${h.listId}/members`, { userIds: [ids.paul], access: { [ids.paul]: 'modification' } });
  return h;
}

// Une opération ; renvoie le résultat (statut compris)
async function op(h, client, operation, id = uuid()) {
  h.tick();
  const res = await client.post('/api/ops', { ops: [{ id, ...operation }] });
  return res.status === 200 ? res.body.results[0] : { status: res.status };
}
async function ok(h, client, operation, id) {
  const result = await op(h, client, operation, id);
  assert.equal(result.status, 200, `${operation.type} : ${result.error}`);
  return result;
}

async function newList(h, client, fields = {}) {
  const listId = uuid();
  const COURSES = h.app.db.prepare("SELECT id FROM categories WHERE name = 'Courses'").pluck().get();
  await ok(h, client, { type: 'list.create', listId, name: 'Courses', categoryId: COURSES, ...fields });
  return listId;
}
async function newItem(h, client, listId, name, { checked = false } = {}) {
  const itemId = uuid();
  await ok(h, client, { type: 'item.create', listId, itemId, name });
  if (checked) await ok(h, client, { type: 'item.check', itemId, checked: true });
  return itemId;
}
const row = (h, id) => h.app.db.prepare('SELECT checked, checked_at, updated_at, deleted_at FROM items WHERE id = ?').get(id);

// --- Date du coché ---

test('date du coché : posée au premier coché, gardée par un second, effacée au décoché', async (t) => {
  const h = await household(t);
  const id = await newItem(h, h.marie, h.listId, 'Lait');
  assert.equal(row(h, id).checked_at, null);
  await ok(h, h.marie, { type: 'item.check', itemId: id, checked: true });
  const first = row(h, id).checked_at;
  assert.ok(first);
  await ok(h, h.paul, { type: 'item.check', itemId: id, checked: true });
  assert.equal(row(h, id).checked_at, first, 'un second « cocher » garde la date');
  await ok(h, h.marie, { type: 'item.update', itemId: id, note: 'demi-écrémé' });
  assert.equal(row(h, id).checked_at, first, 'modifier la note ne change pas la date du coché');
  await ok(h, h.marie, { type: 'item.check', itemId: id, checked: false });
  assert.equal(row(h, id).checked_at, null);
  const sync = (await h.marie.get('/api/sync')).body;
  assert.equal(sync.items.find((i) => i.id === id).checkedAt, null, 'checkedAt envoyé par la synchronisation');
});

// --- Tout décocher ---

test("tout décocher : seuls les cochés de la liste, pas les supprimés ; nouvelle date ; synchro d'un autre compte ; temps réel", async (t) => {
  const h = await household(t);
  const a = await newItem(h, h.marie, h.listId, 'Tomates', { checked: true });
  const b = await newItem(h, h.marie, h.listId, 'Pain', { checked: true });
  const c = await newItem(h, h.marie, h.listId, 'Riz');
  const gone = await newItem(h, h.marie, h.listId, 'Ancien', { checked: true });
  await ok(h, h.marie, { type: 'item.delete', itemId: gone });
  const otherList = await newList(h, h.marie);
  const other = await newItem(h, h.marie, otherList, 'Ailleurs', { checked: true });
  const before = { c: row(h, c), gone: row(h, gone), other: row(h, other) };
  const since = (await h.paul.get('/api/sync')).body.serverTime;

  // Paul (invité) écoute le temps réel
  const controller = new AbortController();
  const res = await fetch(`${h.app.base}/api/events`, { headers: { cookie: [...h.paul.jar].map(([n, v]) => `${n}=${v}`).join('; ') }, signal: controller.signal });
  const reader = res.body.getReader();
  let received = '';
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        received += new TextDecoder().decode(value);
      }
    } catch { /* coupé par le test */ }
  })();
  await pause(50);

  const result = await ok(h, h.paul, { type: 'list.uncheckAll', listId: h.listId });
  assert.equal(result.reopened, 2);
  for (const id of [a, b]) {
    assert.equal(row(h, id).checked, 0);
    assert.equal(row(h, id).checked_at, null);
  }
  assert.deepEqual(row(h, c), before.c, 'non coché : intact');
  assert.deepEqual(row(h, gone), before.gone, 'supprimé : intact');
  assert.deepEqual(row(h, other), before.other, 'autre liste : intacte');

  await pause(100);
  controller.abort();
  assert.ok(received.includes(`"listId":"${h.listId}"`), 'événement temps réel de la liste');

  const changes = (await h.paul.get(`/api/sync?since=${encodeURIComponent(since)}`)).body;
  assert.deepEqual(changes.items.map((i) => [i.name, i.checked]).sort(), [['Pain', false], ['Tomates', false]]);
});

test('droits : membre (propriétaire ou invité) oui ; non-membre 404 ; visiteur 401', async (t) => {
  const h = await household(t);
  const id = await newItem(h, h.marie, h.listId, 'Lait', { checked: true });
  for (const type of ['list.uncheckAll', 'list.removeChecked']) {
    assert.equal((await op(h, h.lea, { type, listId: h.listId })).status, 404, `${type} : non-membre`);
    assert.equal((await op(h, h.app.client(), { type, listId: h.listId })).status, 401, `${type} : visiteur`);
  }
  assert.deepEqual([row(h, id).checked, row(h, id).deleted_at], [1, null], 'rien n\'a changé');
  assert.equal((await ok(h, h.paul, { type: 'list.uncheckAll', listId: h.listId })).reopened, 1);
  await ok(h, h.paul, { type: 'item.check', itemId: id, checked: true });
  assert.equal((await ok(h, h.paul, { type: 'list.removeChecked', listId: h.listId })).removed, 1);
  // L'ancien nom de l'opération est encore accepté (file d'attente d'avant la mise à jour)
  const id2 = await newItem(h, h.marie, h.listId, 'Beurre', { checked: true });
  assert.equal((await ok(h, h.marie, { type: 'list.clearChecked', listId: h.listId })).removed, 1);
  assert.ok(row(h, id2).deleted_at);
});

test('rejeu de la même opération (coupure réseau) : aucun effet de bord', async (t) => {
  const h = await household(t);
  const a = await newItem(h, h.marie, h.listId, 'Tomates', { checked: true });
  const opId = uuid();
  assert.equal((await ok(h, h.marie, { type: 'list.uncheckAll', listId: h.listId }, opId)).reopened, 1);
  // Entre-temps, Paul coche de nouveau ; le téléphone de Marie renvoie la même opération
  await ok(h, h.paul, { type: 'item.check', itemId: a, checked: true });
  const replay = await ok(h, h.marie, { type: 'list.uncheckAll', listId: h.listId }, opId);
  assert.equal(replay.reopened, 1, 'même réponse que la première fois');
  assert.equal(row(h, a).checked, 1, "le coché de Paul n'est pas défait par le rejeu");
});

test('plus de 100 cochés : une seule opération, petite, les décoche tous', async (t) => {
  const h = await household(t);
  const insert = h.app.db.prepare("INSERT INTO items (id, list_id, name, checked, checked_at, created_by) VALUES (?, ?, ?, 1, '2026-10-16T10:00:00.000Z', ?)");
  for (let i = 0; i < 150; i++) insert.run(uuid(), h.listId, `Article ${i}`, h.ids.marie);
  const body = JSON.stringify({ ops: [{ id: uuid(), type: 'list.uncheckAll', listId: h.listId }] });
  assert.ok(body.length < 200, `envoi de ${body.length} octets`);
  assert.equal((await ok(h, h.marie, { type: 'list.uncheckAll', listId: h.listId })).reopened, 150);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM items WHERE list_id = ? AND checked = 1').pluck().get(h.listId), 0);
  // Et « retirer » aussi
  h.app.db.prepare('UPDATE items SET checked = 1 WHERE list_id = ?').run(h.listId);
  assert.equal((await ok(h, h.marie, { type: 'list.removeChecked', listId: h.listId })).removed, 150);
});

// --- Ordre, regroupement, page publique ---

test('zone : du plus récemment coché au plus ancien ; rayon entièrement coché absent, puis de retour', () => {
  const aisles = [{ id: 1, name: 'Crèmerie' }, { id: 2, name: 'Épicerie' }];
  const items = [
    { id: 'a', name: 'Lait', aisleId: 1, checked: true, checkedAt: '2026-10-16T10:00:00.000Z' },
    { id: 'b', name: 'Beurre', aisleId: 1, checked: true, checkedAt: '2026-10-16T12:00:00.000Z' },
    { id: 'c', name: 'Riz', aisleId: 2, checked: false },
    { id: 'd', name: 'Pâtes', aisleId: 2, checked: true, checkedAt: '2026-10-16T11:00:00.000Z' },
  ];
  const { groups, done } = splitDone(items, aisles, true);
  assert.deepEqual(done.map((i) => i.name), ['Beurre', 'Pâtes', 'Lait']);
  assert.deepEqual(groups.map((g) => g.aisle.name), ['Épicerie'], 'Crèmerie, tout coché, disparaît');
  items[0].checked = false;
  assert.deepEqual(splitDone(items, aisles, true).groups.map((g) => g.aisle.name), ['Crèmerie', 'Épicerie'], 'elle revient');
  assert.deepEqual(splitDone([], aisles, true), { groups: [], done: [] });
});

test('téléphone : zone absente sans coché, liste entièrement cochée, tout décocher hors ligne', () => {
  const state = loadSync(emptyState(), {
    serverTime: '2026-10-16T12:00:00.000Z',
    listIds: ['L'],
    lists: [{ id: 'L', name: 'Courses', category: { id: 1, isShopping: true }, store: null, members: [], updatedAt: '2026-10-16T09:00:00.000Z', deletedAt: null }],
    items: [
      { id: '1', listId: 'L', name: 'Lait', aisleId: null, checked: false, checkedAt: null, deletedAt: null },
      { id: '2', listId: 'L', name: 'Pain', aisleId: null, checked: false, checkedAt: null, deletedAt: null },
    ],
    categories: [], stores: [], aisles: [], history: [],
  });
  assert.deepEqual(computeListView(state, 'L').done, [], 'aucun coché : pas de zone');
  const ctx = { user: { id: 1 }, now: '2026-10-16T12:01:00.000Z' };
  applyOp(state, { type: 'item.check', itemId: '1', checked: true }, ctx);
  applyOp(state, { type: 'item.check', itemId: '2', checked: true }, { ...ctx, now: '2026-10-16T12:02:00.000Z' });
  const full = computeListView(state, 'L');
  assert.deepEqual([full.groups, full.done.map((i) => i.name)], [[], ['Pain', 'Lait']], 'tout coché : seulement la zone');
  // Hors ligne : la même opération que celle mise en file est appliquée sur place
  applyOp(state, { type: 'list.uncheckAll', listId: 'L' }, ctx);
  assert.deepEqual(computeListView(state, 'L').done, []);
  applyOp(state, { type: 'list.uncheckAll', listId: 'L' }, ctx);
  assert.equal(computeListView(state, 'L').groups[0].items.length, 2, 'rejouée : sans effet de bord');
});

test('page publique : cochés dans la zone, dans l\'ordre, sans date ni action', async (t) => {
  const h = await household(t);
  await newItem(h, h.marie, h.listId, 'Riz');
  await newItem(h, h.marie, h.listId, 'Lait', { checked: true });
  await newItem(h, h.marie, h.listId, 'Pain', { checked: true });
  const share = await h.marie.request('PUT', `/api/lists/${h.listId}/share`, {});
  const token = share.body.share.url.split('/p/')[1];
  const data = (await h.app.client().get(`/api/public/${token}`)).body;
  assert.deepEqual(data.groups.flatMap((g) => g.items.map((i) => i.name)), ['Riz']);
  assert.deepEqual(data.done.map((i) => i.name), ['Pain', 'Lait'], 'du plus récent au plus ancien');
  assert.ok(!JSON.stringify(data).includes('checkedAt'), 'la date du coché n\'est pas envoyée');
});

// --- Vocabulaire et traces ---

test('vocabulaire de la zone : courses et autres listes', () => {
  assert.deepEqual(doneZoneWords(true), { title: 'Dans le panier', reopen: 'Tout remettre à acheter', remove: 'Retirer du panier' });
  assert.deepEqual(doneZoneWords({ category: { isShopping: false } }), { title: 'Terminés', reopen: 'Tout rouvrir', remove: 'Retirer les terminés' });
  assert.equal(countItems(12, true), '12 articles');
  assert.equal(countItems(4, false), '4 éléments');
});

test('plus aucune trace de « Vider les barrés » (interface, serveur, documentation)', () => {
  const ROOT = new URL('..', import.meta.url).pathname;
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.(js|html|md|css)$/.test(entry.name)) files.push(rel);
    }
  };
  for (const dir of ['public', 'server', 'docs']) walk(dir);
  files.push('README.md', 'CLAUDE.md');
  for (const file of files) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(!/vider les barr|vide les barr/i.test(text), `${file} parle encore de « Vider les barrés »`);
  }
});
