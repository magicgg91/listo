// Tests du magasin « multi » (étape 6) : administration, droits et
// validations côté serveur, magasin automatique, tri par magasin, changement
// de magasin d'une liste, absence de régression sur une liste à magasin
// simple, migration d'une base existante.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import Database from 'better-sqlite3';
import { startTestApp, setupAdmin, addUser, login, tempDir } from './helpers.js';
import { openDatabase, MIGRATIONS, schemaVersion } from '../server/db.js';

const uuid = () => crypto.randomUUID();

// Prépare : Admin « guillaume » et Utilisatrice « marie », connectés ;
// magasins simples Boucherie, Fromagerie, Primeur, Leclerc ; magasin « multi »
// « Centre-ville » qui regroupe les trois premiers.
async function town(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const marieId = await addUser(app.db, { username: 'marie', password: 'MotDePasse-marie' });
  const marie = app.client();
  await login(marie, 'marie', 'MotDePasse-marie');

  const addStore = async (name, isMulti = false) => {
    const res = await guillaume.post('/api/admin/stores', { name, isMulti });
    assert.equal(res.status, 201, res.text);
    return res.body.item.id;
  };
  const s = {
    boucherie: await addStore('Boucherie'),
    fromagerie: await addStore('Fromagerie'),
    primeur: await addStore('Primeur'),
    leclerc: await addStore('Leclerc'),
    centre: await addStore('Centre-ville', true),
  };
  const regroup = (id, storeIds) => guillaume.request('PATCH', `/api/admin/stores/${id}`, { storeIds });
  assert.equal((await regroup(s.centre, [s.boucherie, s.fromagerie, s.primeur])).status, 200);

  const ref = (table, name) => app.db.prepare(`SELECT id FROM ${table} WHERE name = ?`).pluck().get(name);
  return { app, guillaume, marie, marieId, s, regroup, ref, COURSES: ref('categories', 'Courses'), TACHES: ref('categories', 'Tâches') };
}

// Envoie une opération et renvoie son résultat (status, error, item…)
async function op(client, operation) {
  const res = await client.post('/api/ops', { ops: [{ id: uuid(), ...operation }] });
  assert.equal(res.status, 200, res.text);
  return res.body.results[0];
}

async function ok(client, operation) {
  const result = await op(client, operation);
  assert.equal(result.status, 200, `${operation.type} : ${result.error}`);
  return result;
}

async function createList(h, client, fields = {}) {
  const listId = uuid();
  await ok(client, { type: 'list.create', listId, name: 'Courses du centre-ville', listType: 'shopping', storeId: h.s.centre, ...fields });
  return listId;
}

async function addItem(client, listId, name, fields = {}) {
  return (await ok(client, { type: 'item.create', listId, itemId: uuid(), name, ...fields })).item;
}

// --- Administration ---

test('admin : un magasin est simple ou « multi », un « multi » ne regroupe que des magasins simples', async (t) => {
  const h = await town(t);
  const stores = (await h.guillaume.get('/api/admin/stores')).body.items;
  const centre = stores.find((st) => st.id === h.s.centre);
  assert.equal(centre.isMulti, true);
  assert.deepEqual(centre.storeIds.sort(), [h.s.boucherie, h.s.fromagerie, h.s.primeur].sort());
  assert.equal(stores.find((st) => st.id === h.s.leclerc).isMulti, false);
  // Les magasins de départ restent simples
  assert.equal(stores.find((st) => st.name === 'Lidl').isMulti, false);

  // Un « multi » ne regroupe pas un autre « multi », ni lui-même, ni un magasin inconnu
  const other = (await h.guillaume.post('/api/admin/stores', { name: 'Tournée été', isMulti: true })).body.item.id;
  assert.equal((await h.regroup(h.s.centre, [h.s.boucherie, other])).status, 400);
  assert.equal((await h.regroup(h.s.centre, [h.s.centre])).status, 400);
  assert.equal((await h.regroup(h.s.centre, [9999])).status, 400);
  assert.equal((await h.regroup(h.s.centre, 'tout')).status, 400);
  // Un magasin simple ne regroupe rien
  assert.equal((await h.regroup(h.s.leclerc, [h.s.boucherie])).status, 400);
  // Le type ne change pas après la création
  assert.equal((await h.guillaume.request('PATCH', `/api/admin/stores/${h.s.leclerc}`, { isMulti: true })).status, 400);
  assert.equal((await h.guillaume.post('/api/admin/stores', { name: 'Bizarre', isMulti: 'oui' })).status, 400);

  // Rien n'a changé après ces refus
  const after = (await h.guillaume.get('/api/admin/stores')).body.items.find((st) => st.id === h.s.centre);
  assert.equal(after.storeIds.length, 3);

  // Un Utilisateur ne peut rien faire de tout cela
  assert.equal((await h.marie.post('/api/admin/stores', { name: 'Pirate', isMulti: true })).status, 403);
  assert.equal((await h.marie.request('PATCH', `/api/admin/stores/${h.s.centre}`, { storeIds: [] })).status, 403);

  // Journal
  assert.ok(h.app.logs.some((line) => line.includes('admin_magasin_regroupement_change')));
});

