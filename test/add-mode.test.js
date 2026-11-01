// « Après l'ajout » (migration 15) : rester sur la liste ('quick') ou ouvrir
// la fiche de l'élément ajouté ('detail'), réglé liste par liste par le
// propriétaire. Valeur par défaut selon le type de liste, migration des
// listes existantes, droits, duplication, temps réel, copie locale, et
// comportement de l'écran (la fiche s'ouvre sans curseur). Le comportement
// à l'écran est aussi vérifié dans Chromium (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { openDatabase, schemaVersion, addModeMigration } from '../server/db.js';
import { ADD_MODES } from '../server/lists.js';
import { emptyState, applyOp, addModeOf, defaultAddMode } from '../public/js/store.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const INVALID = 'Réglage « Après l\'ajout » invalide.';

// Guillaume (propriétaire) ; Léa « Peut modifier » ; Paul « Lecture seule » ;
// Marc, sans accès. Une liste de tâches, une liste de courses.
async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const ids = {};
  const clients = {};
  for (const name of ['lea', 'paul', 'marc']) {
    ids[name] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    clients[name] = app.client();
    await login(clients[name], name, `MotDePasse-${name}`);
  }
  const tasks = uuid();
  const shopping = uuid();
  await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: tasks, name: 'Maison', listType: 'tasks' },
    { id: uuid(), type: 'list.create', listId: shopping, name: 'Courses', listType: 'shopping' },
  ] });
  for (const listId of [tasks, shopping]) {
    await guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: [ids.lea, ids.paul], access: { [ids.lea]: 'modification', [ids.paul]: 'lecture' } });
  }
  const notified = [];
  const notify = app.ctx.events.notifyList.bind(app.ctx.events);
  app.ctx.events.notifyList = (listId, options) => {
    notified.push(listId);
    notify(listId, options);
  };
  const modeOf = (listId) => app.db.prepare('SELECT add_mode FROM lists WHERE id = ?').pluck().get(listId);
  return { app, guillaume, ...clients, ids, tasks, shopping, notified, modeOf };
}

async function run(client, op) {
  const { id, ...result } = (await client.post('/api/ops', { ops: [{ id: uuid(), ...op }] })).body.results[0];
  return result;
}

test('migration 15 : courses → rester ; autre liste avec priorité ou échéance → fiche ; sans → rester', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'listo-addmode-'));
  const file = path.join(dir, 'listo.db');
  // Base « d'avant » : version 14, sans la colonne
  let db = openDatabase(file);
  db.exec('ALTER TABLE lists DROP COLUMN add_mode; ALTER TABLE lists DROP COLUMN type; DROP TABLE oauth_tokens; DROP TABLE oauth_codes; DROP TABLE oauth_grant_lists; DROP TABLE oauth_grants; DROP TABLE oauth_requests; DROP TABLE oauth_clients; DROP TABLE list_events; DROP TABLE list_reads; ALTER TABLE users DROP COLUMN news_enabled; ALTER TABLE users DROP COLUMN news_checks');
  db.pragma('user_version = 14');
  db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('a', 'A', 'x')").run();
  const add = db.prepare('INSERT INTO lists (id, name, category_id, owner_id, priority_enabled, due_enabled, deleted_at) VALUES (?, ?, ?, 1, ?, ?, ?)');
  add.run('courses', 'Courses', 1, 0, 0, null);
  add.run('courses-reglee', 'Courses (réglages gardés)', 1, 1, 1, null); // réglages ignorés pour les courses
  add.run('taches-deux', 'Maison', 2, 1, 1, null);
  add.run('taches-priorite', 'Travaux', 2, 1, 0, null);
  add.run('taches-echeance', 'Papiers', 2, 0, 1, null);
  add.run('taches-sans', 'Idées', 2, 0, 0, null);
  add.run('taches-supprimee', 'Ancienne', 2, 1, 0, '2026-10-20T10:00:00.000Z');
  const before = db.prepare('SELECT * FROM lists ORDER BY id').all();
  db.close();
  const lines = [];
  const log = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    db = openDatabase(file);
  } finally {
    console.log = log;
  }
  assert.equal(schemaVersion(db), 18);
  const after = db.prepare('SELECT * FROM lists ORDER BY id').all();
  assert.deepEqual(after.map(({ add_mode: mode, type, ...rest }) => rest), before, 'rien d\'autre ne change (type : migration 18)');
  assert.deepEqual(Object.fromEntries(after.map((l) => [l.id, l.add_mode])), {
    courses: 'quick',
    'courses-reglee': 'quick',
    'taches-deux': 'detail',
    'taches-echeance': 'detail',
    'taches-priorite': 'detail',
    'taches-sans': 'quick',
    'taches-supprimee': 'detail',
  });
  // Le journal du conteneur donne le nombre de chaque sorte (aucun nom de liste)
  assert.deepEqual(lines.filter((l) => l.startsWith('Migration 15')), ['Migration 15 (« Après l\'ajout ») : 2 liste(s) de courses → « Rester sur la liste » ; 4 autre(s) liste(s) avec priorité ou échéance → « Ouvrir la fiche » ; 1 autre(s) liste(s) sans priorité ni échéance → « Rester sur la liste ».']);
  assert.doesNotMatch(lines.join(), /Maison|Travaux|Idées/);
  // Une seule fois : un second démarrage ne refait rien
  db.close();
  db = openDatabase(file);
  assert.equal(schemaVersion(db), 18);
  // Contrainte : 'quick' ou 'detail' seulement ; nouvelle ligne sans valeur : 'quick'
  for (const bad of ['rapide', 'QUICK', '', 1]) assert.throws(() => db.prepare("UPDATE lists SET add_mode = ? WHERE id = 'courses'").run(bad), /CHECK/);
  db.prepare("INSERT INTO lists (id, name, category_id, owner_id) VALUES ('neuve', 'Brico', 2, 1)").run();
  assert.equal(db.prepare("SELECT add_mode FROM lists WHERE id = 'neuve'").pluck().get(), 'quick');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('migration 15 sur une base sans liste : rien dans le journal, compteurs à zéro', () => {
  const db = openDatabase(':memory:');
  db.exec('ALTER TABLE lists DROP COLUMN add_mode');
  const lines = [];
  const log = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    assert.deepEqual({ ...addModeMigration(db) }, { shopping: 0, detail: 0, quick: 0 });
  } finally {
    console.log = log;
  }
  assert.deepEqual(lines, []);
  db.close();
});

