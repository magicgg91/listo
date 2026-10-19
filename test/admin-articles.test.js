// Administration, onglet « Articles » (appelé « Noms » avant le 19 octobre
// 2026) : la mémoire des noms d'articles de courses. Seul le libellé change ;
// les routes gardent leur nom (/api/admin/names…). Nouveau : changer le
// rayon habituel d'un article (POST /api/admin/names/aisle).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { itemWords } from '../public/js/words.js';
import { usualAisle } from '../public/js/history.js';

const uuid = () => crypto.randomUUID();

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Code sans les commentaires de fin de ligne
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

test('libellé : onglet « Articles », plus aucun « Noms » à l\'écran', () => {
  const admin = code('public/js/screens/admin.js');
  // L'onglet : le mot des listes de courses, avec une majuscule
  assert.match(admin, /\{ key: 'noms', label: ITEM\.many\.charAt\(0\)\.toUpperCase\(\) \+ ITEM\.many\.slice\(1\) \}/);
  const many = itemWords(true).many;
  assert.equal(many.charAt(0).toUpperCase() + many.slice(1), 'Articles');
  // Ni « Noms », ni « Noms enregistrés », ni « un nom » comme désignation d'une entrée
  assert.doesNotMatch(admin, /Noms|Rechercher un nom|Aucun nom/);
  assert.match(admin, /placeholder: `Rechercher un \$\{ITEM\.one\}`, 'aria-label': `Rechercher un \$\{ITEM\.one\}`/);
  assert.match(admin, /`Aucun \$\{ITEM\.one\} ne correspond à cette recherche\.` : `Aucun \$\{ITEM\.one\} enregistré pour le moment\.`/);
  assert.match(admin, /h\('p', \{ class: 'section-title' \}, countItems\(page\.total, true\)\)/);
  // Message d'une entrée qui n'existe plus
  assert.match(read('server/routes/admin-names.js'), /const NOT_FOUND = 'Cet article n\\'est plus enregistré \(déjà corrigé ou retiré \?\)\.';/);
  // Les routes ne changent pas
  assert.match(admin, /get\(`\/api\/admin\/names\?\$\{params\}`\)/);
  // Documentation : le nouveau libellé
  assert.match(read('docs/exploitation.md'), /onglet \*\*Courses\*\* → \*\*Articles\*\*/);
  assert.doesNotMatch(read('docs/exploitation.md'), /onglet \*\*Noms\*\*/);
});

// --- Rayon habituel ---

// Admin et Marie ; Marie a une liste de courses au Lidl et une à Leclerc,
// avec « Lait » (Crèmerie) dans les deux, et « Pain » (Boulangerie)
async function household(t) {
  const app = await startTestApp(t);
  const admin = await setupAdmin(app, { username: 'admin' });
  await addUser(app.db, { username: 'marie', password: 'MotDePasse-marie' });
  const marie = app.client();
  await login(marie, 'marie', 'MotDePasse-marie');
  const ref = (table, name) => app.db.prepare(`SELECT id FROM ${table} WHERE name = ?`).pluck().get(name);
  // Magasins et rayons des données de départ
  const [leclerc, lidl] = [ref('stores', 'E.Leclerc'), ref('stores', 'Lidl')];
  const [creme, boulangerie] = [ref('aisles', 'Crèmerie'), ref('aisles', 'Boulangerie')];
  assert.ok(leclerc && lidl && creme && boulangerie);
  const lists = [uuid(), uuid()];
  const ops = [
    { type: 'list.create', listId: lists[0], name: 'Liste secrète de Marie', categoryId: ref('categories', 'Courses'), storeId: lidl },
    { type: 'list.create', listId: lists[1], name: 'Courses Leclerc', categoryId: ref('categories', 'Courses'), storeId: leclerc },
    { type: 'item.create', listId: lists[0], itemId: uuid(), name: 'Lait', aisleId: creme },
    { type: 'item.create', listId: lists[1], itemId: uuid(), name: 'Lait', aisleId: creme },
    { type: 'item.create', listId: lists[1], itemId: uuid(), name: 'Pain', aisleId: boulangerie },
  ];
  const res = await marie.post('/api/ops', { ops: ops.map((op) => ({ id: uuid(), ...op })) });
  assert.ok(res.body.results.every((r) => r.status === 200), JSON.stringify(res.body));
  const history = (key) => app.db.prepare('SELECT store_id, aisle_id FROM item_history WHERE name_normalized = ? ORDER BY IFNULL(store_id, 0)').all(key);
  const items = () => JSON.stringify(app.db.prepare('SELECT * FROM items ORDER BY id').all());
  const setAisle = (client, from, aisleId) => client.post('/api/admin/names/aisle', { from, aisleId });
  return { app, admin, marie, ref, leclerc, lidl, creme, boulangerie, lists, history, items, setAisle };
}

test('rayon habituel : Admin seulement (403 pour un autre compte, 401 sans connexion)', async (t) => {
  const h = await household(t);
  const before = JSON.stringify(h.history('lait'));
  const fruits = h.ref('aisles', 'Fruits et légumes');
  assert.equal((await h.setAisle(h.marie, 'lait', fruits)).status, 403);
  assert.equal((await h.setAisle(h.app.client(), 'lait', fruits)).status, 401);
  assert.equal(JSON.stringify(h.history('lait')), before);
});

test('rayon habituel : toutes les lignes du nom (générale et par magasin), aucune autre ; les listes ne changent pas', async (t) => {
  const h = await household(t);
  // Avant : trois lignes pour « lait » (générale, Lidl, Leclerc), toutes en Crèmerie
  assert.deepEqual(h.history('lait').map((l) => l.aisle_id), [h.creme, h.creme, h.creme]);
  const items = h.items();
  const pain = JSON.stringify(h.history('pain'));
  const fruits = h.ref('aisles', 'Fruits et légumes');
  const res = await h.setAisle(h.admin, 'lait', fruits);
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.body, { aisleId: fruits, aisle: 'Fruits et légumes' });
  assert.deepEqual(h.history('lait').map((l) => [l.store_id, l.aisle_id]), [[null, fruits], [h.lidl, fruits], [h.leclerc, fruits]].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0)));
  assert.equal(JSON.stringify(h.history('pain')), pain, 'les autres noms ne changent pas');
  assert.equal(h.items(), items, 'les articles déjà dans les listes gardent leur rayon (et leur date)');
  // Le rayon proposé ensuite, quel que soit le magasin
  const sync = (await h.marie.get('/api/sync')).body;
  for (const store of [null, h.lidl, h.leclerc]) assert.equal(usualAisle(sync.history, 'Lait', store, () => true), fruits);
  // Dans la liste de l'onglet
  const row = (await h.admin.get('/api/admin/names?q=lait')).body.names[0];
  assert.deepEqual([row.aisleId, row.aisle], [fruits, 'Fruits et légumes']);
});

