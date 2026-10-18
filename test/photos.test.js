// Tests des photos des articles (étape 7) : contrôle du fichier JPEG, retrait
// des métadonnées, droits d'accès, remplacement et retrait, plafond d'envois,
// restauration, nettoyage, synchronisation, migration.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { startTestApp, setupAdmin, addUser, login, tempDir, ORIGIN } from './helpers.js';
import { cleanJpeg, MAX_PHOTO_BYTES } from '../server/photos.js';
import { openDatabase, MIGRATIONS, schemaVersion } from '../server/db.js';

const DAY = 24 * 60 * 60 * 1000;
const uuid = () => crypto.randomUUID();

// --- Fabrication de petits fichiers JPEG (structure seulement) ---

const u16 = (n) => Buffer.from([n >> 8, n & 0xff]);
const block = (marker, payload) => Buffer.concat([Buffer.from([0xff, marker]), u16(payload.length + 2), payload]);
const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);
const JFIF = block(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'));
const GPS_TEXT = 'GPSLatitude=48.8566N;GPSLongitude=2.3522E;Model=Telephone-de-Guillaume';
const EXIF = block(0xe1, Buffer.from(`Exif\0\0MM\0*${GPS_TEXT}`, 'latin1'));
const XMP = block(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Lieu secret</x:xmpmeta>', 'latin1'));
const IPTC = block(0xed, Buffer.from('Photoshop 3.0\0Auteur secret', 'latin1'));
const COMMENT = block(0xfe, Buffer.from('Commentaire secret', 'latin1'));
const ICC = block(0xe2, Buffer.from('ICC_PROFILE\0\x01\x01profil', 'latin1'));
const sof = (width, height) => block(0xc0, Buffer.from([8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]));
const SCAN = Buffer.concat([block(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0x78])]);

function jpeg({ width = 640, height = 480, metadata = [EXIF, XMP, IPTC, COMMENT, ICC], frames = null } = {}) {
  return Buffer.concat([
    SOI, JFIF, ...metadata,
    block(0xdb, Buffer.alloc(65, 1)),         // table de quantification
    ...(frames ?? [sof(width, height)]),
    block(0xc4, Buffer.alloc(20, 2)),         // table de Huffman
    SCAN, EOI,
  ]);
}
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const has = (buffer, text) => buffer.includes(Buffer.from(text, 'latin1'));

// --- Contrôle du fichier (sans serveur) ---

test('JPEG valide : accepté, métadonnées retirées (EXIF, GPS, XMP, IPTC, commentaire), affichage gardé', () => {
  const original = jpeg();
  assert.ok(has(original, 'GPSLatitude'));
  const result = cleanJpeg(original);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual([result.width, result.height], [640, 480]);
  for (const secret of ['Exif', 'GPS', 'Model', 'xmpmeta', 'Photoshop', 'secret']) {
    assert.equal(has(result.jpeg, secret), false, `« ${secret} » doit disparaître`);
  }
  assert.ok(has(result.jpeg, 'JFIF') && has(result.jpeg, 'ICC_PROFILE'), 'les blocs utiles à l\'affichage restent');
  assert.deepEqual([...result.jpeg.subarray(0, 2)], [0xff, 0xd8]);
  assert.deepEqual([...result.jpeg.subarray(-2)], [0xff, 0xd9]);
  // Les données de l'image (avec FF 00 et FF D0) sont gardées telles quelles
  assert.ok(result.jpeg.includes(Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0x78])));
  // Nettoyer un fichier déjà propre ne change rien
  assert.deepEqual(cleanJpeg(result.jpeg).jpeg, result.jpeg);
});