test('admin : un magasin regroupé ne peut pas être supprimé, seulement désactivé', async (t) => {
  const h = await town(t);
  assert.equal((await h.guillaume.del(`/api/admin/stores/${h.s.primeur}`)).status, 409);
  // Un « multi » jamais utilisé par une liste peut être supprimé (ses regroupements partent avec lui)
  const tournee = (await h.guillaume.post('/api/admin/stores', { name: 'Tournée', isMulti: true })).body.item.id;
  await h.regroup(tournee, [h.s.leclerc]);
  assert.equal((await h.guillaume.del(`/api/admin/stores/${tournee}`)).status, 204);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM store_members WHERE multi_store_id = ?').pluck().get(tournee), 0);
});

// --- Listes et droits ---

test('liste : un magasin « multi » ne se choisit que pour une liste de courses', async (t) => {
  const h = await town(t);
  const refused = await op(h.guillaume, { type: 'list.create', listId: uuid(), name: 'Tâches', listType: 'tasks', storeId: h.s.centre });
  assert.equal(refused.status, 400);
  // Passée en catégorie Tâches, une liste « multi » perd son magasin
  const listId = await createList(h, h.guillaume);
  await ok(h.guillaume, { type: 'list.update', listId, listType: 'tasks' });
  const list = (await h.guillaume.get(`/api/lists/${listId}`)).body.list;
  assert.equal(list.store, null);
});

test('liste « multi » : le magasin d\'un article est contrôlé par le serveur à chaque requête', async (t) => {
  const h = await town(t);
  const listId = await createList(h, h.guillaume);
  const list = (await h.guillaume.get(`/api/lists/${listId}`)).body.list;
  assert.equal(list.store.isMulti, true);

  // Magasin regroupé : accepté. « Sans magasin » : accepté.
  const steak = await addItem(h.guillaume, listId, 'Steaks hachés', { storeId: h.s.boucherie });
  assert.equal(steak.storeId, h.s.boucherie);
  assert.equal(steak.aisleId, null);
  assert.equal((await addItem(h.guillaume, listId, 'Piles AAA', { storeId: null })).storeId, null);

  // Magasin non regroupé, inconnu, ou mal formé : refusé
  for (const storeId of [h.s.leclerc, h.s.centre, 9999, 'boucherie', 1.5]) {
    const res = await op(h.guillaume, { type: 'item.create', listId, itemId: uuid(), name: 'Pain', storeId });
    assert.equal(res.status, 400, `magasin ${storeId}`);
  }
  // Un rayon dans une liste « multi » : refusé
  const aisle = h.ref('aisles', 'Boucherie');
  assert.equal((await op(h.guillaume, { type: 'item.create', listId, itemId: uuid(), name: 'Poulet', aisleId: aisle })).status, 400);
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: steak.id, aisleId: aisle })).status, 400);

  // Modification : même contrôle
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: steak.id, storeId: h.s.leclerc })).status, 400);
  const moved = await ok(h.guillaume, { type: 'item.update', itemId: steak.id, storeId: h.s.primeur });
  assert.equal(moved.item.storeId, h.s.primeur);

  // Magasin désactivé : retiré des choix…
  await h.guillaume.request('PATCH', `/api/admin/stores/${h.s.fromagerie}`, { active: false });
  assert.equal((await op(h.guillaume, { type: 'item.create', listId, itemId: uuid(), name: 'Comté', storeId: h.s.fromagerie })).status, 400);
  await h.guillaume.request('PATCH', `/api/admin/stores/${h.s.fromagerie}`, { active: true });
  const comte = await addItem(h.guillaume, listId, 'Comté', { storeId: h.s.fromagerie });
  await h.guillaume.request('PATCH', `/api/admin/stores/${h.s.fromagerie}`, { active: false });
  // … sans modifier les articles qui l'utilisent déjà (on peut encore changer leur quantité)
  const kept = await ok(h.guillaume, { type: 'item.update', itemId: comte.id, quantity: '400 g', storeId: h.s.fromagerie });
  assert.equal(kept.item.storeId, h.s.fromagerie);
  assert.equal(kept.item.quantity, '400 g');

  // Retiré du regroupement : même chose
  await h.regroup(h.s.centre, [h.s.fromagerie, h.s.primeur]);
  assert.equal((await op(h.guillaume, { type: 'item.create', listId, itemId: uuid(), name: 'Poulet', storeId: h.s.boucherie })).status, 400);
});

