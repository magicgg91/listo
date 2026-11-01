// Priorité et échéance activées ou non, liste par liste (listes autres que
// les courses, migration 13) : réglages du propriétaire, refus d'une écriture
// sur un réglage désactivé, valeurs jamais effacées, page publique,
// synchronisation, file d'attente hors ligne, et l'écran qui n'affiche que ce
// qui est activé. Le rendu est aussi vérifié dans Chromium
// (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login, createClient, ORIGIN, databaseAt } from './helpers.js';
import { openDatabase, schemaVersion } from '../server/db.js';
import { PRIORITY_OFF, DUE_OFF } from '../server/lists.js';
import { createQueue } from '../public/js/queue.js';
import { memoryLocal } from '../public/js/localdb.js';
import { emptyState, loadSync, mergeSync, applyOp, listOptions, availableSorts, effectiveSort, computeListView } from '../public/js/store.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const OWNER_ONLY = 'Seul le propriétaire de la liste peut faire cela.';

// Guillaume (propriétaire) ; Léa « Peut modifier » ; Paul « Lecture seule ».
// Une liste de tâches toute neuve (réglages désactivés par défaut) avec un
// élément, une liste de courses.
async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const ids = {};
  const clients = {};
  for (const name of ['lea', 'paul']) {
    ids[name] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    clients[name] = app.client();
    await login(clients[name], name, `MotDePasse-${name}`);
  }
  const tasks = uuid();
  const shopping = uuid();
  const bulb = uuid();
  const milk = uuid();
  await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: tasks, name: 'Maison', listType: 'tasks' },
    { id: uuid(), type: 'item.create', listId: tasks, itemId: bulb, name: 'Ampoule' },
    { id: uuid(), type: 'list.create', listId: shopping, name: 'Courses', listType: 'shopping' },
    { id: uuid(), type: 'item.create', listId: shopping, itemId: milk, name: 'Lait', aisleId: 4 },
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
  const settings = (listId) => ({ ...app.db.prepare('SELECT priority_enabled, due_enabled FROM lists WHERE id = ?').get(listId) });
  const values = (itemId) => ({ ...app.db.prepare('SELECT priority, due_date FROM items WHERE id = ?').get(itemId) });
  return { app, guillaume, ...clients, ids, tasks, shopping, bulb, milk, notified, settings, values };
}

async function run(client, op) {
  const { id, ...result } = (await client.post('/api/ops', { ops: [{ id: uuid(), ...op }] })).body.results[0];
  return result;
}

test('migration 13 : listes existantes autres que les courses activées, courses désactivées ; ensuite, désactivées par défaut', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'listo-options-'));
  const file = path.join(dir, 'listo.db');
  // Base « d'avant » : version 12, sans les deux colonnes, avec des listes
  let db = databaseAt(file, 12);
  db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('a', 'A', 'x')").run();
  db.prepare("INSERT INTO lists (id, name, category_id, owner_id) VALUES ('taches', 'Maison', 2, 1), ('courses', 'Courses', 1, 1)").run();
  db.prepare(`INSERT INTO items (id, list_id, name, priority, due_date, created_by, created_at, updated_at)
              VALUES ('i1', 'taches', 'Ampoule', 'high', '2026-10-30', 1, '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z')`).run();
  const before = db.prepare('SELECT * FROM items').all();
  db.close();
  db = openDatabase(file);
  assert.equal(schemaVersion(db), 19);
  const row = (id) => ({ ...db.prepare('SELECT priority_enabled, due_enabled FROM lists WHERE id = ?').get(id) });
  assert.deepEqual(row('taches'), { priority_enabled: 1, due_enabled: 1 }, 'rien ne change, rien ne disparaît');
  assert.deepEqual(row('courses'), { priority_enabled: 0, due_enabled: 0 }, 'courses : réglages ignorés');
  assert.deepEqual(db.prepare('SELECT * FROM items').all().map(({ link, price_cents: price, ...rest }) => rest), before, 'aucune valeur touchée (lien et prix : migration 19)');
  // Nouvelle liste : désactivées (valeur par défaut de la base)
  db.prepare("INSERT INTO lists (id, name, category_id, owner_id) VALUES ('neuve', 'Brico', 2, 1)").run();
  assert.deepEqual(row('neuve'), { priority_enabled: 0, due_enabled: 0 });
  // Contrainte : 0 ou 1 seulement
  for (const bad of [2, -1, 'oui']) assert.throws(() => db.prepare('UPDATE lists SET priority_enabled = ? WHERE id = ?').run(bad, 'neuve'), /CHECK/);
  assert.throws(() => db.prepare('UPDATE lists SET due_enabled = 2 WHERE id = ?').run('neuve'), /CHECK/);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('création : désactivées par défaut (serveur), activées si demandé ; réglage invalide refusé', async (t) => {
  const h = await household(t);
  assert.deepEqual(h.settings(h.tasks), { priority_enabled: 0, due_enabled: 0 });
  const other = uuid();
  assert.equal((await run(h.guillaume, { type: 'list.create', listId: other, name: 'Travaux', listType: 'tasks', priorityEnabled: true, dueEnabled: false })).status, 200);
  assert.deepEqual(h.settings(other), { priority_enabled: 1, due_enabled: 0 });
  for (const bad of ['oui', 1, null]) {
    const result = await run(h.guillaume, { type: 'list.create', listId: uuid(), name: 'X', listType: 'tasks', priorityEnabled: bad });
    assert.deepEqual(result, { status: 400, error: 'Réglage « Priorité » invalide.' }, JSON.stringify(bad));
  }
  const sync = (await h.guillaume.get('/api/sync')).body;
  const list = sync.lists.find((l) => l.id === other);
  assert.equal(list.priorityEnabled, true);
  assert.equal(list.dueEnabled, false);
});

