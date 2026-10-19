// Tri d'une liste autre que les courses : ordre alphabétique (identique à
// l'ordre d'origine), par priorité (groupes avec en-tête), par échéance ;
// éléments cochés hors tri ; choix gardé par liste sur le téléphone. Les
// listes de courses gardent leur tri par rayons.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sortTasks, groupItems, splitDone, compareNames } from '../public/js/sorting.js';
import { emptyState, computeListView, loadItemSort, saveItemSort, pruneItemSorts, itemSortFrom } from '../public/js/store.js';

const item = (name, priority = 'normal', dueDate = null, extra = {}) => ({ id: name, name, priority, dueDate, checked: false, ...extra });
const names = (groups) => groups.flatMap((group) => group.items.map((i) => i.name));

const ITEMS = [
  item('Étape 10', 'normal', '2026-10-30'), item('étape 2', 'high'), item('Zinc', 'low', '2026-10-20'),
  item('arroser', 'high', '2026-10-24'), item('Banque', 'normal', '2026-10-24'), item('Écrire', 'low'),
  item('colis', 'high', '2026-10-20'), item('Agenda', 'normal'), item('vieux', 'low', '2026-09-01'),
];

test('ordre alphabétique : strictement l\'ordre d\'origine (accents, majuscules, chiffres)', () => {
  assert.deepEqual(sortTasks(ITEMS, 'alpha'), groupItems(ITEMS, [], false));
  assert.deepEqual(names(sortTasks(ITEMS, 'alpha')), ['Agenda', 'arroser', 'Banque', 'colis', 'Écrire', 'étape 2', 'Étape 10', 'vieux', 'Zinc']);
  // Sur des noms au hasard aussi
  const random = Array.from({ length: 200 }, (_, i) => item(`${['é', 'E', 'e', 'Z', 'a', 'À'][i % 6]}lément ${i % 37}`));
  assert.deepEqual(sortTasks(random, 'alpha'), groupItems(random, [], false));
  assert.deepEqual(sortTasks([], 'alpha'), []);
});

test('par priorité : groupes élevée, normale, basse avec en-tête, alphabétique dans chaque groupe, groupe vide absent', () => {
  const groups = sortTasks(ITEMS, 'priority');
  assert.deepEqual(groups.map((g) => g.label), ['Priorité élevée', 'Priorité normale', 'Priorité basse']);
  assert.deepEqual(groups.map((g) => g.items.map((i) => i.name)), [
    ['arroser', 'colis', 'étape 2'], ['Agenda', 'Banque', 'Étape 10'], ['Écrire', 'vieux', 'Zinc'],
  ]);
  const noLow = sortTasks(ITEMS.filter((i) => i.priority !== 'low'), 'priority');
  assert.deepEqual(noLow.map((g) => g.label), ['Priorité élevée', 'Priorité normale']);
  // Priorité absente (ancienne copie du téléphone) : normale
  assert.deepEqual(sortTasks([{ id: 'x', name: 'Ancien', checked: false }], 'priority').map((g) => g.label), ['Priorité normale']);
});

test('par échéance : passées d\'abord, sans échéance à la fin ; à date égale, priorité puis alphabétique', () => {
  const groups = sortTasks(ITEMS, 'due');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, undefined, 'sans regroupement ni en-tête');
  assert.deepEqual(names(groups), ['vieux', 'colis', 'Zinc', 'arroser', 'Banque', 'Étape 10', 'étape 2', 'Agenda', 'Écrire']);
});

test('éléments cochés : hors tri, dans leur zone ; décochés, ils reprennent leur place triée', () => {
  const items = [...ITEMS, item('Aaa coché', 'high', '2026-01-01', { checked: true, checkedAt: '2026-10-18T10:00:00Z' })];
  for (const sort of ['alpha', 'priority', 'due']) {
    const { groups, done } = splitDone(items, [], false, { sort });
    assert.equal(names(groups).includes('Aaa coché'), false, sort);
    assert.deepEqual(done.map((i) => i.name), ['Aaa coché']);
  }
  const back = items.map((i) => (i.name === 'Aaa coché' ? { ...i, checked: false } : i));
  assert.equal(names(splitDone(back, [], false, { sort: 'due' }).groups)[0], 'Aaa coché', 'en retard : en tête');
  assert.deepEqual(splitDone(back, [], false, { sort: 'priority' }).groups[0].items[0].name, 'Aaa coché');
});

