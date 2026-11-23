// Rayons propres à un magasin (décisions du 21 novembre 2026, migration 35,
// public/js/aisles.js) : migration, règle des noms, Administration (groupes,
// création, déplacement refusé avec le nombre de listes), création depuis
// une liste, rayons proposés (serveur, Claude, téléphone), changement de
// magasin d'une liste (même résultat sur le serveur et dans applyOp),
// feuille « Ranger les articles » (logique, et vérifications du code).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login, databaseAt, tempDir } from './helpers.js';
import { openDatabase, schemaVersion } from '../server/db.js';
import { aisleKey, aisleFits, offeredAisles, rematchAisle, aisleNameClash } from '../public/js/aisles.js';
import { askTidy, takeTidy, TIDY_DELAY } from '../public/js/tidy-aisles.js';
import { emptyState, loadSync, applyOp, aislesOfItems, itemsWithoutAisle, offeredAislesFor, usualAisleFor, computeListView } from '../public/js/store.js';
import { uuid as mcpUuid, PASSWORD, household as mcpHousehold, connect, claude, data } from './mcp-helpers.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const UNKNOWN_AISLE = 'Rayon inconnu ou désactivé.';

// --- Règles partagées (public/js/aisles.js) ---

test('règles partagées : rayons proposés, nom comparé, rayon retrouvé, noms en conflit', () => {
  const aisles = [
    { id: 1, name: 'Crèmerie', active: true, storeId: null },
    { id: 2, name: 'Drive', active: true, storeId: 10 },
    { id: 3, name: 'drive ', active: true, storeId: 20 },
    { id: 4, name: 'Promo', active: true, storeId: 10 },
    { id: 5, name: 'Vrac', active: false, storeId: 10 },
  ];
  assert.equal(aisleKey('  CRÈMERIE  '), aisleKey('cremerie'));
  assert.ok(aisleFits(aisles[0], null) && aisleFits(aisles[0], 10) && aisleFits(aisles[1], 10));
  assert.ok(!aisleFits(aisles[1], 20) && !aisleFits(aisles[1], null));
  assert.deepEqual(offeredAisles(aisles, 10).map((a) => a.id), [1, 2, 4], 'communs et du magasin, actifs');
  assert.deepEqual(offeredAisles(aisles, null).map((a) => a.id), [1], 'sans magasin : communs');
  // Rayon retrouvé : le sien s'il sert encore, sinon le même nom, sinon aucun
  assert.equal(rematchAisle(1, aisles, 20), 1);
  assert.equal(rematchAisle(5, aisles, 10), 5, 'un rayon désactivé de ce magasin est gardé');
  assert.equal(rematchAisle(2, aisles, 20), 3, 'même nom dans le nouveau magasin');
  assert.equal(rematchAisle(4, aisles, 20), null, 'aucun rayon de ce nom : « Sans rayon »');
  assert.equal(rematchAisle(2, aisles, null), null);
  assert.equal(rematchAisle(null, aisles, 10), null);
  assert.equal(rematchAisle(99, aisles, 10), 99, 'rayon inconnu de la copie : le serveur décide');
  // Noms : unique parmi ce qu'une liste voit
  assert.equal(aisleNameClash(aisles, 'Drive', 30), null, 'même nom dans un troisième magasin : permis');
  assert.equal(aisleNameClash(aisles, 'DRIVE', 10)?.id, 2, 'même magasin');
  assert.equal(aisleNameClash(aisles, 'cremerie', 10)?.id, 1, 'nom d\'un rayon commun');
  assert.equal(aisleNameClash(aisles, 'Promo', null)?.id, 4, 'commun : aucun magasin ne doit l\'avoir');
  assert.equal(aisleNameClash(aisles, 'Drive', 10, 2), null, 'le rayon lui-même ne compte pas');
});

// --- Migration 35 ---

