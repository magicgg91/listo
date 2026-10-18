// Renommer une catégorie (ou un magasin, un rayon) dans l'Administration :
// toutes les listes existantes montrent le nouveau nom, sur tous les
// téléphones, y compris ceux hors ligne qui se reconnectent ensuite.
//
// Cause trouvée : la base ne garde que l'identifiant (lists.category_id,
// lists.store_id, items.aisle_id) et le serveur décrit chaque liste avec le
// nom du moment. Mais une synchronisation « depuis » ne renvoie que les
// listes modifiées (un renommage n'en modifie aucune), et le téléphone
// gardait dans chaque liste la copie du nom reçue la dernière fois. Aucun
// message temps réel ne prévenait non plus les téléphones connectés.
// Correction : le téléphone relit la catégorie et le magasin d'une liste par
// leur identifiant dans les données de référence (envoyées en entier à chaque
// synchronisation, et gardées hors ligne) ; le serveur prévient les
// téléphones connectés (« event: refs ») à chaque changement de l'Admin.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { emptyState, loadSync, mergeSync, toSnapshot, fromSnapshot, computeListView, computeSummaries } from '../public/js/store.js';

const uuid = () => crypto.randomUUID();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Guillaume (Admin), Léa invitée ; une liste de courses au magasin « Leclerc »
// avec un article au rayon « Crèmerie »
async function household(t) {
  const app = await startTestApp(t);
  const admin = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  const storeId = (await admin.post('/api/admin/stores', { name: 'Leclerc Ville' })).body.item.id;
  const aisleId = app.db.prepare("SELECT id FROM aisles WHERE name = 'Crèmerie'").pluck().get();
  const listId = uuid();
  await admin.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId, name: 'Courses', categoryId: 1, storeId },
    { id: uuid(), type: 'item.create', listId, itemId: uuid(), name: 'Beurre', aisleId },
  ] });
  await admin.request('PUT', `/api/lists/${listId}/members`, { userIds: [leaId] });
  return { app, admin, lea, listId, storeId, aisleId };
}

test('base : une liste pointe vers sa catégorie et son magasin par l\'identifiant (aucune copie du nom, aucune migration à faire)', async (t) => {
  const { app } = await household(t);
  const columns = app.db.prepare('PRAGMA table_info(lists)').all().map((c) => c.name);
  assert.ok(columns.includes('category_id') && columns.includes('store_id'));
  assert.ok(!columns.some((c) => /category_name|store_name|categor.*name/.test(c)), columns.join(', '));
  const keys = app.db.prepare('PRAGMA foreign_key_list(lists)').all().map((k) => `${k.from}->${k.table}`);
  assert.ok(keys.includes('category_id->categories'));
  assert.ok(keys.includes('store_id->stores'));
  // La page publique lit aussi le nom par une jointure, à chaque requête
  assert.match(fs.readFileSync(new URL('../server/routes/public.js', import.meta.url), 'utf8'), /JOIN categories ON categories\.id = lists\.category_id/);
});

test('renommer catégorie, magasin, rayon : le téléphone (synchronisation « depuis ») montre les nouveaux noms', async (t) => {
  const h = await household(t);
  // Le téléphone de Léa : synchronisation complète (un peu après la
  // création de la liste), puis l'Admin renomme
  h.app.clock.now += 60 * 1000;
  const first = (await h.lea.get('/api/sync')).body;
  const phone = loadSync(emptyState(), first);
  assert.equal(phone.lists.get(h.listId).category.name, 'Courses');
  h.app.clock.now += 60 * 1000;
  assert.equal((await h.admin.request('PATCH', '/api/admin/categories/1', { name: 'Alimentation' })).status, 200);
  assert.equal((await h.admin.request('PATCH', `/api/admin/stores/${h.storeId}`, { name: 'Leclerc Drive' })).status, 200);
  assert.equal((await h.admin.request('PATCH', `/api/admin/aisles/${h.aisleId}`, { name: 'Produits laitiers' })).status, 200);
  // Serveur : à jour (la liste n'est pas « modifiée » pour autant)
  const since = (await h.lea.get(`/api/sync?since=${encodeURIComponent(first.serverTime)}`)).body;
  assert.equal(since.lists.length, 0, 'aucune liste modifiée : la synchronisation ne la renvoie pas');
  assert.equal(since.categories.find((c) => c.id === 1).name, 'Alimentation');
  // Téléphone : la liste suit ses références
  mergeSync(phone, since);
  const list = phone.lists.get(h.listId);
  assert.equal(list.category.name, 'Alimentation');
  assert.equal(list.store.name, 'Leclerc Drive');
  assert.equal(computeSummaries(phone).find((l) => l.id === h.listId).category.name, 'Alimentation', 'carte de « Mes listes »');
  const view = computeListView(phone, h.listId);
  assert.equal(view.list.category.name, 'Alimentation', 'sous-titre de la liste ouverte');
  assert.equal(view.groups[0].aisle.name, 'Produits laitiers', 'rayons : déjà relus par l\'identifiant');
  // Synchronisation complète : pareil
  const full = loadSync(emptyState(), (await h.lea.get('/api/sync')).body);
  assert.equal(full.lists.get(h.listId).category.name, 'Alimentation');
});

