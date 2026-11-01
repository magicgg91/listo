// Types de liste (courses, tâches, envies) à la place des catégories :
// migration 18, restauration d'une ancienne sauvegarde, droits du changement
// de type, aller-retour sans perte, anciennes opérations des téléphones qui
// n'ont pas rechargé (identifiant de catégorie) et champs provisoires.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
import Database from 'better-sqlite3';
import { startTestApp, setupAdmin, addUser, login, tempDir, createClient, ORIGIN, databaseAt } from './helpers.js';
import { openDatabase, schemaVersion, fillListTypes } from '../server/db.js';
import { loadConfig } from '../server/config.js';
import { createApp } from '../server/app.js';
import { loadOrCreateKey } from '../server/secrets.js';
import { typeOf, isShoppingList, usesTaskOptions, typeChangeWarning, CREATABLE_TYPES, TYPE_ICONS } from '../public/js/list-types.js';

const uuid = () => crypto.randomUUID();
const PASSWORD = 'MotDePasseAdmin!';

// Base « d'avant » (version 17, sans la colonne type), écrite dans un fichier
// comme une sauvegarde nocturne prise avant la mise à jour
function oldDatabase(file, fill) {
  let db = databaseAt(file, 17);
  fill(db);
  db.close();
}

// Contenu d'une ancienne base : catégories de l'Admin comprises
function oldContent(db) {
  if (!db.prepare('SELECT 1 FROM users').get()) db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('a', 'A', 'x')").run();
  db.prepare("INSERT INTO categories (name, is_shopping) VALUES ('Bricolage', 0), ('Marché', 1)").run(); // 3 et 4
  const add = db.prepare('INSERT INTO lists (id, name, category_id, store_id, owner_id, priority_enabled, due_enabled, icon, deleted_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)');
  add.run('l-courses', 'Courses', 1, 2, 0, 0, '', null);
  add.run('l-taches', 'Maison', 2, null, 1, 1, 'home', null);
  add.run('l-bricolage', 'Travaux', 3, null, 0, 1, '', null);
  add.run('l-marche', 'Marché du samedi', 4, null, 0, 0, 'basket', null);
  add.run('l-supprimee', 'Ancienne', 1, null, 0, 0, '', '2026-10-20T10:00:00.000Z');
  db.prepare("INSERT INTO items (id, list_id, name, aisle_id, ean, priority, due_date, created_by) VALUES ('i-lait', 'l-courses', 'Lait', 4, '3428272950019', 'normal', NULL, 1), ('i-vis', 'l-bricolage', 'Vis', NULL, NULL, 'high', '2026-11-05', 1)").run();
}

test('migration 18 : courses → shopping, autres → tasks, rien de perdu, idempotente, journal sans nom', (t) => {
  const file = path.join(tempDir(t), 'listo.db');
  oldDatabase(file, oldContent);
  // Contenu avant la migration (base ouverte sans migrer)
  const raw = new Database(file);
  const before = { lists: raw.prepare('SELECT * FROM lists ORDER BY id').all(), items: raw.prepare('SELECT * FROM items ORDER BY id').all(), categories: raw.prepare('SELECT * FROM categories ORDER BY id').all() };
  raw.close();
  let db;
  const lines = [];
  const log = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    db = openDatabase(file);
  } finally {
    console.log = log;
  }
  assert.equal(schemaVersion(db), 19);
  const types = Object.fromEntries(db.prepare('SELECT id, type FROM lists').all().map((l) => [l.id, l.type]));
  assert.deepEqual(types, { 'l-courses': 'shopping', 'l-taches': 'tasks', 'l-bricolage': 'tasks', 'l-marche': 'shopping', 'l-supprimee': 'shopping' });
  // Rien d'autre ne change : listes (catégorie, magasin, options, icône), articles, catégories
  assert.deepEqual(db.prepare('SELECT * FROM lists ORDER BY id').all().map(({ type, for_user_id: forUser, for_name: forName, ...rest }) => rest), before.lists);
  assert.deepEqual(db.prepare('SELECT * FROM items ORDER BY id').all().map(({ link, price_cents: price, ...rest }) => rest), before.items);
  assert.deepEqual(db.prepare('SELECT * FROM categories ORDER BY id').all(), before.categories, 'table des catégories gardée telle quelle');
  assert.deepEqual(lines, ['Migration 18 (types de liste) : 3 liste(s) de courses, 2 liste(s) de tâches.']);
  db.close();
  // Idempotente : un second démarrage ne change rien
  db = openDatabase(file);
  assert.deepEqual(Object.fromEntries(db.prepare('SELECT id, type FROM lists').all().map((l) => [l.id, l.type])), types);
  assert.deepEqual(fillListTypes(db), { shopping: 0, tasks: 0 });
  db.close();
});