test('création : « Rester sur la liste » pour une liste de courses, « Ouvrir la fiche » pour les autres ; choix explicite respecté', async (t) => {
  const h = await household(t);
  assert.equal(h.modeOf(h.shopping), 'quick');
  assert.equal(h.modeOf(h.tasks), 'detail');
  const sync = (await h.guillaume.get('/api/sync')).body.lists;
  assert.equal(sync.find((l) => l.id === h.shopping).addMode, 'quick');
  assert.equal(sync.find((l) => l.id === h.tasks).addMode, 'detail');
  const quickTasks = uuid();
  const detailShop = uuid();
  assert.equal((await run(h.guillaume, { type: 'list.create', listId: quickTasks, name: 'Idées', listType: 'tasks', addMode: 'quick' })).status, 200);
  assert.equal((await run(h.guillaume, { type: 'list.create', listId: detailShop, name: 'Bricolage', listType: 'shopping', addMode: 'detail' })).status, 200);
  assert.equal(h.modeOf(quickTasks), 'quick');
  assert.equal(h.modeOf(detailShop), 'detail');
  // Valeur inconnue : refusée, rien n'est écrit
  for (const bad of ['rapide', 'QUICK', '', null, true, 1, ['quick'], { mode: 'quick' }]) {
    const listId = uuid();
    assert.deepEqual(await run(h.guillaume, { type: 'list.create', listId, name: 'X', listType: 'tasks', addMode: bad }), { status: 400, error: INVALID }, JSON.stringify(bad));
    assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM lists WHERE id = ?').pluck().get(listId), 0);
  }
  assert.deepEqual(ADD_MODES, ['quick', 'detail']);
});

