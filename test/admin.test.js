// Tests de l'administration (étape 3) : comptes, catégories, magasins, rayons.
// Les listes et articles n'ont pas encore de routes (étape 4) : les tests qui
// en ont besoin les créent directement dans la base.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';

const PASSWORD = 'MotDePasseMarie!';
const ADMIN_PASSWORD = 'MotDePasseAdmin!';

// Prépare : Admin « guillaume » connecté + Utilisateur « marie »
async function withAdmin(t) {
  const app = await startTestApp(t);
  const admin = await setupAdmin(app, { password: ADMIN_PASSWORD });
  const adminId = app.db.prepare("SELECT id FROM users WHERE username = 'guillaume'").pluck().get();
  const marieId = await addUser(app.db, { username: 'marie', password: PASSWORD });
  return { app, admin, adminId, marieId };
}

// Crée directement en base une liste (et son propriétaire comme membre)
function addList(db, ownerId, { name = 'Courses de la semaine', category = 'Courses', storeId = null } = {}) {
  const id = crypto.randomUUID();
  const { id: categoryId, is_shopping: shopping } = db.prepare('SELECT id, is_shopping FROM categories WHERE name = ?').get(category);
  db.prepare('INSERT INTO lists (id, name, type, category_id, store_id, owner_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, shopping ? 'shopping' : 'tasks', categoryId, storeId, ownerId);
  db.prepare('INSERT INTO list_members (list_id, user_id) VALUES (?, ?)').run(id, ownerId);
  return id;
}

// Crée directement en base un article dans une liste
function addItem(db, listId, userId, { name = 'Lait', aisleId = null } = {}) {
  db.prepare('INSERT INTO items (id, list_id, name, aisle_id, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(crypto.randomUUID(), listId, name, aisleId, userId);
}

const idOf = (db, table, name) => db.prepare(`SELECT id FROM ${table} WHERE name = ?`).pluck().get(name);

// Toutes les routes d'administration, avec un exemple de corps de requête
function allAdminRoutes(targetId) {
  const routes = [
    ['GET', '/api/admin/users'],
    ['POST', '/api/admin/users', { username: 'pirate', password: 'MotDePassePirate', role: 'admin' }],
    ['PATCH', `/api/admin/users/${targetId}`, { role: 'admin' }],
    ['POST', `/api/admin/users/${targetId}/password`, { password: 'MotDePassePirate' }],
    ['DELETE', `/api/admin/users/${targetId}/2fa`],
    ['DELETE', `/api/admin/users/${targetId}`],
  ];
  for (const type of ['stores', 'aisles']) {
    routes.push(
      ['GET', `/api/admin/${type}`],
      ['POST', `/api/admin/${type}`, { name: 'Pirate' }],
      ['PATCH', `/api/admin/${type}/1`, { name: 'Pirate', active: false }],
      ['DELETE', `/api/admin/${type}/1`],
    );
  }
  return routes;
}

// État des tables d'administration, pour vérifier que rien n'a changé
const snapshot = (db) => ['users', 'categories', 'stores', 'aisles']
  .map((table) => JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())).join('\n');

// --- Droits d'accès ---

test("un Utilisateur reçoit un refus sur toutes les routes d'administration", async (t) => {
  const { app, marieId } = await withAdmin(t);
  const marie = app.client();
  await login(marie, 'marie', PASSWORD);
  const before = snapshot(app.db);
  for (const [method, url, body] of allAdminRoutes(marieId)) {
    const res = await marie.request(method, url, method === 'GET' ? undefined : body ?? {});
    assert.equal(res.status, 403, `${method} ${url}`);
  }
  assert.equal(snapshot(app.db), before, 'rien ne doit avoir changé');
});

test("un visiteur non connecté reçoit un refus sur toutes les routes d'administration", async (t) => {
  const { app, marieId } = await withAdmin(t);
  const visitor = app.client();
  const before = snapshot(app.db);
  for (const [method, url, body] of allAdminRoutes(marieId)) {
    const res = await visitor.request(method, url, method === 'GET' ? undefined : body ?? {});
    assert.equal(res.status, 401, `${method} ${url}`);
  }
  assert.equal(snapshot(app.db), before);
});

test("un Admin rétrogradé perd l'accès à l'administration aussitôt", async (t) => {
  const { app, admin } = await withAdmin(t);
  const created = await admin.post('/api/admin/users', { username: 'second', password: 'MotDePasseSecond', role: 'admin' });
  const second = app.client();
  await login(second, 'second', 'MotDePasseSecond');
  await second.post('/api/me/password', { currentPassword: 'MotDePasseSecond', newPassword: 'NouveauSecond!!' });
  assert.equal((await second.get('/api/admin/users')).status, 200);

  await admin.request('PATCH', `/api/admin/users/${created.body.user.id}`, { role: 'user' });
  assert.equal((await second.get('/api/admin/users')).status, 403);
});

test("l'administration ne donne jamais accès au contenu des listes", async (t) => {
  const { app, admin, marieId } = await withAdmin(t);
  const listId = addList(app.db, marieId, { name: 'Liste secrète de Marie', storeId: idOf(app.db, 'stores', 'Lidl') });
  addItem(app.db, listId, marieId, { name: 'Cadeau surprise', aisleId: idOf(app.db, 'aisles', 'Boissons') });

  for (const url of ['/api/admin/users', '/api/admin/stores', '/api/admin/aisles']) {
    const res = await admin.get(url);
    assert.equal(res.status, 200);
    assert.ok(!res.text.includes('Liste secrète'), `${url} montre le nom d'une liste`);
    assert.ok(!res.text.includes('Cadeau surprise'), `${url} montre un article`);
    assert.ok(!res.text.includes(listId), `${url} montre l'identifiant d'une liste`);
  }
  // On sait seulement qu'un élément est utilisé (pour savoir s'il est supprimable)
  const stores = (await admin.get('/api/admin/stores')).body.items;
  assert.equal(stores.find((s) => s.name === 'Lidl').inUse, true);
});

// --- Comptes ---

test('créer un compte : validations, mot de passe à changer à la première connexion', async (t) => {
  const { app, admin } = await withAdmin(t);
  const bad = [
    [{ username: 'a', password: 'MotDePasseBob!' }, /Identifiant invalide/],
    [{ username: 'bob martin', password: 'MotDePasseBob!' }, /Identifiant invalide/],
    [{ username: 'bob', password: 'court' }, /10 caractères/],
    [{ username: 'bob', password: 'MotDePasseBob!', role: 'chef' }, /Rôle invalide/],
    [{ username: 'bob', password: 'MotDePasseBob!', displayName: 'x'.repeat(101) }, /Nom affiché/],
  ];
  for (const [body, message] of bad) {
    const res = await admin.post('/api/admin/users', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.body.error, message);
  }

  const res = await admin.post('/api/admin/users', { username: 'bob', displayName: '  Bob   Martin ', password: 'MotDePasseBob!' });
  assert.equal(res.status, 201);
  assert.deepEqual(
    { ...res.body.user, id: 0, createdAt: '' },
    { id: 0, username: 'bob', displayName: 'Bob Martin', role: 'user', active: true, totpEnabled: false,
      mustChangePassword: true, createdAt: '', inUse: false },
  );
  assert.ok(!res.text.includes('scrypt'), "l'empreinte du mot de passe n'est jamais renvoyée");

  // À la première connexion, Bob doit changer son mot de passe
  const bob = app.client();
  const first = await login(bob, 'bob', 'MotDePasseBob!');
  assert.equal(first.body.user.mustChangePassword, true);
});

test("tant que le mot de passe donné par l'Admin n'est pas changé, tout le reste est refusé", async (t) => {
  const { app, admin } = await withAdmin(t);
  await admin.post('/api/admin/users', { username: 'bob', password: 'MotDePasseBob!', role: 'admin' });
  const bob = app.client();
  await login(bob, 'bob', 'MotDePasseBob!');

  assert.equal((await bob.get('/api/me')).status, 200);
  for (const [method, url] of [['POST', '/api/me/2fa/enable'], ['GET', '/api/admin/users']]) {
    const res = await bob.request(method, url, method === 'GET' ? undefined : {});
    assert.equal(res.status, 403, url);
    assert.equal(res.body.mustChangePassword, true);
  }
  // Garder le même mot de passe : refusé
  const same = await bob.post('/api/me/password', { currentPassword: 'MotDePasseBob!', newPassword: 'MotDePasseBob!' });
  assert.equal(same.status, 400);

  const changed = await bob.post('/api/me/password', { currentPassword: 'MotDePasseBob!', newPassword: 'MonPropreMotDePasse' });
  assert.equal(changed.status, 200);
  assert.equal((await bob.get('/api/me')).body.user.mustChangePassword, false);
  assert.equal((await bob.get('/api/admin/users')).status, 200);
  // La déconnexion reste toujours possible
  assert.equal((await bob.post('/api/logout')).status, 204);
});

test('modifier le nom affiché et le rôle', async (t) => {
  const { app, admin, marieId } = await withAdmin(t);
  const res = await admin.request('PATCH', `/api/admin/users/${marieId}`, { displayName: 'Marie D.', role: 'admin' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.displayName, 'Marie D.');
  assert.equal(res.body.user.role, 'admin');

  assert.equal((await admin.request('PATCH', `/api/admin/users/${marieId}`, {})).status, 400);
  assert.equal((await admin.request('PATCH', `/api/admin/users/${marieId}`, { role: 'chef' })).status, 400);
  assert.equal((await admin.request('PATCH', `/api/admin/users/${marieId}`, { active: 'non' })).status, 400);
  assert.equal((await admin.request('PATCH', `/api/admin/users/${marieId}`, { displayName: '   ' })).status, 400);
  assert.equal((await admin.request('PATCH', '/api/admin/users/999', { displayName: 'X' })).status, 404);
  assert.equal((await admin.request('PATCH', '/api/admin/users/abc', { displayName: 'X' })).status, 404);
  // Un Admin peut changer son propre nom affiché
  const self = app.db.prepare("SELECT id FROM users WHERE username = 'guillaume'").pluck().get();
  assert.equal((await admin.request('PATCH', `/api/admin/users/${self}`, { displayName: 'Guillaume B.' })).status, 200);
});

test('le dernier Admin actif ne peut être ni désactivé, ni rétrogradé, ni supprimé', async (t) => {
  const { app, admin, adminId } = await withAdmin(t);
  const url = `/api/admin/users/${adminId}`;
  assert.equal((await admin.request('PATCH', url, { active: false })).status, 400);
  assert.equal((await admin.request('PATCH', url, { role: 'user' })).status, 400);
  assert.equal((await admin.del(url)).status, 400);
  const row = app.db.prepare('SELECT role, active FROM users WHERE id = ?').get(adminId);
  assert.deepEqual(row, { role: 'admin', active: 1 });
  assert.equal((await admin.get('/api/admin/users')).status, 200, "l'Admin garde son accès");
});

test("avec deux Admin, l'un peut désactiver l'autre, mais pas se désactiver lui-même", async (t) => {
  const { app, admin, adminId } = await withAdmin(t);
  const second = (await admin.post('/api/admin/users', { username: 'second', password: 'MotDePasseSecond', role: 'admin' })).body.user;
  assert.equal((await admin.request('PATCH', `/api/admin/users/${adminId}`, { active: false })).status, 400);
  assert.equal((await admin.request('PATCH', `/api/admin/users/${second.id}`, { active: false })).status, 200);
  assert.equal(app.db.prepare("SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1").pluck().get(), 1);
});

test('un compte désactivé perd ses sessions tout de suite et ne peut plus se connecter', async (t) => {
  const { app, admin, marieId } = await withAdmin(t);
  const phone = app.client();
  const computer = app.client();
  await login(phone, 'marie', PASSWORD);
  await login(computer, 'marie', PASSWORD);

  const res = await admin.request('PATCH', `/api/admin/users/${marieId}`, { active: false });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.active, false);
  assert.equal(app.db.prepare('SELECT COUNT(*) FROM sessions WHERE user_id = ?').pluck().get(marieId), 0);
  assert.equal((await phone.get('/api/me')).status, 401);
  assert.equal((await computer.get('/api/me')).status, 401);

  // Même réponse que pour un mauvais mot de passe
  const disabled = await login(app.client({ ip: '10.1.0.1' }), 'marie', PASSWORD);
  const wrong = await login(app.client({ ip: '10.1.0.2' }), 'guillaume', 'MauvaisMotDePasse');
  assert.equal(disabled.status, 401);
  assert.deepEqual([disabled.status, disabled.text], [wrong.status, wrong.text]);

  // Réactivé : Marie peut de nouveau se connecter
  assert.equal((await admin.request('PATCH', `/api/admin/users/${marieId}`, { active: true })).status, 200);
  assert.equal((await login(app.client({ ip: '10.1.0.3' }), 'marie', PASSWORD)).status, 200);
});

test("réinitialiser un mot de passe : l'ancien est refusé, les anciennes sessions sont fermées", async (t) => {
  const { app, admin, adminId, marieId } = await withAdmin(t);
  const marie = app.client();
  await login(marie, 'marie', PASSWORD);

  assert.equal((await admin.post(`/api/admin/users/${marieId}/password`, { password: 'court' })).status, 400);
  const res = await admin.post(`/api/admin/users/${marieId}/password`, { password: 'MotDePasseTemporaire' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.mustChangePassword, true);

  assert.equal((await marie.get('/api/me')).status, 401, 'ancienne session fermée');
  assert.equal((await login(app.client(), 'marie', PASSWORD)).status, 401, 'ancien mot de passe refusé');
  const fresh = app.client();
  const ok = await login(fresh, 'marie', 'MotDePasseTemporaire');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.mustChangePassword, true);

  // Un Admin ne réinitialise pas son propre mot de passe par ici
  assert.equal((await admin.post(`/api/admin/users/${adminId}/password`, { password: 'MotDePasseTemporaire' })).status, 400);
  assert.equal((await admin.post('/api/admin/users/999/password', { password: 'MotDePasseTemporaire' })).status, 404);
});

test('les identifiants en double (majuscules différentes) sont refusés', async (t) => {
  const { admin } = await withAdmin(t);
  for (const username of ['marie', 'Marie', 'MARIE', 'Guillaume']) {
    const res = await admin.post('/api/admin/users', { username, password: 'MotDePasseDouble' });
    assert.equal(res.status, 409, username);
    assert.match(res.body.error, /existe déjà/);
  }
});

test("supprimer un compte : seulement s'il n'a jamais servi", async (t) => {
  const { app, admin, marieId } = await withAdmin(t);
  const unused = (await admin.post('/api/admin/users', { username: 'erreur', password: 'MotDePasseErreur' })).body.user;
  const unusedClient = app.client();
  await login(unusedClient, 'erreur', 'MotDePasseErreur');

  addList(app.db, marieId);
  assert.equal((await admin.get('/api/admin/users')).body.users.find((u) => u.id === marieId).inUse, true);
  const refused = await admin.del(`/api/admin/users/${marieId}`);
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /désactivé, pas supprimé/);

  assert.equal((await admin.del(`/api/admin/users/${unused.id}`)).status, 204);
  assert.equal(app.db.prepare('SELECT COUNT(*) FROM users WHERE id = ?').pluck().get(unused.id), 0);
  assert.equal((await unusedClient.get('/api/me')).status, 401, 'ses sessions disparaissent avec lui');
  assert.equal((await admin.del(`/api/admin/users/${unused.id}`)).status, 404);

  // Un compte simplement invité sur une liste a lui aussi déjà servi
  const guest = await addUser(app.db, { username: 'invite', password: 'MotDePasseInvite' });
  const listId = app.db.prepare('SELECT id FROM lists').pluck().get();
  app.db.prepare('INSERT INTO list_members (list_id, user_id) VALUES (?, ?)').run(listId, guest);
  assert.equal((await admin.del(`/api/admin/users/${guest}`)).status, 409);
});