test('migration 18 : une catégorie « tâches » supprimée est recréée (category_id reste obligatoire)', (t) => {
  const file = path.join(tempDir(t), 'listo.db');
  oldDatabase(file, (db) => {
    db.prepare("DELETE FROM categories WHERE name = 'Tâches'").run();
    db.prepare("INSERT INTO categories (name, is_shopping) VALUES ('Tâches', 1)").run(); // nom déjà pris, mais « courses »
  });
  const db = openDatabase(file);
  const tasks = db.prepare('SELECT name FROM categories WHERE is_shopping = 0').pluck().all();
  assert.deepEqual(tasks, ['Tâches 2']);
  db.close();
});

test('retour à l\'image précédente puis nouvelle mise à jour : une liste sans type reçoit le sien au démarrage', (t) => {
  const file = path.join(tempDir(t), 'listo.db');
  let db = openDatabase(file);
  db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('a', 'A', 'x')").run();
  // L'image précédente écrit ses listes sans type (colonne inconnue d'elle)
  db.prepare("INSERT INTO lists (id, name, category_id, owner_id) VALUES ('ancienne-courses', 'C', 1, 1), ('ancienne-taches', 'T', 2, 1)").run();
  db.close();
  db = openDatabase(file);
  assert.deepEqual(db.prepare('SELECT type FROM lists ORDER BY id').pluck().all(), ['shopping', 'tasks']);
  db.close();
});

test('restauration d\'une ancienne sauvegarde (avant les types) : migrée au démarrage, listes et données retrouvées', async (t) => {
  const root = tempDir(t);
  const backup = path.join(root, 'listo-2026-10-31-0300.db');
  // Sauvegarde prise avant la mise à jour : un compte (mot de passe connu du
  // test) et ses listes
  {
    const db = databaseAt(backup, 17);
    await addUser(db, { username: 'guillaume', password: PASSWORD, role: 'admin' });
    oldContent(db);
    db.prepare("INSERT INTO list_members (list_id, user_id, access) SELECT id, 1, 'modification' FROM lists").run();
    db.close();
  }
  // Restauration : la copie remplace listo.db, puis Listo redémarre
  const dbPath = path.join(root, 'data', 'listo.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.copyFileSync(backup, dbPath);
  const raw = new Database(dbPath);
  assert.equal(raw.pragma('user_version', { simple: true }), 17, 'copie d\'avant les types');
  raw.close();
  // Démarrage : la migration 18 s'applique
  const db = openDatabase(dbPath);
  const { key } = loadOrCreateKey(path.join(root, 'secrets', 'secret.key'));
  const app = createApp({ db, config: { ...loadConfig({}), publicUrl: ORIGIN, dbPath }, masterKey: key, setupCode: null, log: () => {} });
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => {
    app.locals.ctx.stop();
    server.close();
    db.close();
  });
  const client = createClient(`http://127.0.0.1:${server.address().port}`);
  assert.equal((await login(client, 'guillaume', PASSWORD)).status, 200);
  assert.equal(schemaVersion(db), 19);
  const lists = Object.fromEntries((await client.get('/api/lists')).body.lists.map((l) => [l.name, l]));
  assert.deepEqual(Object.keys(lists).sort(), ['Courses', 'Maison', 'Marché du samedi', 'Travaux']);
  assert.equal(lists.Courses.type, 'shopping');
  assert.equal(lists.Courses.store.name, 'E.Leclerc');
  assert.equal(lists.Maison.type, 'tasks');
  assert.equal(lists.Maison.icon, 'home', 'icône gardée');
  assert.equal(lists.Travaux.type, 'tasks');
  assert.equal(lists['Marché du samedi'].type, 'shopping');
  const items = (await client.get('/api/sync')).body.items;
  assert.deepEqual(items.find((i) => i.id === 'i-lait'), { ...items.find((i) => i.id === 'i-lait'), aisleId: 4, ean: '3428272950019' });
  assert.deepEqual(items.find((i) => i.id === 'i-vis'), { ...items.find((i) => i.id === 'i-vis'), priority: 'high', dueDate: '2026-11-05' });
});