test('liste à magasin simple : pas de magasin par article', async (t) => {
  const h = await town(t);
  const listId = await createList(h, h.guillaume, { storeId: h.s.leclerc });
  const refused = await op(h.guillaume, { type: 'item.create', listId, itemId: uuid(), name: 'Lait', storeId: h.s.leclerc });
  assert.equal(refused.status, 400);
  const lait = await addItem(h.guillaume, listId, 'Lait', { storeId: null });
  assert.equal(lait.storeId, null);
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: lait.id, storeId: h.s.boucherie })).status, 400);
  // Une liste de tâches non plus
  const tasks = uuid();
  await ok(h.guillaume, { type: 'list.create', listId: tasks, name: 'Tâches', listType: 'tasks' });
  assert.equal((await op(h.guillaume, { type: 'item.create', listId: tasks, itemId: uuid(), name: 'Vélo', storeId: h.s.leclerc })).status, 400);
});

test('liste « multi » : un non-membre ne peut rien faire, un invité peut choisir le magasin', async (t) => {
  const h = await town(t);
  const listId = await createList(h, h.guillaume);
  const steak = await addItem(h.guillaume, listId, 'Steaks hachés', { storeId: h.s.boucherie });
  assert.equal((await op(h.marie, { type: 'item.update', itemId: steak.id, storeId: h.s.primeur })).status, 404);
  assert.equal((await op(h.marie, { type: 'item.create', listId, itemId: uuid(), name: 'Pain', storeId: h.s.primeur })).status, 404);

  await h.guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: [h.marieId], access: { [h.marieId]: 'modification' } });
  assert.equal((await op(h.marie, { type: 'item.update', itemId: steak.id, storeId: h.s.primeur })).status, 200);
});

// --- Magasin automatique ---

test('magasin automatique : « œufs » ajouté deux fois retrouve son magasin', async (t) => {
  const h = await town(t);
  const listId = await createList(h, h.guillaume);
  const first = await addItem(h.guillaume, listId, 'Œufs', { storeId: h.s.fromagerie });
  await ok(h.guillaume, { type: 'item.delete', itemId: first.id });

  // Sans magasin précisé, le serveur reprend le magasin habituel
  const again = await addItem(h.guillaume, listId, 'œufs ');
  assert.equal(again.storeId, h.s.fromagerie);
  // Même chez Marie, dans sa propre liste « multi » (historique commun)
  const marieList = await createList(h, h.marie);
  assert.equal((await addItem(h.marie, marieList, 'ŒUFS')).storeId, h.s.fromagerie);

  // Un article jamais acheté dans un des magasins de la liste : « Sans magasin »
  assert.equal((await addItem(h.guillaume, listId, 'Papier cadeau')).storeId, null);
});

