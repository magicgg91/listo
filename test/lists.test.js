// Tests des listes et des articles (étape 4) : droits d'accès, opérations,
// historique, tri, autocomplétion, synchronisation, nettoyage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';

const DAY = 24 * 60 * 60 * 1000;
const uuid = () => crypto.randomUUID();

// Prépare : Admin « guillaume » + Utilisateurs « marie » et « paul », tous connectés
async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const ids = { guillaume: app.db.prepare("SELECT id FROM users WHERE username = 'guillaume'").pluck().get() };
  const clients = { guillaume };
  for (const name of ['marie', 'paul']) {
    ids[name] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    clients[name] = app.client();
    await login(clients[name], name, `MotDePasse-${name}`);
  }
  const ref = (table, name) => app.db.prepare(`SELECT id FROM ${table} WHERE name = ?`).pluck().get(name);
  return { app, ...clients, ids, ref, COURSES: ref('categories', 'Courses'), TACHES: ref('categories', 'Tâches') };
}

// Envoie un lot d'opérations (un identifiant unique est ajouté à chacune)
async function run(client, ...ops) {
  const res = await client.post('/api/ops', { ops: ops.map((op) => ({ id: uuid(), ...op })) });
  assert.equal(res.status, 200, res.text);
  return res.body.results;
}

// Une seule opération, qui doit réussir ; renvoie son résultat
async function ok(client, op) {
  const [result] = await run(client, op);
  assert.equal(result.status, 200, `${op.type} : ${result.error}`);
  return result;
}

async function createList(h, client, fields = {}) {
  const listId = uuid();
  await ok(client, { type: 'list.create', listId, name: 'Courses de la semaine', categoryId: h.COURSES, ...fields });
  return listId;
}

async function addItem(client, listId, fields = {}) {
  const itemId = uuid();
  const result = await ok(client, { type: 'item.create', listId, itemId, name: 'Lait', ...fields });
  return { itemId, item: result.item };
}

// Partage avec le droit « Peut modifier » (sans droit précisé, un invité
// est en lecture seule : voir read-only.test.js)
const share = (client, listId, userIds) => client.request('PUT', `/api/lists/${listId}/members`, { userIds, ...(Array.isArray(userIds) ? { access: Object.fromEntries(userIds.filter(Number.isInteger).map((id) => [id, 'modification'])) } : {}) });
const listNames = async (client) => (await client.get('/api/lists')).body.lists.map((l) => l.name).sort();

// --- Droits d'accès ---

test('un invité voit uniquement les listes partagées avec lui', async (t) => {
  const h = await household(t);
  const shared = await createList(h, h.guillaume, { name: 'Partagée avec Marie' });
  await createList(h, h.guillaume, { name: 'Privée de Guillaume' });
  await createList(h, h.marie, { name: 'Liste de Marie' });
  assert.equal((await share(h.guillaume, shared, [h.ids.marie])).status, 200);

  assert.deepEqual(await listNames(h.marie), ['Liste de Marie', 'Partagée avec Marie']);
  assert.deepEqual(await listNames(h.paul), []);
  assert.deepEqual(await listNames(h.guillaume), ['Partagée avec Marie', 'Privée de Guillaume']);
  const sharedForMarie = (await h.marie.get('/api/lists')).body.lists.find((l) => l.id === shared);
  assert.equal(sharedForMarie.isOwner, false);
  assert.deepEqual(sharedForMarie.members.map((m) => m.username).sort(), ['guillaume', 'marie']);
});

test('un non-membre reçoit 404 sur la liste et sur tous ses articles, en lecture comme en modification', async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.guillaume);
  const { itemId } = await addItem(h.guillaume, listId, { checked: false });
  const before = JSON.stringify(h.app.db.prepare('SELECT * FROM items').all()) + JSON.stringify(h.app.db.prepare('SELECT * FROM lists').all());

  // Lecture : même réponse que pour une liste qui n'existe pas
  const read = await h.paul.get(`/api/lists/${listId}`);
  const missing = await h.paul.get(`/api/lists/${uuid()}`);
  assert.equal(read.status, 404);
  assert.deepEqual([read.status, read.text], [missing.status, missing.text]);
  assert.equal((await share(h.paul, listId, [h.ids.paul])).status, 404);

  // Modification : chaque opération répond 404, comme pour une liste inconnue
  const results = await run(h.paul,
    { type: 'list.update', listId, name: 'Piratée' },
    { type: 'list.delete', listId },
    { type: 'list.removeChecked', listId },
    { type: 'list.uncheckAll', listId },
    { type: 'item.create', listId, itemId: uuid(), name: 'Intrus' },
    { type: 'item.update', itemId, name: 'Modifié' },
    { type: 'item.check', itemId, checked: true },
    { type: 'item.delete', itemId });
  for (const result of results) assert.equal(result.status, 404, result.error);
  const [unknownList] = await run(h.paul, { type: 'list.update', listId: uuid(), name: 'X' });
  const [unknownItem] = await run(h.paul, { type: 'item.check', itemId: uuid(), checked: true });
  assert.equal(results[0].error, unknownList.error);
  assert.equal(results[5].error, unknownItem.error);

  const after = JSON.stringify(h.app.db.prepare('SELECT * FROM items').all()) + JSON.stringify(h.app.db.prepare('SELECT * FROM lists').all());
  assert.equal(after, before, 'rien ne doit avoir changé');
  // Et rien dans la synchronisation
  const sync = (await h.paul.get('/api/sync')).body;
  assert.deepEqual([sync.lists, sync.items, sync.listIds], [[], [], []]);
});