test('modification : propriétaire seulement ; contributeur et invité 403, non-membre « Liste introuvable », valeur inconnue 400', async (t) => {
  const h = await household(t);
  assert.deepEqual(await run(h.guillaume, { type: 'list.update', listId: h.tasks, addMode: 'quick' }), { status: 200 });
  assert.equal(h.modeOf(h.tasks), 'quick');
  assert.ok(h.notified.includes(h.tasks), 'membres prévenus en temps réel');
  assert.deepEqual(await run(h.lea, { type: 'list.update', listId: h.tasks, addMode: 'detail' }), { status: 403, error: 'Seul le propriétaire de la liste peut faire cela.' });
  assert.deepEqual(await run(h.paul, { type: 'list.update', listId: h.tasks, addMode: 'detail' }), { status: 403, error: 'Seul le propriétaire de la liste peut faire cela.' });
  assert.deepEqual(await run(h.marc, { type: 'list.update', listId: h.tasks, addMode: 'detail' }), { status: 404, error: 'Liste introuvable.' });
  for (const bad of ['rapide', '', null, false, 2]) {
    assert.deepEqual(await run(h.guillaume, { type: 'list.update', listId: h.tasks, addMode: bad }), { status: 400, error: INVALID }, JSON.stringify(bad));
  }
  assert.equal(h.modeOf(h.tasks), 'quick', 'aucun refus n\'a rien écrit');
  // Autre modification sans le réglage : il ne change pas ; changer de catégorie non plus
  assert.equal((await run(h.guillaume, { type: 'list.update', listId: h.tasks, name: 'Maison 2' })).status, 200);
  assert.equal((await run(h.guillaume, { type: 'list.update', listId: h.tasks, listType: 'shopping' })).status, 200);
  assert.equal(h.modeOf(h.tasks), 'quick');
  // Courses comprises
  assert.equal((await run(h.guillaume, { type: 'list.update', listId: h.shopping, addMode: 'detail' })).status, 200);
  assert.equal(h.modeOf(h.shopping), 'detail');
});

