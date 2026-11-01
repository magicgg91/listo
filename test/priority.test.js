// Priorité et échéance des éléments (listes autres que les courses) :
// migration 10, validation stricte, refus sur une liste de courses (sans
// effet de bord), droits, ancien téléphone (champs absents = inchangés),
// temps réel, synchronisation, page publique, calcul « aujourd'hui / demain
// / en retard » sur des dates fixes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, setupAdmin, addUser, login, createClient } from './helpers.js';
import { openDatabase, migrate, schemaVersion } from '../server/db.js';
import { isDueDate } from '../server/lists.js';
import { todayKey, addDays, dueChip, priorityChip, dueDateLabel } from '../public/js/format.js';
import { emptyState, applyOp } from '../public/js/store.js';

const uuid = () => crypto.randomUUID();

// Foyer de test : Guillaume (propriétaire), Léa (invitée), Paul (ni l'un ni
// l'autre) ; une liste de tâches et une liste de courses, partagées avec Léa
async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  await addUser(app.db, { username: 'paul', password: 'MotDePasse-paul' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  const paul = app.client();
  await login(paul, 'paul', 'MotDePasse-paul');
  const tasks = uuid();
  const shopping = uuid();
  const task = uuid();
  const milk = uuid();
  await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: tasks, name: 'Maison', listType: 'tasks', priorityEnabled: true, dueEnabled: true },
    { id: uuid(), type: 'item.create', listId: tasks, itemId: task, name: 'Changer l\'ampoule', note: 'couloir' },
    { id: uuid(), type: 'list.create', listId: shopping, name: 'Courses', listType: 'shopping' },
    { id: uuid(), type: 'item.create', listId: shopping, itemId: milk, name: 'Lait', aisleId: 4 },
  ] });
  for (const id of [tasks, shopping]) await guillaume.request('PUT', `/api/lists/${id}/members`, { userIds: [leaId], access: { [leaId]: 'modification' } });
  // Compte les annonces temps réel (« la liste X a changé »)
  const notified = [];
  const notify = app.ctx.events.notifyList.bind(app.ctx.events);
  app.ctx.events.notifyList = (listId) => {
    notified.push(listId);
    notify(listId);
  };
  const row = (id) => app.db.prepare('SELECT name, note, priority, due_date, updated_at FROM items WHERE id = ?').get(id);
  return { app, guillaume, lea, paul, tasks, shopping, task, milk, notified, row };
}

const op = async (client, operation) => {
  const res = await client.post('/api/ops', { ops: [{ id: uuid(), ...operation }] });
  assert.equal(res.status, 200, res.text);
  return res.body.results[0];
};

// --- Migration ---

test('migration 10 : base existante, éléments en priorité normale sans échéance, rien d\'autre ne change', () => {
  const db = openDatabase(':memory:');
  assert.equal(schemaVersion(db), 18); // toutes les migrations, jusqu'à la 17 (autorisation Claude)
  // Base « d'avant » : version 9, sans les deux colonnes (ni le code-barres
  // de la migration 11), avec des données
  db.exec('ALTER TABLE items DROP COLUMN priority; ALTER TABLE items DROP COLUMN due_date; ALTER TABLE items DROP COLUMN ean; ALTER TABLE lists DROP COLUMN priority_enabled; ALTER TABLE lists DROP COLUMN due_enabled; ALTER TABLE lists DROP COLUMN icon; ALTER TABLE lists DROP COLUMN add_mode; ALTER TABLE lists DROP COLUMN type; DROP TABLE oauth_tokens; DROP TABLE oauth_codes; DROP TABLE oauth_grant_lists; DROP TABLE oauth_grants; DROP TABLE oauth_requests; DROP TABLE oauth_clients; DROP TABLE list_events; DROP TABLE list_reads; ALTER TABLE users DROP COLUMN news_enabled; ALTER TABLE users DROP COLUMN news_checks');
  db.pragma('user_version = 9');
  db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('a', 'A', 'x')").run();
  db.prepare("INSERT INTO lists (id, name, category_id, owner_id) VALUES ('l1', 'Maison', 2, 1)").run();
  db.prepare(`INSERT INTO items (id, list_id, name, quantity, note, checked, checked_at, created_by, created_at, updated_at)
              VALUES ('i1', 'l1', 'Ampoule', '2', 'couloir', 1, '2026-10-01T10:00:00.000Z', 1, '2026-09-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z')`).run();
  const before = db.prepare('SELECT id, name, quantity, note, checked, checked_at, created_at, updated_at FROM items').all();
  migrate(db);
  assert.equal(schemaVersion(db), 18); // toutes les migrations, jusqu'à la 17 (autorisation Claude)
  assert.deepEqual(db.prepare('SELECT id, name, quantity, note, checked, checked_at, created_at, updated_at FROM items').all(), before);
  assert.deepEqual(db.prepare('SELECT priority, due_date FROM items').get(), { priority: 'normal', due_date: null });
  // La contrainte refuse toute autre priorité, même écrite directement
  assert.throws(() => db.prepare("UPDATE items SET priority = 'urgent'").run(), /CHECK/);
  migrate(db); // second démarrage : rien
  assert.equal(schemaVersion(db), 18); // toutes les migrations, jusqu'à la 17 (autorisation Claude)
  db.close();
});