test("un Admin ne voit pas les listes des autres et n'y a aucun droit", async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.marie, { name: 'Secret de Marie' });
  const { itemId } = await addItem(h.marie, listId, { name: 'Cadeau pour Guillaume' });

  assert.deepEqual(await listNames(h.guillaume), []);
  assert.equal((await h.guillaume.get(`/api/lists/${listId}`)).status, 404);
  const results = await run(h.guillaume, { type: 'list.delete', listId }, { type: 'item.check', itemId, checked: true });
  assert.deepEqual(results.map((r) => r.status), [404, 404]);
  assert.equal((await share(h.guillaume, listId, [h.ids.guillaume])).status, 404);
  const sync = (await h.guillaume.get('/api/sync')).body;
  assert.deepEqual([sync.lists, sync.items, sync.listIds], [[], [], []]);
  assert.ok(!JSON.stringify(sync).includes('Secret de Marie'));
  // Seul l'historique d'autocomplétion est commun à tous (cahier des charges) :
  // il contient les noms d'articles, jamais la liste où ils ont été ajoutés
  assert.ok(sync.history.every((entry) => !('listId' in entry)));
});

test('un invité ne peut ni renommer, ni changer le partage, ni supprimer la liste', async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.guillaume);
  await share(h.guillaume, listId, [h.ids.marie]);

  const results = await run(h.marie,
    { type: 'list.update', listId, name: 'Renommée par Marie' },
    { type: 'list.update', listId, categoryId: h.TACHES },
    { type: 'list.delete', listId });
  assert.deepEqual(results.map((r) => r.status), [403, 403, 403]);
  assert.match(results[0].error, /propriétaire/);
  const shareRes = await share(h.marie, listId, [h.ids.marie, h.ids.paul]);
  assert.equal(shareRes.status, 403);
  const row = h.app.db.prepare('SELECT name, deleted_at FROM lists WHERE id = ?').get(listId);
  assert.deepEqual(row, { name: 'Courses de la semaine', deleted_at: null });
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM list_members WHERE list_id = ?').pluck().get(listId), 2);
});

test('un invité peut ajouter, modifier, cocher, supprimer des articles, tout décocher et retirer les cochés', async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.guillaume);
  await share(h.guillaume, listId, [h.ids.marie]);
  const { itemId } = await addItem(h.guillaume, listId, { name: 'Pain' });

  const created = await addItem(h.marie, listId, { name: 'Beurre', quantity: '250 g', note: 'doux' });
  assert.equal(created.item.createdBy, h.ids.marie);
  assert.equal((await ok(h.marie, { type: 'item.update', itemId, name: 'Pain complet', quantity: '1' })).item.name, 'Pain complet');
  assert.equal((await ok(h.marie, { type: 'item.check', itemId, checked: true })).item.checked, true);
  assert.equal((await ok(h.marie, { type: 'list.uncheckAll', listId })).reopened, 1);
  assert.equal((await ok(h.marie, { type: 'item.check', itemId, checked: true })).item.checked, true);
  assert.equal((await ok(h.marie, { type: 'list.removeChecked', listId })).removed, 1);
  await ok(h.marie, { type: 'item.delete', itemId: created.itemId });

  const { groups } = (await h.guillaume.get(`/api/lists/${listId}`)).body;
  assert.deepEqual(groups, []);
});

test("un invité retiré, ou un compte désactivé, perd l'accès tout de suite", async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.guillaume);
  const { itemId } = await addItem(h.guillaume, listId);
  await share(h.guillaume, listId, [h.ids.marie, h.ids.paul]);
  assert.equal((await h.marie.get(`/api/lists/${listId}`)).status, 200);

  // Marie est retirée : plus rien, dès la requête suivante
  assert.equal((await share(h.guillaume, listId, [h.ids.paul])).status, 200);
  assert.equal((await h.marie.get(`/api/lists/${listId}`)).status, 404);
  assert.equal((await run(h.marie, { type: 'item.check', itemId, checked: true }))[0].status, 404);
  assert.ok(!(await h.marie.get('/api/sync')).body.listIds.includes(listId));

  // Paul est désactivé : refusé partout ; réactivé, il retrouve la liste
  await h.guillaume.request('PATCH', `/api/admin/users/${h.ids.paul}`, { active: false });
  assert.equal((await h.paul.get(`/api/lists/${listId}`)).status, 401);
  await h.guillaume.request('PATCH', `/api/admin/users/${h.ids.paul}`, { active: true });
  const paul = h.app.client();
  await login(paul, 'paul', 'MotDePasse-paul');
  assert.equal((await paul.get(`/api/lists/${listId}`)).status, 200);
});

