// Mémoire des noms réservée aux listes de courses (décision du 17 octobre
// 2026) : seules les listes de courses écrivent dans l'historique
// (item_history) et reçoivent des suggestions ; migration 8 qui retire de
// l'historique les noms venus seulement des autres listes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { openDatabase, migrate, pruneHistory, schemaVersion } from '../server/db.js';
import { remembersNames } from '../public/js/store.js';

const uuid = () => crypto.randomUUID();

async function household(t) {
  const app = await startTestApp(t);
  const admin = await setupAdmin(app, { username: 'admin' });
  const marieId = await addUser(app.db, { username: 'marie', password: 'MotDePasse-marie' });
  const marie = app.client();
  await login(marie, 'marie', 'MotDePasse-marie');
  const ref = (table, name) => app.db.prepare(`SELECT id FROM ${table} WHERE name = ?`).pluck().get(name);
  return { app, admin, marie, marieId, ref, COURSES: ref('categories', 'Courses'), TACHES: ref('categories', 'Tâches') };
}

async function ok(client, op) {
  const res = await client.post('/api/ops', { ops: [{ id: uuid(), ...op }] });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.results[0].status, 200, `${op.type} : ${res.body.results[0].error}`);
  return res.body.results[0];
}

const history = (h) => h.app.db.prepare('SELECT name_normalized, store_id, aisle_id, use_count FROM item_history ORDER BY name_normalized, IFNULL(store_id, 0)').all();
const suggestions = async (client, typed, listId) => {
  const res = await client.get(`/api/suggestions?q=${encodeURIComponent(typed)}${listId ? `&listId=${listId}` : ''}`);
  return res.status === 200 ? res.body.suggestions.map((s) => s.name) : res.status;
};

// --- Écritures dans l'historique ---

test("une liste de tâches n'écrit rien dans l'historique (ajout, renommage) et ne reçoit pas de suggestions", async (t) => {
  const h = await household(t);
  const tasks = uuid();
  await ok(h.marie, { type: 'list.create', listId: tasks, name: 'Maison', listType: 'tasks' });
  const itemId = uuid();
  await ok(h.marie, { type: 'item.create', listId: tasks, itemId, name: 'Arroser les plantes' });
  await ok(h.marie, { type: 'item.update', itemId, name: 'Arroser le jardin' });
  await ok(h.marie, { type: 'item.update', itemId, note: 'le soir' });
  await ok(h.marie, { type: 'item.check', itemId, checked: true });
  assert.deepEqual(history(h), [], "rien dans l'historique");
  // L'élément est bien là
  const list = (await h.marie.get(`/api/lists/${tasks}`)).body;
  assert.deepEqual(list.groups.flatMap((g) => g.items.map((i) => i.name)), ['Arroser le jardin']);

  // Un article de courses est mémorisé, et suggéré dans une liste de courses
  // seulement
  const courses = uuid();
  await ok(h.marie, { type: 'list.create', listId: courses, name: 'Courses', listType: 'shopping' });
  await ok(h.marie, { type: 'item.create', listId: courses, itemId: uuid(), name: 'Arrosoir' });
  assert.deepEqual(await suggestions(h.marie, 'arro', courses), ['Arrosoir']);
  assert.deepEqual(await suggestions(h.marie, 'arro', tasks), [], 'pas de suggestions dans une liste de tâches');
  assert.deepEqual(await suggestions(h.marie, 'arro'), ['Arrosoir'], 'sans liste : les noms de courses');
  // Liste inconnue ou d'un autre compte : refusée comme partout
  const adminList = uuid();
  await ok(h.admin, { type: 'list.create', listId: adminList, name: 'Liste admin', listType: 'shopping' });
  assert.equal(await suggestions(h.marie, 'arro', adminList), 404);
  assert.equal(await suggestions(h.marie, 'arro', 'pas-un-uuid'), 400);
});

