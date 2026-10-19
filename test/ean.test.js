// Code-barres (EAN) des articles des listes de courses : migration 11,
// validation (clé de contrôle, UPC-A → EAN-13), refus hors listes de
// courses, droits, ancien téléphone, synchronisation, temps réel, page
// publique, journaux, et détection de doublon du mode scan.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { openDatabase, migrate, schemaVersion } from '../server/db.js';
import { emptyState, applyOp, duplicateOf, duplicateText } from '../public/js/store.js';

const uuid = () => crypto.randomUUID();

// Foyer de test : Guillaume (propriétaire), Léa (invitée), Paul (ni l'un ni
// l'autre) ; une liste de courses et une liste de tâches, partagées avec Léa
async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  await addUser(app.db, { username: 'paul', password: 'MotDePasse-paul' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  const paul = app.client();
  await login(paul, 'paul', 'MotDePasse-paul');
  const shopping = uuid();
  const tasks = uuid();
  const milk = uuid();
  const task = uuid();
  await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: shopping, name: 'Courses', categoryId: 1 },
    { id: uuid(), type: 'item.create', listId: shopping, itemId: milk, name: 'Lait', aisleId: 4 },
    { id: uuid(), type: 'list.create', listId: tasks, name: 'Maison', categoryId: 2 },
    { id: uuid(), type: 'item.create', listId: tasks, itemId: task, name: 'Ampoule' },
  ] });
  for (const id of [shopping, tasks]) await guillaume.request('PUT', `/api/lists/${id}/members`, { userIds: [leaId], access: { [leaId]: 'modification' } });
  const notified = [];
  const notify = app.ctx.events.notifyList.bind(app.ctx.events);
  app.ctx.events.notifyList = (listId) => {
    notified.push(listId);
    notify(listId);
  };
  const row = (id) => app.db.prepare('SELECT name, note, ean, updated_at FROM items WHERE id = ?').get(id);
  return { app, guillaume, lea, paul, shopping, tasks, milk, task, notified, row };
}

const op = async (client, operation) => {
  const res = await client.post('/api/ops', { ops: [{ id: uuid(), ...operation }] });
  assert.equal(res.status, 200, res.text);
  return res.body.results[0];
};

// --- Migration ---

test('migration 11 : base existante (fichier), articles sans code, rien d\'autre ne change', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'listo-ean-'));
  const file = path.join(dir, 'listo.db');
  // Base « d'avant » : version 10, sans la colonne, avec des données
  let db = openDatabase(file);
  db.exec('ALTER TABLE items DROP COLUMN ean; ALTER TABLE lists DROP COLUMN priority_enabled; ALTER TABLE lists DROP COLUMN due_enabled; ALTER TABLE lists DROP COLUMN icon');
  db.pragma('user_version = 10');
  db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('a', 'A', 'x')").run();
  db.prepare("INSERT INTO lists (id, name, category_id, owner_id) VALUES ('l1', 'Courses', 1, 1)").run();
  db.prepare(`INSERT INTO items (id, list_id, name, quantity, note, aisle_id, checked, checked_at, created_by, created_at, updated_at)
              VALUES ('i1', 'l1', 'Lait', '2', 'demi-écrémé', 4, 1, '2026-10-01T10:00:00.000Z', 1, '2026-09-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z')`).run();
  const columns = 'id, list_id, name, quantity, note, aisle_id, store_id, checked, checked_at, priority, due_date, created_at, updated_at';
  const before = db.prepare(`SELECT ${columns} FROM items`).all();
  db.close();
  // Redémarrage : la migration 11 s'applique
  db = openDatabase(file);
  assert.equal(schemaVersion(db), 14); // toutes les migrations, jusqu'à la 14 (icône des listes)
  assert.deepEqual(db.prepare(`SELECT ${columns} FROM items`).all(), before);
  assert.equal(db.prepare('SELECT ean FROM items').pluck().get(), null);
  // La contrainte : vide, ou exactement 8 ou 13 chiffres
  for (const ok of ['3017620422003', '96385074', null]) db.prepare('UPDATE items SET ean = ?').run(ok);
  for (const bad of ['', '123', '012345678905', '30176204220031', '301762042200A', 'abcdefgh', ' 96385074', '9638507 ']) {
    assert.throws(() => db.prepare('UPDATE items SET ean = ?').run(bad), /CHECK/, JSON.stringify(bad));
  }
  migrate(db); // second démarrage : rien
  assert.equal(schemaVersion(db), 14); // toutes les migrations, jusqu'à la 14 (icône des listes)
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- Validation ---