test('réglages : le propriétaire les change ; un invité (même « Peut modifier ») reçoit 403, rien n\'est écrit', async (t) => {
  const h = await household(t);
  assert.deepEqual(await run(h.guillaume, { type: 'list.update', listId: h.tasks, priorityEnabled: true }), { status: 200 });
  assert.deepEqual(h.settings(h.tasks), { priority_enabled: 1, due_enabled: 0 }, 'l\'autre réglage ne bouge pas');
  assert.deepEqual(await run(h.guillaume, { type: 'list.update', listId: h.tasks, dueEnabled: true }), { status: 200 });
  assert.deepEqual(h.settings(h.tasks), { priority_enabled: 1, due_enabled: 1 });
  h.notified.length = 0;
  for (const client of [h.lea, h.paul]) {
    assert.deepEqual(await run(client, { type: 'list.update', listId: h.tasks, priorityEnabled: false }), { status: 403, error: OWNER_ONLY });
    assert.deepEqual(await run(client, { type: 'list.update', listId: h.tasks, dueEnabled: false }), { status: 403, error: OWNER_ONLY });
  }
  assert.deepEqual(h.settings(h.tasks), { priority_enabled: 1, due_enabled: 1 });
  assert.deepEqual(h.notified, []);
  assert.deepEqual(await run(h.guillaume, { type: 'list.update', listId: h.tasks, dueEnabled: 'non' }), { status: 400, error: 'Réglage « Échéance » invalide.' });
  assert.deepEqual(h.settings(h.tasks), { priority_enabled: 1, due_enabled: 1 });
});

test('écriture refusée quand le réglage est désactivé (rien d\'écrit), acceptée quand il est activé ; les autres champs ne sont pas concernés', async (t) => {
  const h = await household(t);
  const before = h.values(h.bulb);
  h.notified.length = 0;
  assert.deepEqual(await run(h.lea, { type: 'item.update', itemId: h.bulb, priority: 'high' }), { status: 400, error: PRIORITY_OFF });
  assert.deepEqual(await run(h.lea, { type: 'item.update', itemId: h.bulb, dueDate: '2026-10-30' }), { status: 400, error: DUE_OFF });
  assert.deepEqual(await run(h.lea, { type: 'item.update', itemId: h.bulb, dueDate: null }), { status: 400, error: DUE_OFF }, 'effacer est aussi une écriture');
  assert.deepEqual(await run(h.lea, { type: 'item.update', itemId: h.bulb, name: 'Ampoules', priority: 'low' }), { status: 400, error: PRIORITY_OFF }, 'refus avant toute écriture');
  assert.deepEqual(h.values(h.bulb), before);
  assert.equal(h.app.db.prepare('SELECT name FROM items WHERE id = ?').pluck().get(h.bulb), 'Ampoule');
  assert.deepEqual(h.notified, []);
  // Une opération qui ne touche pas à ces champs passe
  assert.equal((await run(h.lea, { type: 'item.update', itemId: h.bulb, note: 'couloir' })).status, 200);
  assert.equal((await run(h.lea, { type: 'item.check', itemId: h.bulb, checked: true })).status, 200);
  // Priorité seule activée
  await run(h.guillaume, { type: 'list.update', listId: h.tasks, priorityEnabled: true });
  assert.equal((await run(h.lea, { type: 'item.update', itemId: h.bulb, priority: 'high' })).status, 200);
  assert.deepEqual(await run(h.lea, { type: 'item.update', itemId: h.bulb, dueDate: '2026-10-30' }), { status: 400, error: DUE_OFF });
  await run(h.guillaume, { type: 'list.update', listId: h.tasks, dueEnabled: true });
  assert.equal((await run(h.lea, { type: 'item.update', itemId: h.bulb, dueDate: '2026-10-30' })).status, 200);
  assert.deepEqual(h.values(h.bulb), { priority: 'high', due_date: '2026-10-30' });
  // Invité en lecture seule : toujours refusé (droit vérifié d'abord)
  assert.equal((await run(h.paul, { type: 'item.update', itemId: h.bulb, priority: 'low' })).status, 403);
  // Liste de courses : refus habituel, inchangé
  assert.equal((await run(h.lea, { type: 'item.update', itemId: h.milk, priority: 'high' })).error, 'La priorité ne se choisit que dans une liste de tâches ou d\'envies.');
});