// --- Partage ---

test("partage : propriétaire toujours membre, comptes désactivés ou inconnus refusés", async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.guillaume);

  // Retirer tout le monde laisse le propriétaire
  const res = await share(h.guillaume, listId, []);
  assert.deepEqual(res.body.list.members.map((m) => m.username), ['guillaume']);

  for (const bad of [[999], ['abc'], 'marie', [h.ids.marie, -1]]) {
    assert.equal((await share(h.guillaume, listId, bad)).status, 400, JSON.stringify(bad));
  }
  await h.guillaume.request('PATCH', `/api/admin/users/${h.ids.paul}`, { active: false });
  const refused = await share(h.guillaume, listId, [h.ids.paul]);
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /désactivé/);

  // Un invité déjà présent puis désactivé peut rester sur la liste
  await share(h.guillaume, listId, [h.ids.marie]);
  await h.guillaume.request('PATCH', `/api/admin/users/${h.ids.marie}`, { active: false });
  const kept = await share(h.guillaume, listId, [h.ids.marie]);
  assert.equal(kept.status, 200);
  assert.equal(kept.body.list.members.find((m) => m.username === 'marie').active, false);

  // Les comptes actifs proposés au partage
  const users = (await h.guillaume.get('/api/users')).body.users.map((u) => u.username);
  assert.deepEqual(users, ['guillaume']);
});

// --- Articles, historique et rayon automatique ---

test('« Lait » ajouté plusieurs fois retrouve son rayon, avec une seule entrée d\'historique', async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.marie);
  const cremerie = h.ref('aisles', 'Crèmerie');

  const first = await addItem(h.marie, listId, { name: 'Lait', aisleId: cremerie });
  assert.equal(first.item.aisleId, cremerie);
  for (const name of ['lait', 'LAIT', 'Lait  ', ' lait ']) {
    const { item } = await addItem(h.marie, listId, { name }); // sans rayon précisé
    assert.equal(item.aisleId, cremerie, `« ${name} » doit retrouver Crèmerie`);
  }
  const history = h.app.db.prepare('SELECT * FROM item_history').all();
  assert.equal(history.length, 1);
  assert.equal(history[0].name_normalized, 'lait');
  assert.equal(history[0].use_count, 5);
  assert.equal(history[0].display_name, 'Lait', 'la suggestion garde la première écriture');

  // Historique commun : sur une autre liste, un autre compte retrouve aussi le rayon
  const other = await createList(h, h.paul);
  assert.equal((await addItem(h.paul, other, { name: 'Lait' })).item.aisleId, cremerie);
});

test('rayon automatique : un nouvel article est « Sans rayon » jusqu\'à ce qu\'on en choisisse un', async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.marie);
  const surgeles = h.ref('aisles', 'Surgelés');

  const { itemId, item } = await addItem(h.marie, listId, { name: 'Glace vanille' });
  assert.equal(item.aisleId, null);
  assert.equal((await addItem(h.marie, listId, { name: 'Glace vanille' })).item.aisleId, null);
  // Le rayon choisi en modifiant l'article est mémorisé (« le dernier choisi »)
  await ok(h.marie, { type: 'item.update', itemId, aisleId: surgeles });
  assert.equal((await addItem(h.marie, listId, { name: 'glace VANILLE' })).item.aisleId, surgeles);
  // Le rayon reste modifiable sur un article, et un rayon choisi à l'ajout l'emporte
  const boissons = h.ref('aisles', 'Boissons');
  assert.equal((await addItem(h.marie, listId, { name: 'Glace vanille', aisleId: boissons })).item.aisleId, boissons);
  assert.equal((await addItem(h.marie, listId, { name: 'Glace vanille', aisleId: null })).item.aisleId, null);
  assert.equal((await addItem(h.marie, listId, { name: 'Glace vanille' })).item.aisleId, boissons, 'Sans rayon ne remplace pas le rayon habituel');

  // Renommer un article mémorise le nouveau nom avec son rayon
  await ok(h.marie, { type: 'item.update', itemId, name: 'Glace chocolat' });
  assert.equal((await addItem(h.marie, listId, { name: 'Glace chocolat' })).item.aisleId, surgeles);
});

