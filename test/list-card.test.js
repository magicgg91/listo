// Carte compacte de « Mes listes » et compteur « X/Y » (restants / total) :
// sur chaque carte et dans l'en-tête de chaque groupe d'une liste. X : non
// cochés ; Y : non supprimés, cochés compris. Calcul vérifié à partir de
// vraies données du serveur ; rendu vérifié aussi dans Chromium, en clair et
// en sombre (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin } from './helpers.js';
import { emptyState, loadSync, computeSummaries, computeListView } from '../public/js/store.js';
import { splitDone } from '../public/js/sorting.js';
import { progressText, progressLabel } from '../public/js/words.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// Rayons de départ (migration 2) : on prend les deux premiers par identifiant
async function shoppingList(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const [a, b] = app.db.prepare('SELECT id, name FROM aisles ORDER BY id LIMIT 2').all();
  const listId = uuid();
  const id = {};
  for (const name of ['lait', 'beurre', 'yaourt', 'creme', 'vieux', 'sel', 'pain']) id[name] = uuid();
  const res = await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId, name: 'Courses', categoryId: 1 },
    // Rayon A : trois à acheter, un coché, un supprimé
    { id: uuid(), type: 'item.create', listId, itemId: id.lait, name: 'Lait', aisleId: a.id },
    { id: uuid(), type: 'item.create', listId, itemId: id.beurre, name: 'Beurre', aisleId: a.id },
    { id: uuid(), type: 'item.create', listId, itemId: id.yaourt, name: 'Yaourt', aisleId: a.id },
    { id: uuid(), type: 'item.create', listId, itemId: id.creme, name: 'Crème', aisleId: a.id },
    { id: uuid(), type: 'item.check', itemId: id.creme, checked: true },
    { id: uuid(), type: 'item.create', listId, itemId: id.vieux, name: 'Vieux', aisleId: a.id },
    { id: uuid(), type: 'item.delete', itemId: id.vieux },
    // Sans rayon : un à acheter
    { id: uuid(), type: 'item.create', listId, itemId: id.sel, name: 'Sel', aisleId: null },
    // Rayon B : tout coché (le rayon quitte la partie « à acheter »)
    { id: uuid(), type: 'item.create', listId, itemId: id.pain, name: 'Pain', aisleId: b.id },
    { id: uuid(), type: 'item.check', itemId: id.pain, checked: true },
  ] });
  assert.ok(res.body.results.every((r) => r.status === 200), JSON.stringify(res.body));
  const state = loadSync(emptyState(), (await guillaume.get('/api/sync')).body);
  return { app, guillaume, state, listId, a, b };
}

test('carte : X = restants, Y = non supprimés cochés compris ; liste vide ; tout coché', async (t) => {
  const h = await shoppingList(t);
  const card = computeSummaries(h.state).find((l) => l.id === h.listId);
  assert.deepEqual([card.remaining, card.total], [4, 6], 'supprimé exclu, cochés comptés dans Y');
  assert.equal(progressText(card.remaining, card.total), '4/6');
  assert.equal(progressLabel(card.remaining, card.total, card), '4 articles restants sur 6');
  // Tout coché : « 0/Y »
  const empty = uuid();
  await h.guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: empty, name: 'Vide', categoryId: 2 },
  ] });
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'list.uncheckAll', listId: h.listId }] });
  const all = h.app.db.prepare('SELECT id FROM items WHERE list_id = ? AND deleted_at IS NULL').pluck().all(h.listId);
  await h.guillaume.post('/api/ops', { ops: all.map((itemId) => ({ id: uuid(), type: 'item.check', itemId, checked: true })) });
  const state = loadSync(emptyState(), (await h.guillaume.get('/api/sync')).body);
  const done = computeSummaries(state).find((l) => l.id === h.listId);
  assert.deepEqual([done.remaining, done.total], [0, 6]);
  assert.equal(progressText(0, 6), '0/6');
  assert.equal(progressLabel(0, 6, done), '0 article restant sur 6');
  const blank = computeSummaries(state).find((l) => l.id === empty);
  assert.equal(blank.total, 0);
  assert.equal(progressLabel(1, 4, false), '1 élément restant sur 4');
  assert.equal(progressLabel(3, 8, false), '3 éléments restants sur 8');
  // Affichage : « Liste vide », « 0/Y » avec la coche (jamais la couleur seule)
  const lists = read('public/js/screens/lists.js');
  assert.match(lists, /if \(list\.total === 0\) return h\('p', \{ class: 'list-card__count' \}, 'Liste vide'\);/);
  assert.match(lists, /progressText\(list\.remaining, list\.total\)\), done \? icon\('check', 'icon--sm'\) : null\);/);
  assert.match(lists, /role: 'img',\s*'aria-label': label,\s*title: label,/);
  assert.match(read('public/css/app.css'), /\.list-card__count--progress \{[^}]*font-variant-numeric: tabular-nums;/);
});

