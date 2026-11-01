// Droit par personne sur une liste partagée : « Peut modifier »
// (list_members.access = 'modification') ou « Lecture seule » ('lecture').
// Le serveur refuse TOUTE écriture d'un membre en lecture seule, sur chaque
// opération et chaque route, sans rien écrire ; la lecture, la
// synchronisation, le temps réel et les photos restent permis. Une seule
// fonction décide (canEdit de server/lists.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login, ORIGIN, databaseAt } from './helpers.js';
import { openDatabase, migrate, schemaVersion } from '../server/db.js';

const uuid = () => crypto.randomUUID();
const READ_ONLY = 'Vous avez un accès en lecture seule à cette liste.';
const OWNER_ONLY = 'Seul le propriétaire de la liste peut faire cela.';

// Petit JPEG valable (voir photos.test.js)
const u16 = (n) => Buffer.from([n >> 8, n & 0xff]);
const block = (marker, payload) => Buffer.concat([Buffer.from([0xff, marker]), u16(payload.length + 2), payload]);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  block(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
  block(0xdb, Buffer.alloc(65, 1)),
  block(0xc0, Buffer.from([8, 0, 32, 0, 32, 1, 1, 0x11, 0])),
  block(0xc4, Buffer.alloc(20, 2)),
  block(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0x12, 0xff, 0x00, 0x34]),
  Buffer.from([0xff, 0xd9]),
]);

async function raw(client, method, url, body, type) {
  const headers = { origin: ORIGIN, cookie: [...client.jar].map(([n, v]) => `${n}=${v}`).join('; ') };
  if (type) headers['content-type'] = type;
  const res = await fetch(`${client.base}${url}`, { method, headers, body });
  const text = await res.text();
  return { status: res.status, body: text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text };
}

// Guillaume (Admin, propriétaire) ; Léa : partage sans droit précisé, donc
// « Lecture seule » (invité) ; Marie : « Peut modifier » (contributeur) ;
// Paul : aucun partage.
// Une liste de courses (lait avec photo, pain coché, beurre supprimé) et une
// liste de tâches (ampoule).
async function household(t) {
  const asked = [];
  const app = await startTestApp(t, { productRequest: async (code) => { asked.push(code); return { notFound: true }; } });
  const guillaume = await setupAdmin(app);
  guillaume.base = app.base;
  const clients = { guillaume };
  const ids = {};
  for (const name of ['lea', 'marie', 'paul']) {
    ids[name] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    clients[name] = app.client();
    clients[name].base = app.base;
    await login(clients[name], name, `MotDePasse-${name}`);
  }
  const shop = uuid();
  const tasks = uuid();
  const milk = uuid();
  const bread = uuid();
  const butter = uuid();
  const bulb = uuid();
  await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: shop, name: 'Courses', listType: 'shopping' },
    { id: uuid(), type: 'item.create', listId: shop, itemId: milk, name: 'Lait', aisleId: 4 },
    { id: uuid(), type: 'item.create', listId: shop, itemId: bread, name: 'Pain' },
    { id: uuid(), type: 'item.check', itemId: bread, checked: true },
    { id: uuid(), type: 'item.create', listId: shop, itemId: butter, name: 'Beurre' },
    { id: uuid(), type: 'item.delete', itemId: butter },
    { id: uuid(), type: 'list.create', listId: tasks, name: 'Maison', listType: 'tasks', priorityEnabled: true, dueEnabled: true },
    { id: uuid(), type: 'item.create', listId: tasks, itemId: bulb, name: 'Ampoule' },
  ] });
  assert.equal((await raw(guillaume, 'PUT', `/api/items/${milk}/photo`, JPEG, 'image/jpeg')).status, 200);
  for (const listId of [shop, tasks]) {
    // Léa : aucun droit précisé ; Marie : « Peut modifier »
    const res = await guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: [ids.lea, ids.marie], access: { [ids.marie]: 'modification' } });
    assert.equal(res.status, 200, res.text);
  }
  const notified = [];
  const notify = app.ctx.events.notifyList.bind(app.ctx.events);
  app.ctx.events.notifyList = (listId, options) => {
    notified.push(listId);
    notify(listId, options);
  };
  // Tout ce que la base contient sur ces listes (pour vérifier que rien n'a bougé)
  const dump = () => JSON.stringify({
    lists: app.db.prepare('SELECT * FROM lists ORDER BY id').all(),
    items: app.db.prepare('SELECT * FROM items ORDER BY id').all(),
    members: app.db.prepare('SELECT * FROM list_members ORDER BY list_id, user_id').all(),
    shares: app.db.prepare('SELECT * FROM public_shares').all(),
  });
  return { app, ...clients, ids, shop, tasks, milk, bread, butter, bulb, dump, notified, asked };
}