test('migration 35 : rayons existants communs, mêmes identifiants, liens intacts, même nom permis dans deux magasins', (t) => {
  const file = path.join(tempDir(t), 'listo.db');
  const old = databaseAt(file, 34);
  old.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('a', 'A', 'x')").run();
  old.prepare("INSERT INTO lists (id, name, type, store_id, owner_id) VALUES ('l1', 'Courses', 'shopping', 1, 1)").run();
  const cremerie = old.prepare("SELECT id FROM aisles WHERE name = 'Crèmerie'").pluck().get();
  old.prepare("INSERT INTO items (id, list_id, name, aisle_id, created_by) VALUES ('i1', 'l1', 'Lait', ?, 1)").run(cremerie);
  old.prepare("INSERT INTO item_history (name_normalized, display_name, aisle_id) VALUES ('lait', 'Lait', ?)").run(cremerie);
  old.prepare("UPDATE aisles SET active = 0 WHERE name = 'Surgelés'").run();
  const before = old.prepare('SELECT id, name, active FROM aisles ORDER BY id').all();
  old.close();

  const db = openDatabase(file);
  t.after(() => db.close());
  assert.equal(schemaVersion(db), 37);
  assert.deepEqual(db.prepare('SELECT id, name, active FROM aisles ORDER BY id').all(), before, 'mêmes rayons, mêmes identifiants');
  assert.equal(db.prepare('SELECT COUNT(*) FROM aisles WHERE store_id IS NOT NULL').pluck().get(), 0, 'tous communs');
  assert.equal(db.prepare("SELECT aisle_id FROM items WHERE id = 'i1'").pluck().get(), cremerie);
  assert.equal(db.prepare("SELECT aisle_id FROM item_history WHERE name_normalized = 'lait'").pluck().get(), cremerie);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.doesNotMatch(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'aisles'").pluck().get(), /UNIQUE/);
  // Les clés étrangères marchent toujours
  assert.throws(() => db.prepare('DELETE FROM aisles WHERE id = ?').run(cremerie), /FOREIGN KEY/);
  assert.throws(() => db.prepare("UPDATE items SET aisle_id = 9999 WHERE id = 'i1'").run(), /FOREIGN KEY/);
  assert.throws(() => db.prepare('INSERT INTO aisles (name, store_id) VALUES (?, 9999)').run('X'), /FOREIGN KEY/);
  // Même nom dans deux magasins : permis ; deux fois au même endroit : refusé (filet de la base)
  db.prepare('INSERT INTO aisles (name, store_id) VALUES (?, 1)').run('Drive');
  db.prepare('INSERT INTO aisles (name, store_id) VALUES (?, 2)').run('Drive');
  assert.throws(() => db.prepare('INSERT INTO aisles (name, store_id) VALUES (?, 1)').run('DRIVE'), /UNIQUE/);
  assert.throws(() => db.prepare('INSERT INTO aisles (name) VALUES (?)').run('crèmerie'), /UNIQUE/);
  // Un magasin qui a des rayons ne s'efface pas
  assert.throws(() => db.prepare('DELETE FROM stores WHERE id = 1').run(), /FOREIGN KEY/);
});

// --- Foyer de test ---
//
// Guillaume (Admin) ; Léa « Peut modifier » ; Paul « Lecture seule ».
// Magasins de la migration 3 : Carrefour, E.Leclerc, Lidl ; rayons communs
// (Boissons, Boucherie, Crèmerie…). « Drive » chez Carrefour et chez Lidl,
// « Promo » chez Carrefour seulement. Listes : « Carrefour » (magasin
// Carrefour), « Sans magasin », « Lidl ».
async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const ids = {};
  const clients = { guillaume };
  for (const name of ['lea', 'paul']) {
    ids[name] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    clients[name] = app.client();
    await login(clients[name], name, `MotDePasse-${name}`);
  }
  const store = (name) => app.db.prepare('SELECT id FROM stores WHERE name = ?').pluck().get(name);
  const aisle = (name, storeId = null) => app.db.prepare('SELECT id FROM aisles WHERE name = ? AND store_id IS ?').pluck().get(name, storeId);
  const stores = { carrefour: store('Carrefour'), leclerc: store('E.Leclerc'), lidl: store('Lidl') };
  const add = async (name, storeId) => {
    const res = await guillaume.post('/api/admin/aisles', { name, storeId });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.item.id;
  };
  const a = {
    cremerie: aisle('Crèmerie'),
    driveCarrefour: await add('Drive', stores.carrefour),
    driveLidl: await add('Drive', stores.lidl),
    promo: await add('Promo', stores.carrefour),
  };
  const lists = { carrefour: uuid(), none: uuid(), lidl: uuid() };
  const ops = (client, list) => client.post('/api/ops', { ops: list.map((op) => ({ id: uuid(), ...op })) });
  await ops(guillaume, [
    { type: 'list.create', listId: lists.carrefour, name: 'Carrefour', listType: 'shopping', storeId: stores.carrefour },
    { type: 'list.create', listId: lists.none, name: 'Sans magasin', listType: 'shopping' },
    { type: 'list.create', listId: lists.lidl, name: 'Lidl', listType: 'shopping', storeId: stores.lidl },
  ]);
  for (const listId of Object.values(lists)) {
    await guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: [ids.lea, ids.paul], access: { [ids.lea]: 'modification', [ids.paul]: 'lecture' } });
  }
  return { app, ...clients, ids, stores, a, lists, ops, aisle };
}

// --- Administration ---

