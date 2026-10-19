// Tri d'une liste de courses : « Par rayon » (« Par magasin » pour une liste
// « multi »), le tri par défaut, ou « Ordre alphabétique » (à plat, sous un
// seul en-tête « À acheter »). Un réglage d'affichage propre à chaque
// téléphone : le rayon des articles ne change jamais, aucun droit n'est en
// jeu. Rendu vérifié aussi dans Chromium (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { splitDone } from '../public/js/sorting.js';
import { emptyState, computeListView, availableSorts, defaultSort, effectiveSort, loadItemSort, saveItemSort, groupKey, possibleGroupKeys } from '../public/js/store.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function shoppingState({ multi = false, readOnly = false } = {}) {
  const state = emptyState();
  state.loaded = true;
  state.aisles = [{ id: 1, name: 'Crèmerie', active: true }, { id: 2, name: 'Boulangerie', active: true }, { id: 3, name: 'Épicerie', active: true }];
  state.stores = [{ id: 10, name: 'Fromagerie', active: true }, { id: 11, name: 'Boucherie', active: true }];
  state.lists.set('c', {
    id: 'c', name: 'Courses', category: { isShopping: true },
    store: multi ? { id: 9, name: 'En ville', isMulti: true } : { id: 3, name: 'Lidl', isMulti: false },
    members: [], canEdit: !readOnly,
  });
  const items = [
    ['a', 'Zeste de citron', 3, 10], ['b', 'éclair', 2, 10], ['c2', 'Eau gazeuse', 3, 11],
    ['d', 'abricots', null, null], ['e', 'Banane', 3, 11], ['f', 'Œufs', 1, 10],
  ];
  for (const [id, name, aisleId, storeId] of items) state.items.set(id, { id, listId: 'c', name, aisleId, storeId, checked: false });
  state.items.set('g', { id: 'g', listId: 'c', name: 'Beurre', aisleId: 1, storeId: 10, checked: true, checkedAt: '2026-10-19T10:00:00Z' });
  return state;
}
const names = (group) => group.items.map((item) => item.name);

test('tris proposés : courses → « Par rayon » (par défaut) puis « Ordre alphabétique », liste « multi » comprise', () => {
  for (const multi of [false, true]) {
    const list = shoppingState({ multi }).lists.get('c');
    assert.deepEqual(availableSorts(list), ['aisle', 'alpha']);
    assert.equal(defaultSort(list), 'aisle');
    assert.equal(effectiveSort(list, null), 'aisle', 'rien de gardé');
    assert.equal(effectiveSort(list, 'priority'), 'aisle', 'priorité : jamais pour les courses');
    assert.equal(effectiveSort(list, 'alpha'), 'alpha');
  }
  const tasks = { category: { isShopping: false }, priorityEnabled: true, dueEnabled: true };
  assert.equal(defaultSort(tasks), 'alpha', 'autres listes : inchangé');
  assert.equal(effectiveSort(tasks, 'aisle'), 'alpha', 'pas de « par rayon » hors courses');
});

test('« Par rayon » : comportement d\'avant, inchangé (rayons alphabétiques, « Sans rayon » en dernier)', () => {
  const state = shoppingState();
  const view = computeListView(state, 'c');
  assert.deepEqual(view.groups.map((g) => g.aisle?.name ?? 'Sans rayon'), ['Boulangerie', 'Crèmerie', 'Épicerie', 'Sans rayon']);
  assert.deepEqual(computeListView(state, 'c', { sort: 'aisle' }), view);
  assert.deepEqual(names(view.groups[2]), ['Banane', 'Eau gazeuse', 'Zeste de citron']);
  // Liste « multi » : par magasin, comme avant
  const multi = computeListView(shoppingState({ multi: true }), 'c');
  assert.deepEqual(multi.groups.map((g) => g.store?.name ?? 'Sans magasin'), ['Boucherie', 'Fromagerie', 'Sans magasin']);
});

