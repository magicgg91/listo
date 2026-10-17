// Tests de l'onglet « Noms enregistrés » de l'administration : corriger un
// nom partout (historique et listes), fusion, retrait des suggestions,
// droits, synchronisation, temps réel, transaction tout ou rien, validation,
// journal.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { savedNameSub, renameImpactText, renameDoneText } from '../public/js/format.js';

const uuid = () => crypto.randomUUID();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Admin « admin » + Utilisateurs « marie » et « paul », tous connectés
async function household(t) {
  const app = await startTestApp(t);
  const admin = await setupAdmin(app, { username: 'admin' });
  const ids = { admin: app.db.prepare("SELECT id FROM users WHERE username = 'admin'").pluck().get() };
  const clients = { admin };
  for (const name of ['marie', 'paul']) {
    ids[name] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    clients[name] = app.client();
    await login(clients[name], name, `MotDePasse-${name}`);
  }
  const ref = (table, name) => app.db.prepare(`SELECT id FROM ${table} WHERE name = ?`).pluck().get(name);
  // L'horloge avance d'une seconde à chaque opération : les dates de
  // modification se suivent, comme dans la vraie vie
  const tick = () => { app.clock.now += 1000; };
  return { app, ...clients, ids, ref, tick, COURSES: ref('categories', 'Courses'), TACHES: ref('categories', 'Tâches') };
}

async function ok(h, client, op) {
  h.tick();
  const res = await client.post('/api/ops', { ops: [{ id: uuid(), ...op }] });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.results[0].status, 200, `${op.type} : ${res.body.results[0].error}`);
  return res.body.results[0];
}

async function newList(h, client, fields = {}) {
  const listId = uuid();
  await ok(h, client, { type: 'list.create', listId, name: 'Courses', categoryId: h.COURSES, ...fields });
  return listId;
}

async function newItem(h, client, listId, name, fields = {}) {
  const itemId = uuid();
  await ok(h, client, { type: 'item.create', listId, itemId, name, ...fields });
  return itemId;
}

const item = (h, id) => h.app.db.prepare('SELECT * FROM items WHERE id = ?').get(id);
const historyOf = (h, key) => h.app.db.prepare('SELECT * FROM item_history WHERE name_normalized = ? ORDER BY IFNULL(store_id, 0)').all(key);
const rename = (client, from, to) => client.post('/api/admin/names/rename', { from, to });
const names = async (client, query = '') => (await client.get(`/api/admin/names${query}`)).body;

// État des données touchées par la fonction, pour vérifier que rien n'a changé
const snapshot = (db) => ['items', 'item_history', 'lists']
  .map((table) => JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all())).join('\n');

// Flux temps réel d'un client (voir aussi test/events.test.js)
async function openStream(app, client) {
  const controller = new AbortController();
  const cookie = [...client.jar].map(([n, v]) => `${n}=${v}`).join('; ');
  const res = await fetch(`${app.base}/api/events`, { headers: { cookie }, signal: controller.signal });
  const stream = { lists: [] };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const match of decoder.decode(value).matchAll(/event: list\ndata: (.*)\n/g)) stream.lists.push(JSON.parse(match[1]).listId);
      }
    } catch {
      // flux coupé par le test
    }
  })();
  stream.close = () => controller.abort();
  await pause(50);
  return stream;
}

// --- Droits ---

test('noms enregistrés : un Utilisateur reçoit 403, un visiteur 401, rien ne change', async (t) => {
  const h = await household(t);
  const listId = await newList(h, h.marie);
  await newItem(h, h.marie, listId, 'Tomatte');
  const before = snapshot(h.app.db);
  const routes = [
    ['GET', '/api/admin/names'],
    ['GET', '/api/admin/names/impact?from=tomatte&to=Tomate'],
    ['POST', '/api/admin/names/rename', { from: 'tomatte', to: 'Tomate' }],
    ['POST', '/api/admin/names/remove', { from: 'tomatte' }],
  ];
  const visitor = h.app.client();
  for (const [method, url, body] of routes) {
    assert.equal((await h.marie.request(method, url, body)).status, 403, `${method} ${url} (Utilisateur)`);
    assert.equal((await visitor.request(method, url, body)).status, 401, `${method} ${url} (visiteur)`);
  }
  assert.equal(snapshot(h.app.db), before);
});