test('Administration : rayons avec leur magasin, magasins simples ; règle des noms ; magasin invalide ; réservé à l\'Admin', async (t) => {
  const h = await household(t);
  const list = (await h.guillaume.get('/api/admin/aisles')).body;
  assert.equal(list.items.find((i) => i.id === h.a.driveCarrefour).storeId, h.stores.carrefour);
  assert.equal(list.items.find((i) => i.id === h.a.cremerie).storeId, null);
  assert.deepEqual(list.stores.map((s) => s.name), ['Carrefour', 'E.Leclerc', 'Lidl'], 'magasins simples, ordre alphabétique');
  // Magasin « multi » : jamais de rayon
  const multi = (await h.guillaume.post('/api/admin/stores', { name: 'Tournée', isMulti: true })).body.item.id;
  assert.ok(!(await h.guillaume.get('/api/admin/aisles')).body.stores.some((s) => s.id === multi));
  for (const storeId of [multi, 9999, 'abc', 0]) {
    const res = await h.guillaume.post('/api/admin/aisles', { name: 'Essai', storeId });
    assert.equal(res.status, 400, String(storeId));
    assert.match(res.body.error, /Magasin invalide/);
  }
  // Noms : même magasin, nom d'un rayon commun, rayon commun au nom d'un rayon de magasin
  const refused = [
    [{ name: 'drive', storeId: h.stores.carrefour }, 'Le magasin Carrefour a déjà un rayon de ce nom.'],
    [{ name: 'CRÈMERIE', storeId: h.stores.lidl }, 'Un rayon de « Tous les magasins » porte déjà ce nom.'],
    [{ name: 'Promo' }, 'Le magasin Carrefour a déjà un rayon de ce nom : un rayon de « Tous les magasins » ne peut pas porter le même.'],
    [{ name: 'Crèmerie', storeId: null }, 'Un rayon de « Tous les magasins » porte déjà ce nom.'],
  ];
  for (const [body, error] of refused) {
    const res = await h.guillaume.post('/api/admin/aisles', body);
    assert.equal(res.status, 409, JSON.stringify(body));
    assert.equal(res.body.error, error);
  }
  assert.equal((await h.guillaume.post('/api/admin/aisles', { name: 'Promo', storeId: h.stores.lidl })).status, 201, 'même nom, autre magasin');
  // Renommer dans le même magasin vers un nom pris : refusé
  const rename = await h.guillaume.request('PATCH', `/api/admin/aisles/${h.a.promo}`, { name: 'Drive' });
  assert.equal(rename.status, 409);
  // Réservé à l'Admin (Léa, même « Peut modifier » sur des listes)
  assert.equal((await h.lea.get('/api/admin/aisles')).status, 403);
  assert.equal((await h.lea.post('/api/admin/aisles', { name: 'X', storeId: h.stores.carrefour })).status, 403);
  assert.equal((await h.lea.request('PATCH', `/api/admin/aisles/${h.a.promo}`, { storeId: null })).status, 403);
  assert.equal(h.app.db.prepare('SELECT store_id FROM aisles WHERE id = ?').pluck().get(h.a.promo), h.stores.carrefour);
  // Un magasin qui a des rayons est « utilisé » : il ne se supprime pas
  const leclercAisle = (await h.guillaume.post('/api/admin/aisles', { name: 'Cave', storeId: h.stores.leclerc })).body.item.id;
  assert.ok((await h.guillaume.get('/api/admin/stores')).body.items.find((s) => s.id === h.stores.leclerc).inUse);
  assert.equal((await h.guillaume.del(`/api/admin/stores/${h.stores.leclerc}`)).status, 409);
  assert.equal((await h.guillaume.del(`/api/admin/aisles/${leclercAisle}`)).status, 204);
});