test('« Aucun rayon » efface le rayon habituel de toutes les lignes', async (t) => {
  const h = await household(t);
  const res = await h.setAisle(h.admin, 'lait', null);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { aisleId: null, aisle: null });
  assert.deepEqual(h.history('lait').map((l) => l.aisle_id), [null, null, null]);
  assert.equal((await h.admin.get('/api/admin/names?q=lait')).body.names[0].aisle, null);
});

test('rayon inexistant, désactivé ou mal écrit : refusé (400), rien ne change ; nom disparu : message habituel (404)', async (t) => {
  const h = await household(t);
  const before = JSON.stringify(h.history('lait'));
  const off = (await h.admin.post('/api/admin/aisles', { name: 'Ancien rayon' })).body.item.id;
  assert.equal((await h.admin.request('PATCH', `/api/admin/aisles/${off}`, { active: false })).status, 200);
  for (const bad of [999999, off, String(h.creme), 1.5, -1, 0, true, [h.creme], { id: h.creme }, undefined]) {
    const res = await h.admin.post('/api/admin/names/aisle', { from: 'lait', ...(bad === undefined ? {} : { aisleId: bad }) });
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.equal(res.body.error, 'Rayon inconnu ou désactivé.');
  }
  assert.equal(JSON.stringify(h.history('lait')), before);
  // Nom qui n'est plus enregistré (retiré entre-temps), ou mal formé
  await h.admin.post('/api/admin/names/remove', { from: 'pain' });
  for (const from of ['pain', '', 'x'.repeat(201), 42, null]) {
    const res = await h.setAisle(h.admin, from, h.creme);
    assert.equal(res.status, 404, String(from));
    assert.equal(res.body.error, 'Cet article n\'est plus enregistré (déjà corrigé ou retiré ?).');
  }
});

