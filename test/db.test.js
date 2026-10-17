// Tests du schéma de la base de données.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase, schemaVersion, MIGRATIONS } from '../server/db.js';
import { tempDir } from './helpers.js';

// Les tables du cahier des charges déjà créées : applied_ops (étape 4 :
// opérations déjà appliquées, pour qu'un renvoi ne soit jamais appliqué deux
// fois) et store_members (étape 6 : magasins regroupés par un « multi »).
// public_shares arrivera avec le lien public (étape 10).
const TABLES = [
  'users', 'recovery_codes', 'sessions', 'categories', 'stores', 'store_members',
  'aisles', 'lists', 'list_members', 'items', 'item_history', 'applied_ops',
];

// Base en mémoire avec un compte, une catégorie et une liste, pour les tests
function sampleDb() {
  const db = openDatabase(':memory:');
  db.prepare("INSERT INTO users (id, username, display_name, password_hash) VALUES (1, 'guillaume', 'Guillaume', 'x')").run();
  // La catégorie « Courses » fait partie des données de départ
  const courses = db.prepare("SELECT id FROM categories WHERE name = 'Courses'").pluck().get();
  db.prepare("INSERT INTO lists (id, name, category_id, owner_id) VALUES ('liste-1', 'Courses', ?, 1)").run(courses);
  return db;
}

test('les tables sont créées (cahier des charges, sauf public_shares de l\'étape 10)', () => {
  const db = openDatabase(':memory:');
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all();
  for (const table of TABLES) assert.ok(names.includes(table), `table ${table} manquante`);
  assert.equal(names.length, TABLES.length);
  assert.equal(schemaVersion(db), MIGRATIONS.length);
});

test('les clés étrangères sont activées', () => {
  const db = sampleDb();
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  // Un article qui pointe vers une liste inexistante est refusé
  assert.throws(
    () => db.prepare("INSERT INTO items (id, list_id, name, created_by) VALUES ('a', 'inconnue', 'Lait', 1)").run(),
    /FOREIGN KEY/
  );
});

test('un élément utilisé ne peut pas être effacé (catégorie, compte)', () => {
  const db = sampleDb();
  assert.throws(() => db.prepare("DELETE FROM categories WHERE name = 'Courses'").run(), /FOREIGN KEY/);
  assert.throws(() => db.prepare('DELETE FROM users WHERE id = 1').run(), /FOREIGN KEY/);
});

test('les index demandés existent', () => {
  const db = openDatabase(':memory:');
  const cols = (index) => db.prepare(`PRAGMA index_info(${index})`).all().map((c) => c.name);
  assert.deepEqual(cols('items_list_updated'), ['list_id', 'updated_at']);
  assert.deepEqual(cols('list_members_user'), ['user_id']);
});

test("l'identifiant est unique, sans tenir compte des majuscules", () => {
  const db = sampleDb();
  assert.throws(
    () => db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('Guillaume', 'G', 'x')").run(),
    /UNIQUE/
  );
});

test('un compte a le rôle « user » par défaut, et seulement admin ou user', () => {
  const db = sampleDb();
  assert.equal(db.prepare('SELECT role FROM users WHERE id = 1').pluck().get(), 'user');
  assert.throws(
    () => db.prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES ('b', 'B', 'x', 'chef')").run(),
    /CHECK/
  );
});

test('les longueurs maximales sont vérifiées (nom 100, quantité 30, note 500)', () => {
  const db = sampleDb();
  const insert = db.prepare('INSERT INTO items (id, list_id, name, quantity, note, created_by) VALUES (?, ?, ?, ?, ?, 1)');
  insert.run('ok', 'liste-1', 'a'.repeat(100), 'q'.repeat(30), 'n'.repeat(500));
  assert.throws(() => insert.run('nom', 'liste-1', 'a'.repeat(101), '', ''), /CHECK/);
  assert.throws(() => insert.run('qte', 'liste-1', 'Lait', 'q'.repeat(31), ''), /CHECK/);
  assert.throws(() => insert.run('note', 'liste-1', 'Lait', '', 'n'.repeat(501)), /CHECK/);
  assert.throws(() => insert.run('vide', 'liste-1', '', '', ''), /CHECK/);
});