// Toutes les opérations d'écriture de /api/ops sur une liste ou ses articles
function writeOps(h) {
  return [
    ['ajouter', { type: 'item.create', listId: h.shop, itemId: uuid(), name: 'Confiture' }],
    ['renommer', { type: 'item.update', itemId: h.milk, name: 'Lait entier' }],
    ['quantité', { type: 'item.update', itemId: h.milk, quantity: '2' }],
    ['note', { type: 'item.update', itemId: h.milk, note: 'bio' }],
    ['rayon', { type: 'item.update', itemId: h.milk, aisleId: 5 }],
    ['code-barres', { type: 'item.update', itemId: h.milk, ean: '3428272950019' }],
    ['priorité', { type: 'item.update', itemId: h.bulb, priority: 'high' }],
    ['échéance', { type: 'item.update', itemId: h.bulb, dueDate: '2026-10-30' }],
    ['cocher', { type: 'item.check', itemId: h.milk, checked: true }],
    ['décocher', { type: 'item.check', itemId: h.bread, checked: false }],
    ['supprimer (fiche ou glissement)', { type: 'item.delete', itemId: h.milk }],
    ['remettre (Annuler)', { type: 'item.restore', itemId: h.butter }],
    ['tout décocher', { type: 'list.uncheckAll', listId: h.shop }],
    ['retirer les cochés', { type: 'list.removeChecked', listId: h.shop }],
    ['retirer les cochés (ancien nom)', { type: 'list.clearChecked', listId: h.shop }],
  ];
}

// Résultat d'une opération, sans son identifiant
async function run(client, op) {
  const { id, ...result } = (await client.post('/api/ops', { ops: [{ id: uuid(), ...op }] })).body.results[0];
  return result;
}

test('lecture seule : chaque opération d\'écriture est refusée (403) et la base ne change pas', async (t) => {
  const h = await household(t);
  const before = h.dump();
  for (const [label, op] of writeOps(h)) {
    const result = await run(h.lea, op);
    assert.equal(result.status, 403, label);
    assert.equal(result.error, READ_ONLY, label);
  }
  // Renommer ou supprimer la liste, changer le partage : réservés au propriétaire
  assert.deepEqual(await run(h.lea, { type: 'list.update', listId: h.shop, name: 'Piratée' }), { status: 403, error: OWNER_ONLY });
  assert.deepEqual(await run(h.lea, { type: 'list.delete', listId: h.shop }), { status: 403, error: OWNER_ONLY });
  assert.equal((await h.lea.request('PUT', `/api/lists/${h.shop}/members`, { userIds: [] })).status, 403);
  assert.equal((await h.lea.request('PUT', `/api/lists/${h.shop}/share`, {})).status, 404);
  // Photo : envoyer, retirer
  assert.deepEqual(await raw(h.lea, 'PUT', `/api/items/${h.milk}/photo`, JPEG, 'image/jpeg'), { status: 403, body: { error: READ_ONLY } });
  assert.deepEqual(await raw(h.lea, 'DELETE', `/api/items/${h.milk}/photo`), { status: 403, body: { error: READ_ONLY } });
  // Mode scan (recherche de produit pour ajouter ou cocher)
  assert.deepEqual(await raw(h.lea, 'POST', `/api/lists/${h.shop}/products`, JSON.stringify({ code: '3017620422003' }), 'application/json'), { status: 403, body: { error: READ_ONLY } });
  assert.deepEqual(h.asked, [], 'aucune demande à Open Food Facts');
  assert.equal(h.dump(), before, 'rien n\'a été écrit');
  assert.deepEqual(h.notified, [], 'aucun message temps réel');
});