test('valeurs conservées : désactiver puis réactiver les fait revenir ; changer de catégorie ne perd rien', async (t) => {
  const h = await household(t);
  await run(h.guillaume, { type: 'list.update', listId: h.tasks, priorityEnabled: true, dueEnabled: true });
  await run(h.lea, { type: 'item.update', itemId: h.bulb, priority: 'high', dueDate: '2026-10-30' });
  await run(h.guillaume, { type: 'list.update', listId: h.tasks, priorityEnabled: false, dueEnabled: false });
  assert.deepEqual(h.values(h.bulb), { priority: 'high', due_date: '2026-10-30' }, 'rien d\'effacé');
  // Le téléphone ne montre rien de ce qui est désactivé
  const phone = loadSync(emptyState(), (await h.lea.get('/api/sync')).body);
  assert.deepEqual(listOptions(phone.lists.get(h.tasks)), { priority: false, due: false });
  await run(h.guillaume, { type: 'list.update', listId: h.tasks, priorityEnabled: true, dueEnabled: true });
  const item = (await h.lea.get('/api/sync')).body.items.find((i) => i.id === h.bulb);
  assert.deepEqual([item.priority, item.dueDate], ['high', '2026-10-30'], 'réapparaissent');
  // Liste de tâches → courses → tâches : réglages et valeurs gardés
  await run(h.guillaume, { type: 'list.update', listId: h.tasks, listType: 'shopping' });
  assert.deepEqual(h.settings(h.tasks), { priority_enabled: 1, due_enabled: 1 });
  assert.deepEqual(h.values(h.bulb), { priority: 'high', due_date: '2026-10-30' });
  const asShopping = loadSync(emptyState(), (await h.lea.get('/api/sync')).body);
  assert.deepEqual(listOptions(asShopping.lists.get(h.tasks)), { priority: false, due: false }, 'courses : ignorés');
  await run(h.guillaume, { type: 'list.update', listId: h.tasks, listType: 'tasks' });
  assert.deepEqual(h.settings(h.tasks), { priority_enabled: 1, due_enabled: 1 });
  assert.deepEqual(h.values(h.bulb), { priority: 'high', due_date: '2026-10-30' });
  // Courses → tâches : les réglages enregistrés de la liste de courses (désactivés)
  await run(h.guillaume, { type: 'list.update', listId: h.shopping, listType: 'tasks' });
  assert.deepEqual(h.settings(h.shopping), { priority_enabled: 0, due_enabled: 0 });
});

test('synchronisation : un changement de réglage prévient les téléphones et arrive par « depuis »', async (t) => {
  const h = await household(t);
  const first = (await h.lea.get('/api/sync')).body;
  const phone = loadSync(emptyState(), first);
  assert.deepEqual(listOptions(phone.lists.get(h.tasks)), { priority: false, due: false });
  h.app.clock.now += 60 * 1000;
  h.notified.length = 0;
  await run(h.guillaume, { type: 'list.update', listId: h.tasks, dueEnabled: true });
  assert.deepEqual(h.notified, [h.tasks], 'temps réel');
  mergeSync(phone, (await h.lea.get(`/api/sync?since=${encodeURIComponent(first.serverTime)}`)).body);
  assert.deepEqual(listOptions(phone.lists.get(h.tasks)), { priority: false, due: true });
  assert.deepEqual(availableSorts(phone.lists.get(h.tasks)), ['alpha', 'due']);
});