test('Administration : changer un rayon de magasin ; refusé avec le nombre de listes qui s\'en servent ailleurs ; vers « Tous les magasins » toujours', async (t) => {
  const h = await household(t);
  const move = (id, storeId) => h.guillaume.request('PATCH', `/api/admin/aisles/${id}`, { storeId });
  // Crèmerie (commune) utilisée dans la liste sans magasin et dans la liste Lidl
  await h.ops(h.guillaume, [
    { type: 'item.create', listId: h.lists.none, itemId: uuid(), name: 'Lait', aisleId: h.a.cremerie },
    { type: 'item.create', listId: h.lists.lidl, itemId: uuid(), name: 'Beurre', aisleId: h.a.cremerie },
    { type: 'item.create', listId: h.lists.carrefour, itemId: uuid(), name: 'Crème', aisleId: h.a.cremerie },
  ]);
  const refused = await move(h.a.cremerie, h.stores.carrefour);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error, 'Ce rayon sert dans 2 listes d\'autres magasins ou sans magasin : il ne peut pas aller dans Carrefour. Choisissez « Tous les magasins », ou changez d\'abord le rayon de ces articles.');
  assert.equal(h.app.db.prepare('SELECT store_id FROM aisles WHERE id = ?').pluck().get(h.a.cremerie), null, 'rien n\'a changé');
  // En anglais, même règle
  h.app.db.prepare("UPDATE users SET locale = 'en' WHERE username = 'guillaume'").run();
  assert.match((await move(h.a.cremerie, h.stores.carrefour)).body.error, /^This aisle is used in 2 lists from other stores or without a store: it can't go to Carrefour\./);
  h.app.db.prepare("UPDATE users SET locale = NULL WHERE username = 'guillaume'").run();
  // Une seule liste ailleurs : le singulier
  const promoItem = uuid();
  await h.ops(h.guillaume, [{ type: 'item.create', listId: h.lists.carrefour, itemId: promoItem, name: 'Chips', aisleId: h.a.promo }]);
  assert.equal((await move(h.a.promo, h.stores.lidl)).body.error, 'Ce rayon sert dans 1 liste d\'un autre magasin ou sans magasin : il ne peut pas aller dans Lidl. Choisissez « Tous les magasins », ou changez d\'abord le rayon de ces articles.');
  // Vers « Tous les magasins » : permis (le nom est libre), l'article garde son rayon
  const toCommon = await move(h.a.promo, null);
  assert.equal(toCommon.status, 200, JSON.stringify(toCommon.body));
  assert.equal(toCommon.body.item.storeId, null);
  assert.equal(h.app.db.prepare('SELECT aisle_id FROM items WHERE id = ?').pluck().get(promoItem), h.a.promo);
  assert.ok(h.app.logs.some((line) => line.includes('admin_aisle_moved') && line.includes('Carrefour') && line.includes('all')));
  // Puis vers Carrefour : seule la liste Carrefour s'en sert, permis
  assert.equal((await move(h.a.promo, h.stores.carrefour)).status, 200);
  // Vers « Tous les magasins » avec un nom pris par un autre magasin : refusé
  const refusedName = await move(h.a.driveCarrefour, null);
  assert.equal(refusedName.status, 409);
  assert.match(refusedName.body.error, /Le magasin Lidl a déjà un rayon de ce nom/);
  // Un rayon jamais utilisé va où l'on veut ; magasin « multi » refusé
  const free = (await h.guillaume.post('/api/admin/aisles', { name: 'Fleurs' })).body.item.id;
  assert.equal((await move(free, h.stores.lidl)).status, 200);
  const multi = (await h.guillaume.post('/api/admin/stores', { name: 'Tournée', isMulti: true })).body.item.id;
  assert.equal((await move(free, multi)).status, 400);
  // Une liste supprimée, ou « multi », ne bloque pas
  await h.ops(h.guillaume, [{ type: 'list.delete', listId: h.lists.none }]);
  await h.ops(h.guillaume, [{ type: 'list.update', listId: h.lists.lidl, storeId: multi }]);
  assert.equal((await move(h.a.cremerie, h.stores.carrefour)).status, 200);
});

// --- Création depuis une liste ---

test('« Nouveau rayon… » depuis une liste : rayon du magasin de la liste, ou commun ; noms ; droits inchangés', async (t) => {
  const h = await household(t);
  const create = (client, listId, name) => client.post('/api/aisles', { name, listId });
  const fromStore = await create(h.lea, h.lists.carrefour, 'Bio');
  assert.equal(fromStore.status, 201, JSON.stringify(fromStore.body));
  assert.equal(fromStore.body.item.storeId, h.stores.carrefour);
  assert.equal(h.app.db.prepare('SELECT store_id FROM aisles WHERE id = ?').pluck().get(fromStore.body.item.id), h.stores.carrefour);
  const common = await create(h.lea, h.lists.none, 'Animalerie');
  assert.equal(common.status, 201);
  assert.equal(common.body.item.storeId, null);
  // Même nom dans un autre magasin : un nouveau rayon, distinct
  const other = await create(h.lea, h.lists.lidl, 'Bio');
  assert.equal(other.status, 201);
  assert.notEqual(other.body.item.id, fromStore.body.item.id);
  // Nom visible par la liste : proposé tel quel (le même que dans l'Administration)
  const twin = await create(h.lea, h.lists.carrefour, 'drive');
  assert.equal(twin.status, 409);
  assert.deepEqual(twin.body.existing, { id: h.a.driveCarrefour, name: 'Drive' });
  const commonTwin = await create(h.lea, h.lists.lidl, 'Animalerie');
  assert.equal(commonTwin.status, 409);
  assert.equal(commonTwin.body.existing.id, common.body.item.id);
  // Liste sans magasin, nom d'un rayon d'un magasin : refusé, sans proposition
  const elsewhere = await create(h.lea, h.lists.none, 'Promo');
  assert.equal(elsewhere.status, 409);
  assert.equal(elsewhere.body.existing, undefined);
  assert.match(elsewhere.body.error, /Le magasin Carrefour a déjà un rayon « Promo »/);
  // Droits : lecture seule 403, non-membre 404 (comme avant)
  assert.equal((await create(h.paul, h.lists.carrefour, 'Vrac')).status, 403);
  const zoe = await addUser(h.app.db, { username: 'zoe', password: 'MotDePasse-zoe' });
  assert.ok(zoe);
  const zoeClient = h.app.client();
  await login(zoeClient, 'zoe', 'MotDePasse-zoe');
  assert.equal((await create(zoeClient, h.lists.carrefour, 'Vrac')).status, 404);
});