test("les dates par défaut sont au format ISO, en UTC", () => {
  const db = sampleDb();
  const row = db.prepare("SELECT created_at, updated_at, deleted_at FROM lists WHERE id = 'liste-1'").get();
  assert.match(row.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(row.deleted_at, null);
});

test('rouvrir une base existante ne refait pas les migrations et garde les données', (t) => {
  const file = path.join(tempDir(t), 'data', 'listo.db');
  const first = openDatabase(file);
  first.prepare("INSERT INTO stores (name) VALUES ('Marché')").run();
  first.close();

  const second = openDatabase(file);
  assert.equal(schemaVersion(second), MIGRATIONS.length);
  assert.equal(second.prepare("SELECT COUNT(*) FROM stores WHERE name = 'Marché'").pluck().get(), 1);
  second.close();
});

test("une base de l'étape 1 est mise à jour sans perte (migration 2)", (t) => {
  const file = path.join(tempDir(t), 'listo.db');
  // Base créée avec seulement la migration 1, comme à l'étape 1
  const old = new Database(file);
  old.exec(MIGRATIONS[0]);
  old.pragma('user_version = 1');
  old.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('marie', 'Marie', 'x')").run();
  old.close();

  const db = openDatabase(file);
  assert.equal(schemaVersion(db), MIGRATIONS.length);
  assert.deepEqual(db.prepare('SELECT username, totp_last_step FROM users').get(), { username: 'marie', totp_last_step: null });
  db.close();
});

// --- Données de départ (migration 3) ---

const seedCounts = (db) => ['categories', 'stores', 'aisles']
  .map((table) => db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get());

test('les données de départ sont créées au premier démarrage', () => {
  const db = openDatabase(':memory:');
  assert.deepEqual(db.prepare('SELECT name, is_shopping FROM categories ORDER BY name').all(), [
    { name: 'Courses', is_shopping: 1 },
    { name: 'Tâches', is_shopping: 0 },
  ]);
  assert.deepEqual(db.prepare('SELECT name FROM stores ORDER BY name').pluck().all(), ['Carrefour', 'E.Leclerc', 'Lidl']);
  assert.deepEqual(db.prepare('SELECT name FROM aisles ORDER BY name').pluck().all(), [
    'Boissons', 'Boucherie', 'Boulangerie', 'Crèmerie', 'Entretien', 'Fromages', 'Fruits et légumes',
    'Hygiène', 'Poissonnerie', 'Surgelés', 'Épicerie salée', 'Épicerie sucrée',
  ]);
  assert.equal(db.prepare('SELECT COUNT(*) FROM categories WHERE active = 0').pluck().get(), 0);
});

test("les données de départ ne sont créées qu'une fois, même après un redémarrage", (t) => {
  const file = path.join(tempDir(t), 'listo.db');
  const first = openDatabase(file);
  const counts = seedCounts(first);
  assert.deepEqual(counts, [2, 3, 12]);
  // L'Admin modifie les données de départ : il supprime un magasin et renomme un rayon
  first.prepare("DELETE FROM stores WHERE name = 'Lidl'").run();
  first.prepare("UPDATE aisles SET name = 'Hygiène et beauté' WHERE name = 'Hygiène'").run();
  first.close();

  // Deux redémarrages : rien n'est recréé, les modifications sont gardées
  for (let i = 0; i < 2; i++) {
    const again = openDatabase(file);
    assert.deepEqual(seedCounts(again), [2, 2, 12]);
    assert.equal(again.prepare("SELECT COUNT(*) FROM stores WHERE name = 'Lidl'").pluck().get(), 0);
    assert.equal(again.prepare("SELECT COUNT(*) FROM aisles WHERE name = 'Hygiène'").pluck().get(), 0);
    again.close();
  }
});

test("une base de l'étape 2 reçoit les données de départ lors de sa mise à jour", (t) => {
  const file = path.join(tempDir(t), 'listo.db');
  const old = new Database(file);
  old.exec(MIGRATIONS[0]);
  old.exec(MIGRATIONS[1]);
  old.pragma('user_version = 2');
  old.prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES ('guillaume', 'G', 'x', 'admin')").run();
  old.close();

  const db = openDatabase(file);
  assert.deepEqual(seedCounts(db), [2, 3, 12]);
  assert.deepEqual(db.prepare('SELECT username, must_change_password FROM users').get(), { username: 'guillaume', must_change_password: 0 });
  db.close();
});
