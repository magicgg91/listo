// « Dupliquer la liste » : copie faite par le serveur, en une transaction,
// pour le propriétaire et l'invité « Peut modifier » (lecture seule : 403 ;
// non-membre : « Liste introuvable »). La copie est privée (ni invités, ni
// lien public), ses éléments non supprimés sont tous décochés, les photos ne
// sont pas copiées. Le rendu est aussi vérifié dans Chromium
// (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login, ORIGIN } from './helpers.js';
import { copyName } from '../public/js/format.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const READ_ONLY = 'Vous avez un accès en lecture seule à cette liste.';

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

// Guillaume (propriétaire) ; Léa « Peut modifier » ; Paul « Lecture seule » ;
// Zoé, non-membre. Une liste de tâches (priorité et échéance activées) avec
// trois éléments (un coché, un avec photo, un supprimé), un lien public.
async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const ids = {};
  const clients = { guillaume };
  for (const name of ['lea', 'paul', 'zoe']) {
    ids[name] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    clients[name] = app.client();
    await login(clients[name], name, `MotDePasse-${name}`);
  }
  const listId = uuid();
  const [bulb, paint, old] = [uuid(), uuid(), uuid()];
  await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId, name: 'Maison', listType: 'tasks', priorityEnabled: true, dueEnabled: true },
    { id: uuid(), type: 'item.create', listId, itemId: bulb, name: 'Ampoule', quantity: '2', note: 'couloir' },
    { id: uuid(), type: 'item.update', itemId: bulb, priority: 'high', dueDate: '2026-10-30' },
    { id: uuid(), type: 'item.create', listId, itemId: paint, name: 'Peinture' },
    { id: uuid(), type: 'item.check', itemId: paint, checked: true },
    { id: uuid(), type: 'item.create', listId, itemId: old, name: 'Vieux truc' },
    { id: uuid(), type: 'item.delete', itemId: old },
  ] });
  const cookie = [...guillaume.jar].map(([n, v]) => `${n}=${v}`).join('; ');
  const photo = await fetch(`${app.base}/api/items/${bulb}/photo`, { method: 'PUT', headers: { cookie, origin: ORIGIN, 'content-type': 'image/jpeg' }, body: JPEG });
  assert.equal(photo.status, 200);
  await guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: [ids.lea, ids.paul], access: { [ids.lea]: 'modification', [ids.paul]: 'lecture' } });
  assert.equal((await guillaume.request('PUT', `/api/lists/${listId}/share`, {})).status, 201);
  const dump = () => JSON.stringify({
    lists: app.db.prepare('SELECT * FROM lists ORDER BY id').all(),
    items: app.db.prepare('SELECT * FROM items ORDER BY id').all(),
    members: app.db.prepare('SELECT * FROM list_members ORDER BY list_id, user_id').all(),
  });
  return { app, ...clients, ids, listId, bulb, paint, old, dump };
}

const duplicate = (client, listId, body) => client.post(`/api/lists/${listId}/duplicate`, body);