// --- Rayons proposés : vérifiés par le serveur ---

test('serveur : seul un rayon proposé à la liste est accepté (ajout et modification) ; synchronisation avec le magasin de chaque rayon', async (t) => {
  const h = await household(t);
  const results = async (client, list) => (await h.ops(client, list)).body.results;
  const item = uuid();
  // Ajout : rayon d'un autre magasin, ou d'un magasin dans une liste sans magasin : refusé
  for (const [listId, aisleId] of [[h.lists.carrefour, h.a.driveLidl], [h.lists.none, h.a.driveCarrefour], [h.lists.lidl, h.a.promo]]) {
    const [res] = await results(h.lea, [{ type: 'item.create', listId, itemId: uuid(), name: 'Essai', aisleId }]);
    assert.equal(res.error, UNKNOWN_AISLE, `${listId} ${aisleId}`);
  }
  // Rayon du magasin, ou commun : accepté
  const ok = await results(h.lea, [
    { type: 'item.create', listId: h.lists.carrefour, itemId: item, name: 'Courses drive', aisleId: h.a.driveCarrefour },
    { type: 'item.create', listId: h.lists.none, itemId: uuid(), name: 'Yaourts', aisleId: h.a.cremerie },
  ]);
  assert.ok(ok.every((r) => !r.error), JSON.stringify(ok));
  // Modification : même règle
  const [moved] = await results(h.lea, [{ type: 'item.update', itemId: item, aisleId: h.a.driveLidl }]);
  assert.equal(moved.error, UNKNOWN_AISLE);
  const [promo] = await results(h.lea, [{ type: 'item.update', itemId: item, aisleId: h.a.promo }]);
  assert.ok(!promo.error);
  // Synchronisation : chaque rayon avec son magasin
  const sync = (await h.paul.get('/api/sync')).body;
  assert.equal(sync.aisles.find((a) => a.id === h.a.driveLidl).storeId, h.stores.lidl);
  assert.equal(sync.aisles.find((a) => a.id === h.a.cremerie).storeId, null);
  // Rayon habituel : seulement s'il est proposé (« Courses drive » est au
  // rayon Promo de Carrefour ; ajouté chez Lidl : sans rayon)
  const lidlItem = uuid();
  await results(h.lea, [{ type: 'item.create', listId: h.lists.lidl, itemId: lidlItem, name: 'courses DRIVE' }]);
  assert.equal(h.app.db.prepare('SELECT aisle_id FROM items WHERE id = ?').pluck().get(lidlItem), null);
  const again = uuid();
  await results(h.lea, [{ type: 'item.create', listId: h.lists.carrefour, itemId: again, name: 'Courses Drive' }]);
  assert.equal(h.app.db.prepare('SELECT aisle_id FROM items WHERE id = ?').pluck().get(again), h.a.promo, 'dans son magasin, le rayon habituel revient');
  // Suggestions d'une liste : le rayon n'est donné que s'il est proposé
  const suggest = async (listId) => (await h.lea.get(`/api/suggestions?q=courses&listId=${listId}`)).body.suggestions[0];
  assert.equal((await suggest(h.lists.carrefour)).aisleId, h.a.promo);
  assert.equal((await suggest(h.lists.lidl)).aisleId, null);
});

// --- Changement de magasin : serveur et téléphone ---

