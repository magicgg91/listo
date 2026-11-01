// Tests des fichiers partagés entre le serveur et le téléphone
// (public/js/history.js et public/js/sorting.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItemName, suggest, isKnownName, usualAisle, usualStore, recordUse, moveUse } from '../public/js/history.js';
import { groupItems, compareNames, isMultiList } from '../public/js/sorting.js';

test('nom normalisé : minuscules, sans accents ni espaces superflus', () => {
  for (const name of ['Lait', 'lait', 'LAIT', 'Lait  ', '  lait', 'Laït']) assert.equal(normalizeItemName(name), 'lait');
  assert.equal(normalizeItemName('Crème   fraîche'), 'creme fraiche');
  assert.equal(normalizeItemName('ŒUFS'), 'œufs');
  assert.equal(normalizeItemName('Pâtes fraîches'), 'pates fraiches'); // espace insécable
});

test("suggestions : dès 2 lettres, début de mot, plus fréquents puis plus récents d'abord", () => {
  const entry = (name, useCount, lastUsedAt = '2026-10-01') => ({ name, nameNormalized: normalizeItemName(name), useCount, lastUsedAt });
  const history = [entry('Lait', 3), entry('Laitue', 3, '2026-10-10'), entry('Pain au lait', 7), entry('Salade', 9)];
  assert.deepEqual(suggest(history, 'l'), []);
  assert.deepEqual(suggest(history, '  '), []);
  assert.deepEqual(suggest(history, 'la').map((e) => e.name), ['Pain au lait', 'Laitue', 'Lait']);
  assert.ok(!suggest(history, 'la').some((e) => e.name === 'Salade'), 'pas au milieu d\'un mot');
  assert.equal(suggest(history, 'la', 2).length, 2);
});

test('comparaison alphabétique française', () => {
  const sorted = ['zèbre', 'École', 'abricot', 'Été', 'eau', 'article 10', 'article 2'].sort(compareNames);
  assert.deepEqual(sorted, ['abricot', 'article 2', 'article 10', 'eau', 'École', 'Été', 'zèbre']);
});

test("groupement : rayon inconnu ou supprimé = « Sans rayon », aucun groupe vide", () => {
  const aisles = [{ id: 1, name: 'Boissons' }];
  const items = [
    { name: 'Jus', aisleId: 1, checked: false },
    { name: 'Mystère', aisleId: 42, checked: false }, // rayon qui n'existe plus
  ];
  const groups = groupItems(items, aisles, true);
  assert.deepEqual(groups.map((g) => [g.aisle?.name ?? null, g.items.map((i) => i.name)]), [['Boissons', ['Jus']], [null, ['Mystère']]]);
  assert.deepEqual(groupItems([], aisles, true), []);
  assert.deepEqual(groupItems([], aisles, false), []);
});

// --- Magasin « multi » (étape 6) ---

test('historique : une ligne générale et une ligne par magasin ; suggestions sur les lignes générales', () => {
  const history = [];
  const now = '2026-10-17T10:00:00.000Z';
  recordUse(history, { name: 'Comté', storeId: 5, count: 1, now });
  recordUse(history, { name: 'comte', storeId: 6, count: 1, now });
  recordUse(history, { name: 'COMTÉ', storeId: null, aisleId: 3, count: 1, now });
  assert.equal(history.length, 3);
  const general = history.find((e) => e.storeId === null);
  assert.deepEqual([general.name, general.useCount, general.aisleId], ['Comté', 3, 3]);
  assert.deepEqual(suggest(history, 'co').map((e) => [e.name, e.useCount]), [['Comté', 3]]);
  assert.equal(isKnownName(history, ' comté '), true);
  // « Sans rayon » n'efface pas un rayon connu ; une modification (count 0) ne compte pas
  recordUse(history, { name: 'Comté', storeId: 5, aisleId: null, count: 0, now });
  assert.deepEqual([general.useCount, general.aisleId], [3, 3]);
});