// --- Validation ---

test('échéance : date seule AAAA-MM-JJ, vraie date, entre 2000 et 2100', () => {
  for (const ok of ['2026-10-24', '2028-02-29', '2000-01-01', '2100-12-31', '2026-12-31']) assert.equal(isDueDate(ok), true, ok);
  for (const bad of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '2026-10-00', '2026-10-32', '1999-12-31', '2101-01-01',
    '2026-10-24T10:00', '2026-10-24T10:00:00Z', '2026-10-24 ', ' 2026-10-24', '24/10/2026', '2026-1-5', '', null, undefined, 20261024, {}]) {
    assert.equal(isDueDate(bad), false, JSON.stringify(bad));
  }
});

test('modifier priorité et échéance : valeurs refusées, null efface, champ absent inchangé', async (t) => {
  const h = await household(t);
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.task, priority: 'high', dueDate: '2026-10-24' })).status, 200);
  assert.deepEqual([h.row(h.task).priority, h.row(h.task).due_date], ['high', '2026-10-24']);
  const before = h.row(h.task);
  for (const [field, value] of [['priority', 'urgent'], ['priority', 'HIGH'], ['priority', null], ['priority', ''], ['priority', 2],
    ['dueDate', '2026-02-29'], ['dueDate', '2026-02-30'], ['dueDate', '1999-12-31'], ['dueDate', '2101-01-01'],
    ['dueDate', '2026-10-24T10:00'], ['dueDate', ''], ['dueDate', 0], ['dueDate', false]]) {
    const res = await op(h.guillaume, { type: 'item.update', itemId: h.task, [field]: value, name: 'Ne doit pas être écrit' });
    assert.equal(res.status, 400, `${field} = ${JSON.stringify(value)}`);
    assert.deepEqual(h.row(h.task), before, 'rien n\'est écrit');
  }
  // Année bissextile : le 29 février 2028 existe
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.task, dueDate: '2028-02-29' })).status, 200);
  // Champ absent : inchangé ; dueDate: null : effacée
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.task, note: 'escalier' })).status, 200);
  assert.deepEqual([h.row(h.task).priority, h.row(h.task).due_date, h.row(h.task).note], ['high', '2028-02-29', 'escalier']);
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.task, dueDate: null })).status, 200);
  assert.deepEqual([h.row(h.task).priority, h.row(h.task).due_date], ['high', null]);
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.task, priority: 'low' })).status, 200);
  assert.equal(h.row(h.task).priority, 'low');
});

test('ancien téléphone (opération sans priorité ni échéance, ou restée dans la file) : les deux champs restent intacts', async (t) => {
  const h = await household(t);
  await op(h.lea, { type: 'item.update', itemId: h.task, priority: 'high', dueDate: '2026-11-02' });
  // Opérations telles qu'un ancien téléphone les envoie, en lot (file d'attente rejouée au retour du réseau)
  const res = await h.guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'item.update', itemId: h.task, name: 'Changer les ampoules' },
    { id: uuid(), type: 'item.update', itemId: h.task, quantity: '3', note: 'couloir et cave' },
    { id: uuid(), type: 'item.check', itemId: h.task, checked: true },
    { id: uuid(), type: 'item.check', itemId: h.task, checked: false },
  ] });
  assert.deepEqual(res.body.results.map((r) => r.status), [200, 200, 200, 200]);
  assert.deepEqual([h.row(h.task).name, h.row(h.task).priority, h.row(h.task).due_date], ['Changer les ampoules', 'high', '2026-11-02']);
});