test("la liste des noms ne montre ni les listes, ni leurs membres : des noms et des compteurs", async (t) => {
  const h = await household(t);
  const listId = await newList(h, h.marie, { name: 'Liste secrète de Marie', storeId: h.ref('stores', 'Lidl') });
  await newItem(h, h.marie, listId, 'Tomatte', { aisleId: h.ref('aisles', 'Fruits et légumes') });
  await newItem(h, h.marie, listId, 'tomatte');
  const res = await h.admin.get('/api/admin/names');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.names, [{ key: 'tomatte', name: 'Tomatte', aisle: 'Fruits et légumes', uses: 2, inLists: 2 }]);
  for (const secret of ['Liste secrète', listId, 'marie', 'Lidl']) assert.ok(!res.text.includes(secret), `la réponse montre « ${secret} »`);
});

// --- Correction ---

test('corriger un nom : historique et articles de plusieurs listes de courses de comptes différents ; les tâches jamais', async (t) => {
  const h = await household(t);
  const fruits = h.ref('aisles', 'Fruits et légumes');
  const marieList = await newList(h, h.marie, { name: 'Courses Marie', storeId: h.ref('stores', 'Lidl') });
  const paulList = await newList(h, h.paul, { name: 'Courses Paul' });
  const paulTasks = await newList(h, h.paul, { name: 'Maison', categoryId: h.TACHES });
  const a = await newItem(h, h.marie, marieList, 'Tomatte', { aisleId: fruits, quantity: '500 g', note: 'bien mûres' });
  const b = await newItem(h, h.paul, paulList, 'TOMATTE');
  const c = await newItem(h, h.paul, paulTasks, 'tomatte');
  const other = await newItem(h, h.marie, marieList, 'Lait');
  const gone = await newItem(h, h.marie, marieList, 'Tomatte');
  await ok(h, h.marie, { type: 'item.check', itemId: a, checked: true });
  await ok(h, h.marie, { type: 'item.delete', itemId: gone });
  const before = { a: item(h, a), other: item(h, other), gone: item(h, gone) };

  const beforeTask = item(h, c);

  // Confirmation : 2 articles dans 2 listes de courses (l'article supprimé et
  // l'élément de la liste de tâches ne comptent pas)
  const impact = await h.admin.get('/api/admin/names/impact?from=tomatte&to=%20Tomate%20');
  assert.equal(impact.status, 200);
  assert.deepEqual(impact.body, { oldName: 'Tomatte', newName: 'Tomate', unchanged: false, merge: false, items: 2, lists: 2 });
  assert.equal((await names(h.admin)).names.find((n) => n.key === 'tomatte').inLists, 2, 'le compteur ignore les tâches');

  h.tick();
  const res = await rename(h.admin, 'tomatte', '  Tomate ');
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.body, { changed: true, items: 2, lists: 2, merge: false });

  // Les deux articles ont le nouveau nom et une nouvelle date ; le reste est intact
  for (const id of [a, b]) assert.equal(item(h, id).name, 'Tomate');
  assert.deepEqual(item(h, c), beforeTask, "l'élément de la liste de tâches au même nom n'est jamais modifié");
  const after = item(h, a);
  assert.ok(after.updated_at > before.a.updated_at);
  for (const field of ['quantity', 'note', 'aisle_id', 'store_id', 'checked', 'photo_at', 'list_id', 'created_by']) {
    assert.equal(after[field], before.a[field], field);
  }
  assert.deepEqual(item(h, other), before.other, 'un autre nom ne change pas');
  assert.deepEqual(item(h, gone), before.gone, 'un élément supprimé ne change pas');

  // Historique : toutes les lignes (générale et magasin) ont le nouveau nom
  assert.equal(historyOf(h, 'tomatte').length, 0);
  const lines = historyOf(h, 'tomate');
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => line.display_name === 'Tomate'));
  assert.equal(lines[0].use_count, 3, 'utilisations conservées (les tâches ne comptent pas)');
  assert.equal(lines[0].aisle_id, fruits, 'rayon habituel conservé');
  // Les suggestions proposent le nom corrigé
  const suggestions = (await h.marie.get('/api/suggestions?q=tom')).body.suggestions.map((s) => s.name);
  assert.deepEqual(suggestions, ['Tomate']);
});

