// Icône au choix pour chaque liste (migration 14) : liste blanche vérifiée
// par le serveur à chaque écriture, propriétaire seulement (comme le
// titre), lue par les invités, copiée à la duplication, envoyée en temps
// réel ; la page du lien public ne change pas. Grille de choix, carte et
// en-tête : vérifiés aussi dans Chromium (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { openDatabase, schemaVersion } from '../server/db.js';
import { LIST_ICONS, isListIcon, listIcon, categoryIcon } from '../public/js/list-icons.js';
import { emptyState, applyOp } from '../public/js/store.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const OWNER_ONLY = 'Seul le propriétaire de la liste peut faire cela.';

async function run(client, op) {
  const { id, ...result } = (await client.post('/api/ops', { ops: [{ id: uuid(), ...op }] })).body.results[0];
  return result;
}

// Guillaume (propriétaire) ; Léa « Peut modifier » ; Paul « Lecture seule ».
// Une liste de tâches sans icône choisie.
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
  const listId = uuid();
  assert.equal((await run(guillaume, { type: 'list.create', listId, name: 'Maison', categoryId: 2 })).status, 200);
  await guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: [ids.lea, ids.paul], access: { [ids.lea]: 'modification', [ids.paul]: 'lecture' } });
  const iconOf = (id = listId) => app.db.prepare('SELECT icon FROM lists WHERE id = ?').pluck().get(id);
  return { app, ...clients, ids, listId, iconOf };
}