test('magasin automatique : le plus souvent acheté, le plus récent en cas d\'égalité, modifiable', async (t) => {
  const h = await town(t);
  const listId = await createList(h, h.guillaume);
  const add = (storeId) => addItem(h.guillaume, listId, 'Pains à burger', { storeId });

  // Un ajout sans magasin précisé compte aussi un achat dans le magasin choisi
  const auto = () => addItem(h.guillaume, listId, 'pains a burger');

  await add(h.s.primeur);                           // Primeur 1
  h.app.clock.now += 1000;
  await add(h.s.boucherie);                         // Boucherie 1
  // Égalité : le plus récent gagne
  assert.equal((await auto()).storeId, h.s.boucherie); // Boucherie 2
  h.app.clock.now += 1000;
  await add(h.s.primeur);                           // Primeur 2 (égalité, plus récent)
  const item = await auto();                        // Primeur 3
  assert.equal(item.storeId, h.s.primeur);

  // Changer le magasin d'un article reporte son achat sur le nouveau magasin
  h.app.clock.now += 1000;
  await ok(h.guillaume, { type: 'item.update', itemId: item.id, storeId: h.s.boucherie }); // Primeur 2, Boucherie 3
  assert.equal((await auto()).storeId, h.s.boucherie); // Boucherie 4

  // Seuls les magasins regroupés et actifs comptent
  await h.guillaume.request('PATCH', `/api/admin/stores/${h.s.boucherie}`, { active: false });
  assert.equal((await auto()).storeId, h.s.primeur);
});

test('historique : une suggestion par article, quel que soit le nombre de magasins', async (t) => {
  const h = await town(t);
  const listId = await createList(h, h.guillaume);
  await addItem(h.guillaume, listId, 'Comté', { storeId: h.s.fromagerie });
  await addItem(h.guillaume, listId, 'Comté', { storeId: h.s.primeur });
  const leclerc = await createList(h, h.guillaume, { storeId: h.s.leclerc });
  await addItem(h.guillaume, leclerc, 'Comté', { aisleId: h.ref('aisles', 'Fromages') });

  const suggestions = (await h.guillaume.get('/api/suggestions?q=co')).body.suggestions;
  assert.deepEqual(suggestions.map((s) => s.name), ['Comté']);
  assert.equal(suggestions[0].useCount, 3);
  // Lignes : générale + Fromagerie + Primeur + Leclerc
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM item_history WHERE name_normalized = 'comte'").pluck().get(), 4);
});

// --- Tri ---

test('tri : par magasin (A→Z, « Sans magasin » en dernier), puis A→Z, cochés en bas de leur magasin', async (t) => {
  const h = await town(t);
  await h.regroup(h.s.centre, [h.s.boucherie, h.s.fromagerie, h.s.primeur, h.s.leclerc]);
  const listId = await createList(h, h.guillaume);
  await addItem(h.guillaume, listId, 'Piles AAA', { storeId: null });
  await addItem(h.guillaume, listId, 'Lessive', { storeId: h.s.leclerc });
  await addItem(h.guillaume, listId, 'Pommes Gala', { storeId: h.s.primeur });
  const citrons = await addItem(h.guillaume, listId, 'Citrons', { storeId: h.s.primeur });
  await addItem(h.guillaume, listId, 'Comté', { storeId: h.s.fromagerie });
  await addItem(h.guillaume, listId, 'Chèvre frais', { storeId: h.s.fromagerie });
  await addItem(h.guillaume, listId, 'Steaks hachés', { storeId: h.s.boucherie });
  await ok(h.guillaume, { type: 'item.check', itemId: citrons.id, checked: true });

  const { groups } = (await h.guillaume.get(`/api/lists/${listId}`)).body;
  assert.deepEqual(groups.map((g) => g.store?.name ?? 'Sans magasin'), ['Boucherie', 'Fromagerie', 'Leclerc', 'Primeur', 'Sans magasin']);
  assert.deepEqual(groups[1].items.map((i) => i.name), ['Chèvre frais', 'Comté']);
  assert.deepEqual(groups[3].items.map((i) => i.name), ['Pommes Gala', 'Citrons']);
  assert.ok(groups.every((g) => !('aisle' in g)), 'pas de rayon dans une liste « multi »');
});