test('changement de magasin : même nom retrouvé, sinon « Sans rayon » ; « multi » sans effet sur les rayons ; même résultat dans applyOp', async (t) => {
  const h = await household(t);
  const it = { commun: uuid(), drive: uuid(), promo: uuid(), vide: uuid() };
  await h.ops(h.guillaume, [
    { type: 'item.create', listId: h.lists.carrefour, itemId: it.commun, name: 'Lait', aisleId: h.a.cremerie },
    { type: 'item.create', listId: h.lists.carrefour, itemId: it.drive, name: 'Retrait', aisleId: h.a.driveCarrefour },
    { type: 'item.create', listId: h.lists.carrefour, itemId: it.promo, name: 'Chips', aisleId: h.a.promo },
    { type: 'item.create', listId: h.lists.carrefour, itemId: it.vide, name: 'Inconnu', aisleId: null },
  ]);
  const user = { id: h.app.db.prepare("SELECT id FROM users WHERE username = 'guillaume'").pluck().get(), username: 'guillaume', displayName: 'Guillaume' };
  const server = () => Object.fromEntries(Object.entries(it).map(([k, id]) => [k, h.app.db.prepare('SELECT aisle_id FROM items WHERE id = ?').pluck().get(id)]));
  // Téléphone : copie prise avant le changement, opération appliquée localement
  const phone = async (op) => {
    const state = loadSync(emptyState(), (await h.guillaume.get('/api/sync')).body);
    state.history = state.history ?? [];
    const before = aislesOfItems(state, op.listId);
    applyOp(state, op, { user, now: new Date().toISOString() });
    const local = Object.fromEntries(Object.entries(it).map(([k, id]) => [k, state.items.get(id)?.aisleId ?? null]));
    const had = Object.keys(it).filter((k) => before.get(it[k]) !== null);
    return { local, had, lost: itemsWithoutAisle(state, op.listId, before).map((i) => i.name), state };
  };
  const change = async (storeId) => {
    const op = { type: 'list.update', listId: h.lists.carrefour, storeId };
    const mirror = await phone(op);
    const [res] = (await h.ops(h.guillaume, [op])).body.results;
    assert.ok(!res.error, res.error);
    // Seuls les articles qui avaient un rayon sont comparés (un article déjà
    // sans rayon peut recevoir son rayon habituel du serveur, comme avant)
    const expected = server();
    assert.ok(mirror.had.length);
    for (const key of mirror.had) assert.equal(mirror.local[key], expected[key], `${key} : serveur et téléphone`);
    return { ...mirror, expected };
  };

  // Carrefour -> Lidl : commun gardé, Drive retrouvé chez Lidl, Promo sans rayon
  let step = await change(h.stores.lidl);
  assert.deepEqual([step.expected.commun, step.expected.drive, step.expected.promo], [h.a.cremerie, h.a.driveLidl, null]);
  assert.deepEqual(step.lost, ['Chips'], 'à ranger : seulement ce qui a perdu son rayon');
  // L'historique ne change pas
  assert.equal(h.app.db.prepare("SELECT aisle_id FROM item_history WHERE name_normalized = 'chips' AND store_id IS NULL").pluck().get(), h.a.promo);
  // Lidl -> aucun magasin : Drive (de Lidl) n'a pas d'équivalent commun
  step = await change(null);
  assert.deepEqual([step.expected.commun, step.expected.drive], [h.a.cremerie, null]);
  assert.deepEqual(step.lost, ['Retrait']);
  // Aucun -> magasin « multi » : les rayons ne bougent pas (cachés)
  const multi = (await h.guillaume.post('/api/admin/stores', { name: 'Tournée', isMulti: true })).body.item.id;
  step = await change(multi);
  assert.equal(step.expected.commun, h.a.cremerie);
  assert.deepEqual(step.lost, []);
  // Multi -> Carrefour : rien à ranger de plus
  step = await change(h.stores.carrefour);
  assert.equal(step.expected.commun, h.a.cremerie);
  // Les autres membres reçoivent le résultat par la synchronisation
  const lea = (await h.lea.get('/api/sync')).body.items.find((i) => i.id === it.commun);
  assert.equal(lea.aisleId, h.a.cremerie);
});

test('retour au type « Courses » : les articles sont rangés de nouveau (même règle, serveur et téléphone)', async (t) => {
  const h = await household(t);
  const item = uuid();
  await h.ops(h.guillaume, [
    { type: 'item.create', listId: h.lists.carrefour, itemId: item, name: 'Chips', aisleId: h.a.promo },
    { type: 'list.update', listId: h.lists.carrefour, listType: 'tasks' },
  ]);
  // Pendant que la liste est une liste de tâches, Promo devient un rayon de Lidl
  assert.equal((await h.guillaume.request('PATCH', `/api/admin/aisles/${h.a.promo}`, { storeId: h.stores.lidl })).status, 200);
  const state = loadSync(emptyState(), (await h.guillaume.get('/api/sync')).body);
  const op = { type: 'list.update', listId: h.lists.carrefour, listType: 'shopping' };
  applyOp(state, op, { user: { id: 1 }, now: new Date().toISOString() });
  await h.ops(h.guillaume, [op]);
  assert.equal(h.app.db.prepare('SELECT aisle_id FROM items WHERE id = ?').pluck().get(item), null);
  assert.equal(state.items.get(item).aisleId, null);
});

// --- Téléphone : rayons proposés, groupes ---