test('liste de courses : priorité et échéance refusées, sans rien écrire ni rien annoncer', async (t) => {
  const h = await household(t);
  const before = h.row(h.milk);
  h.notified.length = 0;
  for (const operation of [
    { priority: 'high' }, { dueDate: '2026-10-24' }, { dueDate: null }, { priority: 'normal' },
    { name: 'Lait entier', priority: 'high' }, { note: 'bio', dueDate: '2026-10-24' },
  ]) {
    const res = await op(h.guillaume, { type: 'item.update', itemId: h.milk, ...operation });
    assert.equal(res.status, 400, JSON.stringify(operation));
    assert.match(res.error, /ne se choisissent que dans une liste autre que les courses/);
  }
  assert.deepEqual(h.row(h.milk), before, 'rien n\'est écrit');
  assert.deepEqual(h.notified, [], 'aucune annonce temps réel');
  // Les autres champs se modifient toujours, et sont annoncés
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.milk, note: 'bio' })).status, 200);
  assert.deepEqual(h.notified, [h.shopping]);
});

test('droits : tout membre modifie, non-membre 404, visiteur sans compte 401', async (t) => {
  const h = await household(t);
  assert.equal((await op(h.lea, { type: 'item.update', itemId: h.task, priority: 'high' })).status, 200, 'invitée');
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.task, dueDate: '2026-12-01' })).status, 200, 'propriétaire');
  const before = h.row(h.task);
  const outsider = await op(h.paul, { type: 'item.update', itemId: h.task, priority: 'low', dueDate: '2026-01-01' });
  assert.equal(outsider.status, 404);
  assert.deepEqual(h.row(h.task), before);
  const anonymous = createClient(h.app.base);
  assert.equal((await anonymous.post('/api/ops', { ops: [{ id: uuid(), type: 'item.update', itemId: h.task, priority: 'low' }] })).status, 401);
  assert.deepEqual(h.row(h.task), before);
});

test('temps réel et synchronisation : modification annoncée, champs renvoyés par /api/sync', async (t) => {
  const h = await household(t);
  h.notified.length = 0;
  const result = await op(h.lea, { type: 'item.update', itemId: h.task, priority: 'high', dueDate: '2026-10-24' });
  assert.deepEqual(h.notified, [h.tasks]);
  assert.equal(result.item.priority, 'high');
  assert.equal(result.item.dueDate, '2026-10-24');
  const sync = (await h.guillaume.get('/api/sync')).body;
  const synced = sync.items.find((item) => item.id === h.task);
  assert.deepEqual([synced.priority, synced.dueDate], ['high', '2026-10-24']);
  const milk = sync.items.find((item) => item.id === h.milk);
  assert.deepEqual([milk.priority, milk.dueDate], ['normal', null]);
});

test('téléphone : la copie locale applique priorité et échéance (null efface, champ absent inchangé)', () => {
  const state = emptyState();
  state.items.set('i1', { id: 'i1', listId: 'l1', name: 'Ampoule', priority: 'normal', dueDate: null, updatedAt: '' });
  applyOp(state, { type: 'item.update', itemId: 'i1', priority: 'high', dueDate: '2026-10-24' }, { now: 'x' });
  assert.deepEqual([state.items.get('i1').priority, state.items.get('i1').dueDate], ['high', '2026-10-24']);
  applyOp(state, { type: 'item.update', itemId: 'i1', name: 'Ampoules' }, { now: 'y' });
  assert.deepEqual([state.items.get('i1').priority, state.items.get('i1').dueDate], ['high', '2026-10-24']);
  applyOp(state, { type: 'item.update', itemId: 'i1', dueDate: null }, { now: 'z' });
  assert.equal(state.items.get('i1').dueDate, null);
});