test('liste de courses : par rayons par défaut ; priorité et échéance n\'y sont pas proposées', () => {
  const state = emptyState();
  state.loaded = true;
  state.aisles = [{ id: 1, name: 'Crèmerie', active: true }, { id: 2, name: 'Boulangerie', active: true }];
  state.lists.set('c', { id: 'c', name: 'Courses', category: { isShopping: true }, store: null, members: [] });
  state.items.set('a', { id: 'a', listId: 'c', name: 'Lait', aisleId: 1, checked: false, priority: 'low' });
  state.items.set('b', { id: 'b', listId: 'c', name: 'Pain', aisleId: 2, checked: false, priority: 'high', dueDate: '2026-01-01' });
  const plain = computeListView(state, 'c');
  for (const sort of ['priority', 'due', 'aisle', null, 'n\'importe quoi']) assert.deepEqual(computeListView(state, 'c', { sort }), plain, sort);
  assert.deepEqual(plain.groups.map((g) => g.aisle.name), ['Boulangerie', 'Crèmerie']);
});

test('choix gardé par liste (listo-tri-liste-<id>) ; rien ou valeur invalide → tri par défaut de la liste ; ménage des listes disparues', () => {
  const memory = new Map();
  const storage = () => ({
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
    key: (i) => [...memory.keys()][i] ?? null,
    get length() { return memory.size; },
  });
  assert.equal(loadItemSort('l1', storage), null, 'rien de gardé : tri par défaut de la liste');
  saveItemSort('l1', 'priority', storage);
  saveItemSort('l2', 'due', storage);
  assert.deepEqual([loadItemSort('l1', storage), loadItemSort('l2', storage)], ['priority', 'due'], 'chaque liste son tri');
  assert.equal(memory.get('listo-tri-liste-l1'), 'priority');
  memory.set('listo-tri-liste-l1', 'date');
  assert.equal(loadItemSort('l1', storage), null);
  for (const bad of [null, '', 'ALPHA', 'recent', 42]) assert.equal(itemSortFrom(bad), null);
  saveItemSort('l3', 'bidon', storage);
  assert.equal(memory.has('listo-tri-liste-l3'), false, 'une valeur invalide n\'est jamais écrite');
  saveItemSort('l3', 'aisle', storage);
  assert.equal(loadItemSort('l3', storage), 'aisle');
  memory.delete('listo-tri-liste-l3');
  memory.set('listo-tri-listes', 'alpha'); // tri de « Mes listes » : jamais touché
  pruneItemSorts(['l2'], storage);
  assert.deepEqual([...memory.keys()].sort(), ['listo-tri-liste-l2', 'listo-tri-listes']);
  const broken = () => { throw new Error('refusé'); };
  assert.equal(loadItemSort('l1', broken), null);
  assert.doesNotThrow(() => saveItemSort('l1', 'due', broken));
  assert.doesNotThrow(() => pruneItemSorts([], broken));
});

test('écran d\'une liste : bouton « Trier la liste » dès qu\'il y a un choix (toujours pour les courses), choix exclusif coché', () => {
  const source = fs.readFileSync(new URL('../public/js/screens/list.js', import.meta.url), 'utf8');
  assert.match(source, /iconButton\('az', 'Trier la liste', \(\) => openSortMenu\(\)\)/);
  // Courses : toujours (par rayon / alphabétique) ; ailleurs : seulement s'il y a un choix
  assert.match(source, /sortButton\.hidden = availableSorts\(list\)\.length < 2;/);
  assert.match(source, /checked: value === activeSort\(\),/);
  assert.match(source, /toast\(message, \{ duration: 2000 \}\)/);
  const ui = fs.readFileSync(new URL('../public/js/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /role: item\.checked === undefined \? 'menuitem' : 'menuitemradio'/);
  assert.equal(compareNames('a', 'B') < 0, true);
});