test("la synchronisation d'un autre compte renvoie les éléments corrigés, et le temps réel prévient", async (t) => {
  const h = await household(t);
  const listId = await newList(h, h.marie);
  const itemId = await newItem(h, h.marie, listId, 'Tomatte');
  const otherList = await newList(h, h.paul);
  const since = (await h.marie.get('/api/sync')).body.serverTime;
  const marie = await openStream(h.app, h.marie);
  const paul = await openStream(h.app, h.paul);

  h.tick();
  assert.equal((await rename(h.admin, 'tomatte', 'Tomate')).status, 200);
  await pause(100);
  assert.deepEqual(marie.lists, [listId], 'Marie est prévenue pour sa liste');
  assert.deepEqual(paul.lists, [], "Paul n'a pas d'élément concerné");
  assert.ok(!paul.lists.includes(otherList));
  marie.close();
  paul.close();

  const changes = (await h.marie.get(`/api/sync?since=${encodeURIComponent(since)}`)).body;
  assert.deepEqual(changes.items.map((i) => [i.id, i.name]), [[itemId, 'Tomate']]);
  assert.ok(changes.history.some((e) => e.nameNormalized === 'tomate' && e.name === 'Tomate'));
});

test('fusion avec un nom déjà enregistré : utilisations additionnées, aucune erreur de doublon', async (t) => {
  const h = await household(t);
  const fruits = h.ref('aisles', 'Fruits et légumes');
  const epicerie = h.ref('aisles', 'Épicerie salée');
  const lidl = h.ref('stores', 'Lidl');
  const listId = await newList(h, h.marie, { storeId: lidl });
  // « Tomate » : 3 utilisations, rayon Fruits et légumes ; « Tomatte » : 1, Épicerie
  for (let i = 0; i < 3; i++) await newItem(h, h.marie, listId, 'Tomate', { aisleId: fruits });
  const typo = await newItem(h, h.marie, listId, 'Tomatte', { aisleId: epicerie });

  const impact = (await h.admin.get('/api/admin/names/impact?from=tomatte&to=Tomate')).body;
  assert.equal(impact.merge, true);
  assert.equal(impact.items, 1);
  const res = await rename(h.admin, 'tomatte', 'Tomate');
  assert.deepEqual(res.body, { changed: true, items: 1, lists: 1, merge: true });

  assert.equal(historyOf(h, 'tomatte').length, 0);
  const lines = historyOf(h, 'tomate');
  assert.equal(lines.length, 2, 'une ligne générale et une ligne Lidl');
  assert.deepEqual(lines.map((l) => [l.store_id, l.use_count, l.aisle_id]), [[null, 4, fruits], [lidl, 4, fruits]],
    'rayon de la ligne la plus utilisée');
  assert.equal(item(h, typo).name, 'Tomate');
  assert.equal(item(h, typo).aisle_id, epicerie, "le rayon de l'élément ne change pas");
  const listing = await names(h.admin);
  assert.deepEqual(listing.names.map((n) => [n.name, n.uses, n.inLists]), [['Tomate', 4, 4]]);
});

