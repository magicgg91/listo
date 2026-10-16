// Tests du schéma de la base de données.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openDatabase, schemaVersion, MIGRATIONS } from '../server/db.js';
import { tempDir } from './helpers.js';

// Les dix tables du cahier des charges
const TABLES = [
  'users', 'recovery_codes', 'sessions', 'categories', 'stores',
  'aisles', 'lists', 'list_members', 'items', 'item_history',
];

// Base en mémoire avec un compte, une catégorie et une liste, pour les tests
function sampleDb() {
  const db = openDatabase(':memory:');
  db.prepare("INSERT INTO users (id, username, display_name, password_hash) VALUES (1, 'guillaume', 'Guillaume', 'x')").run();
  db.prepare("INSERT INTO categories (id, name, is_shopping) VALUES (1, 'Courses', 1)").run();
  db.prepare("INSERT INTO lists (id, name, category_id, owner_id) VALUES ('liste-1', 'Courses', 1, 1)").run();
  return db;
}

test('les dix tables sont créées', () => {
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
  assert.throws(() => db.prepare('DELETE FROM categories WHERE id = 1').run(), /FOREIGN KEY/);
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
  assert.equal(second.prepare('SELECT name FROM stores').pluck().get(), 'Marché');
  second.close();
});