test('page publique : priorité et échéance seulement si activées (champ par champ)', async (t) => {
  const h = await household(t);
  await run(h.guillaume, { type: 'list.update', listId: h.tasks, priorityEnabled: true, dueEnabled: true });
  await run(h.guillaume, { type: 'item.update', itemId: h.bulb, priority: 'high', dueDate: '2026-10-30' });
  const res = await h.guillaume.request('PUT', `/api/lists/${h.tasks}/share`, {});
  const token = res.body.share.url.split('/p/')[1];
  const visitor = createClient(h.app.base, { ip: '203.0.113.9' });
  const item = async () => (await visitor.get(`/api/public/${token}`)).body.groups.flatMap((g) => g.items)[0];
  assert.deepEqual(Object.keys(await item()).sort(), ['checked', 'dueDate', 'name', 'note', 'photo', 'priority', 'quantity']);
  await run(h.guillaume, { type: 'list.update', listId: h.tasks, priorityEnabled: false });
  assert.deepEqual(Object.keys(await item()).sort(), ['checked', 'dueDate', 'name', 'note', 'photo', 'quantity']);
  await run(h.guillaume, { type: 'list.update', listId: h.tasks, dueEnabled: false });
  const none = await item();
  assert.deepEqual(Object.keys(none).sort(), ['checked', 'name', 'note', 'photo', 'quantity']);
  assert.ok(!JSON.stringify(none).includes('2026-10-30') && !JSON.stringify(none).includes('high'));
  const route = read('server/routes/public.js');
  assert.match(route, /\.\.\.\(withPriority \? \{ priority: item\.priority \} : \{\}\),\s*\.\.\.\(withDue \? \{ dueDate: item\.dueDate \} : \{\}\),/);
});

test('hors ligne : une modification refusée (option désactivée) sort de la file sans bloquer les autres ; message court', async (t) => {
  const h = await household(t);
  await run(h.guillaume, { type: 'list.update', listId: h.tasks, priorityEnabled: true, dueEnabled: true });
  const calls = [];
  const cookie = () => [...h.lea.jar].map(([n, v]) => `${n}=${v}`).join('; ');
  const refused = [];
  const queue = createQueue({
    storage: memoryLocal(),
    transport: {
      sendOps: async (ops) => {
        calls.push(ops.length);
        const res = await fetch(`${h.app.base}/api/ops`, { method: 'POST', headers: { cookie: cookie(), origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ ops }) });
        return (await res.json()).results;
      },
      putPhoto: async () => {},
      deletePhoto: async () => {},
    },
    timers: { setTimeout: () => 0, clearTimeout: () => {} },
    events: { refused: (entry, message) => refused.push(message) },
  });
  // Léa, hors ligne : priorité, puis une note, puis une échéance
  await queue.add({ kind: 'op', op: { id: uuid(), type: 'item.update', itemId: h.bulb, priority: 'high' } });
  await queue.add({ kind: 'op', op: { id: uuid(), type: 'item.update', itemId: h.bulb, note: 'couloir' } });
  await queue.add({ kind: 'op', op: { id: uuid(), type: 'item.update', itemId: h.bulb, dueDate: '2026-10-30' } });
  // Pendant ce temps, le propriétaire désactive la priorité
  await run(h.guillaume, { type: 'list.update', listId: h.tasks, priorityEnabled: false });
  assert.equal(await queue.flush(), 'done');
  assert.equal(queue.count(), 0);
  assert.deepEqual(refused, [PRIORITY_OFF]);
  assert.deepEqual(h.values(h.bulb), { priority: 'normal', due_date: '2026-10-30' }, 'la suite est passée');
  assert.equal(h.app.db.prepare('SELECT note FROM items WHERE id = ?').pluck().get(h.bulb), 'couloir');
  calls.length = 0;
  assert.equal(await queue.flush(), 'done');
  assert.deepEqual(calls, [], 'pas de boucle');
  // app.js : un seul message court, après la synchronisation
  const appJs = read('public/js/app.js');
  assert.match(appJs, /const OPTION_OFF = \['La priorité est désactivée pour cette liste\.', "L'échéance est désactivée pour cette liste\."\];/);
  assert.deepEqual([PRIORITY_OFF, DUE_OFF], ['La priorité est désactivée pour cette liste.', "L'échéance est désactivée pour cette liste."]);
  assert.match(appJs, /const OPTION_OFF_MESSAGE = 'Cette option est désactivée pour cette liste\.';/);
  assert.match(appJs, /if \(readOnlyRefused\) toast\(READ_ONLY_OFFLINE\);\s*else if \(optionRefused\) toast\(OPTION_OFF_MESSAGE\);/);
});