test("désactiver la 2FA d'un autre compte (route de l'étape 2, intégrée)", async (t) => {
  const { app, admin, adminId, marieId } = await withAdmin(t);
  app.db.prepare("UPDATE users SET totp_enabled = 1, totp_secret = 'v1:x:y:z' WHERE id = ?").run(marieId);
  app.db.prepare("INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, 'h')").run(marieId);
  const res = await admin.del(`/api/admin/users/${marieId}/2fa`);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.totpEnabled, false);
  assert.equal(app.db.prepare('SELECT COUNT(*) FROM recovery_codes').pluck().get(), 0);
  assert.equal((await admin.del(`/api/admin/users/${adminId}/2fa`)).status, 400);
  assert.equal((await admin.del('/api/admin/users/999/2fa')).status, 404);
});

// --- Magasins, rayons (les catégories n'existent plus) ---

test('les données de départ sont disponibles pour l\'Admin', async (t) => {
  const { admin } = await withAdmin(t);
  const names = async (type) => (await admin.get(`/api/admin/${type}`)).body.items.map((i) => i.name);
  assert.deepEqual(await names('stores'), ['Carrefour', 'E.Leclerc', 'Lidl']);
  assert.deepEqual(await names('aisles'), [
    'Boissons', 'Boucherie', 'Boulangerie', 'Crèmerie', 'Entretien', 'Épicerie salée', 'Épicerie sucrée',
    'Fromages', 'Fruits et légumes', 'Hygiène', 'Poissonnerie', 'Surgelés',
  ]);
});