test("un rayon désactivé n'est plus proposé, mais reste sur les articles qui l'ont", async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.marie);
  const fromages = h.ref('aisles', 'Fromages');
  const { itemId } = await addItem(h.marie, listId, { name: 'Comté', aisleId: fromages });
  await h.guillaume.request('PATCH', `/api/admin/aisles/${fromages}`, { active: false });

  // L'article existant garde son rayon, même quand on le modifie
  const updated = await ok(h.marie, { type: 'item.update', itemId, quantity: '200 g', aisleId: fromages });
  assert.equal(updated.item.aisleId, fromages);
  const { groups } = (await h.marie.get(`/api/lists/${listId}`)).body;
  assert.equal(groups[0].aisle.name, 'Fromages');
  // Un nouvel article ne le reçoit plus, ni automatiquement ni sur demande
  assert.equal((await addItem(h.marie, listId, { name: 'Comté' })).item.aisleId, null);
  const [refused] = await run(h.marie, { type: 'item.create', listId, itemId: uuid(), name: 'Brie', aisleId: fromages });
  assert.equal(refused.status, 400);
  assert.equal((await h.marie.get('/api/suggestions?q=co')).body.suggestions[0].aisleId, null);
});

test('sur une liste qui n\'est pas de courses, les articles n\'ont pas de rayon', async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.marie, { name: 'Bricolage', categoryId: h.TACHES });
  const { item } = await addItem(h.marie, listId, { name: 'Ampoule', aisleId: h.ref('aisles', 'Entretien') });
  assert.equal(item.aisleId, null);
});

test('retirer les cochés ne touche que les articles cochés de cette liste ; l\'historique reste', async (t) => {
  const h = await household(t);
  const list1 = await createList(h, h.marie);
  const list2 = await createList(h, h.marie, { name: 'Autre liste' });
  const a = await addItem(h.marie, list1, { name: 'Pommes' });
  const b = await addItem(h.marie, list1, { name: 'Poires' });
  const c = await addItem(h.marie, list2, { name: 'Prunes' });
  for (const { itemId } of [a, c]) await ok(h.marie, { type: 'item.check', itemId, checked: true });

  assert.equal((await ok(h.marie, { type: 'list.removeChecked', listId: list1 })).removed, 1);
  const state = (id) => h.app.db.prepare('SELECT checked, deleted_at IS NOT NULL AS deleted FROM items WHERE id = ?').get(id);
  assert.deepEqual(state(a.itemId), { checked: 1, deleted: 1 });
  assert.deepEqual(state(b.itemId), { checked: 0, deleted: 0 }, 'non coché : gardé');
  assert.deepEqual(state(c.itemId), { checked: 1, deleted: 0 }, 'autre liste : gardé');
  // Supprimer et retirer les cochés n'effacent pas l'historique
  await ok(h.marie, { type: 'item.delete', itemId: b.itemId });
  const names = h.app.db.prepare('SELECT name_normalized FROM item_history ORDER BY 1').pluck().all();
  assert.deepEqual(names, ['poires', 'pommes', 'prunes']);
});

// --- Tri ---

test('tri : rayons par ordre alphabétique français, « Sans rayon » en dernier, cochés en bas, rayon vide masqué', async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.marie);
  const aisle = (name) => h.ref('aisles', name);
  const add = (name, aisleName, checked = false) => ({ name, aisleName, checked });
  const wanted = [
    add('zeste de citron', 'Épicerie salée'), add('Ail', 'Épicerie salée'), add('éclats de noisette', 'Épicerie salée', true),
    add('Sel', 'Épicerie salée'), add('Eau gazeuse', 'Boissons'), add('Café', 'Boissons', true), add('Bière', 'Boissons'),
    add('Pizza', 'Surgelés'), add('Bougies', null), add('allumettes', null), add('Éponges', null, true),
  ];
  for (const w of wanted) {
    const { itemId } = await addItem(h.marie, listId, { name: w.name, aisleId: w.aisleName ? aisle(w.aisleName) : null });
    if (w.checked) await ok(h.marie, { type: 'item.check', itemId, checked: true });
  }
  // Un rayon dont le seul article est supprimé ne doit pas apparaître
  const { itemId } = await addItem(h.marie, listId, { name: 'Steak', aisleId: aisle('Boucherie') });
  await ok(h.marie, { type: 'item.delete', itemId });

  const { groups } = (await h.marie.get(`/api/lists/${listId}`)).body;
  assert.deepEqual(groups.map((g) => g.aisle?.name ?? 'Sans rayon'), ['Boissons', 'Épicerie salée', 'Surgelés', 'Sans rayon']);
  assert.deepEqual(groups.map((g) => g.items.map((i) => i.name)), [
    ['Bière', 'Eau gazeuse', 'Café'],
    ['Ail', 'Sel', 'zeste de citron', 'éclats de noisette'],
    ['Pizza'],
    ['allumettes', 'Bougies', 'Éponges'],
  ]);
});