test('téléphone : rayons proposés et groupes d\'une liste selon son magasin', () => {
  const state = emptyState();
  state.aisles = [
    { id: 1, name: 'Crèmerie', active: true, storeId: null },
    { id: 2, name: 'Drive', active: true, storeId: 10 },
    { id: 3, name: 'Drive', active: true, storeId: 20 },
    { id: 4, name: 'Ancien', active: false, storeId: 10 },
  ];
  state.stores = [{ id: 10, name: 'Carrefour', active: true, isMulti: false }, { id: 20, name: 'Lidl', active: true, isMulti: false }, { id: 30, name: 'Tournée', active: true, isMulti: true, storeIds: [10, 20] }];
  const list = { id: 'l', name: 'Courses', type: 'shopping', store: { id: 10, name: 'Carrefour', isMulti: false }, members: [] };
  state.lists.set('l', list);
  state.listIds.add('l');
  assert.deepEqual(offeredAislesFor(state, list).map((a) => a.id), [1, 2]);
  assert.deepEqual(offeredAislesFor(state, { ...list, store: null }).map((a) => a.id), [1]);
  assert.deepEqual(offeredAislesFor(state, { ...list, store: { id: 30, isMulti: true } }), []);
  assert.deepEqual(offeredAislesFor(state, { ...list, type: 'tasks' }), []);
  // Rayon habituel : seulement s'il est proposé
  state.history = [{ name: 'Retrait', nameNormalized: 'retrait', storeId: null, aisleId: 3, useCount: 1, lastUsedAt: '2026-11-01' }];
  assert.equal(usualAisleFor(state, list, 'Retrait'), null, 'rayon de Lidl dans une liste Carrefour');
  assert.equal(usualAisleFor(state, { ...list, store: { id: 20 } }, 'Retrait'), 3);
  // Groupes : un article au rayon d'un autre magasin (ne devrait pas arriver) va dans « Sans rayon »
  for (const [id, aisleId] of [['a', 2], ['b', 3], ['c', 4]]) state.items.set(id, { id, listId: 'l', name: id, aisleId, checked: false });
  const groups = computeListView(state, 'l').groups.map((g) => [g.aisle?.name ?? null, g.items.map((i) => i.id)]);
  assert.deepEqual(groups, [['Ancien', ['c']], ['Drive', ['a']], [null, ['b']]]);
});

// --- Feuille « Ranger les articles » ---