test('ajouter, renommer, désactiver et réactiver (magasins, rayons)', async (t) => {
  const { admin } = await withAdmin(t);
  for (const type of ['stores', 'aisles']) {
    const created = await admin.post(`/api/admin/${type}`, { name: '  Nouvel   élément ' });
    assert.equal(created.status, 201, type);
    assert.equal(created.body.item.name, 'Nouvel élément');
    const url = `/api/admin/${type}/${created.body.item.id}`;

    assert.equal((await admin.request('PATCH', url, { name: 'Élément renommé' })).body.item.name, 'Élément renommé');
    assert.equal((await admin.request('PATCH', url, { active: false })).body.item.active, false);
    assert.equal((await admin.request('PATCH', url, { active: true })).body.item.active, true);
    // Changer seulement les majuscules de son propre nom est permis
    assert.equal((await admin.request('PATCH', url, { name: 'élément Renommé' })).status, 200);

    assert.equal((await admin.post(`/api/admin/${type}`, { name: '' })).status, 400);
    assert.equal((await admin.post(`/api/admin/${type}`, { name: 'x'.repeat(101) })).status, 400);
    assert.equal((await admin.post(`/api/admin/${type}`, { name: 42 })).status, 400);
    assert.equal((await admin.request('PATCH', url, {})).status, 400);
    assert.equal((await admin.request('PATCH', url, { active: 'oui' })).status, 400);
    assert.equal((await admin.request('PATCH', `/api/admin/${type}/999`, { name: 'X' })).status, 404);
  }
});

