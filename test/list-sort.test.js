// Tri de l'écran « Mes listes » : ordre alphabétique ou plus récentes
// d'abord, choix gardé sur ce téléphone. À l'intérieur d'une liste, rien ne
// change. (Bouton, toast, clavier et synchronisation en direct : vérifiés
// dans un vrai navigateur.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  emptyState, computeSummaries, computeListView, sortSummaries, listSortFrom, loadListSort, saveListSort,
  DEFAULT_LIST_SORT, LIST_SORT_KEY,
} from '../public/js/store.js';
import { listSortButton } from '../public/js/format.js';

const category = { id: 1, name: 'Courses', isShopping: true };
const at = (minute) => `2026-10-18T10:${String(minute).padStart(2, '0')}:00.000Z`;
function state(lists, items = []) {
  const s = emptyState();
  s.loaded = true;
  for (const l of lists) s.lists.set(l.id, { category, members: [], ...l });
  for (const i of items) s.items.set(i.id, { checked: false, aisleId: null, ...i });
  return s;
}
const names = (lists) => lists.map((l) => l.name);

test('ordre alphabétique : sans tenir compte des majuscules ni des accents, nombres dans l\'ordre naturel', () => {
  const lists = ['Liste 10', 'écoles', 'Zoo', 'Liste 2', 'apéro', 'Été', 'courses', 'Bricolage', 'Liste 1'].map((name, i) => ({ id: `l${i}`, name, updatedAt: at(i) }));
  assert.deepEqual(names(computeSummaries(state(lists), { sort: 'alpha' })),
    ['apéro', 'Bricolage', 'courses', 'écoles', 'Été', 'Liste 1', 'Liste 2', 'Liste 10', 'Zoo']);
  // Même nom à la casse près : la plus récente d'abord
  const twins = [{ id: 'a', name: 'courses', updatedAt: at(1), lastActivity: at(1) }, { id: 'b', name: 'Courses', updatedAt: at(5), lastActivity: at(5) }];
  assert.deepEqual(sortSummaries(twins, 'alpha').map((l) => l.id), ['b', 'a']);
});

test('plus récentes d\'abord : dernière activité (liste ou élément), égalité → ordre alphabétique', () => {
  const lists = [
    { id: 'a', name: 'Bricolage', updatedAt: at(1) },
    { id: 'b', name: 'Apéro', updatedAt: at(2) },
    { id: 'c', name: 'Courses', updatedAt: at(3) },
    { id: 'd', name: 'Anniversaire', updatedAt: at(3) },          // égalité avec Courses
    { id: 'e', name: 'Maison', updatedAt: at(0), lastActivity: at(9) }, // activité donnée par le serveur (élément supprimé…)
  ];
  const items = [{ id: 'i1', listId: 'a', name: 'Vis', updatedAt: at(7) }]; // élément ajouté, modifié ou coché
  assert.deepEqual(names(computeSummaries(state(lists, items), { sort: 'recent' })), ['Maison', 'Bricolage', 'Anniversaire', 'Courses', 'Apéro']);
});

test('par défaut : le tri d\'origine (plus récentes d\'abord) ; valeur inconnue → défaut', () => {
  assert.equal(DEFAULT_LIST_SORT, 'recent');
  const s = state([{ id: 'a', name: 'Ancienne', updatedAt: at(1) }, { id: 'b', name: 'Zut récente', updatedAt: at(2) }]);
  assert.deepEqual(names(computeSummaries(s)), ['Zut récente', 'Ancienne']);
  for (const bad of [null, undefined, '', 'ALPHA', 'date', '{"x":1}', 42]) {
    assert.equal(listSortFrom(bad), 'recent', String(bad));
    assert.deepEqual(names(computeSummaries(s, { sort: bad })), ['Zut récente', 'Ancienne']);
  }
});

