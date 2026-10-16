// Tests des fichiers partagés entre le serveur et le téléphone
// (public/js/history.js et public/js/sorting.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItemName, suggest } from '../public/js/history.js';
import { groupItems, compareNames } from '../public/js/sorting.js';

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