test('« Ordre alphabétique » : un seul groupe « À acheter », majuscules et accents ignorés ; panier inchangé', () => {
  for (const multi of [false, true]) {
    const view = computeListView(shoppingState({ multi }), 'c', { sort: 'alpha' });
    assert.equal(view.groups.length, 1);
    const [group] = view.groups;
    assert.equal(group.all, true);
    assert.equal(group.label, 'À acheter');
    assert.deepEqual(names(group), ['abricots', 'Banane', 'Eau gazeuse', 'éclair', 'Œufs', 'Zeste de citron']);
    assert.equal(group.total, 7, 'compteur X/Y : le coché compte dans le total');
    assert.deepEqual(view.done.map((item) => item.name), ['Beurre'], 'zone « Dans le panier » comme d\'habitude');
    assert.equal(groupKey(group), 'tous');
  }
  assert.ok(possibleGroupKeys(emptyState()).has('tous'), 'le repli de « À acheter » est gardé');
  // Tout coché : plus de groupe à acheter
  assert.deepEqual(splitDone([{ id: 'x', name: 'Lait', checked: true }], [], true, { sort: 'alpha' }).groups, []);
});

test('passer d\'un tri à l\'autre ne change aucun article (rayon et magasin gardés)', () => {
  const state = shoppingState();
  const before = JSON.stringify([...state.items.values()]);
  const alpha = computeListView(state, 'c', { sort: 'alpha' });
  assert.deepEqual(alpha.groups[0].items.map((item) => [item.name, item.aisleId]).sort(), [
    ['abricots', null], ['Banane', 3], ['Eau gazeuse', 3], ['Œufs', 1], ['Zeste de citron', 3], ['éclair', 2],
  ].sort());
  const back = computeListView(state, 'c', { sort: 'aisle' });
  assert.deepEqual(back.groups.map((g) => g.aisle?.name ?? 'Sans rayon'), ['Boulangerie', 'Crèmerie', 'Épicerie', 'Sans rayon']);
  assert.equal(JSON.stringify([...state.items.values()]), before, 'copie locale intacte');
});

test('tri propre à chaque téléphone (localStorage) ; aucun droit en jeu, lecture seule comprise', () => {
  const phone = () => {
    const memory = new Map();
    return () => ({ getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)) });
  };
  const a = phone();
  const b = phone();
  saveItemSort('c', 'alpha', a);
  assert.equal(loadItemSort('c', a), 'alpha');
  assert.equal(loadItemSort('c', b), null, 'l\'autre personne garde le tri par rayon');
  // Invité en lecture seule : les mêmes choix
  assert.deepEqual(availableSorts(shoppingState({ readOnly: true }).lists.get('c')), ['aisle', 'alpha']);
  const list = read('public/js/screens/list.js');
  assert.match(list, /sortButton\.hidden = availableSorts\(list\)\.length < 2;/, 'le bouton ne dépend pas du droit');
  // Le choix ne part jamais vers le serveur : ni opération, ni requête
  const menu = list.slice(list.indexOf('function openSortMenu()'), list.indexOf('let view = null;'));
  assert.doesNotMatch(menu, /actions\.|post\(|api/);
});

test('écran : « Par rayon » / « Par magasin » (liste « multi ») et en-tête « À acheter »', () => {
  const list = read('public/js/screens/list.js');
  assert.match(list, /\['aisle', 'layers', 'Par rayon', 'Tri : par rayon'\],/);
  assert.match(list, /value === 'aisle' && isMultiList\(currentList\(\)\)\s*\? \[value, 'store', 'Par magasin', 'Tri : par magasin'\]/);
  assert.match(list, /group\.all \? foldableGroup\(list, group, group\.label\)/);
  // Le choix gardé n'est jamais effacé ; un tri indisponible laisse place au tri par défaut
  assert.match(read('public/js/store.js'), /return availableSorts\(list\)\.includes\(wanted\) \? wanted : defaultSort\(list\);/);
});

test('lien public : toujours par rayon (aucun tri envoyé), réponse inchangée', () => {
  const pub = read('server/routes/public.js');
  assert.match(pub, /splitDone\(items, q\.allAisles\.all\(\), isShopping, \{ byStore, stores: q\.allStores\.all\(\) \}\)/);
  assert.doesNotMatch(pub, /sort:/);
});