test('tri : une liste qui n\'est pas de courses forme un seul groupe', async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.marie, { name: 'Ménage', categoryId: h.TACHES });
  for (const name of ['Vitres', 'aspirateur', 'Évier']) await addItem(h.marie, listId, { name });
  const { groups } = (await h.marie.get(`/api/lists/${listId}`)).body;
  assert.equal(groups.length, 1);
  assert.equal(groups[0].aisle, null);
  assert.deepEqual(groups[0].items.map((i) => i.name), ['aspirateur', 'Évier', 'Vitres']);
});

// --- Autocomplétion ---

test("l'autocomplétion renvoie les plus fréquents d'abord, dès deux lettres", async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.marie);
  const uses = { Laitue: 5, Lait: 3, 'Pain au lait': 2, Lardons: 1, Pâtes: 4, Éclair: 1 };
  for (const [name, count] of Object.entries(uses)) {
    for (let i = 0; i < count; i++) await addItem(h.marie, listId, { name });
  }
  const names = async (q) => (await h.marie.get(`/api/suggestions?q=${encodeURIComponent(q)}`)).body.suggestions.map((s) => s.name);
  assert.deepEqual(await names('l'), [], 'une seule lettre : rien');
  assert.deepEqual(await names('la'), ['Laitue', 'Lait', 'Pain au lait', 'Lardons']);
  assert.deepEqual(await names('LAI'), ['Laitue', 'Lait', 'Pain au lait']);
  assert.deepEqual(await names('pa'), ['Pâtes', 'Pain au lait']);
  assert.deepEqual(await names('ec'), ['Éclair'], 'accents ignorés');
  assert.deepEqual(await names('xy'), []);
  // L'historique est commun : Paul a les mêmes suggestions
  const paul = (await h.paul.get('/api/suggestions?q=la')).body.suggestions;
  assert.equal(paul[0].useCount, 5);
});

// --- Validation des entrées ---

test('entrées invalides refusées', async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.marie);
  const { itemId } = await addItem(h.marie, listId);
  const lidl = h.ref('stores', 'Lidl');
  const carrefour = h.ref('stores', 'Carrefour');
  await h.guillaume.request('PATCH', `/api/admin/stores/${carrefour}`, { active: false });
  const inactiveCategory = (await h.guillaume.post('/api/admin/categories', { name: 'Ancienne' })).body.item.id;
  await h.guillaume.request('PATCH', `/api/admin/categories/${inactiveCategory}`, { active: false });

  const cases = [
    [{ type: 'list.create', listId: 'pas-un-uuid', name: 'X', categoryId: h.COURSES }, 400],
    [{ type: 'list.create', listId, name: 'Déjà prise', categoryId: h.COURSES }, 409],
    [{ type: 'list.create', listId: uuid(), name: '', categoryId: h.COURSES }, 400],
    [{ type: 'list.create', listId: uuid(), name: 'x'.repeat(101), categoryId: h.COURSES }, 400],
    [{ type: 'list.create', listId: uuid(), name: 'X' }, 400],
    [{ type: 'list.create', listId: uuid(), name: 'X', categoryId: 999 }, 400],
    [{ type: 'list.create', listId: uuid(), name: 'X', categoryId: inactiveCategory }, 400],
    [{ type: 'list.create', listId: uuid(), name: 'X', categoryId: h.COURSES, storeId: 999 }, 400],
    [{ type: 'list.create', listId: uuid(), name: 'X', categoryId: h.COURSES, storeId: carrefour }, 400],
    [{ type: 'list.create', listId: uuid(), name: 'X', categoryId: h.TACHES, storeId: lidl }, 400],
    [{ type: 'list.update', listId, storeId: 'abc' }, 400],
    [{ type: 'list.update', listId }, 400],
    [{ type: 'item.create', listId, itemId: 'abc', name: 'X' }, 400],
    [{ type: 'item.create', listId, itemId, name: 'Déjà pris' }, 409],
    [{ type: 'item.create', listId, itemId: uuid(), name: '   ' }, 400],
    [{ type: 'item.create', listId, itemId: uuid(), name: 'x'.repeat(101) }, 400],
    [{ type: 'item.create', listId, itemId: uuid(), name: 'X', quantity: 'q'.repeat(31) }, 400],
    [{ type: 'item.create', listId, itemId: uuid(), name: 'X', quantity: 2 }, 400],
    [{ type: 'item.create', listId, itemId: uuid(), name: 'X', note: 'n'.repeat(501) }, 400],
    [{ type: 'item.create', listId, itemId: uuid(), name: 'X', aisleId: 999 }, 400],
    [{ type: 'item.create', listId, itemId: uuid(), name: 'X', aisleId: 'abc' }, 400],
    [{ type: 'item.update', itemId, aisleId: 'abc' }, 400],
    [{ type: 'item.update', itemId }, 400],
    [{ type: 'item.check', itemId, checked: 'oui' }, 400],
    [{ type: 'item.check', itemId: 'abc', checked: true }, 400],
    [{ type: 'list.inventee', listId }, 400],
    [{ type: 'constructor', listId }, 400],
  ];
  const results = await run(h.marie, ...cases.map(([op]) => op));
  results.forEach((result, i) => assert.equal(result.status, cases[i][1], `${JSON.stringify(cases[i][0])} → ${result.error}`));
  // Les limites exactes passent
  await addItem(h.marie, listId, { name: 'x'.repeat(100), quantity: 'q'.repeat(30), note: 'n'.repeat(500) });

  // Lots invalides
  for (const body of [{}, { ops: [] }, { ops: 'x' }, { ops: Array.from({ length: 101 }, () => ({})) }]) {
    assert.equal((await h.marie.post('/api/ops', body)).status, 400, JSON.stringify(body).slice(0, 40));
  }
  const [badId] = (await h.marie.post('/api/ops', { ops: [{ id: 'abc', type: 'item.delete', itemId }] })).body.results;
  assert.equal(badId.status, 400);
  assert.equal((await h.marie.get('/api/lists/pas-un-uuid')).status, 404);
  assert.equal((await h.marie.get('/api/sync?since=hier')).status, 400);
});

