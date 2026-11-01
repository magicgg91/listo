// Tout compte connecté crée un magasin ou un rayon manquant (POST /api/stores,
// POST /api/aisles), sans passer par l'Admin ; le reste (renommer, désactiver,
// supprimer, regrouper, catégories) reste à l'Admin. Doublons, droits,
// fréquence, temps réel, et l'écran (feuille « Nouveau magasin » / « Nouveau
// rayon »). Le rendu est aussi vérifié dans Chromium (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const READ_ONLY = 'Vous avez un accès en lecture seule à cette liste.';

// Guillaume (Admin, propriétaire) ; Léa « Peut modifier » ; Paul « Lecture
// seule » ; Zoé, non-membre. Une liste de courses partagée avec Léa et Paul.
async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const ids = {};
  const clients = { guillaume };
  for (const name of ['lea', 'paul', 'zoe']) {
    ids[name] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    clients[name] = app.client();
    await login(clients[name], name, `MotDePasse-${name}`);
  }
  const [shop, tasks] = [uuid(), uuid()];
  await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: shop, name: 'Courses', listType: 'shopping' },
    { id: uuid(), type: 'list.create', listId: tasks, name: 'Maison', listType: 'tasks' },
  ] });
  for (const listId of [shop, tasks]) {
    await guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: [ids.lea, ids.paul], access: { [ids.lea]: 'modification', [ids.paul]: 'lecture' } });
  }
  let refs = 0;
  const notify = app.ctx.events.notifyReferences.bind(app.ctx.events);
  app.ctx.events.notifyReferences = () => {
    refs += 1;
    notify();
  };
  const count = (table) => app.db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get();
  return { app, ...clients, ids, shop, tasks, refs: () => refs, count };
}

test('un compte qui n\'est pas Admin crée un magasin et un rayon ; ils sont communs, et annoncés en temps réel', async (t) => {
  const h = await household(t);
  const store = await h.lea.post('/api/stores', { name: '  Marché   du samedi ' });
  assert.equal(store.status, 201, JSON.stringify(store.body));
  assert.deepEqual(store.body.item, { id: store.body.item.id, name: 'Marché du samedi', active: true, isMulti: false, storeIds: [] });
  const aisle = await h.lea.post('/api/aisles', { name: 'Produits du monde', listId: h.shop });
  assert.equal(aisle.status, 201);
  assert.equal(h.refs(), 2, 'les téléphones connectés se mettent à jour');
  // Visibles par les autres comptes (synchronisation)
  const sync = (await h.paul.get('/api/sync')).body;
  assert.ok(sync.stores.some((s) => s.name === 'Marché du samedi' && s.active));
  assert.ok(sync.aisles.some((a) => a.name === 'Produits du monde' && a.active));
  // Et dans l'Administration, comme les autres
  const admin = (await h.guillaume.get('/api/admin/aisles')).body.items;
  assert.ok(admin.some((a) => a.name === 'Produits du monde'));
  // Journal : nom du compte et type, rien d'une liste
  const lines = h.app.logs.filter((l) => /magasin_cree|rayon_cree/.test(l));
  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => l.includes('lea') && !l.includes('Courses')));
  // Le magasin créé sert tout de suite à une nouvelle liste
  const listId = uuid();
  assert.equal((await h.lea.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId, name: 'Samedi', listType: 'shopping', storeId: store.body.item.id }] })).body.results[0].status, 200);
  // … et le rayon à un article
  assert.equal((await h.lea.post('/api/ops', { ops: [{ id: uuid(), type: 'item.create', listId: h.shop, itemId: uuid(), name: 'Sauce soja', aisleId: aisle.body.item.id }] })).body.results[0].status, 200);
});