test('option changée par un autre téléphone : visible à la synchronisation suivante (temps réel), pour chaque membre', async (t) => {
  const h = await household(t);
  const modeFor = async (client) => (await client.get('/api/sync')).body.lists.find((l) => l.id === h.tasks).addMode;
  assert.equal(await modeFor(h.lea), 'detail');
  await run(h.guillaume, { type: 'list.update', listId: h.tasks, addMode: 'quick' });
  assert.equal(await modeFor(h.lea), 'quick');
  assert.equal(await modeFor(h.paul), 'quick');
  // Sur le téléphone : la copie locale reçoit la liste telle quelle ; l'écran
  // relit le réglage à chaque ajout (aucun rechargement)
  assert.match(read('public/js/screens/list.js'), /if \(addModeOf\(currentList\(\)\) === 'detail'\) \{/);
});

test('duplication : la copie garde « Après l\'ajout »', async (t) => {
  const h = await household(t);
  await run(h.guillaume, { type: 'list.update', listId: h.shopping, addMode: 'detail' });
  const res = await h.guillaume.post(`/api/lists/${h.shopping}/duplicate`, { name: 'Courses (copie)' });
  assert.equal(res.status, 201, res.text);
  assert.equal(h.modeOf(res.body.list.id), 'detail');
  assert.equal(res.body.list.addMode, 'detail');
  const fromLea = await h.lea.post(`/api/lists/${h.tasks}/duplicate`, { name: 'Maison (copie)' });
  assert.equal(h.modeOf(fromLea.body.list.id), 'detail');
});

test('copie locale (hors ligne) : création selon le type, modification, valeur inconnue ignorée, ancienne copie = rester', () => {
  const state = emptyState();
  state.categories = [{ id: 1, name: 'Courses', isShopping: true, active: true }, { id: 2, name: 'Tâches', isShopping: false, active: true }];
  const user = { id: 1, username: 'g', displayName: 'G' };
  applyOp(state, { type: 'list.create', listId: 'c', name: 'Courses', listType: 'shopping' }, { user });
  applyOp(state, { type: 'list.create', listId: 't', name: 'Maison', listType: 'tasks' }, { user });
  applyOp(state, { type: 'list.create', listId: 'x', name: 'Bricolage', listType: 'shopping', addMode: 'detail' }, { user });
  assert.deepEqual(['c', 't', 'x'].map((id) => addModeOf(state.lists.get(id))), ['quick', 'detail', 'detail']);
  applyOp(state, { type: 'list.update', listId: 't', addMode: 'quick' }, { user });
  assert.equal(addModeOf(state.lists.get('t')), 'quick');
  applyOp(state, { type: 'list.update', listId: 't', addMode: 'rapide' }, { user });
  assert.equal(addModeOf(state.lists.get('t')), 'quick', 'valeur inconnue : ignorée');
  assert.equal(addModeOf({ name: 'copie d\'avant' }), 'quick');
  assert.equal(addModeOf(undefined), 'quick');
  assert.deepEqual([defaultAddMode(true), defaultAddMode(false)], ['quick', 'detail']);
  // L'opération passe par la file d'attente comme le titre ou les options
  const actions = read('public/js/actions.js');
  assert.match(actions, /\.\.\.\(addMode \? \{ addMode \} : \{\}\)/);
  assert.match(actions, /export const updateList = \(listId, fields\) => perform\(\{ type: 'list\.update', listId, \.\.\.fields \}\);/);
});

test('écran : ajout détaillé = fiche de l\'élément créé, une fois le clavier replié, sans curseur ; ajout rapide inchangé', () => {
  const list = read('public/js/screens/list.js');
  const add = list.slice(list.indexOf('async function addTyped('), list.indexOf('// Attend la ligne'));
  // Rapide (et début du détaillé) : exactement comme avant
  assert.match(add, /if \(!item\) return;\s*suggestBox\.hidden = true;\s*releaseFocus\(\);\s*revealItem\(item\.id\);/);
  // Détaillé : la même fiche qu'en touchant la ligne, sur l'élément créé
  assert.match(add, /if \(addModeOf\(currentList\(\)\) === 'detail'\) \{\s*whenKeyboardClosed\(\(\) => \{\s*const created = app\.data\.items\.get\(item\.id\);\s*if \(created && view && !created\.deletedAt\) openItemSheet\(created\);/);
  // Le clavier se replie d'abord : zone visible revenue à toute la hauteur
  // (mesure, aucune marque), 700 ms au plus, puis deux images (app-height.js)
  assert.match(add, /const closed = \(\) => !viewport \|\| viewport\.height >= window\.innerHeight - 1;\s*if \(closed\(\)\) \{\s*then\(\);/);
  assert.match(add, /const timer = setTimeout\(finish, 700\);/);
  assert.match(add, /requestAnimationFrame\(\(\) => requestAnimationFrame\(then\)\);/);
  // Aucun focus dans la fiche ni ailleurs (test/focus.test.js le vérifie aussi)
  const sheet = list.slice(list.indexOf('function openItemSheet('), list.indexOf('function openItemView('));
  assert.doesNotMatch(sheet + add, /\.focus\(|autofocus|\.select\(\)/);
  // « + », Entrée et suggestion passent tous par addTyped ; le scan garde son déroulement
  assert.match(list, /const plus = taps\.button\(\(\) => addTyped\(input\.value\), \{ persistent: true \}\);/);
  assert.match(list, /addForm\.addEventListener\('submit', \(event\) => \{\s*event\.preventDefault\(\);\s*addTyped\(input\.value\);/);
  assert.match(list, /option\(h\('span', \{\}, h\('strong', \{\}, start\), rest\), hintFor\(s\), \(\) => addTyped\(s\.name\)\)/);
  const scan = list.slice(list.indexOf('const scanner = createScanner('), list.indexOf('scanner.button.hidden = true;'));
  assert.doesNotMatch(scan, /addModeOf|openItemSheet/);
});

test('formulaire : « Après l\'ajout » pour toutes les listes, deux choix (.segmented), défaut selon le type tant qu\'on n\'y touche pas', () => {
  const form = read('public/js/screens/list-form.js');
  assert.match(form, /\[\['quick', 'Rester sur la liste'\], \['detail', 'Ouvrir la fiche'\]\]/);
  assert.match(form, /h\('div', \{ class: 'segmented', role: 'radiogroup', 'aria-labelledby': 'add-mode-label' \}, options\)/);
  assert.match(form, /option\.setAttribute\('aria-checked', String\(on\)\);\s*replace\(option, on \? icon\('check', 'icon--sm icon--check'\) : null, option\.dataset\.label\);/);
  assert.match(form, /let addMode = list \? addModeOf\(list\) : defaultAddMode\(true\);\s*let addModeChosen = Boolean\(list\);/);
  assert.match(form, /if \(!addModeChosen\) \{\s*addMode = defaultAddMode\(shopping\);/);
  assert.doesNotMatch(form, /optionsField\.hidden/, 'visible pour tous les types');
  assert.match(form, /addMode, icon: chosenIcon \}\);/);
  assert.match(form, /if \(addMode !== addModeOf\(list\)\) switches\.addMode = addMode;/);
  assert.doesNotMatch(form, /innerHTML|\.focus\(/);
  // 44 px : les choix .segmented du kit
  assert.match(read('public/css/listo.css'), /\.segmented__opt \{[^}]*min-height: var\(--tap-min\);/);
});