test('code-barres : normalisé, clé de contrôle vérifiée, null efface, chaîne vide refusée', async (t) => {
  const h = await household(t);
  // EAN-13
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.milk, ean: '3428272950019' })).status, 200);
  assert.equal(h.row(h.milk).ean, '3428272950019');
  // EAN-8
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.milk, ean: '96385074' })).item.ean, '96385074');
  // UPC-A : gardé en EAN-13 (un 0 devant)
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.milk, ean: '012345678905' })).item.ean, '0012345678905');
  assert.equal(h.row(h.milk).ean, '0012345678905');
  // Refusés, jamais enregistrés tels quels
  for (const bad of ['3428272950018', '301762042200A', 'abcdefgh', '1234567', '123456789', '30176204220031', '', ' 3428272950019',
    3428272950019, true, {}, ['3428272950019']]) {
    const result = await op(h.guillaume, { type: 'item.update', itemId: h.milk, ean: bad });
    assert.equal(result.status, 400, JSON.stringify(bad));
    assert.equal(result.error, 'Code-barres invalide : vérifiez les chiffres (8, 12 ou 13 chiffres).');
  }
  assert.equal(h.row(h.milk).ean, '0012345678905');
  // null efface
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.milk, ean: null })).item.ean, null);
  assert.equal(h.row(h.milk).ean, null);
  // À la création
  const bread = uuid();
  assert.equal((await op(h.guillaume, { type: 'item.create', listId: h.shopping, itemId: bread, name: 'Pain de mie', ean: '012345678905' })).item.ean, '0012345678905');
  const refused = uuid();
  assert.equal((await op(h.guillaume, { type: 'item.create', listId: h.shopping, itemId: refused, name: 'Biscuits', ean: '12' })).status, 400);
  assert.equal(h.row(refused), undefined, 'rien n\'est créé');
  // Sans code : null
  const eggs = uuid();
  assert.equal((await op(h.guillaume, { type: 'item.create', listId: h.shopping, itemId: eggs, name: 'Œufs' })).item.ean, null);
});

test('photo et code-barres facultatifs : un article s\'enregistre sans l\'un ni l\'autre', async (t) => {
  const h = await household(t);
  // Création avec le nom seul, puis modification de la note et de la
  // quantité : ni code-barres ni photo à aucun moment
  const butter = uuid();
  const created = await op(h.guillaume, { type: 'item.create', listId: h.shopping, itemId: butter, name: 'Beurre' });
  assert.equal(created.status, 200);
  assert.equal(created.item.ean, null);
  assert.equal(created.item.photoAt, null);
  const updated = await op(h.guillaume, { type: 'item.update', itemId: butter, note: 'doux', quantity: '2' });
  assert.equal(updated.status, 200);
  assert.equal(updated.item.note, 'doux');
  assert.equal(updated.item.ean, null);
  assert.equal(updated.item.photoAt, null);
  const stored = h.app.db.prepare('SELECT name, ean, photo_at FROM items WHERE id = ?').get(butter);
  assert.deepEqual({ ...stored }, { name: 'Beurre', ean: null, photo_at: null });
  // Liste de tâches : même chose
  const task = uuid();
  assert.equal((await op(h.guillaume, { type: 'item.create', listId: h.tasks, itemId: task, name: 'Appeler le plombier' })).status, 200);
  // Feuille de l'article : champ Code-barres vide = pas de code (null), pas
  // une erreur ; la photo n'est pas demandée à l'enregistrement
  const list = fs.readFileSync(new URL('../public/js/screens/list.js', import.meta.url), 'utf8');
  assert.match(list, /const newEan = typedEan \? normalizeBarcode\(typedEan\) : null;/);
  assert.match(list, /if \(!newName \|\| \(shopping && typedEan && !newEan\)\) return;/);
});

test('deux articles peuvent porter le même code (pas d\'interdiction)', async (t) => {
  const h = await household(t);
  const other = uuid();
  await op(h.guillaume, { type: 'item.update', itemId: h.milk, ean: '3428272950019' });
  assert.equal((await op(h.guillaume, { type: 'item.create', listId: h.shopping, itemId: other, name: 'Lait (pack)', ean: '3428272950019' })).status, 200);
  assert.equal(h.row(other).ean, '3428272950019');
});