test('propriétaire : copie privée, éléments non supprimés tous décochés, champs copiés, ni invités ni lien ni photo', async (t) => {
  const h = await household(t);
  const res = await duplicate(h.guillaume, h.listId, { name: 'Maison (copie)', withItems: true });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const copy = res.body.list;
  assert.equal(res.body.copied, 2);
  assert.notEqual(copy.id, h.listId);
  assert.equal(copy.name, 'Maison (copie)');
  assert.equal(copy.isOwner, true);
  assert.deepEqual(copy.members.map((m) => m.id), [1], 'aucun invité');
  assert.equal(copy.publicLink, null, 'aucun lien public');
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM public_shares WHERE list_id = ?').pluck().get(copy.id), 0);
  const row = h.app.db.prepare('SELECT * FROM lists WHERE id = ?').get(copy.id);
  assert.deepEqual([row.category_id, row.store_id, row.owner_id, row.priority_enabled, row.due_enabled], [2, null, 1, 1, 1]);
  const items = h.app.db.prepare('SELECT * FROM items WHERE list_id = ? ORDER BY name').all(copy.id);
  assert.deepEqual(items.map((i) => i.name), ['Ampoule', 'Peinture'], 'le supprimé n\'est pas copié');
  assert.ok(items.every((i) => i.checked === 0 && i.checked_at === null && i.deleted_at === null && i.photo_at === null && i.created_by === 1));
  const ampoule = items[0];
  assert.deepEqual([ampoule.quantity, ampoule.note, ampoule.priority, ampoule.due_date], ['2', 'couloir', 'high', '2026-10-30']);
  assert.ok(!items.some((i) => [h.bulb, h.paint, h.old].includes(i.id)), 'nouveaux identifiants');
  // Photos : non copiées (aucun nouveau fichier) ; l'original garde la sienne
  assert.equal(h.app.ctx.photos.exists(ampoule.id), false);
  assert.equal(h.app.ctx.photos.exists(h.bulb), true);
  // L'original n'a pas bougé
  assert.equal(h.app.db.prepare('SELECT checked FROM items WHERE id = ?').pluck().get(h.paint), 1);
  // La copie apparaît chez le propriétaire, jamais chez les invités de l'original
  assert.ok((await h.guillaume.get('/api/sync')).body.listIds.includes(copy.id));
  assert.ok(!(await h.lea.get('/api/sync')).body.listIds.includes(copy.id));
  // Journal : identifiants seulement
  const entry = h.app.logs.find((l) => l.includes('liste_dupliquee'));
  assert.ok(entry, 'événement au journal');
  assert.doesNotMatch(entry, /Maison|Ampoule|Peinture|couloir/);
});

test('copie de liste de courses : magasin, rayons, code-barres ; la mémoire des noms suit l\'ajout habituel', async (t) => {
  const h = await household(t);
  const shop = uuid();
  const milk = uuid();
  const storeId = (await h.guillaume.post('/api/admin/stores', { name: 'Leclerc' })).body.item.id;
  await h.guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: shop, name: 'Courses', listType: 'shopping', storeId },
    { id: uuid(), type: 'item.create', listId: shop, itemId: milk, name: 'Lait', aisleId: 4, ean: '3428272950019' },
  ] });
  const before = h.app.db.prepare("SELECT SUM(use_count) FROM item_history WHERE name_normalized = 'lait'").pluck().get();
  const res = await duplicate(h.guillaume, shop, { name: 'Courses 2' });
  assert.equal(res.status, 201);
  const copy = h.app.db.prepare('SELECT * FROM lists WHERE id = ?').get(res.body.list.id);
  assert.equal(copy.store_id, storeId);
  const item = h.app.db.prepare('SELECT * FROM items WHERE list_id = ?').get(copy.id);
  assert.deepEqual([item.name, item.aisle_id, item.ean], ['Lait', 4, '3428272950019']);
  const after = h.app.db.prepare("SELECT SUM(use_count) FROM item_history WHERE name_normalized = 'lait'").pluck().get();
  assert.ok(after > before, 'comme un ajout');
});

test('sans « Copier les éléments » : liste vide ; titre obligatoire ; réglage invalide refusé', async (t) => {
  const h = await household(t);
  const res = await duplicate(h.guillaume, h.listId, { name: 'Vide', withItems: false });
  assert.equal(res.status, 201);
  assert.equal(res.body.copied, 0);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM items WHERE list_id = ?').pluck().get(res.body.list.id), 0);
  const before = h.dump();
  assert.equal((await duplicate(h.guillaume, h.listId, { name: '   ' })).status, 400);
  assert.equal((await duplicate(h.guillaume, h.listId, { name: 'x'.repeat(101) })).status, 400);
  assert.equal((await duplicate(h.guillaume, h.listId, { name: 'X', withItems: 'oui' })).status, 400);
  assert.equal(h.dump(), before);
});