test('liste blanche : une quarantaine d\'icônes au plus, toutes dans le sprite (kit et application), libellés en français', () => {
  assert.ok(LIST_ICONS.length >= 30 && LIST_ICONS.length <= 40, `${LIST_ICONS.length} icônes`);
  assert.equal(new Set(LIST_ICONS.map((i) => i.id)).size, LIST_ICONS.length, 'pas de doublon');
  const kit = read('design/icons-sprite.html');
  const app = read('public/index.html');
  for (const { id, label } of LIST_ICONS) {
    assert.match(id, /^[a-z]+$/, id);
    assert.ok(label.trim().length > 1, id);
    const symbol = (source) => source.match(new RegExp(`<symbol id="i-${id}"[^\\n]*</symbol>`))?.[0];
    assert.ok(symbol(kit), `i-${id} dans design/icons-sprite.html`);
    assert.equal(symbol(app), symbol(kit), `i-${id} identique dans public/index.html`);
    // Même style que les autres icônes : traits seulement, couleur héritée
    assert.doesNotMatch(symbol(kit), /stroke="#|fill="#|style=|stroke-width/, id);
  }
  // Les icônes ajoutées existent aussi en fichiers séparés dans le kit
  for (const file of fs.readdirSync(new URL('../design/icones/listes/', import.meta.url))) {
    assert.match(file, /^i-[a-z]+\.svg$/);
    assert.ok(isListIcon(file.slice(2, -4)), file);
    assert.match(read(`design/icones/listes/${file}`), /stroke="currentColor" stroke-width="2"/);
  }
  // Icône de la catégorie (comportement d'avant), et icône choisie
  assert.equal(categoryIcon(true), 'cart');
  assert.equal(categoryIcon(false), 'tasks');
  assert.equal(listIcon({ icon: '', category: { isShopping: true } }), 'cart');
  assert.equal(listIcon({ category: { isShopping: false } }), 'tasks');
  assert.equal(listIcon({ icon: 'gift', category: { isShopping: false } }), 'gift');
  assert.equal(listIcon({ icon: 'x" onload="', category: { isShopping: false } }), 'tasks', 'inconnue : icône de la catégorie');
  for (const bad of ['', 'inconnue', 'CART', 'cart ', '../cart', null, 3, {}]) assert.equal(isListIcon(bad), false, String(bad));
});

test('icône hors liste blanche refusée (400) à la création comme à la modification, rien n\'est écrit', async (t) => {
  const h = await household(t);
  for (const bad of ['inconnue', 'CART', 'i-cart', 'cart"><script>', '../../etc', 42, true, null, ['cart'], { id: 'cart' }]) {
    const listId = uuid();
    assert.deepEqual(await run(h.guillaume, { type: 'list.create', listId, name: 'X', categoryId: 2, icon: bad }), { status: 400, error: 'Icône inconnue.' }, JSON.stringify(bad));
    assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM lists WHERE id = ?').pluck().get(listId), 0);
    assert.deepEqual(await run(h.guillaume, { type: 'list.update', listId: h.listId, icon: bad }), { status: 400, error: 'Icône inconnue.' }, JSON.stringify(bad));
    assert.equal(h.iconOf(), '');
  }
  // Acceptées : une icône de la liste, puis « » (retour à l'icône de la catégorie)
  assert.deepEqual(await run(h.guillaume, { type: 'list.update', listId: h.listId, icon: 'hammer' }), { status: 200 });
  assert.equal(h.iconOf(), 'hammer');
  assert.deepEqual(await run(h.guillaume, { type: 'list.update', listId: h.listId, name: 'Maison 2' }), { status: 200 });
  assert.equal(h.iconOf(), 'hammer', 'non envoyée : rien ne change');
  assert.deepEqual(await run(h.guillaume, { type: 'list.update', listId: h.listId, icon: '' }), { status: 200 });
  assert.equal(h.iconOf(), '');
  const created = uuid();
  const res = await run(h.guillaume, { type: 'list.create', listId: created, name: 'Voyage', categoryId: 2, icon: 'plane' });
  assert.equal(res.status, 200);
  assert.equal(res.list.icon, 'plane');
  assert.equal(h.iconOf(created), 'plane');
  // Sans icône : vide (icône de la catégorie)
  const plain = uuid();
  assert.equal((await run(h.guillaume, { type: 'list.create', listId: plain, name: 'Simple', categoryId: 1 })).list.icon, '');
  // Requête paramétrée, et contrôle à chaque écriture
  const source = read('server/lists.js');
  assert.match(source, /function listIconOf\(value\) \{\s*if \(value === undefined\) return undefined;\s*if \(value === '' \|\| isListIcon\(value\)\) return value;\s*throw new OpError\(400, 'Icône inconnue\.'\);/);
  assert.match(source, /const icon = listIconOf\(op\.icon\) \?\? '';/);
  assert.match(source, /const icon = listIconOf\(op\.icon\) \?\? list\.icon;/);
  assert.match(source, /UPDATE lists SET name = \?, category_id = \?, store_id = \?, priority_enabled = \?, due_enabled = \?, icon = \?, add_mode = \?, updated_at = \? WHERE id = \?/);
});

test('seul le propriétaire change l\'icône : invités refusés (403), quel que soit leur droit ; un invité la voit', async (t) => {
  const h = await household(t);
  for (const client of [h.lea, h.paul]) {
    assert.deepEqual(await run(client, { type: 'list.update', listId: h.listId, icon: 'gift' }), { status: 403, error: OWNER_ONLY });
  }
  assert.equal(h.iconOf(), '');
  assert.deepEqual(await run(h.guillaume, { type: 'list.update', listId: h.listId, icon: 'gift' }), { status: 200 });
  // Lue par les invités (synchronisation), en lecture seule comme en modification
  for (const client of [h.lea, h.paul]) {
    const list = (await client.get('/api/sync')).body.lists.find((l) => l.id === h.listId);
    assert.equal(list.icon, 'gift');
  }
  // Une valeur inconnue en base (écrite à la main) n'est jamais renvoyée
  h.app.db.prepare("UPDATE lists SET icon = 'x\"/><script>' WHERE id = ?").run(h.listId);
  assert.equal((await h.lea.get('/api/sync')).body.lists.find((l) => l.id === h.listId).icon, '');
});

test('temps réel : un changement d\'icône prévient les téléphones des membres', async (t) => {
  const h = await household(t);
  const since = (await h.lea.get('/api/sync')).body.serverTime;
  const notified = [];
  const notify = h.app.ctx.events.notifyList.bind(h.app.ctx.events);
  h.app.ctx.events.notifyList = (listId, options) => {
    notified.push(listId);
    return notify(listId, options);
  };
  assert.deepEqual(await run(h.guillaume, { type: 'list.update', listId: h.listId, icon: 'paw' }), { status: 200 });
  assert.deepEqual(notified, [h.listId]);
  // Les changements « depuis » contiennent la liste avec sa nouvelle icône
  const changes = (await h.lea.get(`/api/sync?since=${encodeURIComponent(since)}`)).body;
  assert.equal(changes.lists.find((l) => l.id === h.listId).icon, 'paw');
});

test('duplication : l\'icône est copiée', async (t) => {
  const h = await household(t);
  await run(h.guillaume, { type: 'list.update', listId: h.listId, icon: 'suitcase' });
  for (const client of [h.guillaume, h.lea]) {
    const res = await client.post(`/api/lists/${h.listId}/duplicate`, { name: 'Copie' });
    assert.equal(res.status, 201);
    assert.equal(res.body.list.icon, 'suitcase');
    assert.equal(h.iconOf(res.body.list.id), 'suitcase');
  }
});

test('la page du lien public ne change pas : aucune icône de liste envoyée', async (t) => {
  const h = await household(t);
  await run(h.guillaume, { type: 'list.update', listId: h.listId, icon: 'balloon' });
  const share = await h.guillaume.request('PUT', `/api/lists/${h.listId}/share`, {});
  assert.equal(share.status, 201);
  const token = share.body.share.url.split('/p/')[1];
  const visitor = h.app.client();
  const data = await visitor.get(`/api/public/${token}`);
  assert.equal(data.status, 200, JSON.stringify(data.body));
  assert.doesNotMatch(JSON.stringify(data.body), /balloon|"icon"/);
});

test('hors ligne : l\'icône passe par la file d\'attente, comme le titre (copie locale mise à jour tout de suite)', () => {
  const state = emptyState();
  state.categories = [{ id: 2, name: 'Tâches', isShopping: false, active: true }];
  const user = { id: 1, username: 'g', displayName: 'G' };
  applyOp(state, { type: 'list.create', listId: 'l1', name: 'Fête', categoryId: 2, icon: 'balloon' }, { user, now: 'x' });
  assert.equal(state.lists.get('l1').icon, 'balloon');
  applyOp(state, { type: 'list.update', listId: 'l1', name: 'Fête 2' }, { user, now: 'y' });
  assert.equal(state.lists.get('l1').icon, 'balloon', 'non envoyée : gardée');
  applyOp(state, { type: 'list.update', listId: 'l1', icon: 'cake' }, { user, now: 'z' });
  assert.equal(state.lists.get('l1').icon, 'cake');
  applyOp(state, { type: 'list.update', listId: 'l1', icon: 'pas-une-icone' }, { user, now: 'z' });
  assert.equal(state.lists.get('l1').icon, '', 'inconnue : icône de la catégorie');
  applyOp(state, { type: 'list.create', listId: 'l2', name: 'Simple', categoryId: 2 }, { user, now: 'x' });
  assert.equal(state.lists.get('l2').icon, '');
  // Formulaire : envoyée seulement si elle a changé ; jamais de focus automatique
  const form = read('public/js/screens/list-form.js');
  assert.match(form, /if \(chosenIcon !== \(list\.icon \?\? ''\)\) switches\.icon = chosenIcon;/);
  assert.match(form, /actions\.createList\(\{[^}]*icon: chosenIcon \}\)/);
  assert.match(read('public/js/actions.js'), /\.\.\.\(icon \? \{ icon \} : \{\}\)/);
});

test('grille « Icône » : radiogroup, cases de 44 px, aria-label en français, choix entouré ET coché', () => {
  const form = read('public/js/screens/list-form.js');
  assert.match(form, /h\('div', \{ class: 'icon-grid', role: 'radiogroup', 'aria-labelledby': 'icon-label' \}, iconButtons\)/);
  assert.match(form, /h\('button', \{ class: 'icon-grid__opt', type: 'button', role: 'radio', 'aria-label': choice\.label, title: choice\.label \}/);
  assert.match(form, /button\.setAttribute\('aria-checked', String\(on\)\);\s*button\.querySelector\('\.icon-grid__check'\)\?\.remove\(\);\s*if \(on\) button\.append\(h\('span', \{ class: 'icon-grid__check' \}, icon\('check', 'icon--xs'\)\)\);/);
  // Au départ : l'icône de la catégorie (rien de choisi)
  assert.match(form, /let chosenIcon = list\?\.icon \?\? '';/);
  assert.match(form, /const shownIcon = chosenIcon \|\| categoryIcon\(Boolean\(category\?\.isShopping\)\);/);
  // Sous « Catégorie »
  assert.match(form, /'Catégorie'\), categoryGroup\),\s*h\('div', \{ class: 'field' \}, h\('span', \{ class: 'field__label', id: 'icon-label' \}, 'Icône'\), iconGroup\),/);
  const css = read('public/css/app.css');
  assert.match(css, /\.icon-grid__opt \{[^}]*min-width: var\(--tap-min\); min-height: var\(--tap-min\);/);
  assert.match(css, /\.icon-grid__opt\[aria-checked="true"\] \{ border: 2px solid var\(--color-accent\);/);
  // Affichage : <use href> seulement, jamais de HTML
  for (const file of ['public/js/screens/list-form.js', 'public/js/screens/lists.js', 'public/js/screens/list.js']) {
    assert.doesNotMatch(read(file), /innerHTML|insertAdjacentHTML|outerHTML/, file);
  }
  assert.match(read('public/js/screens/list.js'), /replace\(titleIcon, icon\(listIcon\(list\), 'icon--sm'\)\);/);
});

test('migration 14 : base existante, les listes gardent l\'icône de leur catégorie, rien d\'autre ne change', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'listo-icon-'));
  const file = path.join(dir, 'listo.db');
  // Base « d'avant » : version 13, sans la colonne, avec des listes
  let db = openDatabase(file);
  db.exec('ALTER TABLE lists DROP COLUMN icon; ALTER TABLE lists DROP COLUMN add_mode');
  db.pragma('user_version = 13');
  db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('a', 'A', 'x')").run();
  db.prepare("INSERT INTO lists (id, name, category_id, owner_id, priority_enabled) VALUES ('taches', 'Maison', 2, 1, 1), ('courses', 'Courses', 1, 1, 0)").run();
  const before = db.prepare('SELECT * FROM lists ORDER BY id').all();
  db.close();
  db = openDatabase(file);
  assert.equal(schemaVersion(db), 15);
  const after = db.prepare('SELECT * FROM lists ORDER BY id').all();
  assert.deepEqual(after.map(({ icon, add_mode: addMode, ...rest }) => rest), before, 'rien d\'autre ne change (« Après l\'ajout » : migration 15)');
  assert.deepEqual(after.map((l) => l.icon), ['', ''], 'icône de la catégorie');
  // À l'écran : chariot pour les courses, liste cochée pour les tâches
  assert.equal(listIcon({ icon: after[0].icon, category: { isShopping: true } }), 'cart');
  assert.equal(listIcon({ icon: after[1].icon, category: { isShopping: false } }), 'tasks');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