test('téléphone hors ligne : sa copie gardée (IndexedDB) se remet à jour à la reconnexion', async (t) => {
  const h = await household(t);
  h.app.clock.now += 60 * 1000;
  const first = (await h.lea.get('/api/sync')).body;
  // Copie enregistrée sur le téléphone, puis il coupe le réseau
  const saved = toSnapshot(loadSync(emptyState(), first));
  h.app.clock.now += 60 * 1000;
  await h.admin.request('PATCH', '/api/admin/categories/1', { name: 'Alimentation' });
  // Rouverte hors ligne : ancien nom (rien d'autre n'est connu)
  const offline = fromSnapshot(JSON.parse(JSON.stringify(saved)));
  assert.equal(offline.lists.get(h.listId).category.name, 'Courses');
  // Retour du réseau : synchronisation « depuis » → nouveau nom
  mergeSync(offline, (await h.lea.get(`/api/sync?since=${encodeURIComponent(first.serverTime)}`)).body);
  assert.equal(offline.lists.get(h.listId).category.name, 'Alimentation');
  // Et la copie enregistrée ensuite le garde
  assert.equal(fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(offline)))).lists.get(h.listId).category.name, 'Alimentation');
  // Une copie ancienne (liste au vieux nom) mais références à jour : corrigée dès l'ouverture
  const mixed = JSON.parse(JSON.stringify(saved));
  mixed.categories = mixed.categories.map((c) => (c.id === 1 ? { ...c, name: 'Alimentation' } : c));
  assert.equal(fromSnapshot(mixed).lists.get(h.listId).category.name, 'Alimentation');
});

test('temps réel : chaque changement de l\'Admin prévient les téléphones connectés, sans aucune donnée', async (t) => {
  const h = await household(t);
  const controller = new AbortController();
  t.after(() => controller.abort());
  const headers = { cookie: [...h.lea.jar].map(([n, v]) => `${n}=${v}`).join('; ') };
  const res = await fetch(`${h.app.base}/api/events`, { headers, signal: controller.signal });
  const reader = res.body.getReader();
  let raw = '';
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        raw += new TextDecoder().decode(value);
      }
    } catch {
      // flux coupé par le test
    }
  })();
  const waitFor = async (count) => {
    for (let i = 0; i < 300; i++) {
      if ((raw.match(/event: refs/g) ?? []).length >= count) return;
      await pause(10);
    }
    throw new Error(`message « refs » n° ${count} non reçu`);
  };
  await h.admin.request('PATCH', '/api/admin/categories/1', { name: 'Alimentation' });
  await waitFor(1);
  await h.admin.request('PATCH', `/api/admin/stores/${h.storeId}`, { name: 'Leclerc Drive' });
  await waitFor(2);
  await h.admin.request('PATCH', `/api/admin/aisles/${h.aisleId}`, { name: 'Produits laitiers' });
  await waitFor(3);
  const added = (await h.admin.post('/api/admin/aisles', { name: 'Rayon d\'essai' })).body.item;
  await waitFor(4);
  await h.admin.request('DELETE', `/api/admin/aisles/${added.id}`);
  await waitFor(5);
  // Le message ne dit rien de ce qui a changé
  assert.match(raw, /event: refs\ndata: \{\}\n\n/);
  for (const secret of ['Alimentation', 'Leclerc Drive', 'laitiers', 'essai']) assert.equal(raw.includes(secret), false, secret);
  // Un changement refusé (pas Admin) ne prévient personne
  const before = (raw.match(/event: refs/g) ?? []).length;
  assert.equal((await h.lea.request('PATCH', '/api/admin/categories/1', { name: 'Piraté' })).status, 403);
  await pause(100);
  assert.equal((raw.match(/event: refs/g) ?? []).length, before);
  assert.equal(h.app.db.prepare('SELECT name FROM categories WHERE id = 1').pluck().get(), 'Alimentation');
  // Le téléphone écoute ce message
  assert.match(fs.readFileSync(new URL('../public/js/live.js', import.meta.url), 'utf8'), /source\.addEventListener\('refs', \(\) => scheduleSync\(\)\);/);
});