test('page publique : priorité et échéance pour une liste classique (liste blanche), jamais pour les courses ; ordre alphabétique', async (t) => {
  const h = await household(t);
  const extra = [uuid(), uuid()];
  await h.guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'item.create', listId: h.tasks, itemId: extra[0], name: 'arroser' },
    { id: uuid(), type: 'item.create', listId: h.tasks, itemId: extra[1], name: 'Zinguerie' },
    { id: uuid(), type: 'item.update', itemId: extra[1], priority: 'high', dueDate: '2026-10-20' },
    { id: uuid(), type: 'item.update', itemId: h.task, priority: 'low' },
  ] });
  const read = async (listId) => {
    const res = await h.guillaume.request('PUT', `/api/lists/${listId}/share`, {});
    const token = res.body.share.url.split('/p/')[1];
    return (await createClient(h.app.base, { ip: '203.0.113.9' }).get(`/api/public/${token}`)).body;
  };
  const tasks = await read(h.tasks);
  const items = tasks.groups.flatMap((group) => group.items);
  for (const item of items) assert.deepEqual(Object.keys(item).sort(), ['checked', 'dueDate', 'name', 'note', 'photo', 'priority', 'quantity']);
  assert.deepEqual(items.map((item) => item.name), ['arroser', 'Changer l\'ampoule', 'Zinguerie'], 'ordre alphabétique');
  assert.deepEqual(items.map((item) => [item.priority, item.dueDate]), [['normal', null], ['low', null], ['high', '2026-10-20']]);
  const courses = await read(h.shopping);
  for (const item of courses.groups.flatMap((group) => group.items)) {
    assert.deepEqual(Object.keys(item).sort(), ['checked', 'name', 'note', 'photo', 'quantity'], 'courses : aucun champ ajouté');
  }
});

// --- Calcul des dates (téléphone) ---

test('aujourd\'hui / demain / en retard : dates fixes, minuit, fin de mois, année bissextile', () => {
  // Date du téléphone (heure locale), jusqu'à la dernière seconde de la journée
  assert.equal(todayKey(new Date(2026, 9, 24, 0, 0, 0)), '2026-10-24');
  assert.equal(todayKey(new Date(2026, 9, 24, 23, 59, 59)), '2026-10-24');
  assert.equal(todayKey(new Date(2026, 9, 25, 0, 0, 0)), '2026-10-25');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2027-02-28', 1), '2027-03-01');
  assert.equal(addDays('2026-10-24', 7), '2026-10-31');
  assert.equal(dueDateLabel('2026-10-24', '2026-10-01'), 'sam. 24 oct.');
  assert.equal(dueDateLabel('2027-01-08', '2026-10-01'), 'ven. 8 janv. 2027');

  const today = '2026-10-24';
  assert.equal(dueChip(null, false, today), null);
  assert.equal(dueChip('2026-10-24', false, today).state, 'today', 'aujourd\'hui toute la journée');
  assert.equal(dueChip('2026-10-24', false, today).text, 'Aujourd\'hui');
  assert.equal(dueChip('2026-10-25', false, today).text, 'Demain');
  assert.equal(dueChip('2026-10-23', false, today).state, 'late', 'en retard dès le lendemain');
  assert.equal(dueChip('2026-10-23', false, today).text, 'En retard · ven. 23 oct.');
  assert.equal(dueChip('2026-10-23', false, '2026-10-23').state, 'today');
  assert.equal(dueChip('2026-11-01', false, '2026-10-31').text, 'Demain', 'fin de mois');
  assert.equal(dueChip('2028-02-29', false, '2028-02-28').text, 'Demain', 'année bissextile');
  assert.equal(dueChip('2026-10-30', false, today).text, 'ven. 30 oct.');
  // Élément coché : jamais « en retard », sa date en gris
  assert.deepEqual(dueChip('2026-10-01', true, today), { state: 'done', text: 'jeu. 1 oct.', label: 'Échéance : jeu. 1 oct.' });
  assert.deepEqual(priorityChip('high'), { icon: 'arrow-up', text: 'Élevée', label: 'Priorité élevée' });
  assert.deepEqual(priorityChip('low'), { icon: 'arrow-down', text: 'Basse', label: 'Priorité basse' });
  assert.equal(priorityChip('normal'), null);
  assert.equal(priorityChip(undefined), null);
});