// --- Changement de magasin d'une liste ---

test('changer de magasin : chaque article garde ses champs, les champs vides sont complétés', async (t) => {
  const h = await town(t);
  const fromages = h.ref('aisles', 'Fromages');
  // Historique : Comté acheté à la Fromagerie ; rayon Fromages chez Leclerc
  const before = await createList(h, h.guillaume);
  await addItem(h.guillaume, before, 'Comté', { storeId: h.s.fromagerie });
  const leclercList = await createList(h, h.guillaume, { storeId: h.s.leclerc });
  await addItem(h.guillaume, leclercList, 'Comté', { aisleId: fromages });

  // Simple → multi : le magasin vide est complété, le rayon est gardé
  const comte = await addItem(h.guillaume, leclercList, 'Comté');
  assert.equal(comte.aisleId, fromages);
  const inconnu = await addItem(h.guillaume, leclercList, 'Bougies', { aisleId: null });
  await ok(h.guillaume, { type: 'list.update', listId: leclercList, storeId: h.s.centre });
  let items = (await h.guillaume.get(`/api/lists/${leclercList}`)).body.groups.flatMap((g) => g.items);
  const comteAfter = items.find((i) => i.id === comte.id);
  assert.equal(comteAfter.storeId, h.s.fromagerie);
  assert.equal(comteAfter.aisleId, fromages, 'le rayon est gardé en base');
  assert.equal(items.find((i) => i.id === inconnu.id).storeId, null, 'sans historique : « Sans magasin »');

  // Multi → simple : on retrouve le rayon gardé ; le magasin reste en base
  await ok(h.guillaume, { type: 'list.update', listId: leclercList, storeId: h.s.leclerc });
  const { groups } = (await h.guillaume.get(`/api/lists/${leclercList}`)).body;
  assert.ok(groups.every((g) => 'aisle' in g));
  items = groups.flatMap((g) => g.items);
  assert.equal(items.find((i) => i.id === comte.id).aisleId, fromages);
  assert.equal(items.find((i) => i.id === comte.id).storeId, h.s.fromagerie);
});

// --- Pas de régression sur une liste à magasin simple ---

test('liste à magasin simple : rayon automatique comme avant, rayon propre à chaque magasin', async (t) => {
  const h = await town(t);
  const lidl = h.ref('stores', 'Lidl');
  const cremerie = h.ref('aisles', 'Crèmerie');
  const frais = h.ref('aisles', 'Fromages');
  const lidlList = await createList(h, h.guillaume, { storeId: lidl });
  await addItem(h.guillaume, lidlList, 'Lait', { aisleId: cremerie });
  // « LAIT » sans rayon retrouve la Crèmerie, comme avant
  assert.equal((await addItem(h.guillaume, lidlList, 'LAIT')).aisleId, cremerie);
  // Dans un autre magasin simple, le rayon général sert aussi
  const leclercList = await createList(h, h.guillaume, { storeId: h.s.leclerc });
  const lait = await addItem(h.guillaume, leclercList, 'lait');
  assert.equal(lait.aisleId, cremerie);
  // Rangé ailleurs chez Leclerc : chaque magasin garde son rayon
  await ok(h.guillaume, { type: 'item.update', itemId: lait.id, aisleId: frais });
  assert.equal((await addItem(h.guillaume, leclercList, 'Lait')).aisleId, frais);
  // Un troisième magasin simple prend le rayon général (le dernier choisi)
  const carrefourList = await createList(h, h.guillaume, { storeId: h.ref('stores', 'Carrefour') });
  assert.equal((await addItem(h.guillaume, carrefourList, 'Lait')).aisleId, frais);
  assert.equal((await addItem(h.guillaume, lidlList, 'Lait')).aisleId, cremerie, 'chez Lidl, il garde son rayon');
  // Groupes par rayon, sans champ magasin
  const { groups } = (await h.guillaume.get(`/api/lists/${lidlList}`)).body;
  assert.ok(groups.every((g) => 'aisle' in g && !('store' in g)));
});