// --- Foyer de test : Guillaume propriétaire, Marie « Peut modifier », Paul
// en lecture seule, Zoé sans accès ---

async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const people = {};
  for (const name of ['marie', 'paul', 'zoe']) {
    people[`${name}Id`] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    people[name] = app.client();
    await login(people[name], name, `MotDePasse-${name}`);
  }
  const ops = async (client, list) => (await client.post('/api/ops', { ops: list.map((op) => ({ id: uuid(), ...op })) })).body.results;
  const one = async (client, op) => (await ops(client, [op]))[0];
  const courses = uuid();
  const lait = uuid();
  const vis = uuid();
  const res = await ops(guillaume, [
    { type: 'list.create', listId: courses, name: 'Courses', listType: 'shopping', storeId: 1 },
    { type: 'item.create', listId: courses, itemId: lait, name: 'Lait', aisleId: 4, ean: '3428272950019' },
    { type: 'item.create', listId: courses, itemId: vis, name: 'Vis' },
  ]);
  assert.deepEqual(res.map((r) => r.status), [200, 200, 200], JSON.stringify(res));
  await guillaume.request('PUT', `/api/lists/${courses}/members`, { userIds: [people.marieId, people.paulId], access: { [people.marieId]: 'modification', [people.paulId]: 'lecture' } });
  const listOf = async (client, id = courses) => (await client.get('/api/lists')).body.lists.find((l) => l.id === id);
  const row = (id = courses) => app.db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
  const item = (id) => app.db.prepare('SELECT aisle_id, store_id, ean, priority, due_date FROM items WHERE id = ?').get(id);
  return { app, guillaume, ...people, ops, one, courses, lait, vis, listOf, row, item };
}

test('droits : seul le propriétaire change le type ; contributeur et lecture seule 403, non-membre 404 ; rien ne change', async (t) => {
  const h = await household(t);
  for (const [client, status] of [[h.marie, 403], [h.paul, 403], [h.zoe, 404]]) {
    const res = await h.one(client, { type: 'list.update', listId: h.courses, listType: 'tasks' });
    assert.equal(res.status, status, JSON.stringify(res));
    // Ancienne opération (identifiant de catégorie) : même refus
    assert.equal((await h.one(client, { type: 'list.update', listId: h.courses, categoryId: 2 })).status, status);
  }
  assert.equal(h.row().type, 'shopping');
  assert.equal((await h.one(h.guillaume, { type: 'list.update', listId: h.courses, listType: 'tasks' })).status, 200);
  assert.equal(h.row().type, 'tasks');
  assert.ok(h.app.logs.some((l) => /liste_type_change/.test(l) && /avant="shopping"/.test(l) && /apres="tasks"/.test(l)));
});

test('types : une liste existante ne devient pas une liste d\'envies ; type inconnu refusé', async (t) => {
  const h = await household(t);
  const update = await h.one(h.guillaume, { type: 'list.update', listId: h.courses, listType: 'wishes' });
  assert.deepEqual([update.status, update.error], [400, 'Une liste existante ne devient pas une liste d\'envies : créez une nouvelle liste.']);
  for (const listType of ['autre', 'Shopping', 1, null, '']) {
    assert.equal((await h.one(h.guillaume, { type: 'list.create', listId: uuid(), name: 'X', listType })).status, 400, String(listType));
  }
  assert.equal((await h.one(h.guillaume, { type: 'list.create', listId: uuid(), name: 'Sans type' })).error, 'Type de liste inconnu.');
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM lists WHERE type = 'wishes' OR type IS NULL").pluck().get(), 0);
  assert.deepEqual(CREATABLE_TYPES, ['shopping', 'tasks', 'wishes']);
});