test('liste autre que les courses : code refusé, rien écrit, rien annoncé', async (t) => {
  const h = await household(t);
  const before = h.row(h.task);
  h.notified.length = 0;
  const update = await op(h.guillaume, { type: 'item.update', itemId: h.task, ean: '3017620422003', note: 'escalier' });
  assert.equal(update.status, 400);
  assert.equal(update.error, 'Le code-barres ne se choisit que dans une liste de courses.');
  // null aussi : le champ n'existe pas pour ces listes
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.task, ean: null })).status, 400);
  const created = uuid();
  assert.equal((await op(h.guillaume, { type: 'item.create', listId: h.tasks, itemId: created, name: 'Vis', ean: '3017620422003' })).status, 400);
  assert.deepEqual(h.row(h.task), before, 'rien n\'est écrit (pas même la note)');
  assert.equal(h.row(created), undefined);
  assert.deepEqual(h.notified, [], 'aucune annonce temps réel');
});

test('droits : membre invité oui ; non-membre 404 ; visiteur sans compte 401', async (t) => {
  const h = await household(t);
  assert.equal((await op(h.lea, { type: 'item.update', itemId: h.milk, ean: '3428272950019' })).status, 200);
  assert.equal(h.row(h.milk).ean, '3428272950019');
  const paul = await op(h.paul, { type: 'item.update', itemId: h.milk, ean: null });
  assert.equal(paul.status, 404);
  const created = uuid();
  assert.equal((await op(h.paul, { type: 'item.create', listId: h.shopping, itemId: created, name: 'Lait', ean: '3428272950019' })).status, 404);
  assert.equal(h.row(h.milk).ean, '3428272950019');
  const visitor = await h.app.client().post('/api/ops', { ops: [{ id: uuid(), type: 'item.update', itemId: h.milk, ean: null }] });
  assert.equal(visitor.status, 401);
  assert.equal(h.row(h.milk).ean, '3428272950019');
});

test('ancien téléphone (opération sans le champ) : code conservé ; conflits champ par champ', async (t) => {
  const h = await household(t);
  await op(h.guillaume, { type: 'item.update', itemId: h.milk, ean: '3428272950019' });
  // Opération d'un téléphone qui ne connaît pas le code-barres (ou mise en
  // file d'attente avant la mise à jour)
  assert.equal((await op(h.lea, { type: 'item.update', itemId: h.milk, note: 'demi-écrémé' })).status, 200);
  assert.deepEqual([h.row(h.milk).note, h.row(h.milk).ean], ['demi-écrémé', '3428272950019']);
  assert.equal((await op(h.lea, { type: 'item.update', itemId: h.milk, name: 'Lait bio' })).item.ean, '3428272950019');
  // Deux téléphones changent le code : la dernière modification reçue gagne
  await op(h.guillaume, { type: 'item.update', itemId: h.milk, ean: '96385074' });
  await op(h.lea, { type: 'item.update', itemId: h.milk, ean: '3017620422003' });
  assert.equal(h.row(h.milk).ean, '3017620422003');
  // L'un change le code, l'autre la note : les deux sont gardés
  await op(h.guillaume, { type: 'item.update', itemId: h.milk, ean: null });
  await op(h.lea, { type: 'item.update', itemId: h.milk, note: 'entier' });
  assert.deepEqual([h.row(h.milk).note, h.row(h.milk).ean], ['entier', null]);
});