test('fusion : le rayon vient de la ligne la plus utilisée, sinon de l\'autre', async (t) => {
  const h = await household(t);
  const fruits = h.ref('aisles', 'Fruits et légumes');
  const listId = await newList(h, h.marie);
  // La faute est la plus utilisée et a un rayon ; le bon nom n'en a pas
  await newItem(h, h.marie, listId, 'Tomatte', { aisleId: fruits });
  await newItem(h, h.marie, listId, 'Tomatte', { aisleId: fruits });
  await newItem(h, h.marie, listId, 'Tomate', { aisleId: null });
  await rename(h.admin, 'tomatte', 'Tomate');
  assert.deepEqual(historyOf(h, 'tomate').map((l) => [l.use_count, l.aisle_id]), [[3, fruits]]);

  // À égalité, le rayon du nom corrigé ; s'il n'en a pas, celui de l'autre
  const epicerie = h.ref('aisles', 'Épicerie salée');
  await newItem(h, h.marie, listId, 'Poivron', { aisleId: epicerie });
  await newItem(h, h.marie, listId, 'Poivronn', { aisleId: fruits });
  await rename(h.admin, 'poivronn', 'Poivron');
  assert.deepEqual(historyOf(h, 'poivron').map((l) => [l.use_count, l.aisle_id]), [[2, epicerie]]);
});

test('même nom une fois normalisé : majuscules ou accents corrigés, sans fusion', async (t) => {
  const h = await household(t);
  const listId = await newList(h, h.marie);
  const a = await newItem(h, h.marie, listId, 'creme fraiche');
  const b = await newItem(h, h.marie, listId, 'CREME FRAICHE');
  const res = await rename(h.admin, 'creme fraiche', 'Crème fraîche');
  assert.deepEqual(res.body, { changed: true, items: 2, lists: 1, merge: false });
  assert.equal(item(h, a).name, 'Crème fraîche');
  assert.equal(item(h, b).name, 'Crème fraîche');
  assert.deepEqual(historyOf(h, 'creme fraiche').map((l) => l.display_name), ['Crème fraîche']);
});

test('ancien nom = nouveau nom : rien à faire, rien ne change', async (t) => {
  const h = await household(t);
  const listId = await newList(h, h.marie);
  await newItem(h, h.marie, listId, 'Tomate');
  const before = snapshot(h.app.db);
  h.tick();
  const res = await rename(h.admin, 'tomate', ' Tomate ');
  assert.deepEqual(res.body, { changed: false, items: 0, lists: 0, merge: false });
  assert.equal(snapshot(h.app.db), before);
  assert.ok(!h.app.logs.join('\n').includes('admin_nom_'), 'rien dans le journal');
});

test('seuls les noms identiques une fois normalisés sont touchés', async (t) => {
  const h = await household(t);
  const listId = await newList(h, h.marie);
  const keep = await Promise.all(['Tomates cerises', 'Tomat', 'Sauce tomatte'].map(async (n) => [n, await newItem(h, h.marie, listId, n)]));
  await newItem(h, h.marie, listId, 'Tomatte');
  await rename(h.admin, 'tomatte', 'Tomate');
  for (const [n, id] of keep) assert.equal(item(h, id).name, n);
});

// --- Retrait des suggestions ---

test('retirer des suggestions : l\'historique seulement, les listes ne changent pas', async (t) => {
  const h = await household(t);
  const listId = await newList(h, h.marie, { storeId: h.ref('stores', 'Lidl') });
  const itemId = await newItem(h, h.marie, listId, 'Tomatte');
  const before = item(h, itemId);
  const res = await h.admin.post('/api/admin/names/remove', { from: 'tomatte' });
  assert.equal(res.status, 204);
  assert.equal(historyOf(h, 'tomatte').length, 0, 'lignes générale et magasin retirées');
  assert.deepEqual(item(h, itemId), before);
  assert.deepEqual((await h.marie.get('/api/suggestions?q=tom')).body.suggestions, []);
  assert.equal((await h.admin.post('/api/admin/names/remove', { from: 'tomatte' })).status, 404);
  // Ressaisi plus tard, le nom est de nouveau enregistré (c'est normal)
  await newItem(h, h.marie, listId, 'Tomatte');
  assert.equal(historyOf(h, 'tomatte').length, 2);
});

// --- Transaction, validation ---