test('fichiers refusés : pas un JPEG, tronqué, données après la fin, trop grand, mal formé', () => {
  const good = jpeg();
  const refused = (buffer) => cleanJpeg(buffer).ok === false;
  assert.ok(refused(PNG), 'PNG');
  assert.ok(refused(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), 'SVG');
  assert.ok(refused(Buffer.alloc(0)), 'vide');
  assert.ok(refused(null), 'absent');
  assert.ok(refused(good.subarray(0, good.length - 2)), 'sans la fin FF D9');
  assert.ok(refused(good.subarray(0, 40)), 'coupé au milieu');
  assert.ok(refused(Buffer.concat([good, Buffer.from('<script>alert(1)</script>')])), 'données après la fin');
  assert.ok(refused(Buffer.concat([good, Buffer.from([0x00])])), 'un octet après la fin');
  assert.ok(refused(jpeg({ width: 4097, height: 100 })), 'trop large');
  assert.ok(refused(jpeg({ width: 100, height: 5000 })), 'trop haut');
  assert.ok(refused(jpeg({ width: 0, height: 100 })), 'largeur nulle');
  assert.ok(refused(jpeg({ frames: [sof(10, 10), sof(20, 20)] })), 'deux tailles déclarées');
  assert.ok(refused(jpeg({ frames: [] })), 'aucune taille déclarée');
  assert.ok(refused(Buffer.concat([SOI, JFIF, sof(10, 10), EOI])), 'aucune donnée d\'image');
  // Longueur de bloc qui dépasse le fichier
  assert.ok(refused(Buffer.concat([SOI, Buffer.from([0xff, 0xe1, 0xff, 0xff]), Buffer.alloc(10)])), 'bloc trop long');
  assert.equal(cleanJpeg(jpeg({ width: 4096, height: 4096 })).ok, true, '4096 × 4096 est permis');
});

// --- Routes ---

// Prépare : Admin « guillaume » (propriétaire), « marie » (invitée), « paul »
// (ni l'un ni l'autre), une liste partagée avec Marie et un article.
async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const clients = { guillaume };
  const ids = {};
  for (const name of ['marie', 'paul']) {
    ids[name] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    clients[name] = app.client();
    await login(clients[name], name, `MotDePasse-${name}`);
  }
  const courses = app.db.prepare("SELECT id FROM categories WHERE name = 'Courses'").pluck().get();
  const listId = uuid();
  const itemId = uuid();
  await run(guillaume, { type: 'list.create', listId, name: 'Courses', categoryId: courses });
  await run(guillaume, { type: 'item.create', listId, itemId, name: 'Café en grains' });
  await guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: [ids.marie], access: { [ids.marie]: 'modification' } });
  const file = path.join(app.photosDir, `${itemId}.jpg`);
  return { app, ...clients, ids, listId, itemId, file };
}

async function run(client, op) {
  const res = await client.post('/api/ops', { ops: [{ id: uuid(), ...op }] });
  assert.equal(res.status, 200, res.text);
  return res.body.results[0];
}