test('téléphone : options d\'une liste, tri proposé, tri mémorisé indisponible → alphabétique', () => {
  const tasks = (priorityEnabled, dueEnabled) => ({ id: 'l', type: 'tasks', priorityEnabled, dueEnabled });
  assert.deepEqual(listOptions(tasks(false, false)), { priority: false, due: false });
  assert.deepEqual(listOptions(tasks(true, false)), { priority: true, due: false });
  assert.deepEqual(listOptions({ type: 'shopping', priorityEnabled: true, dueEnabled: true }), { priority: false, due: false }, 'courses : jamais');
  assert.deepEqual(listOptions({ type: 'tasks' }), { priority: true, due: true }, 'copie d\'avant les réglages : comme avant');
  assert.deepEqual(listOptions(null), { priority: false, due: false });
  assert.deepEqual(availableSorts(tasks(false, false)), ['alpha']);
  assert.deepEqual(availableSorts(tasks(true, true)), ['alpha', 'priority', 'due']);
  assert.equal(effectiveSort(tasks(false, true), 'priority'), 'alpha');
  assert.equal(effectiveSort(tasks(false, true), 'due'), 'due');
  assert.equal(effectiveSort(tasks(true, false), 'n\'importe quoi'), 'alpha');
  // La vue de la liste suit : pas de groupes par priorité quand elle est désactivée
  const state = emptyState();
  state.categories = [{ id: 2, name: 'Tâches', isShopping: false, active: true }];
  const user = { id: 1, username: 'g', displayName: 'G' };
  applyOp(state, { type: 'list.create', listId: 'l', name: 'Maison', listType: 'tasks' }, { user, now: '2026-10-18T10:00:00.000Z' });
  assert.deepEqual(listOptions(state.lists.get('l')), { priority: false, due: false }, 'créée sur le téléphone : désactivées');
  for (const [name, priority] of [['b', 'high'], ['a', 'low']]) {
    applyOp(state, { type: 'item.create', listId: 'l', itemId: name, name }, { user, now: '2026-10-18T10:00:00.000Z' });
    state.items.set(name, { ...state.items.get(name), priority });
  }
  const off = computeListView(state, 'l', { sort: 'priority' });
  assert.equal(off.groups.length, 1);
  assert.deepEqual(off.groups[0].items.map((i) => i.name), ['a', 'b'], 'alphabétique');
  assert.equal(off.groups[0].label, undefined, 'aucun en-tête de priorité (rien à replier)');
  applyOp(state, { type: 'list.update', listId: 'l', priorityEnabled: true }, { user, now: '2026-10-18T10:01:00.000Z' });
  const on = computeListView(state, 'l', { sort: 'priority' });
  assert.deepEqual(on.groups.map((g) => g.label), ['Priorité élevée', 'Priorité basse']);
  // Mémoire du tri : lue, jamais effacée par le repli sur l'alphabétique
  const list = read('public/js/screens/list.js');
  assert.match(list, /const activeSort = \(\) => effectiveSort\(currentList\(\), itemSort\);/);
  assert.doesNotMatch(list, /saveItemSort\(listId, 'alpha'\)|removeItem/);
});