test('catégorie, magasin et changement de catégorie d\'une liste', async (t) => {
  const h = await household(t);
  const lidl = h.ref('stores', 'Lidl');
  const listId = await createList(h, h.marie, { storeId: lidl });
  const get = async () => (await h.marie.get(`/api/lists/${listId}`)).body.list;
  assert.equal((await get()).store.name, 'Lidl');

  // Magasin désactivé : la liste le garde, même en la renommant
  await h.guillaume.request('PATCH', `/api/admin/stores/${lidl}`, { active: false });
  await ok(h.marie, { type: 'list.update', listId, name: 'Courses du samedi', storeId: lidl });
  assert.deepEqual([(await get()).name, (await get()).store.name], ['Courses du samedi', 'Lidl']);
  // …mais on ne peut pas le choisir pour une autre liste
  const [refused] = await run(h.marie, { type: 'list.create', listId: uuid(), name: 'X', categoryId: h.COURSES, storeId: lidl });
  assert.equal(refused.status, 400);

  // Passer à « Tâches » retire le magasin ; y ajouter un magasin est refusé
  await ok(h.marie, { type: 'list.update', listId, categoryId: h.TACHES });
  assert.deepEqual([(await get()).category.name, (await get()).store], ['Tâches', null]);
  const [noStore] = await run(h.marie, { type: 'list.update', listId, storeId: h.ref('stores', 'E.Leclerc') });
  assert.equal(noStore.status, 400);
  // Retour en liste de courses avec un magasin actif
  await ok(h.marie, { type: 'list.update', listId, categoryId: h.COURSES, storeId: h.ref('stores', 'E.Leclerc') });
  assert.equal((await get()).store.name, 'E.Leclerc');
  await ok(h.marie, { type: 'list.update', listId, storeId: null });
  assert.equal((await get()).store, null);
});

// --- Horodatages, renvois, conflits ---

test('les horodatages envoyés par le client sont ignorés', async (t) => {
  const h = await household(t);
  const fake = { createdAt: '1999-01-01T00:00:00.000Z', updatedAt: '2099-01-01T00:00:00.000Z', deletedAt: '1999-01-01T00:00:00.000Z',
    created_at: '1999-01-01T00:00:00.000Z', updated_at: '2099-01-01T00:00:00.000Z', deleted_at: '1999-01-01T00:00:00.000Z' };
  const listId = await createList(h, h.marie, fake);
  const { itemId } = await addItem(h.marie, listId, fake);
  h.app.clock.now += 60 * 1000;
  await ok(h.marie, { type: 'item.check', itemId, checked: true, ...fake });

  const server = (ms) => new Date(ms).toISOString();
  const list = h.app.db.prepare('SELECT * FROM lists WHERE id = ?').get(listId);
  const item = h.app.db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  assert.deepEqual([list.created_at, list.updated_at, list.deleted_at], [server(h.app.clock.now - 60000), server(h.app.clock.now - 60000), null]);
  assert.deepEqual([item.created_at, item.updated_at, item.deleted_at], [server(h.app.clock.now - 60000), server(h.app.clock.now), null]);
});

test("une opération renvoyée (même identifiant) n'est jamais appliquée deux fois", async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.marie);
  const op = { id: uuid(), type: 'item.create', listId, itemId: uuid(), name: 'Œufs' };
  const first = (await h.marie.post('/api/ops', { ops: [op] })).body.results[0];
  const again = (await h.marie.post('/api/ops', { ops: [op, op] })).body.results;
  assert.equal(first.status, 200);
  assert.deepEqual(again.map((r) => [r.status, r.duplicate]), [[200, true], [200, true]]);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM items').pluck().get(), 1);
  assert.equal(h.app.db.prepare('SELECT use_count FROM item_history').pluck().get(), 1);

  // Un refus est aussi mémorisé : renvoyé, il donne le même refus
  const guestOp = { id: uuid(), type: 'list.delete', listId };
  await share(h.marie, listId, [h.ids.paul]);
  assert.equal((await h.paul.post('/api/ops', { ops: [guestOp] })).body.results[0].status, 403);
  assert.equal((await h.paul.post('/api/ops', { ops: [guestOp] })).body.results[0].status, 403);
  // Le même identifiant ne peut pas servir à un autre compte
  assert.equal((await h.paul.post('/api/ops', { ops: [op] })).body.results[0].status, 409);
});