test('« Peut modifier » : les mêmes écritures réussissent', async (t) => {
  const h = await household(t);
  for (const [label, op] of writeOps(h)) assert.equal((await run(h.marie, op)).status, 200, label);
  assert.equal((await raw(h.marie, 'PUT', `/api/items/${h.bulb}/photo`, JPEG, 'image/jpeg')).status, 200);
  assert.equal((await raw(h.marie, 'DELETE', `/api/items/${h.bulb}/photo`)).status, 200);
  assert.equal((await raw(h.marie, 'POST', `/api/lists/${h.shop}/products`, JSON.stringify({ code: '3017620422003' }), 'application/json')).status, 200);
  // Mais pas renommer la liste ni changer le partage (propriétaire seulement)
  assert.equal((await run(h.marie, { type: 'list.update', listId: h.shop, name: 'X' })).status, 403);
  assert.equal((await h.marie.request('PUT', `/api/lists/${h.shop}/members`, { userIds: [h.ids.marie], access: { [h.ids.marie]: 'modification' } })).status, 403);
});

test('lecture seule : lire, synchroniser, voir les photos, recevoir le temps réel', async (t) => {
  const h = await household(t);
  const sync = (await h.lea.get('/api/sync')).body;
  const list = sync.lists.find((l) => l.id === h.shop);
  assert.equal(list.canEdit, false);
  assert.equal(list.members.find((m) => m.id === h.ids.lea).access, 'lecture');
  assert.equal(list.members.find((m) => m.isOwner).access, 'modification');
  assert.ok(sync.items.some((i) => i.id === h.milk));
  assert.equal((await h.lea.get(`/api/lists/${h.shop}`)).status, 200);
  const photo = await fetch(`${h.lea.base}/api/items/${h.milk}/photo`, { headers: { cookie: [...h.lea.jar].map(([n, v]) => `${n}=${v}`).join('; ') } });
  assert.equal(photo.status, 200);
  assert.equal((await h.lea.get(`/api/suggestions?q=La&listId=${h.shop}`)).status, 200);
  // Le propriétaire et Marie ont le droit d'écrire
  assert.equal((await h.guillaume.get('/api/sync')).body.lists.find((l) => l.id === h.shop).canEdit, true);
  assert.equal((await h.marie.get('/api/sync')).body.lists.find((l) => l.id === h.shop).canEdit, true);
});

test('non-membre : exactement les mêmes réponses qu\'avant (404, aucune fuite)', async (t) => {
  const h = await household(t);
  assert.deepEqual(await run(h.paul, { type: 'item.create', listId: h.shop, itemId: uuid(), name: 'X' }), { status: 404, error: 'Liste introuvable.' });
  assert.deepEqual(await run(h.paul, { type: 'item.check', itemId: h.milk, checked: true }), { status: 404, error: 'Introuvable, peut-être supprimé entre-temps.' });
  assert.equal((await raw(h.paul, 'PUT', `/api/items/${h.milk}/photo`, JPEG, 'image/jpeg')).status, 404);
  assert.equal((await raw(h.paul, 'POST', `/api/lists/${h.shop}/products`, JSON.stringify({ code: '3017620422003' }), 'application/json')).status, 404);
});