test('invité « Peut modifier » : accepté, il devient propriétaire de la copie', async (t) => {
  const h = await household(t);
  const res = await duplicate(h.lea, h.listId, { name: 'À moi' });
  assert.equal(res.status, 201);
  assert.equal(res.body.list.isOwner, true);
  assert.equal(h.app.db.prepare('SELECT owner_id FROM lists WHERE id = ?').pluck().get(res.body.list.id), h.ids.lea);
  assert.ok(!(await h.guillaume.get('/api/sync')).body.listIds.includes(res.body.list.id), 'privée');
});

test('lecture seule : 403, base inchangée ; non-membre : « Liste introuvable »', async (t) => {
  const h = await household(t);
  const before = h.dump();
  const ro = await duplicate(h.paul, h.listId, { name: 'Non' });
  assert.deepEqual([ro.status, ro.body.error], [403, READ_ONLY]);
  const stranger = await duplicate(h.zoe, h.listId, { name: 'Non' });
  assert.deepEqual([stranger.status, stranger.body.error], [404, 'Liste introuvable.']);
  assert.deepEqual([(await duplicate(h.zoe, uuid(), { name: 'Non' })).body.error], ['Liste introuvable.'], 'même réponse qu\'une liste inexistante');
  assert.equal(h.dump(), before);
});

test('tout ou rien : une erreur pendant la copie n\'écrit rien', async (t) => {
  const h = await household(t);
  const before = h.dump();
  // Panne simulée au milieu de la copie (après la liste et le premier élément)
  h.app.db.exec("CREATE TRIGGER panne BEFORE INSERT ON items WHEN NEW.name = 'Peinture' BEGIN SELECT RAISE(ABORT, 'panne'); END;");
  const res = await duplicate(h.guillaume, h.listId, { name: 'Panne' });
  assert.equal(res.status, 500);
  h.app.db.exec('DROP TRIGGER panne');
  assert.equal(h.dump(), before);
});

test('plafond : 20 duplications par heure et par compte', async (t) => {
  const h = await household(t);
  for (let i = 0; i < 20; i++) assert.equal((await duplicate(h.lea, h.listId, { name: `C${i}`, withItems: false })).status, 201);
  const res = await duplicate(h.lea, h.listId, { name: 'Une de trop', withItems: false });
  assert.equal(res.status, 429);
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM lists WHERE name = 'Une de trop'").pluck().get(), 0);
  // Un autre compte n'est pas concerné
  assert.equal((await duplicate(h.guillaume, h.listId, { name: 'Ok', withItems: false })).status, 201);
});

test('téléphone : feuille, nom proposé, hors ligne, aucun focus', () => {
  assert.equal(copyName('Courses'), 'Courses (copie)');
  assert.equal(copyName('x'.repeat(100)).length, 100);
  assert.ok(copyName('x'.repeat(100)).endsWith(' (copie)'));
  const source = read('public/js/screens/list-actions.js');
  assert.match(source, /const OFFLINE_DUPLICATE = 'Connexion nécessaire pour dupliquer une liste';/);
  assert.match(source, /if \(!navigator\.onLine\) \{\s*toast\(OFFLINE_DUPLICATE\);/);
  assert.match(source, /const nameField = field\('Titre de la liste', name\);/);
  assert.match(source, /'aria-label': `Copier les \$\{words\.many\}`/);
  assert.match(source, /let withItems = true;/);
  assert.match(source, /toast\(`Liste « \$\{created\.name\} » créée`, \{ action: 'Ouvrir', onAction: \(\) => navigate\('list', \{ id: created\.id \}\) \}\);/);
  assert.doesNotMatch(source, /innerHTML|\.focus\(/);
  assert.match(read('public/js/screens/lists.js'), /isFreshList\(list\.id\) \? ' list-card--fresh' : ''/);
});