test('choix gardé sur le téléphone (clé listo-tri-listes), relu après rechargement ; stockage en panne → défaut', () => {
  const memory = new Map();
  const storage = () => ({ getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)) });
  assert.equal(loadListSort(storage), 'recent');
  saveListSort('alpha', storage);
  assert.equal(LIST_SORT_KEY, 'listo-tri-listes');
  assert.equal(memory.get('listo-tri-listes'), 'alpha');
  assert.equal(loadListSort(storage), 'alpha', 'relu comme après un rechargement');
  memory.set('listo-tri-listes', 'nimporte quoi');
  assert.equal(loadListSort(storage), 'recent');
  const broken = () => { throw new Error('stockage refusé'); };
  assert.equal(loadListSort(broken), 'recent');
  assert.doesNotThrow(() => saveListSort('alpha', broken));
});

test('bouton : icône du tri actif et libellé qui dit l\'effet d\'un appui', () => {
  assert.deepEqual(listSortButton('alpha'), { icon: 'az', label: 'Tri : ordre alphabétique. Appuyer pour trier par plus récentes', message: 'Tri : ordre alphabétique' });
  assert.deepEqual(listSortButton('recent'), { icon: 'clock', label: 'Tri : plus récentes d\'abord. Appuyer pour trier par ordre alphabétique', message: 'Tri : plus récentes d\'abord' });
  // Un appui bascule le tri, et rien d'autre (voir lists.js)
  const source = fs.readFileSync(new URL('../public/js/screens/lists.js', import.meta.url), 'utf8');
  assert.match(source, /listSort = currentSort\(\) === 'alpha' \? 'recent' : 'alpha';\s*saveListSort\(listSort\);/);
  assert.match(source, /toast\(message, \{ duration: 2000 \}\)/);
  assert.match(source, /h\('p', \{ class: 'visually-hidden', role: 'status' \}\)/);
  // Icône ajoutée au sprite, identique dans le kit et l'application
  const symbol = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').match(/<symbol id="i-az"[^\n]*<\/symbol>/)?.[0];
  assert.ok(symbol('design/icons-sprite.html'));
  assert.equal(symbol('public/index.html'), symbol('design/icons-sprite.html'));
});

test('après une synchronisation, une liste modifiée remonte en tête (plus récentes d\'abord)', () => {
  const s = state([{ id: 'a', name: 'Courses', updatedAt: at(5) }, { id: 'b', name: 'Bricolage', updatedAt: at(1) }]);
  assert.deepEqual(names(computeSummaries(s)), ['Courses', 'Bricolage']);
  // L'autre personne coche un élément de « Bricolage » (reçu par la synchronisation)
  s.items.set('i1', { id: 'i1', listId: 'b', name: 'Vis', checked: true, updatedAt: at(8) });
  assert.deepEqual(names(computeSummaries(s)), ['Bricolage', 'Courses']);
  // En ordre alphabétique, l'ordre ne bouge pas
  assert.deepEqual(names(computeSummaries(s, { sort: 'alpha' })), ['Bricolage', 'Courses']);
});

test('à l\'intérieur d\'une liste : ordre alphabétique inchangé, aucun bouton de tri', () => {
  const s = state([{ id: 'a', name: 'Courses', updatedAt: at(1) }], [
    { id: 'i1', listId: 'a', name: 'Pommes', updatedAt: at(9) },
    { id: 'i2', listId: 'a', name: 'ananas', updatedAt: at(2) },
    { id: 'i3', listId: 'a', name: 'Œufs', updatedAt: at(5) },
  ]);
  assert.deepEqual(computeListView(s, 'a').groups.flatMap((g) => g.items.map((i) => i.name)), ['ananas', 'Œufs', 'Pommes']);
  const listScreen = fs.readFileSync(new URL('../public/js/screens/list.js', import.meta.url), 'utf8');
  assert.equal(/listSort|LIST_SORT|sortControl/.test(listScreen), false);
});