test('la correction est tout ou rien : une erreur au milieu ne modifie rien', async (t) => {
  const h = await household(t);
  const listId = await newList(h, h.marie);
  await newItem(h, h.marie, listId, 'Tomatte');
  const second = await newItem(h, h.marie, listId, 'Tomatte');
  await newItem(h, h.marie, listId, 'Tomatte');
  // Panne simulée : la base refuse de renommer le deuxième élément
  h.app.db.exec(`CREATE TEMP TRIGGER panne BEFORE UPDATE OF name ON items WHEN NEW.id = '${second}' BEGIN SELECT RAISE(ABORT, 'panne'); END`);
  const before = snapshot(h.app.db);
  const res = await rename(h.admin, 'tomatte', 'Tomate');
  assert.equal(res.status, 500);
  assert.equal(snapshot(h.app.db), before, 'ni historique ni éléments modifiés');
  assert.ok(!h.app.logs.join('\n').includes('admin_nom_corrige'));
  h.app.db.exec('DROP TRIGGER panne');
});

test('le nouveau nom est validé ; un nom inconnu est refusé', async (t) => {
  const h = await household(t);
  const listId = await newList(h, h.marie);
  await newItem(h, h.marie, listId, 'Tomatte');
  const before = snapshot(h.app.db);
  for (const to of ['', '   ', 'x'.repeat(101), 'To\u0000mate', 'Tom\u0007ate', 'Tomate\u007F', 42, null, ['Tomate']]) {
    const res = await rename(h.admin, 'tomatte', to);
    assert.equal(res.status, 400, JSON.stringify(to));
    assert.match(res.body.error, /Nom invalide/);
  }
  assert.equal((await h.admin.get('/api/admin/names/impact?from=tomatte&to=')).status, 400);
  for (const from of ['inconnu', '', 42, 'x'.repeat(201)]) {
    assert.equal((await rename(h.admin, from, 'Tomate')).status, 404, JSON.stringify(from));
  }
  // Retour à la ligne et tabulation : nettoyés comme des espaces
  assert.equal((await h.admin.get('/api/admin/names/impact?from=tomatte&to=Tom%0Aate')).body.newName, 'Tom ate');
  assert.equal(snapshot(h.app.db), before);
});

// --- Recherche, tri, morceaux ---

test('recherche sans accents ni majuscules, tri, et morceaux de 50 noms', async (t) => {
  const h = await household(t);
  const add = h.app.db.prepare('INSERT INTO item_history (name_normalized, display_name, use_count, last_used_at) VALUES (?, ?, ?, ?)');
  for (let i = 1; i <= 60; i++) add.run(`nom ${String(i).padStart(2, '0')}`, `Nom ${String(i).padStart(2, '0')}`, i, '2026-10-16T12:00:00.000Z');
  add.run('creme fraiche', 'Crème fraîche', 100, '2026-10-16T12:00:00.000Z');

  const first = await names(h.admin);
  assert.equal(first.total, 61);
  assert.equal(first.names.length, 50);
  assert.equal(first.names[0].name, 'Crème fraîche', 'par nom (sans accents)');
  const next = await names(h.admin, '?offset=50');
  assert.equal(next.names.length, 11);
  assert.equal(next.names.at(-1).name, 'Nom 60');

  const byUses = await names(h.admin, '?sort=uses');
  assert.deepEqual(byUses.names.slice(0, 3).map((n) => n.uses), [100, 60, 59]);

  for (const query of ['CRÈME', 'creme', 'Fraîche', 'ème fr']) {
    const found = await names(h.admin, `?q=${encodeURIComponent(query)}`);
    assert.deepEqual(found.names.map((n) => n.name), ['Crème fraîche'], query);
  }
  assert.equal((await names(h.admin, '?q=%25')).total, 0, 'un % est cherché tel quel');
  assert.equal((await names(h.admin, '?offset=abc')).names.length, 50, 'offset invalide : début');
});

// --- Journal, lien public ---