test('partage : sans droit précisé, lecture seule ; le propriétaire garde tout ; droits invalides refusés sans rien écrire', async (t) => {
  const h = await household(t);
  const access = (listId, userId) => h.app.db.prepare('SELECT access FROM list_members WHERE list_id = ? AND user_id = ?').pluck().get(listId, userId);
  assert.equal(access(h.shop, h.ids.lea), 'lecture', 'ajoutée sans droit précisé');
  assert.equal(access(h.shop, h.ids.marie), 'modification');
  assert.equal(access(h.shop, 1), 'modification', 'propriétaire');
  // Liste créée puis partagée par l'ancienne forme de l'API (userIds seuls)
  const other = uuid();
  await run(h.guillaume, { type: 'list.create', listId: other, name: 'Brico', listType: 'tasks' });
  await h.guillaume.request('PUT', `/api/lists/${other}/members`, { userIds: [h.ids.paul] });
  assert.equal(access(other, h.ids.paul), 'lecture');
  // Une appartenance écrite sans droit, directement dans la base : lecture seule
  h.app.db.prepare('INSERT INTO list_members (list_id, user_id) VALUES (?, ?)').run(other, h.ids.lea);
  assert.equal(access(other, h.ids.lea), 'lecture');
  assert.throws(() => h.app.db.prepare("UPDATE list_members SET access = 'admin' WHERE list_id = ?").run(other), /CHECK/);
  // Un invité déjà présent, sans droit précisé, garde le sien
  await h.guillaume.request('PUT', `/api/lists/${h.shop}/members`, { userIds: [h.ids.lea, h.ids.marie] });
  assert.equal(access(h.shop, h.ids.marie), 'modification');
  // Refus, rien d'écrit
  const before = h.dump();
  for (const [body, message] of [
    [{ userIds: [h.ids.lea], access: { 1: 'lecture' } }, 'Le propriétaire a tous les droits sur sa liste.'],
    [{ userIds: [h.ids.lea], access: { [h.ids.lea]: 'admin' } }, 'Droits des personnes invalides.'],
    [{ userIds: [h.ids.lea], access: { [h.ids.paul]: 'modification' } }, 'Droit donné à une personne avec qui la liste n\'est pas partagée.'],
    [{ userIds: [h.ids.lea], access: [] }, 'Droits des personnes invalides.'],
  ]) {
    const res = await h.guillaume.request('PUT', `/api/lists/${h.shop}/members`, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error, message);
  }
  assert.equal(h.dump(), before);
});

test('changer le droit : arrive par la synchronisation et le temps réel ; journal sans contenu', async (t) => {
  const h = await household(t);
  const first = (await h.lea.get('/api/sync')).body;
  h.app.clock.now += 60 * 1000;
  await h.guillaume.request('PUT', `/api/lists/${h.shop}/members`, { userIds: [h.ids.lea, h.ids.marie], access: { [h.ids.lea]: 'modification' } });
  assert.ok(h.notified.includes(h.shop), 'message temps réel aux membres');
  const since = (await h.lea.get(`/api/sync?since=${encodeURIComponent(first.serverTime)}`)).body;
  assert.equal(since.lists.find((l) => l.id === h.shop)?.canEdit, true, 'la liste revient avec le nouveau droit');
  assert.equal((await run(h.lea, { type: 'item.check', itemId: h.milk, checked: true })).status, 200);
  // Et de nouveau en lecture seule : la prochaine écriture est refusée
  await h.guillaume.request('PUT', `/api/lists/${h.shop}/members`, { userIds: [h.ids.lea, h.ids.marie], access: { [h.ids.lea]: 'lecture' } });
  assert.equal((await run(h.lea, { type: 'item.check', itemId: h.milk, checked: false })).status, 403);
  const log = h.app.logs.join('\n');
  assert.match(log, /liste_droit_change/);
  assert.doesNotMatch(log, /Courses|Lait|Pain/, 'ni nom de liste ni article dans le journal');
});