test('synchronisation et temps réel : le code suit comme les autres champs', async (t) => {
  const h = await household(t);
  const sync = await h.lea.get('/api/sync');
  h.notified.length = 0;
  await op(h.guillaume, { type: 'item.update', itemId: h.milk, ean: '3428272950019' });
  assert.deepEqual(h.notified, [h.shopping], 'les membres sont prévenus');
  const changes = await h.lea.get(`/api/sync?since=${encodeURIComponent(sync.body.serverTime)}`);
  const milk = changes.body.items.find((item) => item.id === h.milk);
  assert.equal(milk.ean, '3428272950019');
  // Lecture d'une liste
  const list = await h.lea.get(`/api/lists/${h.shopping}`);
  assert.match(JSON.stringify(list.body), /"ean":"3428272950019"/);

  // Copie locale du téléphone (file d'attente hors ligne) : mêmes règles
  const state = emptyState();
  state.lists.set(h.shopping, { id: h.shopping, name: 'Courses', category: { isShopping: true } });
  const user = { id: 1 };
  const id = uuid();
  applyOp(state, { type: 'item.create', listId: h.shopping, itemId: id, name: 'Nutella', ean: '3017620422003' }, { user });
  assert.equal(state.items.get(id).ean, '3017620422003');
  applyOp(state, { type: 'item.update', itemId: id, note: 'Ferrero' }, { user });
  assert.equal(state.items.get(id).ean, '3017620422003', 'champ absent : inchangé');
  applyOp(state, { type: 'item.update', itemId: id, ean: null }, { user });
  assert.equal(state.items.get(id).ean, null);
  const plain = uuid();
  applyOp(state, { type: 'item.create', listId: h.shopping, itemId: plain, name: 'Pain' }, { user });
  assert.equal(state.items.get(plain).ean, null);
});

test('page publique : le code-barres n\'est jamais exposé', async (t) => {
  const h = await household(t);
  await op(h.guillaume, { type: 'item.update', itemId: h.milk, ean: '3428272950019' });
  const share = await h.guillaume.request('PUT', `/api/lists/${h.shopping}/share`, {});
  const token = share.body.share.url.split('/p/')[1];
  const res = await fetch(`${h.app.base}/api/public/${token}`);
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.match(text, /Lait/);
  assert.doesNotMatch(text, /ean|3428272950019/i);
});

test('journaux : le code-barres n\'y est jamais écrit', async (t) => {
  const lines = [];
  for (const method of ['log', 'warn', 'error', 'info']) t.mock.method(console, method, (...args) => lines.push(args.join(' ')));
  const h = await household(t);
  await op(h.guillaume, { type: 'item.update', itemId: h.milk, ean: '3428272950019' });
  await op(h.guillaume, { type: 'item.update', itemId: h.milk, ean: 'faux' });
  await op(h.guillaume, { type: 'item.create', listId: h.shopping, itemId: uuid(), name: 'Pain', ean: '0012345678905' });
  await op(h.guillaume, { type: 'item.update', itemId: h.task, ean: '3017620422003' });
  assert.doesNotMatch([...lines, ...h.app.logs].join('\n'), /3428272950019|0012345678905|3017620422003/);
});

// --- Détection de doublon (mode scan) ---

test('doublon : même code-barres ou même nom (le code passe avant le nom)', () => {
  const item = (name, ean = null, checked = false) => ({ id: uuid(), name, ean, checked });
  const view = {
    groups: [{ items: [item('Lait demi-écrémé', '3428272950019'), item('Pain')] }],
    done: [item('Nutella', '3017620422003', true)],
  };
  // Même code, nom différent
  assert.deepEqual(duplicateOf(view, 'Lait entier Lactel', '3428272950019'), { where: 'list', by: 'code', name: 'Lait demi-écrémé' });
  assert.equal(duplicateText(duplicateOf(view, 'Lait entier', '3428272950019')), 'Déjà dans la liste : « Lait demi-écrémé » a ce code-barres.');
  // Même code, article coché (dans le panier)
  assert.deepEqual(duplicateOf(view, 'Pâte à tartiner', '3017620422003'), { where: 'cart', by: 'code', name: 'Nutella' });
  assert.equal(duplicateText(duplicateOf(view, 'x', '3017620422003')), 'Déjà dans le panier (coché) : « Nutella » a ce code-barres.');
  // Même nom (majuscules et accents ignorés), sans code
  assert.deepEqual(duplicateOf(view, 'PAIN', null), { where: 'list', by: 'name', name: 'Pain' });
  assert.equal(duplicateText(duplicateOf(view, 'pain', '96385074')), 'Déjà dans la liste.');
  assert.deepEqual(duplicateOf(view, 'nutella', '96385074'), { where: 'cart', by: 'name', name: 'Nutella' });
  // Ni le code ni le nom
  assert.equal(duplicateOf(view, 'Beurre', '96385074'), null);
  assert.equal(duplicateOf(view, '', null), null);
  assert.equal(duplicateOf(null, 'Pain', null), null);
});