test('les noms en double (majuscules ou accents différents) sont refusés', async (t) => {
  const { admin } = await withAdmin(t);
  const cases = [
    ['stores', ['lidl', 'LIDL', 'e.leclerc']],
    ['aisles', ['épicerie salée', 'ÉPICERIE SALÉE', 'Epicerie salee', 'cremerie', 'surgeles']],
  ];
  for (const [type, names] of cases) {
    for (const name of names) {
      const res = await admin.post(`/api/admin/${type}`, { name });
      assert.equal(res.status, 409, `${type} : ${name}`);
    }
  }
  // Renommer vers un nom déjà pris : refusé aussi
  const lidl = (await admin.get('/api/admin/stores')).body.items.find((s) => s.name === 'Lidl');
  assert.equal((await admin.request('PATCH', `/api/admin/stores/${lidl.id}`, { name: 'CARREFOUR' })).status, 409);
});

test('un élément déjà utilisé peut être désactivé mais pas supprimé ; un élément inutilisé peut l\'être', async (t) => {
  const { app, admin, marieId } = await withAdmin(t);
  const lidl = idOf(app.db, 'stores', 'Lidl');
  const boissons = idOf(app.db, 'aisles', 'Boissons');
  const fromages = idOf(app.db, 'aisles', 'Fromages');
  const listId = addList(app.db, marieId, { category: 'Courses', storeId: lidl });
  addItem(app.db, listId, marieId, { aisleId: boissons });
  // Un rayon retenu seulement par l'historique d'autocomplétion compte aussi
  app.db.prepare("INSERT INTO item_history (name_normalized, display_name, aisle_id) VALUES ('comte', 'Comté', ?)").run(fromages);

  const used = [
    ['stores', lidl],
    ['aisles', boissons],
    ['aisles', fromages],
  ];
  for (const [type, id] of used) {
    const del = await admin.del(`/api/admin/${type}/${id}`);
    assert.equal(del.status, 409, `${type} ${id}`);
    assert.match(del.body.error, /désactivé, pas supprimé/);
    const off = await admin.request('PATCH', `/api/admin/${type}/${id}`, { active: false });
    assert.equal(off.status, 200);
    assert.deepEqual([off.body.item.active, off.body.item.inUse], [false, true]);
  }
  // La liste garde son magasin désactivé
  assert.equal(app.db.prepare('SELECT store_id FROM lists WHERE id = ?').pluck().get(listId), lidl);

  const unused = [
    ['stores', idOf(app.db, 'stores', 'Carrefour')],
    ['aisles', idOf(app.db, 'aisles', 'Surgelés')],
  ];
  for (const [type, id] of unused) {
    assert.equal((await admin.del(`/api/admin/${type}/${id}`)).status, 204, `${type} ${id}`);
    assert.equal((await admin.del(`/api/admin/${type}/${id}`)).status, 404);
  }
  assert.equal(idOf(app.db, 'stores', 'Carrefour'), undefined);
});