// Envoie une photo (corps brut) ; type : en-tête Content-Type annoncé
async function upload(client, itemId, body, { type = 'image/jpeg', origin = ORIGIN } = {}) {
  const headers = { 'content-type': type };
  if (origin) headers.origin = origin;
  if (client.jar.size) headers.cookie = [...client.jar].map(([n, v]) => `${n}=${v}`).join('; ');
  const res = await fetch(`${client.base}/api/items/${itemId}/photo`, { method: 'PUT', headers, body });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function download(client, itemId) {
  const headers = client.jar.size ? { cookie: [...client.jar].map(([n, v]) => `${n}=${v}`).join('; ') } : {};
  const res = await fetch(`${client.base}/api/items/${itemId}/photo`, { headers });
  return { status: res.status, headers: res.headers, body: Buffer.from(await res.arrayBuffer()) };
}

test('envoi par un membre : photo nettoyée, enregistrée, lisible par les membres seulement', async (t) => {
  const h = await household(t);
  for (const c of [h.guillaume, h.marie, h.paul]) c.base = h.app.base;

  const res = await upload(h.marie, h.itemId, jpeg());
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.match(res.body.item.photoAt, /^\d{4}-\d{2}-\d{2}T/);
  const stored = fs.readFileSync(h.file);
  assert.equal(has(stored, 'GPS'), false, 'pas de position GPS dans le fichier écrit');
  assert.equal(has(stored, 'Exif'), false);
  assert.equal((fs.statSync(h.file).mode & 0o777).toString(8), '600');

  for (const member of [h.guillaume, h.marie]) {
    const photo = await download(member, h.itemId);
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/jpeg');
    assert.equal(photo.headers.get('x-content-type-options'), 'nosniff');
    assert.match(photo.headers.get('cache-control'), /^private/);
    assert.deepEqual(photo.body, stored);
  }

  // Paul n'est pas membre : 404 partout, comme pour un article inconnu, et rien ne change
  assert.equal((await download(h.paul, h.itemId)).status, 404);
  assert.equal((await upload(h.paul, h.itemId, jpeg({ width: 10, height: 10 }))).status, 404);
  assert.equal((await h.paul.del(`/api/items/${h.itemId}/photo`)).status, 404);
  assert.deepEqual(fs.readFileSync(h.file), stored);
  assert.equal((await download(h.paul, uuid())).status, 404);

  // Sans connexion : 401 ; sans l'en-tête Origin (CSRF) : 403
  const visitor = h.app.client();
  visitor.base = h.app.base;
  assert.equal((await download(visitor, h.itemId)).status, 401);
  assert.equal((await upload(visitor, h.itemId, jpeg())).status, 401);
  assert.equal((await upload(h.marie, h.itemId, jpeg(), { origin: null })).status, 403);
  assert.equal((await upload(h.marie, h.itemId, jpeg(), { origin: 'https://pirate.example' })).status, 403);
  // Identifiant qui n'est pas un UUID : 404, aucun fichier créé ailleurs
  assert.equal((await upload(h.marie, '..%2F..%2Fsecret', jpeg())).status, 404);
  assert.deepEqual(fs.readdirSync(h.app.photosDir), [`${h.itemId}.jpg`]);
});

test('le contenu compte, pas le type annoncé ; trop lourd ou invalide : refusé sans rien écrire', async (t) => {
  const h = await household(t);
  h.guillaume.base = h.app.base;
  // Un PNG annoncé comme JPEG : refusé
  assert.equal((await upload(h.guillaume, h.itemId, PNG)).status, 400);
  // Un fichier tronqué, ou avec des données après la fin : refusé
  const good = jpeg();
  assert.equal((await upload(h.guillaume, h.itemId, good.subarray(0, good.length - 10))).status, 400);
  assert.equal((await upload(h.guillaume, h.itemId, Buffer.concat([good, Buffer.from('suite')]))).status, 400);
  assert.equal((await upload(h.guillaume, h.itemId, jpeg({ width: 8000, height: 6000 }))).status, 400);
  // Plus de 2 Mo : 413
  const heavy = Buffer.concat([SOI, JFIF, block(0xfe, Buffer.alloc(60000))]);
  const tooBig = Buffer.concat([heavy, Buffer.alloc(MAX_PHOTO_BYTES)]);
  assert.equal((await upload(h.guillaume, h.itemId, tooBig)).status, 413);
  assert.equal(fs.existsSync(h.file), false, 'aucun fichier écrit');
  assert.equal(h.app.db.prepare('SELECT photo_at FROM items').pluck().get(), null);
  // Un vrai JPEG annoncé avec un autre type est accepté (le contenu est vérifié)
  assert.equal((await upload(h.guillaume, h.itemId, good, { type: 'application/octet-stream' })).status, 200);
});

test('remplacer ou retirer la photo efface l\'ancien fichier', async (t) => {
  const h = await household(t);
  h.guillaume.base = h.app.base;
  h.marie.base = h.app.base;
  const first = await upload(h.guillaume, h.itemId, jpeg({ width: 100, height: 100 }));
  const firstFile = fs.readFileSync(h.file);
  h.app.clock.now += 60 * 1000;
  const second = await upload(h.marie, h.itemId, jpeg({ width: 200, height: 150 }));
  assert.equal(second.status, 200);
  assert.notEqual(second.body.item.photoAt, first.body.item.photoAt, 'nouvelle date : le téléphone recharge l\'image');
  assert.notDeepEqual(fs.readFileSync(h.file), firstFile);
  assert.equal(cleanJpeg(fs.readFileSync(h.file)).width, 200);
  assert.deepEqual(fs.readdirSync(h.app.photosDir), [`${h.itemId}.jpg`], 'un seul fichier, aucun reste temporaire');

  const removed = await h.marie.del(`/api/items/${h.itemId}/photo`);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.item.photoAt, null);
  assert.equal(fs.existsSync(h.file), false);
  assert.equal((await download(h.guillaume, h.itemId)).status, 404);
});