test('le journal note chaque correction, fusion et retrait', async (t) => {
  const h = await household(t);
  const listId = await newList(h, h.marie);
  const otherList = await newList(h, h.paul);
  await newItem(h, h.marie, listId, 'Tomatte');
  await newItem(h, h.paul, otherList, 'Tomatte');
  await newItem(h, h.marie, listId, 'Poivronn');
  await newItem(h, h.marie, listId, 'Poivron');
  await newItem(h, h.marie, listId, 'Fraises');
  await rename(h.admin, 'tomatte', 'Tomate');
  await rename(h.admin, 'poivronn', 'Poivron');
  await h.admin.post('/api/admin/names/remove', { from: 'fraises' });
  const journal = h.app.logs.join('\n');
  for (const line of [
    'admin_nom_corrige admin="admin" ancien="Tomatte" nouveau="Tomate" corrections=2 listes=2',
    'admin_nom_fusionne admin="admin" ancien="Poivronn" nouveau="Poivron" corrections=1 listes=1',
    'admin_nom_retire admin="admin" nom="Fraises"',
  ]) assert.ok(journal.includes(line), `absent du journal : ${line}\n${journal}`);
});

test('le lien public affiche le nom corrigé', async (t) => {
  const h = await household(t);
  const listId = await newList(h, h.marie);
  await newItem(h, h.marie, listId, 'Tomatte');
  const share = await h.marie.request('PUT', `/api/lists/${listId}/share`, {});
  const token = share.body.share.url.split('/p/')[1];
  await rename(h.admin, 'tomatte', 'Tomate');
  const page = await h.app.client().get(`/api/public/${token}`);
  assert.deepEqual(page.body.groups.flatMap((g) => g.items.map((i) => i.name)), ['Tomate']);
});

// --- Interface ---

test('écran : textes avec « article » (listes de courses seulement), et affichage par textContent (jamais innerHTML)', () => {
  const sub = (entry) => savedNameSub(entry).replaceAll('\u00a0', '_');
  assert.equal(sub({ aisle: 'Crèmerie', uses: 12, inLists: 3 }), 'Crèmerie · 12_utilisations · 3_articles_en_liste');
  assert.equal(sub({ aisle: null, uses: 1, inLists: 1 }), '1_utilisation · 1_article_en_liste');
  assert.equal(sub({ aisle: 'Fruits et légumes', uses: 1, inLists: 0 }), 'Fruits_et_légumes · 1_utilisation · aucun_article_en_liste');
  assert.equal(renameImpactText({ oldName: 'Tomatte', newName: 'Tomate', merge: false, items: 1, lists: 1 }),
    '« Tomatte » deviendra « Tomate ». 1 article sera corrigé, dans 1 liste de courses.');
  assert.equal(renameImpactText({ oldName: 'Tomatte', newName: 'Tomate', merge: false, items: 3, lists: 2 }),
    '« Tomatte » deviendra « Tomate ». 3 articles seront corrigés, dans 2 listes de courses.');
  assert.equal(renameImpactText({ oldName: 'Tomatte', newName: 'Tomate', merge: true, items: 0, lists: 0 }),
    '« Tomatte » sera fusionné avec « Tomate », déjà enregistré. Aucun article en liste ne porte ce nom : seules les suggestions changent.');
  assert.equal(renameDoneText({ items: 3, lists: 2 }), '3 articles corrigés, dans 2 listes de courses');
  assert.equal(renameDoneText({ items: 1, lists: 1 }), '1 article corrigé, dans 1 liste de courses');
  for (const text of [savedNameSub({ aisle: 'x', uses: 2, inLists: 2 }), renameImpactText({ oldName: 'a', newName: 'b', items: 2, lists: 2 })]) {
    assert.ok(!/élément/i.test(text), `« élément » dans un texte de courses : ${text}`);
  }
  // Le nom (texte saisi) est placé par h() de dom.js, qui crée des nœuds de texte
  for (const file of ['public/js/screens/admin.js', 'public/js/format.js', 'public/js/dom.js']) {
    const code = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(code.replace(/\/\/.*$/gm, '')), `${file} utilise innerHTML`);
  }
  const dom = fs.readFileSync(new URL('../public/js/dom.js', import.meta.url), 'utf8');
  assert.match(dom, /createTextNode|\.append\(/, 'dom.js ajoute le texte comme texte');
});