test("une liste de courses continue d'écrire dans l'historique (ajout, renommage, rayon, magasin)", async (t) => {
  const h = await household(t);
  const lidl = h.ref('stores', 'Lidl');
  const fruits = h.ref('aisles', 'Fruits et légumes');
  const courses = uuid();
  await ok(h.marie, { type: 'list.create', listId: courses, name: 'Courses', listType: 'shopping', storeId: lidl });
  const itemId = uuid();
  await ok(h.marie, { type: 'item.create', listId: courses, itemId, name: 'Tomates' });
  await ok(h.marie, { type: 'item.update', itemId, aisleId: fruits });
  await ok(h.marie, { type: 'item.update', itemId, name: 'Tomates cerises' });
  assert.deepEqual(history(h), [
    { name_normalized: 'tomates', store_id: null, aisle_id: fruits, use_count: 1 },
    { name_normalized: 'tomates', store_id: lidl, aisle_id: fruits, use_count: 1 },
    { name_normalized: 'tomates cerises', store_id: null, aisle_id: fruits, use_count: 1 },
    { name_normalized: 'tomates cerises', store_id: lidl, aisle_id: fruits, use_count: 1 },
  ]);
});

test("changement de catégorie : rien n'est écrit ni effacé dans l'historique ; la suite suit la nouvelle catégorie", async (t) => {
  const h = await household(t);
  const fruits = h.ref('aisles', 'Fruits et légumes');
  const listId = uuid();
  await ok(h.marie, { type: 'list.create', listId, name: 'Marché', listType: 'shopping' });
  const pommes = uuid();
  await ok(h.marie, { type: 'item.create', listId, itemId: pommes, name: 'Pommes', aisleId: fruits });
  const before = history(h);

  // Courses → Tâches : l'historique ne bouge pas ; les nouveaux éléments ne
  // sont plus mémorisés
  await ok(h.marie, { type: 'list.update', listId, listType: 'tasks' });
  assert.deepEqual(history(h), before);
  await ok(h.marie, { type: 'item.create', listId, itemId: uuid(), name: 'Poires' });
  await ok(h.marie, { type: 'item.update', itemId: pommes, name: 'Pommes golden' });
  assert.deepEqual(history(h), before, 'rien de nouveau');
  assert.deepEqual(await suggestions(h.marie, 'po', listId), []);

  // Tâches → Courses : les éléments sans rayon reçoivent leur rayon habituel
  // (lecture seule de l'historique), rien n'est écrit ; les ajouts suivants
  // sont mémorisés
  await ok(h.marie, { type: 'item.create', listId, itemId: uuid(), name: 'Pommes' });
  await ok(h.marie, { type: 'list.update', listId, listType: 'shopping' });
  assert.deepEqual(history(h), before);
  const items = h.app.db.prepare('SELECT name, aisle_id FROM items WHERE list_id = ? ORDER BY name').all(listId);
  assert.deepEqual(items, [
    { name: 'Poires', aisle_id: null },
    { name: 'Pommes', aisle_id: fruits },
    { name: 'Pommes golden', aisle_id: fruits },
  ]);
  await ok(h.marie, { type: 'item.create', listId, itemId: uuid(), name: 'Poires', aisleId: fruits });
  assert.ok(history(h).some((line) => line.name_normalized === 'poires'));
  assert.deepEqual(await suggestions(h.marie, 'poi', listId), ['Poires']);
});

test('téléphone : seules les listes de courses mémorisent et suggèrent', () => {
  assert.equal(remembersNames({ type: 'shopping' }), true);
  assert.equal(remembersNames({ type: 'tasks' }), false);
  assert.equal(remembersNames(null), false);
});

// --- Migration 8 ---