test('plafond : 60 envois par compte et par heure', async (t) => {
  const h = await household(t);
  h.guillaume.base = h.app.base;
  h.marie.base = h.app.base;
  const small = jpeg({ width: 8, height: 8, metadata: [] });
  for (let i = 0; i < 60; i++) assert.equal((await upload(h.guillaume, h.itemId, small)).status, 200, `envoi ${i + 1}`);
  assert.equal((await upload(h.guillaume, h.itemId, small)).status, 429);
  // Les envois refusés comptent aussi (le plafond protège le serveur)
  assert.equal((await upload(h.guillaume, h.itemId, PNG)).status, 429);
  // Marie a son propre compteur
  assert.equal((await upload(h.marie, h.itemId, small)).status, 200);
  assert.ok(h.app.logs.some((line) => line.includes('photo_plafond_atteint')));
  // Une heure plus tard, c'est reparti
  h.app.clock.now += 60 * 60 * 1000;
  assert.equal((await upload(h.guillaume, h.itemId, small)).status, 200);
});

test('article supprimé : photo invisible, « Annuler » la retrouve ; la purge efface le fichier', async (t) => {
  const h = await household(t);
  for (const c of [h.guillaume, h.marie, h.paul]) c.base = h.app.base;
  await upload(h.guillaume, h.itemId, jpeg());

  assert.equal((await run(h.marie, { type: 'item.delete', itemId: h.itemId })).status, 200);
  assert.equal((await download(h.guillaume, h.itemId)).status, 404, 'article supprimé : photo invisible');
  assert.equal((await upload(h.guillaume, h.itemId, jpeg())).status, 404, 'la suppression l\'emporte sur un envoi');
  assert.equal(fs.existsSync(h.file), true, 'fichier gardé jusqu\'au nettoyage');

  // Paul (non membre) ne peut pas restaurer ; Marie (membre) oui
  assert.equal((await run(h.paul, { type: 'item.restore', itemId: h.itemId })).status, 404);
  const restored = await run(h.marie, { type: 'item.restore', itemId: h.itemId });
  assert.equal(restored.status, 200);
  assert.equal(restored.item.deletedAt, null);
  assert.ok(restored.item.photoAt);
  assert.equal((await download(h.guillaume, h.itemId)).status, 200, 'la photo revient');
  // Restaurer un article qui n'est pas supprimé : 404
  assert.equal((await run(h.marie, { type: 'item.restore', itemId: h.itemId })).status, 404);

  // Supprimé de nouveau, puis 31 jours plus tard : le nettoyage efface le fichier
  await run(h.marie, { type: 'item.delete', itemId: h.itemId });
  h.app.clock.now += 31 * DAY;
  const purged = h.app.ctx.lists.purgeDeleted();
  assert.equal(purged.items, 1);
  assert.equal(fs.existsSync(h.file), false);
  await login(h.marie, 'marie', 'MotDePasse-marie'); // sa session (30 jours) a expiré
  assert.equal((await run(h.marie, { type: 'item.restore', itemId: h.itemId })).status, 404, 'trop tard après la purge');
});