test('écran : champ, pastilles, fiche à consulter et option de tri masqués quand le réglage est désactivé', () => {
  const list = read('public/js/screens/list.js');
  // Pastilles de la ligne (dont « En retard ») : seulement ce qui est activé
  assert.match(list, /const options = listOptions\(view\?\.list\);\s*if \(!options\.priority && !options\.due\) return \{ chips: \[\], spoken: '' \};/);
  assert.match(list, /const priority = options\.priority \? priorityChip\(item\.priority\) : null;/);
  assert.match(list, /const due = options\.due \? dueChip\(item\.dueDate, item\.checked, todayKey\(\)\) : null;/);
  // Fiche : champs cachés, jamais envoyés quand désactivés (même si le réglage change pendant que la fiche est ouverte)
  assert.match(list, /fieldEl\.hidden = !shown;/);
  assert.match(list, /if \(!shown && fieldEl\.contains\(document\.activeElement\)\) document\.activeElement\.blur\(\);/);
  assert.match(list, /const stopWatching = onDataChange\(\(\) => \{\s*reservation\?\.paint\(\);[^\n]*\n\s*showOptions\(\);/);
  assert.match(list, /const enabled = options\(\);\s*if \(enabled\.priority && priority !== \(item\.priority \?\? 'normal'\)\) changes\.priority = priority;\s*if \(enabled\.due && dueDate !== \(item\.dueDate \?\? null\)\) changes\.dueDate = dueDate;/);
  // Fiche à consulter (lecture seule) : même règle
  assert.match(list, /options\.priority \? value\('Priorité', [^\n]*\) : null,\s*options\.due \? value\('Échéance', [^\n]*\) : null,/);
  // Tri : seulement les choix proposés ; pas de bouton sans choix
  assert.match(list, /const offered = availableSorts\(currentList\(\)\);\s*openMenu\(SORTS\.filter\(\(\[value\]\) => offered\.includes\(value\)\)/);
  assert.match(list, /sortButton\.hidden = availableSorts\(list\)\.length < 2;/);
  assert.doesNotMatch(list, /innerHTML/);
});

test('formulaire : le même composant à la création et dans « Modifier la liste », visible hors courses seulement', () => {
  const form = read('public/js/screens/list-form.js');
  assert.match(form, /export function optionSwitches\(values, onChange, leading = null\) \{/);
  assert.equal((form.match(/optionSwitches\(/g) ?? []).length, 2, 'défini une fois, utilisé une fois, dans le formulaire commun');
  assert.match(form, /\['priority', 'Priorité', /);
  assert.match(form, /\['due', 'Échéance', /);
  // Vrai interrupteur : nom = titre de la ligne, description reliée, état dans aria-checked
  assert.match(form, /const toggle = h\('button', \{ class: 'switch', type: 'button', role: 'switch', 'aria-labelledby': titleId, 'aria-describedby': helpId \}\);/);
  assert.match(form, /h\('span', \{ class: 'row__title', id: titleId \}, label\), h\('span', \{ class: 'row__sub', id: helpId \}, help\)/);
  assert.match(form, /toggle\.setAttribute\('aria-checked', String\(current\[key\]\)\);/);
  // Description seule, fixe : ni « Activée · » / « Désactivée · » (la position du
  // bouton montre l'état), ni mention du tri (sous-entendue quand l'option est activée)
  assert.match(form, /\['priority', 'Priorité', 'Basse, normale ou élevée\.'\],/);
  assert.match(form, /\['due', 'Échéance', 'Une date limite ; retards signalés\.'\],/);
  const block = form.slice(form.indexOf('export function optionSwitches('), form.indexOf('export function addModeChoice('));
  for (const gone of ['Activée', 'Désactivée', 'textContent', "'aria-label'"]) assert.equal(block.includes(gone), false, gone);
  assert.doesNotMatch(block, /\btri\b|par priorité|par échéance/);
  // Nouvelle liste : désactivées ; visibles seulement hors courses, aussi quand on change la catégorie
  assert.match(form, /let options = list \? listOptionsOf\(list\) : \{ priority: false, due: false \};/);
  // (la carte reste visible pour « Après l'ajout » : seuls les deux interrupteurs se cachent)
  assert.match(form, /row\.hidden = row\.dataset\.switch === 'priority' \? !usesPriority\(listType\) : !usesDue\(listType\);/);
  assert.match(form, /priorityEnabled: withPriority && options\.priority, dueEnabled: withDue && options\.due/);
  assert.match(form, /if \(withPriority && options\.priority !== saved\.priority\) switches\.priorityEnabled = options\.priority;/);
  // Réservé au propriétaire : le formulaire de modification renvoie un invité vers la liste
  assert.match(form, /if \(editing && !list\.isOwner\) \{\s*navigate\('list', \{ id: listId \}, \{ replace: true \}\);/);
  assert.doesNotMatch(form, /innerHTML|\.focus\(/);
  assert.match(read('public/css/listo.css'), /\.switch \{[^}]*height: var\(--tap-min\);/);
});