// --- Synchronisation ---

test('synchronisation : type des magasins, magasins regroupés, magasin des articles et de l\'historique', async (t) => {
  const h = await town(t);
  const listId = await createList(h, h.guillaume);
  await addItem(h.guillaume, listId, 'Comté', { storeId: h.s.fromagerie });
  const sync = (await h.guillaume.get('/api/sync')).body;
  const centre = sync.stores.find((st) => st.id === h.s.centre);
  assert.equal(centre.isMulti, true);
  assert.equal(centre.storeIds.length, 3);
  assert.equal(sync.lists.find((l) => l.id === listId).store.isMulti, true);
  assert.equal(sync.items[0].storeId, h.s.fromagerie);
  assert.ok(sync.history.some((e) => e.nameNormalized === 'comte' && e.storeId === h.s.fromagerie && e.useCount === 1));
  assert.ok(sync.history.some((e) => e.nameNormalized === 'comte' && e.storeId === null));
});

// --- Migration ---

test("migration : une base de l'étape 5 passe au magasin « multi » sans rien changer", (t) => {
  const file = path.join(tempDir(t), 'listo.db');
  // Base au schéma de l'étape 5 (migrations 1 à 4), avec des données
  const old = new Database(file);
  old.pragma('foreign_keys = ON');
  for (let i = 0; i < 4; i++) {
    const migration = MIGRATIONS[i];
    if (typeof migration === 'function') migration(old);
    else old.exec(migration);
  }
  old.pragma('user_version = 4');
  old.prepare("INSERT INTO users (id, username, display_name, password_hash) VALUES (1, 'guillaume', 'Guillaume', 'x')").run();
  const courses = old.prepare("SELECT id FROM categories WHERE name = 'Courses'").pluck().get();
  const lidl = old.prepare("SELECT id FROM stores WHERE name = 'Lidl'").pluck().get();
  const cremerie = old.prepare("SELECT id FROM aisles WHERE name = 'Crèmerie'").pluck().get();
  old.prepare("INSERT INTO lists (id, name, category_id, store_id, owner_id) VALUES ('l1', 'Courses', ?, ?, 1)").run(courses, lidl);
  old.prepare("INSERT INTO items (id, list_id, name, aisle_id, created_by) VALUES ('i1', 'l1', 'Lait', ?, 1)").run(cremerie);
  old.prepare("INSERT INTO item_history (name_normalized, display_name, aisle_id, use_count, last_used_at) VALUES ('lait', 'Lait', ?, 7, '2026-10-01T10:00:00.000Z')").run(cremerie);
  old.close();

  const db = openDatabase(file);
  assert.equal(schemaVersion(db), MIGRATIONS.length);
  assert.deepEqual(db.prepare('SELECT name, is_multi FROM stores WHERE id = ?').get(lidl), { name: 'Lidl', is_multi: 0 });
  assert.equal(db.prepare('SELECT COUNT(*) FROM stores WHERE is_multi = 1').pluck().get(), 0);
  assert.deepEqual(db.prepare('SELECT name, aisle_id, store_id FROM items').get(), { name: 'Lait', aisle_id: cremerie, store_id: null });
  assert.deepEqual(
    db.prepare('SELECT name_normalized, store_id, display_name, aisle_id, use_count, last_used_at FROM item_history').all(),
    [{ name_normalized: 'lait', store_id: null, display_name: 'Lait', aisle_id: cremerie, use_count: 7, last_used_at: '2026-10-01T10:00:00.000Z' }],
  );
  // Une seule ligne générale par article : un doublon est refusé par la base
  assert.throws(() => db.prepare("INSERT INTO item_history (name_normalized, display_name) VALUES ('lait', 'Lait')").run(), /UNIQUE/);
  // Mais une ligne par magasin est possible
  db.prepare("INSERT INTO item_history (name_normalized, store_id, display_name) VALUES ('lait', ?, 'Lait')").run(lidl);
  assert.throws(() => db.prepare("INSERT INTO item_history (name_normalized, store_id, display_name) VALUES ('lait', ?, 'Lait')").run(lidl), /UNIQUE/);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  db.close();
});