test('groupes : « X/Y » par rayon (cochés du rayon comptés, supprimés exclus) ; rayon tout coché absent', async (t) => {
  const h = await shoppingList(t);
  const view = computeListView(h.state, h.listId);
  const groups = view.groups.map((g) => [g.aisle?.name ?? 'Sans rayon', progressText(g.items.length, g.total)]);
  assert.deepEqual(groups, [[h.a.name, '3/4'], ['Sans rayon', '1/1']]);
  assert.equal(view.done.length, 2);
});

test('groupes : par priorité et par magasin « multi », même règle', () => {
  const items = [
    { id: 1, name: 'A', priority: 'high', checked: false },
    { id: 2, name: 'B', priority: 'high', checked: true },
    { id: 3, name: 'C', priority: 'low', checked: false },
    { id: 4, name: 'D', priority: 'normal', checked: true },
  ];
  const { groups } = splitDone(items, [], false, { sort: 'priority' });
  assert.deepEqual(groups.map((g) => [g.priority, progressText(g.items.length, g.total)]), [['high', '1/2'], ['low', '1/1']]);
  // Échéance ou ordre alphabétique : un seul groupe, sans en-tête
  assert.equal(splitDone(items, [], false, { sort: 'due' }).groups[0].total, 4);
  // Magasins d'une liste « multi »
  const stores = [{ id: 1, name: 'Leclerc' }, { id: 2, name: 'Lidl' }];
  const shop = [
    { id: 1, name: 'Lait', storeId: 1, checked: false },
    { id: 2, name: 'Pain', storeId: 1, checked: true },
    { id: 3, name: 'Riz', storeId: 2, checked: false },
    { id: 4, name: 'Sel', storeId: null, checked: true },
  ];
  const multi = splitDone(shop, [], true, { byStore: true, stores });
  assert.deepEqual(multi.groups.map((g) => [g.store?.name ?? 'Sans magasin', progressText(g.items.length, g.total)]), [['Leclerc', '1/2'], ['Lidl', '1/1']]);
});

test('en-tête de groupe : « X/Y » à la place de « · 3 à acheter », anciens textes retirés', () => {
  const list = read('public/js/screens/list.js');
  assert.match(list, /const total = group\.total \?\? remaining;/);
  assert.match(list, /title: progressLabel\(remaining, total, list\),/);
  assert.doesNotMatch(list, /aisle__rest|remainingWords/);
  for (const file of ['public/js/words.js', 'public/js/format.js', 'public/js/screens/lists.js', 'public/js/screens/list.js']) {
    const source = read(file).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(source, /articles restants|élément restant|éléments restants|'à acheter'|à acheter' :|remainingLabel|Tout est coché'/, file);
  }
});

test('carte compacte : ni catégorie ni magasin ; badge « Multi » ; lien public collé aux pastilles, absent sans lien', () => {
  const lists = read('public/js/screens/lists.js');
  const card = lists.slice(lists.indexOf('function cardLink('), lists.indexOf('export function cardCount('));
  // Ni catégorie ni magasin sur la carte
  assert.doesNotMatch(card, /category\.name|store\.name|list-card__meta|icon\('store'/);
  // Ligne 1 : icône, titre, heure (le bouton ⋮ est posé à côté, voir listCard)
  assert.match(card, /h\('div', \{ class: 'list-card__head' \},\s*h\('span', \{ class: 'list-card__icon' \}, icon\(listIcon\(list\), 'icon--sm'\)\),\s*h\('h2', \{ class: 'list-card__name' \}, list\.name\),\s*h\('span', \{ class: 'list-card__time' \}, relativeTime\(list\.lastActivity\)\)\),/);
  // Ligne 2 à gauche : compteur, puis « Multi » quand il y a lieu
  assert.match(card, /h\('div', \{ class: 'list-card__left' \},\s*cardCount\(list\),\s*list\.store\?\.isMulti && list\.category\.isShopping \? multiBadge\(\) : null,/);
  // Ligne 2 à droite : le lien public juste avant les pastilles, seulement s'il y en a un
  assert.match(card, /h\('div', \{ class: 'list-card__people' \},\s*\/\/[^\n]*\n\s*hasPublicLink\(list\) \? h\('span', \{ class: 'list-card__link', role: 'img', 'aria-label': 'Lien public actif', title: 'Lien public actif' \}, icon\('link', 'icon--xs'\)\) : null,\s*h\('div', \{ class: 'avatars'/);
  assert.equal((card.match(/icon\('link'/g) ?? []).length, 1, 'le symbole du lien n\'apparaît qu\'une fois');
  // Deux lignes au plus (trois si le titre passe sur deux lignes)
  assert.equal((card.match(/class: 'list-card__(head|foot)'/g) ?? []).length, 2);
  const css = read('public/css/app.css');
  assert.match(css, /\.list-card__people \{ display: flex; flex: none; align-items: center; gap: 6px; \}/);
  assert.match(css, /\.list-card__head \.list-card__name \{[^}]*-webkit-line-clamp: 2;[^}]*\}/, 'titre : deux lignes au plus');
});