test('migration 12 : les membres existants gardent la modification ; ensuite, lecture seule par défaut', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'listo-droits-'));
  const file = path.join(dir, 'listo.db');
  // Base « d'avant » : version 11, table des membres sans droit
  let db = databaseAt(file, 11);
  for (const name of ['a', 'b', 'c']) db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, 'x')").run(name, name);
  db.prepare("INSERT INTO lists (id, name, category_id, owner_id) VALUES ('l1', 'Courses', 1, 1)").run();
  for (const userId of [1, 2, 3]) db.prepare("INSERT INTO list_members (list_id, user_id) VALUES ('l1', ?)").run(userId);
  db.close();
  // Redémarrage : la migration 12 s'applique
  db = openDatabase(file);
  assert.equal(schemaVersion(db), 19);
  assert.deepEqual(db.prepare('SELECT user_id, access FROM list_members ORDER BY user_id').all().map((r) => [r.user_id, r.access]), [[1, 'modification'], [2, 'modification'], [3, 'modification']]);
  db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('d', 'd', 'x')").run();
  db.prepare("INSERT INTO list_members (list_id, user_id) VALUES ('l1', 4)").run();
  assert.equal(db.prepare('SELECT access FROM list_members WHERE user_id = 4').pluck().get(), 'lecture');
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'list_members_user'").get(), 'index gardé');
  assert.equal(db.pragma('foreign_key_check').length, 0);
  // Suppression d'un compte ou d'une liste : toujours en cascade
  db.prepare('DELETE FROM users WHERE id = 3').run();
  assert.equal(db.prepare('SELECT COUNT(*) FROM list_members').pluck().get(), 3);
  migrate(db); // second démarrage : rien
  assert.equal(schemaVersion(db), 19);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('une seule fonction décide : canEdit, utilisée par les opérations, les photos et le mode scan', () => {
  const lists = fs.readFileSync(new URL('../server/lists.js', import.meta.url), 'utf8');
  assert.equal((lists.match(/export function canEdit\(/g) ?? []).length, 1);
  assert.match(lists, /function requireEdit\(user, row\) \{\s*if \(!canEdit\(user, row\)\) throw new OpError\(403, READ_ONLY\);/);
  for (const op of ['list.removeChecked', 'list.uncheckAll', 'item.create']) assert.match(lists, new RegExp(`'${op.replace('.', '\\.')}'\\(user, op\\) \\{\\s*const list = listForEditor\\(`), op);
  for (const op of ['item.update', 'item.check', 'item.delete']) assert.match(lists, new RegExp(`'${op.replace('.', '\\.')}'\\(user, op\\) \\{\\s*const item = itemForEditor\\(`), op);
  assert.match(lists, /if \(!item\) throw new OpError\(404, ITEM_NOT_FOUND\);\s*requireEdit\(user, item\);/);
  const photos = fs.readFileSync(new URL('../server/routes/photos.js', import.meta.url), 'utf8');
  assert.match(photos, /if \(!canEdit\(req\.user, req\.item\)\) return res\.status\(403\)\.json\(\{ error: READ_ONLY \}\);/);
  assert.match(photos, /router\.put\('\/items\/:id\/photo', findItem, mayEdit,/);
  assert.match(photos, /router\.delete\('\/items\/:id\/photo', findItem, mayEdit,/);
  assert.match(fs.readFileSync(new URL('../server/routes/products.js', import.meta.url), 'utf8'), /list = ctx\.lists\.listForEditor\(req\.user, req\.params\.id\);/);
  // Aucun autre contrôle maison du droit
  for (const file of ['server/routes/photos.js', 'server/routes/products.js', 'server/routes/lists.js', 'server/routes/shares.js']) {
    assert.doesNotMatch(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /member_access|'modification'|'lecture'/, file);
  }
});