test('doublon refusé (majuscules, accents, espaces) : l\'existant est proposé ; désactivé : demander à l\'Admin', async (t) => {
  const h = await household(t);
  const before = [h.count('stores'), h.count('aisles')];
  for (const name of ['crèmerie', '  CREMERIE ', 'Crémerie', 'Crèmerie']) {
    const res = await h.lea.post('/api/aisles', { name, listId: h.shop });
    assert.equal(res.status, 409, name);
    assert.equal(res.body.error, 'Le rayon « Crèmerie » existe déjà : choisissez-le dans la liste.');
    assert.equal(res.body.existing.name, 'Crèmerie');
  }
  const first = await h.lea.post('/api/stores', { name: 'Leclerc  Drive' });
  assert.equal(first.status, 201);
  const twin = await h.lea.post('/api/stores', { name: 'LECLERC drive' });
  assert.deepEqual([twin.status, twin.body.existing], [409, { id: first.body.item.id, name: 'Leclerc Drive' }]);
  // Désactivé par l'Admin : refus, sans le réactiver, sans le proposer
  await h.guillaume.request('PATCH', `/api/admin/stores/${first.body.item.id}`, { active: false });
  const off = await h.lea.post('/api/stores', { name: 'leclerc drive' });
  assert.equal(off.status, 409);
  assert.equal(off.body.error, 'Le magasin « Leclerc Drive » existe déjà mais il est désactivé : demandez à l\'Admin de le réactiver.');
  assert.equal(off.body.existing, undefined);
  assert.equal(h.app.db.prepare('SELECT active FROM stores WHERE id = ?').pluck().get(first.body.item.id), 0);
  assert.deepEqual([h.count('stores'), h.count('aisles')], [before[0] + 1, before[1]]);
  // Nom vide ou trop long
  for (const name of ['', '   ', 'x'.repeat(101), 42]) assert.equal((await h.lea.post('/api/stores', { name })).status, 400, String(name));
});

test('renommer, désactiver, supprimer, regrouper et les catégories restent à l\'Admin (403)', async (t) => {
  const h = await household(t);
  const store = (await h.lea.post('/api/stores', { name: 'Biocoop' })).body.item;
  const aisle = (await h.lea.post('/api/aisles', { name: 'Vrac', listId: h.shop })).body.item;
  for (const [method, url, body] of [
    ['PATCH', `/api/admin/stores/${store.id}`, { name: 'Bio' }],
    ['PATCH', `/api/admin/stores/${store.id}`, { active: false }],
    ['DELETE', `/api/admin/stores/${store.id}`],
    ['PATCH', `/api/admin/aisles/${aisle.id}`, { name: 'Épicerie vrac' }],
    ['DELETE', `/api/admin/aisles/${aisle.id}`],
    ['POST', '/api/admin/categories', { name: 'Bricolage' }],
    ['POST', '/api/admin/stores', { name: 'Multi', isMulti: true }],
  ]) {
    assert.equal((await h.lea.request(method, url, body)).status, 403, `${method} ${url}`);
  }
  assert.equal((await h.lea.post('/api/categories', { name: 'Bricolage' })).status, 404, 'pas de création de catégorie hors Administration');
  assert.equal(h.app.db.prepare('SELECT name FROM stores WHERE id = ?').pluck().get(store.id), 'Biocoop');
  assert.equal(h.app.db.prepare('SELECT active FROM aisles WHERE id = ?').pluck().get(aisle.id), 1);
  // Un nouveau magasin est toujours simple (pas « multi »)
  assert.equal(h.app.db.prepare('SELECT is_multi FROM stores WHERE id = ?').pluck().get(store.id), 0);
});

test('lecture seule : pas de rayon depuis un article ; un magasin seulement pour ses propres listes', async (t) => {
  const h = await household(t);
  const before = [h.count('stores'), h.count('aisles')];
  const aisle = await h.paul.post('/api/aisles', { name: 'Non', listId: h.shop });
  assert.deepEqual([aisle.status, aisle.body.error], [403, READ_ONLY]);
  const store = await h.paul.post('/api/stores', { name: 'Non', listId: h.shop });
  assert.deepEqual([store.status, store.body.error], [403, READ_ONLY]);
  assert.deepEqual([h.count('stores'), h.count('aisles')], before, 'rien d\'écrit');
  // Pour une nouvelle liste (la sienne) : permis
  assert.equal((await h.paul.post('/api/stores', { name: 'Mon épicerie' })).status, 201);
  // Non-membre : « Liste introuvable » ; rayon sans liste ou hors courses : refusé
  assert.deepEqual((await h.zoe.post('/api/aisles', { name: 'X', listId: h.shop })).body.error, 'Liste introuvable.');
  assert.equal((await h.lea.post('/api/aisles', { name: 'X' })).status, 400);
  assert.equal((await h.lea.post('/api/aisles', { name: 'X', listId: h.tasks })).status, 400);
});