test('catégories retirées : leurs routes d\'administration n\'existent plus (404), rien n\'est écrit', async (t) => {
  const { app, admin } = await withAdmin(t);
  const before = app.db.prepare('SELECT * FROM categories ORDER BY id').all();
  for (const [method, url, body] of [
    ['GET', '/api/admin/categories'],
    ['POST', '/api/admin/categories', { name: 'Bricolage', isShopping: true }],
    ['PATCH', '/api/admin/categories/1', { name: 'Alimentation', isShopping: false }],
    ['DELETE', '/api/admin/categories/2'],
  ]) {
    const res = await admin.request(method, url, body);
    assert.equal(res.status, 404, `${method} ${url}`);
    assert.equal(res.body.error, 'Route inconnue.');
  }
  assert.deepEqual(app.db.prepare('SELECT * FROM categories ORDER BY id').all(), before, 'table gardée telle quelle');
});

// --- Journal ---

test("le journal contient les actions d'administration et aucun secret", async (t) => {
  const { app, admin, marieId } = await withAdmin(t);
  const secrets = [ADMIN_PASSWORD, PASSWORD, 'MotDePasseBob!', 'MotDePasseTemporaire', admin.jar.get('listo_session')];

  const bob = (await admin.post('/api/admin/users', { username: 'bob', password: 'MotDePasseBob!' })).body.user;
  await admin.request('PATCH', `/api/admin/users/${bob.id}`, { displayName: 'Bob M.', role: 'admin' });
  await admin.request('PATCH', `/api/admin/users/${bob.id}`, { active: false });
  await admin.request('PATCH', `/api/admin/users/${bob.id}`, { active: true });
  await admin.post(`/api/admin/users/${marieId}/password`, { password: 'MotDePasseTemporaire' });
  await admin.del(`/api/admin/users/${marieId}/2fa`);
  await admin.del(`/api/admin/users/${bob.id}`);
  const store = (await admin.post('/api/admin/stores', { name: 'Biocoop' })).body.item;
  await admin.request('PATCH', `/api/admin/stores/${store.id}`, { name: 'Biocoop Centre' });
  await admin.request('PATCH', `/api/admin/stores/${store.id}`, { active: false });
  await admin.del(`/api/admin/stores/${store.id}`);
  const aisle = (await admin.post('/api/admin/aisles', { name: 'Jardin' })).body.item;
  await admin.request('PATCH', `/api/admin/aisles/${aisle.id}`, { active: false });
  await admin.request('PATCH', `/api/admin/aisles/${aisle.id}`, { active: true });

  const journal = app.logs.join('\n');
  const expected = [
    'admin_compte_cree admin="guillaume" utilisateur="bob" role="user"',
    'admin_compte_renomme admin="guillaume" utilisateur="bob"',
    'admin_role_change admin="guillaume" utilisateur="bob" ip="127.0.0.1" role="admin"',
    'admin_compte_desactive admin="guillaume" utilisateur="bob"',
    'admin_compte_reactive admin="guillaume" utilisateur="bob"',
    'admin_mot_de_passe_reinitialise admin="guillaume" utilisateur="marie"',
    'admin_2fa_desactivee admin="guillaume" utilisateur="marie"',
    'admin_compte_supprime admin="guillaume" utilisateur="bob"',
    'admin_magasin_ajoute admin="guillaume" nom="Biocoop"',
    'admin_magasin_renomme admin="guillaume" nom="Biocoop Centre"',
    'admin_magasin_desactive admin="guillaume" nom="Biocoop Centre"',
    'admin_magasin_supprime admin="guillaume" nom="Biocoop Centre"',
    'admin_rayon_ajoute admin="guillaume" nom="Jardin"',
    'admin_rayon_desactive admin="guillaume" nom="Jardin"',
    'admin_rayon_reactive admin="guillaume" nom="Jardin"',
  ];
  for (const line of expected) assert.ok(journal.includes(line), `absent du journal : ${line}`);
  for (const secret of secrets) assert.ok(secret && !journal.includes(secret), `secret dans le journal : ${secret}`);
});