test('aller-retour courses → tâches → courses : magasin, rayons, codes-barres, priorité et échéance conservés', async (t) => {
  const h = await household(t);
  // Courses → Tâches : le magasin est caché partout pour les membres, gardé en base
  assert.equal((await h.one(h.guillaume, { type: 'list.update', listId: h.courses, listType: 'tasks', priorityEnabled: true, dueEnabled: true })).status, 200);
  assert.equal(h.row().store_id, 1, 'magasin gardé en base');
  const owner = await h.listOf(h.guillaume);
  assert.equal(owner.type, 'tasks');
  assert.equal(owner.store, null, 'magasin caché');
  assert.deepEqual(owner.keptStore, { id: 1, name: 'Carrefour', active: true, isMulti: false }, 'donné au seul propriétaire, pour le formulaire');
  for (const member of [h.marie, h.paul]) {
    const list = await h.listOf(member);
    assert.equal(list.store, null);
    assert.equal('keptStore' in list, false);
  }
  assert.equal(JSON.stringify((await h.marie.get('/api/sync')).body.lists).includes('Carrefour'), false, 'aucun nom de magasin pour un membre');
  // Rayon et code-barres gardés en base
  assert.deepEqual(h.item(h.lait), { aisle_id: 4, store_id: null, ean: '3428272950019', priority: 'normal', due_date: null });
  // En tâches : le code-barres ne se choisit plus ; la priorité et l'échéance oui
  assert.equal((await h.one(h.guillaume, { type: 'item.update', itemId: h.vis, ean: '96385074' })).status, 400);
  assert.equal((await h.one(h.guillaume, { type: 'item.update', itemId: h.vis, priority: 'high', dueDate: '2026-11-05' })).status, 200);
  // Un ancien téléphone envoie « aucun magasin » avec la liste : ignoré, le magasin conservé reste
  assert.equal((await h.one(h.guillaume, { type: 'list.update', listId: h.courses, name: 'Courses', storeId: null })).status, 200);
  assert.equal(h.row().store_id, 1);
  // Choisir un magasin pour une liste de tâches : refusé
  assert.equal((await h.one(h.guillaume, { type: 'list.update', listId: h.courses, storeId: 2 })).status, 400);

  // Tâches → Courses : le magasin réapparaît, rayons et code-barres aussi
  assert.equal((await h.one(h.guillaume, { type: 'list.update', listId: h.courses, listType: 'shopping' })).status, 200);
  const back = await h.listOf(h.marie);
  assert.equal(back.type, 'shopping');
  assert.deepEqual(back.store, { id: 1, name: 'Carrefour', active: true, isMulti: false });
  assert.equal('keptStore' in (await h.listOf(h.guillaume)), false);
  assert.deepEqual(h.item(h.lait), { aisle_id: 4, store_id: null, ean: '3428272950019', priority: 'normal', due_date: null });
  // Priorité et échéance gardées (ignorées en courses), réglages de la liste aussi
  assert.deepEqual(h.item(h.vis).priority, 'high');
  assert.deepEqual(h.item(h.vis).due_date, '2026-11-05');
  assert.equal(h.row().priority_enabled, 1);
  assert.equal((await h.one(h.guillaume, { type: 'item.update', itemId: h.vis, priority: 'low' })).status, 400, 'pas de priorité en courses');
  // Et de nouveau Tâches : tout est là
  await h.one(h.guillaume, { type: 'list.update', listId: h.courses, listType: 'tasks' });
  const sync = (await h.guillaume.get('/api/sync')).body;
  const vis = sync.items.find((i) => i.id === h.vis);
  assert.deepEqual([vis.priority, vis.dueDate], ['high', '2026-11-05']);
  assert.equal(sync.lists.find((l) => l.id === h.courses).priorityEnabled, true);
});