test("conflits : la dernière modification reçue gagne, une suppression l'emporte", async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.marie);
  await share(h.marie, listId, [h.ids.paul]);
  const { itemId } = await addItem(h.marie, listId, { name: 'Riz' });
  await ok(h.marie, { type: 'item.update', itemId, quantity: '1 kg' });
  await ok(h.paul, { type: 'item.update', itemId, quantity: '2 kg' });
  assert.equal(h.app.db.prepare('SELECT quantity FROM items WHERE id = ?').pluck().get(itemId), '2 kg');

  await ok(h.paul, { type: 'item.delete', itemId });
  const [late] = await run(h.marie, { type: 'item.update', itemId, quantity: '3 kg' });
  assert.equal(late.status, 404);
  // Deux ajouts du même nom : deux articles, pas de fusion
  await addItem(h.marie, listId, { name: 'Sucre' });
  await addItem(h.paul, listId, { name: 'sucre' });
  assert.equal((await h.marie.get(`/api/lists/${listId}`)).body.groups.flatMap((g) => g.items).length, 2);
});

test('une liste supprimée disparaît pour tous ses membres', async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.marie);
  await share(h.marie, listId, [h.ids.paul]);
  await ok(h.marie, { type: 'list.delete', listId });
  for (const client of [h.marie, h.paul]) {
    assert.deepEqual(await listNames(client), []);
    assert.equal((await client.get(`/api/lists/${listId}`)).status, 404);
  }
  assert.equal((await run(h.paul, { type: 'item.create', listId, itemId: uuid(), name: 'X' }))[0].status, 404);
});

test('mes listes : nombre d\'articles restants et tri par dernière activité', async (t) => {
  const h = await household(t);
  const older = await createList(h, h.marie, { name: 'Ancienne' });
  h.app.clock.now += 60 * 1000;
  await createList(h, h.marie, { name: 'Récente' });
  assert.deepEqual((await h.marie.get('/api/lists')).body.lists.map((l) => l.name), ['Récente', 'Ancienne']);

  // Un article ajouté à l'ancienne la fait remonter
  h.app.clock.now += 60 * 1000;
  const { itemId } = await addItem(h.marie, older, { name: 'Pain' });
  await addItem(h.marie, older, { name: 'Lait' });
  await ok(h.marie, { type: 'item.check', itemId, checked: true });
  const lists = (await h.marie.get('/api/lists')).body.lists;
  assert.deepEqual(lists.map((l) => [l.name, l.remaining]), [['Ancienne', 1], ['Récente', 0]]);
});

// --- Synchronisation ---

test('« depuis tel instant » : modifications et suppressions, seulement pour mes listes', async (t) => {
  const h = await household(t);
  const mine = await createList(h, h.marie, { name: 'Ma liste' });
  const kept = await addItem(h.marie, mine, { name: 'Gardé' });
  const changed = await addItem(h.marie, mine, { name: 'Modifié' });
  const removed = await addItem(h.marie, mine, { name: 'Supprimé' });
  const notMine = await createList(h, h.paul, { name: 'Liste de Paul' });
  await addItem(h.paul, notMine, { name: 'Article de Paul' });

  // Première synchro : tout (un peu plus tard : sinon les lignes créées à la
  // même milliseconde que « serverTime » reviendraient, ce qui est voulu)
  h.app.clock.now += 1000;
  const first = (await h.marie.get('/api/sync')).body;
  assert.deepEqual(first.listIds, [mine]);
  assert.equal(first.items.length, 3);
  assert.equal(first.categories.length, 2);
  assert.ok(first.aisles.length > 0 && first.stores.length > 0 && first.history.length >= 3);

  // Des changements, puis une synchro « depuis »
  h.app.clock.now += 1000;
  await ok(h.marie, { type: 'item.update', itemId: changed.itemId, note: 'nouvelle note' });
  await ok(h.marie, { type: 'item.delete', itemId: removed.itemId });
  await addItem(h.marie, mine, { name: 'Nouveau' });
  await addItem(h.paul, notMine, { name: 'Autre de Paul' });
  h.app.clock.now += 1000;
  const next = (await h.marie.get(`/api/sync?since=${first.serverTime}`)).body;
  const byName = Object.fromEntries(next.items.map((i) => [i.name, i]));
  assert.deepEqual(Object.keys(byName).sort(), ['Modifié', 'Nouveau', 'Supprimé']);
  assert.equal(byName['Modifié'].note, 'nouvelle note');
  assert.ok(byName['Supprimé'].deletedAt, 'la suppression est transmise');
  assert.ok(!next.items.some((i) => i.id === kept.itemId), 'un article inchangé ne revient pas');
  assert.ok(!JSON.stringify([next.lists, next.items]).includes('Paul'), 'rien des listes des autres');
  assert.deepEqual(next.lists, [], 'la liste elle-même n\'a pas changé');
  assert.ok(next.history.some((e) => e.name === 'Nouveau'));

  // Liste partagée avec moi depuis : elle arrive avec tous ses articles
  h.app.clock.now += 1000;
  await share(h.paul, notMine, [h.ids.marie]);
  h.app.clock.now += 1000;
  const shared = (await h.marie.get(`/api/sync?since=${next.serverTime}`)).body;
  assert.deepEqual(shared.lists.map((l) => l.name), ['Liste de Paul']);
  assert.deepEqual(shared.items.map((i) => i.name).sort(), ['Article de Paul', 'Autre de Paul']);
  assert.deepEqual(shared.listIds.sort(), [mine, notMine].sort());

  // Liste supprimée : transmise avec sa date de suppression, et absente de listIds
  h.app.clock.now += 1000;
  await ok(h.marie, { type: 'list.delete', listId: mine });
  h.app.clock.now += 1000;
  const afterDelete = (await h.marie.get(`/api/sync?since=${shared.serverTime}`)).body;
  assert.ok(afterDelete.lists.find((l) => l.id === mine).deletedAt);
  assert.deepEqual(afterDelete.listIds, [notMine]);
});