test('journal « nom_rayon_modifie » : le compte, l\'article et le rayon, jamais une liste ; téléphones prévenus', async (t) => {
  const h = await household(t);
  let refs = 0;
  const notify = h.app.ctx.events.notifyReferences.bind(h.app.ctx.events);
  h.app.ctx.events.notifyReferences = () => {
    refs++;
    return notify();
  };
  // L'horloge du test avance : « depuis » vient après la création des articles
  h.app.clock.now += 1000;
  const since = (await h.marie.get('/api/sync')).body.serverTime;
  h.app.clock.now += 1000;
  await h.setAisle(h.admin, 'lait', h.boulangerie);
  assert.equal(refs, 1, '« event: refs » : les téléphones connectés relisent la mémoire');
  const entry = h.app.logs.find((line) => line.includes('nom_rayon_modifie'));
  assert.ok(entry, 'action inscrite au journal');
  assert.match(entry, /admin/);
  assert.match(entry, /Lait/);
  assert.match(entry, /Boulangerie/);
  for (const secret of ['Liste secrète', 'Courses Leclerc', ...h.lists, 'marie']) assert.ok(!entry.includes(secret), `journal : « ${secret} »`);
  // Synchronisation « depuis » : les lignes du nom reviennent avec le nouveau rayon
  const changes = (await h.marie.get(`/api/sync?since=${encodeURIComponent(since)}`)).body;
  const lines = changes.history.filter((l) => l.nameNormalized === 'lait');
  assert.equal(lines.length, 3);
  assert.ok(lines.every((l) => l.aisleId === h.boulangerie));
  assert.equal(changes.items.length, 0, 'aucun article renvoyé : aucune liste n\'a changé');
  // L'Admin ne voit toujours ni listes ni personnes
  const text = JSON.stringify((await h.admin.get('/api/admin/names')).body);
  for (const secret of ['Liste secrète', 'Courses Leclerc', 'marie']) assert.ok(!text.includes(secret));
});

test('écran : « Modifier le rayon » à côté de « Corriger » et « Retirer », feuille de choix sans champ de saisie', () => {
  const admin = code('public/js/screens/admin.js');
  assert.match(admin, /iconButton\('pencil', `Corriger \$\{entry\.name\}`, showEdit\),\s*iconButton\('store', `Modifier le rayon de \$\{entry\.name\}`, \(\) => chooseAisle\(entry, reload\)\),\s*iconButton\('trash',/);
  const sheet = admin.slice(admin.indexOf('function chooseAisle('), admin.indexOf('async function removeName('));
  assert.match(sheet, /activeOnly\(app\.data\.aisles\)/);
  assert.match(sheet, /\{ id: null, name: 'Aucun rayon' \}/);
  assert.match(sheet, /h\('button', \{ class: 'radio-row', type: 'button', role: 'radio', 'aria-checked': 'false' \}/);
  assert.match(sheet, /if \(on\) row\.append\(icon\('check', 'icon-end'\)\);/);
  assert.match(sheet, /h\('div', \{ role: 'radiogroup', 'aria-label': 'Rayon' \}, rows\)/);
  assert.match(sheet, /post\('\/api\/admin\/names\/aisle', \{ from: entry\.key, aisleId: selected \}\)/);
  assert.doesNotMatch(sheet, /h\('input'|\.focus\(|openCreateReference|innerHTML/);
});

test('onglets de l\'Administration : la barre défile de côté au lieu de déborder, l\'onglet actif ramené en vue', () => {
  const css = read('public/css/app.css');
  assert.match(css, /\.tabs \{ overflow-x: auto; scrollbar-width: none; \}/);
  assert.match(css, /\.tab \{ flex: 1 0 auto; white-space: nowrap; \}/);
  assert.match(code('public/js/screens/admin.js'), /requestAnimationFrame\(\(\) => tabs\.querySelector\('\[aria-selected="true"\]'\)\?\.scrollIntoView\(\{ block: 'nearest', inline: 'nearest' \}\)\);/);
});