test('article d\'une liste « multi » : le nouveau magasin rejoint ses magasins regroupés et peut être choisi', async (t) => {
  const h = await household(t);
  const leclerc = (await h.guillaume.post('/api/admin/stores', { name: 'Leclerc' })).body.item;
  const multi = (await h.guillaume.post('/api/admin/stores', { name: 'Tournée', isMulti: true })).body.item;
  await h.guillaume.request('PATCH', `/api/admin/stores/${multi.id}`, { storeIds: [leclerc.id] });
  const listId = uuid();
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId, name: 'Tournée', listType: 'shopping', storeId: multi.id }] });
  await h.guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: [h.ids.lea], access: { [h.ids.lea]: 'modification' } });
  const made = (await h.lea.post('/api/stores', { name: 'Boulangerie Martin', listId })).body.item;
  const members = h.app.db.prepare('SELECT store_id FROM store_members WHERE multi_store_id = ? ORDER BY store_id').pluck().all(multi.id);
  assert.deepEqual(members, [leclerc.id, made.id]);
  assert.equal((await h.lea.post('/api/ops', { ops: [{ id: uuid(), type: 'item.create', listId, itemId: uuid(), name: 'Pain', storeId: made.id }] })).body.results[0].status, 200);
  // Rayon dans une liste « multi » : refusé (pas de rayon dans ces listes)
  assert.equal((await h.lea.post('/api/aisles', { name: 'Y', listId })).status, 400);
  // Magasin d'une liste de courses simple, ou d'une nouvelle liste : jamais regroupé
  const plain = (await h.lea.post('/api/stores', { name: 'Primeur', listId: h.shop })).body.item;
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM store_members WHERE store_id = ?').pluck().get(plain.id), 0);
});

test('fréquence : 20 créations par heure et par compte (429), les autres comptes non concernés', async (t) => {
  const h = await household(t);
  for (let i = 0; i < 20; i++) assert.equal((await h.lea.post('/api/stores', { name: `Magasin ${i}` })).status, 201);
  const res = await h.lea.post('/api/aisles', { name: 'Un de trop', listId: h.shop });
  assert.equal(res.status, 429);
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM aisles WHERE name = 'Un de trop'").pluck().get(), 0);
  assert.equal((await h.guillaume.post('/api/stores', { name: 'Autre compte' })).status, 201);
  // Un doublon refusé ne compte pas
  assert.equal((await h.paul.post('/api/stores', { name: 'magasin 3' })).status, 409);
});

test('écran : même feuille pour magasin et rayon, dernière ligne des choix, hors ligne, aucun focus', () => {
  const module = read('public/js/create-reference.js');
  assert.match(module, /store: \{ path: '\/api\/stores', title: 'Nouveau magasin', label: 'Libellé du magasin',[^\n]*offline: 'Connexion nécessaire pour créer un magasin' \}/);
  assert.match(module, /aisle: \{ path: '\/api\/aisles', title: 'Nouveau rayon', label: 'Libellé du rayon',[^\n]*offline: 'Connexion nécessaire pour créer un rayon' \}/);
  assert.match(module, /const input = h\('input', \{ class: 'input', \.\.\.LABEL_INPUT, maxlength: '100', placeholder: kind\.placeholder \}\);/);
  assert.match(module, /if \(!navigator\.onLine\) \{\s*toast\(kind\.offline\);\s*return Promise\.resolve\(undefined\);/);
  assert.match(module, /`Choisir « \$\{existing\.name\} »`/);
  assert.doesNotMatch(module, /innerHTML|\.focus\(|autofocus/);
  const list = read('public/js/screens/list.js');
  assert.match(list, /create: \{ kind: 'aisle', text: 'Nouveau rayon…' \}/);
  assert.match(list, /create: \{ kind: 'store', text: 'Nouveau magasin…' \}/);
  // Le nouvel élément est ajouté aux choix ET sélectionné (il reste à confirmer, rien n'est perdu)
  assert.match(list, /const made = await openCreateReference\(create\.kind, \{ listId \}\);\s*if \(!made\) return;/);
  assert.match(list, /selected = made\.id;\s*paint\(\);/);
  const form = read('public/js/screens/list-form.js');
  assert.match(form, /const made = await openCreateReference\('store'\);/);
  assert.match(form, /selected = made\.id;\s*paintRows\(\);/);
  assert.match(read('public/sw.js'), /'\/js\/create-reference\.js',/);
  // Feuille ouverte par-dessus un choix : elle passe au-dessus, fond grisé compris
  assert.match(read('public/js/ui.js'), /const below = host\.querySelectorAll\(':scope > \.scrim'\)\.length - 1;\s*if \(below > 0\) \{/);
});