// --- Nettoyage ---

test('le nettoyage efface ce qui est supprimé depuis plus de 30 jours, et rien d\'autre', async (t) => {
  const h = await household(t);
  const listA = await createList(h, h.marie, { name: 'Gardée' });
  const listB = await createList(h, h.marie, { name: 'Supprimée il y a longtemps' });
  const listC = await createList(h, h.marie, { name: 'Supprimée récemment' });
  const oldItem = await addItem(h.marie, listA, { name: 'Vieux' });
  const recentItem = await addItem(h.marie, listA, { name: 'Récent' });
  const liveItem = await addItem(h.marie, listA, { name: 'Vivant' });
  await addItem(h.marie, listB, { name: 'Dans B' });

  await ok(h.marie, { type: 'item.delete', itemId: oldItem.itemId });
  await ok(h.marie, { type: 'list.delete', listId: listB });
  h.app.clock.now += 20 * DAY;
  await ok(h.marie, { type: 'item.delete', itemId: recentItem.itemId });
  await ok(h.marie, { type: 'list.delete', listId: listC });
  h.app.clock.now += 11 * DAY; // 31 jours après les premières suppressions, 11 après les autres

  const purged = h.app.ctx.lists.purgeDeleted();
  assert.deepEqual([purged.items, purged.lists], [1, 1]);
  const exists = (table, id) => h.app.db.prepare(`SELECT COUNT(*) FROM ${table} WHERE id = ?`).pluck().get(id) === 1;
  assert.equal(exists('items', oldItem.itemId), false);
  assert.equal(exists('lists', listB), false, 'liste effacée avec ses articles et ses membres');
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM list_members WHERE list_id = ?').pluck().get(listB), 0);
  assert.equal(exists('items', recentItem.itemId), true);
  assert.equal(exists('lists', listC), true);
  assert.equal(exists('items', liveItem.itemId), true);
  assert.equal(exists('lists', listA), true);
  assert.ok(h.app.db.prepare('SELECT COUNT(*) FROM item_history').pluck().get() >= 4, "l'historique reste");
  assert.ok(purged.ops > 0, 'les vieilles traces d\'opérations sont effacées aussi');
});

// --- Journal ---

test('le journal note création, partage, retrait et suppression de liste, sans leur contenu', async (t) => {
  const h = await household(t);
  const listId = await createList(h, h.marie, { name: 'Surprise pour Paul' });
  await addItem(h.marie, listId, { name: 'Gâteau' });
  await share(h.marie, listId, [h.ids.paul]);
  await share(h.marie, listId, []);
  await ok(h.marie, { type: 'list.delete', listId });

  const journal = h.app.logs.join('\n');
  for (const event of [
    `liste_creee utilisateur="marie" liste="${listId}"`,
    `liste_partage_ajoute utilisateur="marie" liste="${listId}" personne="paul"`,
    `liste_partage_retire utilisateur="marie" liste="${listId}" personne="paul"`,
    `liste_supprimee utilisateur="marie" liste="${listId}"`,
  ]) assert.ok(journal.includes(event), `absent : ${event}`);
  assert.ok(!journal.includes('Surprise') && !journal.includes('Gâteau'), 'ni nom de liste ni article dans le journal');
});