test('magasin habituel : le plus utilisé parmi les magasins proposés, le plus récent si égalité', () => {
  const line = (storeId, useCount, lastUsedAt) => ({ name: 'Œufs', nameNormalized: 'œufs', storeId, aisleId: null, useCount, lastUsedAt });
  const history = [line(null, 9, '2026-10-17'), line(1, 3, '2026-10-01'), line(2, 3, '2026-10-05'), line(3, 8, '2026-10-10')];
  assert.equal(usualStore(history, 'œufs', [1, 2]), 2, 'égalité : le plus récent');
  assert.equal(usualStore(history, 'Œufs', [1, 2, 3]), 3, 'le plus utilisé');
  assert.equal(usualStore(history, 'œufs', [1]), 1);
  assert.equal(usualStore(history, 'œufs', [4]), null, 'jamais acheté dans ces magasins');
  assert.equal(usualStore(history, 'pain', [1, 2, 3]), null);
  // Un achat reporté sur un autre magasin
  moveUse(history, { name: 'œufs', from: 3, to: 1, now: '2026-10-18' });
  assert.deepEqual(history.filter((e) => e.storeId !== null).map((e) => e.useCount), [4, 3, 7]);
  moveUse(history, { name: 'œufs', from: null, to: 9, now: '2026-10-18' });
  assert.equal(history.find((e) => e.storeId === 9).useCount, 1);
  assert.equal(history.find((e) => e.storeId === null).useCount, 9, 'la ligne générale ne bouge pas');
});

test('rayon habituel : celui du magasin, sinon le général ; un rayon désactivé est ignoré', () => {
  const history = [
    { nameNormalized: 'lait', storeId: null, aisleId: 10 },
    { nameNormalized: 'lait', storeId: 7, aisleId: 20 },
    { nameNormalized: 'lait', storeId: 8, aisleId: null },
  ];
  const all = () => true;
  assert.equal(usualAisle(history, 'Lait', 7, all), 20);
  assert.equal(usualAisle(history, 'Lait', 8, all), 10, 'magasin sans rayon connu : rayon général');
  assert.equal(usualAisle(history, 'Lait', 9, all), 10);
  assert.equal(usualAisle(history, 'Lait', null, all), 10);
  assert.equal(usualAisle(history, 'Lait', 7, (id) => id !== 20), 10, 'rayon du magasin désactivé');
  assert.equal(usualAisle(history, 'Lait', 7, () => false), null);
});

test('tri « multi » : par magasin A→Z, « Sans magasin » en dernier, cochés en bas', () => {
  const stores = [{ id: 1, name: 'Primeur' }, { id: 2, name: 'Boucherie' }, { id: 3, name: 'Leclerc' }];
  const items = [
    { name: 'Piles', checked: false, storeId: null, aisleId: 10 },
    { name: 'Citrons', checked: true, storeId: 1 },
    { name: 'Pommes', checked: false, storeId: 1 },
    { name: 'Lessive', checked: false, storeId: 3 },
    { name: 'Steak', checked: false, storeId: 2 },
    { name: 'Inconnu', checked: false, storeId: 99 },
  ];
  const groups = groupItems(items, [{ id: 10, name: 'Rayon' }], true, { byStore: true, stores });
  assert.deepEqual(groups.map((g) => g.store?.name ?? 'Sans magasin'), ['Boucherie', 'Leclerc', 'Primeur', 'Sans magasin']);
  assert.deepEqual(groups[2].items.map((i) => i.name), ['Pommes', 'Citrons']);
  assert.deepEqual(groups[3].items.map((i) => i.name), ['Inconnu', 'Piles'], 'magasin inconnu : « Sans magasin »');
  // Sans l'option, rien ne change : groupes par rayon
  assert.ok(groupItems(items, [], true).every((g) => 'aisle' in g));

  const list = (isShopping, isMulti) => ({ type: isShopping ? 'shopping' : 'tasks', store: isMulti === undefined ? null : { isMulti } });
  assert.equal(isMultiList(list(true, true)), true);
  assert.equal(isMultiList(list(true, false)), false);
  assert.equal(isMultiList(list(false, true)), false, 'une liste « multi » est une liste de courses');
  assert.equal(isMultiList(list(true)), false);
});