test('« Ranger les articles » : proposition reprise une seule fois, oubliée après 10 minutes ; vérifications du code', () => {
  askTidy('l1', ['a', 'b'], 1000);
  assert.deepEqual(takeTidy('l1', 2000), ['a', 'b']);
  assert.deepEqual(takeTidy('l1', 2000), [], 'une seule fois');
  askTidy('l2', ['a'], 0);
  assert.deepEqual(takeTidy('l2', TIDY_DELAY + 1), [], 'trop ancienne');
  askTidy('l3', ['a'], 0);
  askTidy('l3', [], 0);
  assert.deepEqual(takeTidy('l3', 1), [], 'rien à ranger : rien de noté');

  const form = read('public/js/screens/list-form.js');
  // Le formulaire note les articles qui perdent leur rayon, juste après l'enregistrement
  assert.match(form, /const aislesBefore = aislesOfItems\(app\.data, id\);\s*if \(Object\.keys\(switches\)\.length\) await actions\.updateList\(id, switches\);\s*if \(shopping\) askTidy\(id, itemsWithoutAisle\(app\.data, id, aislesBefore\)\.map\(\(item\) => item\.id\)\);/);
  const list = read('public/js/screens/list.js');
  // L'écran de la liste reprend la proposition : jamais en lecture seule, ni hors courses à magasin simple
  assert.match(list, /const toTidy = takeTidy\(listId\);/);
  assert.match(list, /if \(view && canEditList\(view\.list\) && isShoppingList\(view\.list\) && !view\.multi\) openTidySheet\(toTidy\);/);
  // Chaque choix : une modification ordinaire de l'article (file d'attente, hors ligne compris)
  const sheet = list.slice(list.indexOf('function openTidySheet'), list.indexOf('// Nom d\'un magasin (null si inconnu)'));
  assert.match(sheet, /await actions\.updateItem\(now, \{ aisleId: chosen \}\);/);
  assert.match(sheet, /pickAisle\(\{ title: t\('liste\.ranger\.rayonDe'/);
  assert.match(sheet, /t\('liste\.ranger\.termine'\)/);
  assert.match(sheet, /if \(!latest \|\| !editable\(\)\) return;/);
  // Les choix du rayon d'un article ne proposent que les rayons de la liste
  assert.match(list, /const aisles = offeredAislesFor\(app\.data, view\.list\);/);
  // Service worker : les deux nouveaux fichiers sont gardés hors ligne
  const sw = read('public/sw.js');
  for (const file of ['/js/aisles.js', '/js/tidy-aisles.js']) assert.ok(sw.includes(`'${file}'`), file);
  // Administration : rayons groupés par magasin, déplacement par une feuille de choix
  const admin = read('public/js/screens/admin.js');
  assert.match(admin, /function drawAisles\(/);
  assert.match(admin, /await patch\(`\/api\/admin\/aisles\/\$\{aisle\.id\}`, \{ storeId: chosen \}\);/);
  assert.match(admin, /await post\('\/api\/admin\/aisles', \{ name, storeId: place \}\);/);
});

// --- Claude ---

test('Claude : list.aisles ne donne que les rayons proposés ; un rayon d\'un autre magasin refuse tout l\'appel', async (t) => {
  const h = await mcpHousehold(t);
  const c = claude(h, (await connect(h, h.guillaume, PASSWORD, { scope: 'write' })).access_token);
  const carrefour = h.app.db.prepare("SELECT id FROM stores WHERE name = 'Carrefour'").pluck().get();
  const lidl = h.app.db.prepare("SELECT id FROM stores WHERE name = 'Lidl'").pluck().get();
  for (const [name, storeId] of [['Drive', carrefour], ['Vrac', lidl]]) {
    assert.equal((await h.guillaume.post('/api/admin/aisles', { name, storeId })).status, 201);
  }
  const ops = (list) => h.guillaume.post('/api/ops', { ops: list.map((op) => ({ id: mcpUuid(), ...op })) });
  await ops([{ type: 'list.update', listId: h.ids.courses, storeId: carrefour }]);
  const aisles = data(await c.tool('read_list', { list_id: h.ids.courses })).list.aisles;
  assert.ok(aisles.includes('Drive') && aisles.includes('Crèmerie'));
  assert.ok(!aisles.includes('Vrac'), 'rayon de Lidl : absent');
  const before = h.app.db.prepare('SELECT COUNT(*) FROM items').pluck().get();
  const res = await c.tool('add_items', { list_id: h.ids.courses, items: [{ name: 'Tomates', aisle: 'Crèmerie' }, { name: 'Riz', aisle: 'vrac' }] });
  assert.match(res.body.result.content[0].text, /^Rayon inconnu, désactivé ou que cette liste ne propose pas : « vrac »\. Rayons disponibles : .*Drive/);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM items').pluck().get(), before, 'rien n\'a été écrit');
  const ok = data(await c.tool('add_items', { list_id: h.ids.courses, items: [{ name: 'Retrait', aisle: 'drive' }] }));
  assert.equal(ok.results[0].aisle, 'Drive');
  const update = await c.tool('update_items', { list_id: h.ids.courses, items: [{ id: ok.results[0].id, aisle: 'Vrac' }] });
  assert.ok(update.body.result.isError);
  // Liste sans magasin : les rayons communs seulement
  await ops([{ type: 'list.update', listId: h.ids.courses, storeId: null }]);
  assert.ok(!data(await c.tool('read_list', { list_id: h.ids.courses })).list.aisles.includes('Drive'));
});

// --- Administration › Articles ---

test('Administration › Articles : un rayon de magasin ne change que la ligne de ce magasin ; un rayon commun, toutes', async (t) => {
  const h = await household(t);
  await h.ops(h.guillaume, [
    { type: 'item.create', listId: h.lists.lidl, itemId: uuid(), name: 'Pain', aisleId: h.a.driveLidl },
  ]);
  const lines = () => h.app.db.prepare("SELECT store_id, aisle_id FROM item_history WHERE name_normalized = 'pain' ORDER BY IFNULL(store_id, 0)").all();
  assert.deepEqual(lines(), [{ store_id: null, aisle_id: h.a.driveLidl }, { store_id: h.stores.lidl, aisle_id: h.a.driveLidl }]);
  // Rayon de Carrefour : une ligne Carrefour est créée, les autres gardent le leur
  const store = await h.guillaume.post('/api/admin/names/aisle', { from: 'pain', aisleId: h.a.driveCarrefour });
  assert.equal(store.status, 200, JSON.stringify(store.body));
  assert.deepEqual(lines(), [
    { store_id: null, aisle_id: h.a.driveLidl },
    { store_id: h.stores.carrefour, aisle_id: h.a.driveCarrefour },
    { store_id: h.stores.lidl, aisle_id: h.a.driveLidl },
  ]);
  assert.equal(h.app.db.prepare("SELECT use_count FROM item_history WHERE name_normalized = 'pain' AND store_id = ?").pluck().get(h.stores.carrefour), 0, 'aucun achat compté');
  // Ajouté chez Carrefour : son rayon Drive de Carrefour
  const item = uuid();
  await h.ops(h.lea, [{ type: 'item.create', listId: h.lists.carrefour, itemId: item, name: 'pain' }]);
  assert.equal(h.app.db.prepare('SELECT aisle_id FROM items WHERE id = ?').pluck().get(item), h.a.driveCarrefour);
  // Rayon commun : toutes les lignes, comme avant
  await h.guillaume.post('/api/admin/names/aisle', { from: 'pain', aisleId: h.a.cremerie });
  assert.ok(lines().every((line) => line.aisle_id === h.a.cremerie));
});