// Base de test au schéma actuel, avec des données « d'avant » la règle
function oldData() {
  const db = openDatabase(':memory:');
  db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('a', 'A', 'x')").run();
  const ref = (table, name) => db.prepare(`SELECT id FROM ${table} WHERE name = ?`).pluck().get(name);
  const list = (category, { deleted = false } = {}) => {
    const id = uuid();
    db.prepare('INSERT INTO lists (id, name, category_id, owner_id, deleted_at) VALUES (?, ?, ?, 1, ?)')
      .run(id, 'Liste', ref('categories', category), deleted ? '2026-10-01T00:00:00.000Z' : null);
    return id;
  };
  const item = (listId, name, { deleted = false } = {}) => db.prepare('INSERT INTO items (id, list_id, name, created_by, deleted_at) VALUES (?, ?, ?, 1, ?)')
    .run(uuid(), listId, name, deleted ? '2026-10-01T00:00:00.000Z' : null);
  const line = (key, display, { storeId = null, aisleId = null } = {}) => db.prepare('INSERT INTO item_history (name_normalized, store_id, display_name, aisle_id, use_count) VALUES (?, ?, ?, ?, 1)')
    .run(key, storeId, display, aisleId);

  const courses = list('Courses');
  const tasks = list('Tâches');
  const oldCourses = list('Courses', { deleted: true });
  // Noms qui ne viennent que des tâches : à retirer
  line('arroser les plantes', 'Arroser les plantes');
  item(tasks, 'Arroser les plantes');
  line('sortir les poubelles', 'Sortir les poubelles');
  // Noms de courses : à garder
  line('lait', 'Lait', { aisleId: ref('aisles', 'Crèmerie') });             // rayon, plus aucun article
  line('comte', 'Comté', {});
  line('comte', 'Comté', { storeId: ref('stores', 'Lidl') });              // ligne de magasin
  line('pain', 'Pain');
  item(courses, 'PAIN');                                                   // article de courses actif
  line('chips', 'Chips');
  item(courses, 'Chips', { deleted: true });                               // supprimé, pas encore purgé
  line('olives', 'Olives');
  item(oldCourses, 'Olives');                                              // liste de courses supprimée, pas purgée
  // Même nom dans une liste de tâches ET de courses : gardé
  line('ampoules', 'Ampoules');
  item(tasks, 'Ampoules');
  item(courses, 'Ampoules');
  // Ancien nom de courses sans rayon ni magasin, plus aucun article : retiré
  // (seul cas de courses touché par la règle prudente)
  line('glacons', 'Glaçons');
  return db;
}

const keys = (db) => db.prepare('SELECT DISTINCT name_normalized FROM item_history ORDER BY 1').pluck().all();

test('migration 8 : retire les noms venus seulement des autres listes, garde les noms de courses', () => {
  const db = oldData();
  assert.equal(pruneHistory(db), 3);
  assert.deepEqual(keys(db), ['ampoules', 'chips', 'comte', 'lait', 'olives', 'pain']);
  // Relancée : plus rien à effacer, aucune erreur
  assert.equal(pruneHistory(db), 0);
  assert.deepEqual(keys(db), ['ampoules', 'chips', 'comte', 'lait', 'olives', 'pain']);
  // Les listes et les articles ne changent pas
  assert.equal(db.prepare('SELECT COUNT(*) FROM items').pluck().get(), 6);
  db.close();
});

test('migration 8 : appliquée une seule fois par le mécanisme des migrations numérotées', () => {
  const db = oldData();
  assert.equal(schemaVersion(db), 18); // toutes les migrations, jusqu'à la 17 (autorisation Claude)
  // Comme une base restée en version 7 (avant les migrations 8 à 11) :
  // la migration 8 s'applique au démarrage
  db.exec('ALTER TABLE items DROP COLUMN checked_at; ALTER TABLE items DROP COLUMN priority; ALTER TABLE items DROP COLUMN due_date; ALTER TABLE items DROP COLUMN ean; ALTER TABLE lists DROP COLUMN priority_enabled; ALTER TABLE lists DROP COLUMN due_enabled; ALTER TABLE lists DROP COLUMN icon; ALTER TABLE lists DROP COLUMN add_mode; ALTER TABLE lists DROP COLUMN type; DROP TABLE oauth_tokens; DROP TABLE oauth_codes; DROP TABLE oauth_grant_lists; DROP TABLE oauth_grants; DROP TABLE oauth_requests; DROP TABLE oauth_clients; DROP TABLE list_events; DROP TABLE list_reads; ALTER TABLE users DROP COLUMN news_enabled; ALTER TABLE users DROP COLUMN news_checks');
  db.pragma('user_version = 7');
  migrate(db);
  assert.equal(schemaVersion(db), 18); // toutes les migrations, jusqu'à la 17 (autorisation Claude)
  assert.deepEqual(keys(db), ['ampoules', 'chips', 'comte', 'lait', 'olives', 'pain']);
  // Un second démarrage ne refait rien
  migrate(db);
  assert.equal(schemaVersion(db), 18); // toutes les migrations, jusqu'à la 17 (autorisation Claude)
  db.close();
});