test('purge : les photos des articles d\'une liste supprimée et les fichiers orphelins sont effacés', async (t) => {
  const h = await household(t);
  h.guillaume.base = h.app.base;
  await upload(h.guillaume, h.itemId, jpeg());
  // Un fichier dont l'article n'existe pas (coupure pendant un envoi…)
  const orphan = path.join(h.app.photosDir, `${uuid()}.jpg`);
  fs.writeFileSync(orphan, jpeg());
  // Un autre article, vivant, avec sa photo : il reste
  const otherList = uuid();
  const otherItem = uuid();
  const courses = h.app.db.prepare("SELECT id FROM categories WHERE name = 'Courses'").pluck().get();
  await run(h.guillaume, { type: 'list.create', listId: otherList, name: 'Autre', categoryId: courses });
  await run(h.guillaume, { type: 'item.create', listId: otherList, itemId: otherItem, name: 'Lait' });
  await upload(h.guillaume, otherItem, jpeg());

  await run(h.guillaume, { type: 'list.delete', listId: h.listId });
  h.app.ctx.lists.purgeDeleted();
  assert.equal(fs.existsSync(h.file), true, 'liste supprimée depuis moins de 30 jours : rien n\'est effacé');
  assert.equal(fs.existsSync(orphan), false, 'fichier orphelin effacé');

  h.app.clock.now += 31 * DAY;
  h.app.ctx.lists.purgeDeleted();
  assert.equal(fs.existsSync(h.file), false, 'photo de l\'article de la liste effacée');
  assert.equal(fs.existsSync(path.join(h.app.photosDir, `${otherItem}.jpg`)), true);
});

test('synchronisation : photoAt fait partie de l\'article ; une liste de tâches peut aussi avoir des photos', async (t) => {
  const h = await household(t);
  h.marie.base = h.app.base;
  const res = await upload(h.marie, h.itemId, jpeg());
  const sync = (await h.guillaume.get('/api/sync')).body;
  assert.equal(sync.items.find((i) => i.id === h.itemId).photoAt, res.body.item.photoAt);

  const taches = h.app.db.prepare("SELECT id FROM categories WHERE name = 'Tâches'").pluck().get();
  const tasks = uuid();
  const task = uuid();
  await run(h.marie, { type: 'list.create', listId: tasks, name: 'Bricolage', categoryId: taches });
  await run(h.marie, { type: 'item.create', listId: tasks, itemId: task, name: 'Vis de 4 mm' });
  assert.equal((await upload(h.marie, task, jpeg())).status, 200);
  // Le même nom ajouté plus tard n'a pas de photo (elle appartient à l'article)
  const again = await run(h.marie, { type: 'item.create', listId: tasks, itemId: uuid(), name: 'Vis de 4 mm' });
  assert.equal(again.item.photoAt, null);
});

test("migration : une base de l'étape 6 reçoit photo_at sans rien perdre", (t) => {
  const file = path.join(tempDir(t), 'listo.db');
  const old = new Database(file);
  old.pragma('foreign_keys = ON');
  for (let i = 0; i < 5; i++) {
    const migration = MIGRATIONS[i];
    if (typeof migration === 'function') migration(old);
    else old.exec(migration);
  }
  old.pragma('user_version = 5');
  old.prepare("INSERT INTO users (id, username, display_name, password_hash) VALUES (1, 'guillaume', 'Guillaume', 'x')").run();
  const courses = old.prepare("SELECT id FROM categories WHERE name = 'Courses'").pluck().get();
  old.prepare("INSERT INTO stores (id, name, is_multi) VALUES (50, 'Centre-ville', 1), (51, 'Fromagerie', 0)").run();
  old.prepare('INSERT INTO store_members (multi_store_id, store_id) VALUES (50, 51)').run();
  old.prepare("INSERT INTO lists (id, name, category_id, store_id, owner_id) VALUES ('l1', 'Centre', ?, 50, 1)").run(courses);
  old.prepare("INSERT INTO items (id, list_id, name, store_id, checked, created_by) VALUES ('i1', 'l1', 'Comté', 51, 1, 1)").run();
  old.prepare("INSERT INTO item_history (name_normalized, store_id, display_name, use_count) VALUES ('comte', 51, 'Comté', 3)").run();
  old.close();

  const db = openDatabase(file);
  assert.equal(schemaVersion(db), MIGRATIONS.length);
  assert.deepEqual(db.prepare('SELECT name, store_id, checked, photo_at FROM items').get(), { name: 'Comté', store_id: 51, checked: 1, photo_at: null });
  assert.deepEqual(db.prepare('SELECT multi_store_id, store_id FROM store_members').get(), { multi_store_id: 50, store_id: 51 });
  assert.equal(db.prepare("SELECT use_count FROM item_history WHERE name_normalized = 'comte'").pluck().get(), 3);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  db.close();
});