test('category_id suit le type (colonne obligatoire, retour à l\'image précédente cohérent)', async (t) => {
  const h = await household(t);
  const isShoppingCategory = () => h.app.db.prepare('SELECT categories.is_shopping FROM lists JOIN categories ON categories.id = lists.category_id WHERE lists.id = ?').pluck().get(h.courses);
  assert.equal(isShoppingCategory(), 1);
  await h.one(h.guillaume, { type: 'list.update', listId: h.courses, listType: 'tasks' });
  assert.equal(isShoppingCategory(), 0);
  await h.one(h.guillaume, { type: 'list.update', listId: h.courses, listType: 'shopping' });
  assert.equal(isShoppingCategory(), 1);
  // Dupliquer : même type
  const copy = await h.guillaume.post(`/api/lists/${h.courses}/duplicate`, { name: 'Copie' });
  assert.equal(copy.body.list.type, 'shopping');
});

test('ancien téléphone : opérations avec un identifiant de catégorie acceptées (traduites en type), champs provisoires envoyés', async (t) => {
  const h = await household(t);
  const bricolage = h.app.db.prepare("INSERT INTO categories (name, is_shopping, active) VALUES ('Bricolage', 0, 0)").run().lastInsertRowid;
  const fromOld = uuid();
  const created = await h.one(h.marie, { type: 'list.create', listId: fromOld, name: 'Ancien téléphone', categoryId: 1, storeId: 2 });
  assert.equal(created.status, 200, created.error);
  assert.equal(created.list.type, 'shopping');
  assert.equal(created.list.store.name, 'E.Leclerc');
  // Catégorie désactivée ou de l'Admin : traduite aussi (plus de catégories à gérer)
  const other = uuid();
  assert.equal((await h.one(h.marie, { type: 'list.create', listId: other, name: 'Bricolage', categoryId: bricolage })).list.type, 'tasks');
  assert.equal((await h.one(h.marie, { type: 'list.create', listId: uuid(), name: 'X', categoryId: 999 })).error, 'Type de liste inconnu.');
  // Modification : categoryId traduit ; listType l'emporte s'il est là aussi
  assert.equal((await h.one(h.marie, { type: 'list.update', listId: fromOld, categoryId: 2, storeId: null })).status, 200);
  assert.equal(h.row(fromOld).type, 'tasks');
  assert.equal(h.row(fromOld).store_id, 2, 'magasin conservé malgré « aucun magasin »');
  await h.one(h.marie, { type: 'list.update', listId: fromOld, categoryId: 2, listType: 'shopping' });
  assert.equal(h.row(fromOld).type, 'shopping');

  // Synchronisation d'un téléphone qui n'a pas rechargé : il lit encore
  // list.category.isShopping et les catégories (champs provisoires)
  const sync = (await h.marie.get('/api/sync')).body;
  assert.ok(Array.isArray(sync.categories) && sync.categories.some((c) => c.isShopping));
  for (const list of sync.lists) {
    assert.equal(typeof list.category.id, 'number');
    assert.equal(list.category.isShopping, list.type === 'shopping', list.name);
    assert.ok(sync.categories.some((c) => c.id === list.category.id && c.isShopping === list.category.isShopping), 'la catégorie se retrouve par son identifiant');
  }
});

test('point unique : typeOf (jamais la catégorie), icônes par défaut, avertissement', () => {
  assert.equal(typeOf({ type: 'tasks', category: { isShopping: true } }), 'tasks', 'le type seul compte');
  assert.equal(typeOf({ category: { isShopping: true } }), 'tasks', 'la catégorie provisoire n\'est jamais lue');
  assert.equal(typeOf({}), 'tasks');
  assert.equal(typeOf({ type: 'autre' }), 'tasks');
  assert.equal(typeOf('wishes'), 'wishes');
  assert.equal(isShoppingList({ type: 'shopping' }), true);
  assert.equal(usesTaskOptions({ type: 'shopping' }), false);
  assert.deepEqual(TYPE_ICONS, { shopping: 'cart', tasks: 'tasks', wishes: 'gift' });
  assert.match(typeChangeWarning('shopping', 'tasks'), /^Les rayons, magasins et codes-barres ne s'affichent plus pour ce type ; ils sont conservés si vous revenez à Courses\.$/);
  assert.match(typeChangeWarning('tasks', 'shopping'), /conservées si vous revenez à Tâches/);
  assert.equal(typeChangeWarning('tasks', 'tasks'), '');
});
