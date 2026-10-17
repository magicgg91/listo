// Tests de la logique de l'interface qui ne dépend pas de l'écran :
// routeur (adresses), mise en forme des textes, copie locale des données.
// (Les écrans eux-mêmes se vérifient à la main : voir le README.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRoute, pathFor } from '../public/js/router.js';
import { relativeTime, remainingLabel, splitPrefix, namesList, defaultDisplayName } from '../public/js/format.js';
import {
  emptyState, loadSync, putItem, removeItem, putList, removeList, rememberItem,
  computeSummaries, computeListView, computeSuggestions, isKnownItem, activeOnly,
  storeChoices, usualStoreFor, usualAisleFor, historyStoreFor, moveItemStore,
} from '../public/js/store.js';

// --- Routeur ---

test('routeur : chaque adresse mène au bon écran', () => {
  const cases = [
    ['#/connexion', { name: 'login', params: {} }],
    ['#/listes', { name: 'lists', params: {} }],
    ['#/listes/nouvelle', { name: 'newList', params: {} }],
    ['#/listes/abc-123', { name: 'list', params: { id: 'abc-123' } }],
    ['#/listes/abc-123/modifier', { name: 'editList', params: { id: 'abc-123' } }],
    ['#/reglages', { name: 'settings', params: {} }],
    ['#/reglages/mot-de-passe', { name: 'password', params: {} }],
    ['#/reglages/double-authentification', { name: 'twoFactor', params: {} }],
    ['#/administration/rayons', { name: 'admin', params: { tab: 'rayons' } }],
  ];
  for (const [hash, expected] of cases) assert.deepEqual(matchRoute(hash), expected, hash);
});

test('routeur : adresse vide, inconnue ou mal encodée → « Mes listes »', () => {
  for (const hash of ['', '#', '#/', '#/inconnu', '#/listes/a/b/c', '#/listes/%E0%A4%A', undefined]) {
    assert.deepEqual(matchRoute(hash), { name: 'lists', params: {} }, String(hash));
  }
});

test("routeur : fabrication d'une adresse, aller-retour sans perte", () => {
  assert.equal(pathFor('list', { id: 'abc' }), '#/listes/abc');
  assert.equal(pathFor('admin', { tab: 'comptes' }), '#/administration/comptes');
  const odd = 'liste/avec espaces?&#';
  assert.deepEqual(matchRoute(pathFor('list', { id: odd })), { name: 'list', params: { id: odd } });
  assert.throws(() => pathFor('écran-inconnu'));
});

// --- Mise en forme ---

test('dates relatives comme dans les maquettes', () => {
  const now = new Date(2026, 9, 16, 15, 30).getTime(); // vendredi 16 octobre 2026, 15 h 30
  const at = (...args) => new Date(2026, ...args).toISOString();
  assert.equal(relativeTime(at(9, 16, 15, 29, 40), now), "à l'instant");
  assert.equal(relativeTime(at(9, 16, 15, 28), now), 'il y a 2 min');
  assert.equal(relativeTime(at(9, 16, 12, 0), now), 'il y a 3 h');
  assert.equal(relativeTime(at(9, 15, 20, 0), now), 'hier');
  assert.equal(relativeTime(at(9, 13, 9, 0), now), 'mar.');
  assert.equal(relativeTime(at(9, 2, 9, 0), now), '2 oct.');
  assert.equal(relativeTime(new Date(2025, 11, 24).toISOString(), now), '24 déc. 2025');
  assert.equal(relativeTime('pas une date', now), '');
});

test('nombre d\'articles restants, liste de prénoms', () => {
  assert.equal(remainingLabel(1), '1 article restant');
  assert.equal(remainingLabel(11), '11 articles restants');
  assert.equal(remainingLabel(0), '0 articles restants');
  assert.equal(namesList(['Guillaume']), 'Guillaume');
  assert.equal(namesList(['Guillaume', 'Léa']), 'Guillaume et Léa');
  assert.equal(namesList(['A', 'B', 'C']), 'A, B et C');
});

test('nom affiché par défaut : identifiant avec une majuscule au début', () => {
  assert.equal(defaultDisplayName('guillaume'), 'Guillaume');
  assert.equal(defaultDisplayName(' lea.martin '), 'Lea.martin');
  assert.equal(defaultDisplayName(''), '');
});

test('suggestion : début tapé mis en gras, accents et majuscules ignorés', () => {
  assert.deepEqual(splitPrefix('Pâtes', 'pa'), ['Pâ', 'tes']);
  assert.deepEqual(splitPrefix('Pain de mie', 'PAIN'), ['Pain', ' de mie']);
  assert.deepEqual(splitPrefix('Éclair', 'ec'), ['Éc', 'lair']);
  assert.deepEqual(splitPrefix('Pain au lait', 'la'), ['', 'Pain au lait']); // pas au début
});

// --- Copie locale des données ---

function sample() {
  const list = (id, name, updatedAt, isShopping = true) => ({
    id, name, updatedAt, lastActivity: updatedAt, deletedAt: null,
    category: { id: isShopping ? 1 : 2, name: isShopping ? 'Courses' : 'Tâches', isShopping, active: true },
    store: null, members: [], isOwner: true,
  });
  const item = (id, listId, name, extra = {}) => ({ id, listId, name, quantity: '', note: '', aisleId: null, checked: false, updatedAt: '2026-10-16T10:00:00.000Z', deletedAt: null, ...extra });
  return loadSync(emptyState(), {
    serverTime: '2026-10-16T12:00:00.000Z',
    listIds: ['A', 'B', 'C'],
    lists: [list('A', 'Courses', '2026-10-16T09:00:00.000Z'), list('B', 'Tâches', '2026-10-16T11:00:00.000Z', false),
      list('C', 'Vide', '2026-10-15T09:00:00.000Z'), { ...list('D', 'Supprimée', '2026-10-16T11:30:00.000Z'), deletedAt: '2026-10-16T11:30:00.000Z' }],
    items: [
      item('1', 'A', 'Lait', { aisleId: 10 }), item('2', 'A', 'Pain', { aisleId: 11, checked: true }),
      item('3', 'A', 'Piles', { updatedAt: '2026-10-16T11:45:00.000Z' }),
      item('4', 'B', 'Ranger'), item('5', 'A', 'Ancien', { deletedAt: '2026-10-16T10:00:00.000Z' }),
      item('6', 'X', "Liste d'un autre"),
    ],
    categories: [{ id: 1, name: 'Courses', active: true, isShopping: true }, { id: 2, name: 'Tâches', active: true, isShopping: false }],
    stores: [],
    aisles: [{ id: 10, name: 'Crèmerie', active: true }, { id: 11, name: 'Boulangerie', active: true }, { id: 12, name: 'Ancien rayon', active: false }],
    history: [
      { name: 'Lait', nameNormalized: 'lait', aisleId: 10, useCount: 5, lastUsedAt: '2026-10-16T10:00:00.000Z' },
      { name: 'Laitue', nameNormalized: 'laitue', aisleId: 12, useCount: 2, lastUsedAt: '2026-10-16T10:00:00.000Z' },
    ],
  });
}

test('copie locale : listes et articles supprimés ou hors de mes listes ignorés', () => {
  const state = sample();
  assert.deepEqual([...state.lists.keys()].sort(), ['A', 'B', 'C']);
  assert.deepEqual([...state.items.keys()].sort(), ['1', '2', '3', '4']);
});

test('mes listes : restants, total et tri par dernière activité (articles compris)', () => {
  const summaries = computeSummaries(sample());
  assert.deepEqual(summaries.map((l) => [l.id, l.remaining, l.total]), [['A', 2, 3], ['B', 1, 1], ['C', 0, 0]]);
  assert.equal(summaries[0].lastActivity, '2026-10-16T11:45:00.000Z', "l'article ajouté à 11 h 45 fait remonter la liste A");
});

test('une liste : groupée par rayon, cochés comptés ; liste inconnue → null', () => {
  const state = sample();
  const view = computeListView(state, 'A');
  assert.deepEqual(view.groups.map((g) => g.aisle?.name ?? 'Sans rayon'), ['Boulangerie', 'Crèmerie', 'Sans rayon']);
  assert.equal(view.checked, 1);
  assert.equal(computeListView(state, 'B').groups.length, 1);
  assert.equal(computeListView(state, 'X'), null);
});

test('modifications locales : article ajouté, coché, supprimé ; liste retirée avec ses articles', () => {
  const state = sample();
  putItem(state, { id: '9', listId: 'C', name: 'Nouveau', checked: false, updatedAt: '2026-10-16T12:00:00.000Z', deletedAt: null });
  assert.equal(computeListView(state, 'C').total, 1);
  putItem(state, { ...state.items.get('1'), checked: true });
  assert.equal(computeListView(state, 'A').checked, 2);
  putItem(state, { ...state.items.get('3'), deletedAt: '2026-10-16T12:00:00.000Z' });
  removeItem(state, '2');
  assert.equal(computeListView(state, 'A').total, 1);
  removeList(state, 'A');
  assert.equal(computeListView(state, 'A'), null);
  assert.ok(![...state.items.values()].some((i) => i.listId === 'A'));
  putList(state, { ...computeSummaries(state)[0], id: 'E', deletedAt: null });
  assert.ok(state.listIds.has('E'));
});

test('historique local : suggestions, article connu, rayon mémorisé', () => {
  const state = sample();
  assert.deepEqual(computeSuggestions(state, 'la').map((s) => [s.name, s.aisleName]), [['Lait', 'Crèmerie'], ['Laitue', null]]);
  assert.equal(computeSuggestions(state, 'l').length, 0);
  assert.equal(isKnownItem(state, '  LAIT '), true);
  assert.equal(isKnownItem(state, 'Café'), false);
  rememberItem(state, 'Café', { aisleId: 11 });
  rememberItem(state, 'café');
  const cafe = state.history.find((e) => e.nameNormalized === 'cafe');
  assert.deepEqual([cafe.useCount, cafe.aisleId], [2, 11], '« Sans rayon » ne remplace pas le rayon connu');
  rememberItem(state, 'Café', { aisleId: 10, count: 0 });
  assert.deepEqual([cafe.useCount, cafe.aisleId], [2, 10], 'une modification ne compte pas comme une utilisation');
  assert.deepEqual(activeOnly(state.aisles).map((a) => a.name), ['Boulangerie', 'Crèmerie']);
});

// --- Liste « multi » (étape 6) ---

function multiSample() {
  const state = sample();
  state.stores = [
    { id: 1, name: 'Boucherie', active: true, isMulti: false, storeIds: [] },
    { id: 2, name: 'Fromagerie', active: true, isMulti: false, storeIds: [] },
    { id: 3, name: 'Biocoop', active: false, isMulti: false, storeIds: [] },
    { id: 4, name: 'Lidl', active: true, isMulti: false, storeIds: [] },
    { id: 9, name: 'Centre-ville', active: true, isMulti: true, storeIds: [2, 1, 3] },
  ];
  const multi = { ...state.lists.get('A'), id: 'M', name: 'Centre-ville', store: { id: 9, name: 'Centre-ville', active: true, isMulti: true } };
  putList(state, multi);
  putItem(state, { id: 'm1', listId: 'M', name: 'Comté', storeId: 2, aisleId: null, checked: false, updatedAt: '2026-10-16T10:00:00.000Z', deletedAt: null });
  putItem(state, { id: 'm2', listId: 'M', name: 'Piles', storeId: null, aisleId: 10, checked: false, updatedAt: '2026-10-16T10:00:00.000Z', deletedAt: null });
  return { state, multi };
}

test('liste « multi » : groupée par magasin, magasins proposés, magasin habituel', () => {
  const { state, multi } = multiSample();
  const view = computeListView(state, 'M');
  assert.equal(view.multi, true);
  assert.deepEqual(view.groups.map((g) => g.store?.name ?? 'Sans magasin'), ['Fromagerie', 'Sans magasin']);
  assert.equal(computeListView(state, 'A').multi, false);
  // Magasins regroupés et actifs, par ordre alphabétique (Biocoop est désactivé)
  assert.deepEqual(storeChoices(state, multi).map((s) => s.name), ['Boucherie', 'Fromagerie']);

  assert.equal(usualStoreFor(state, multi, 'Comté'), null);
  rememberItem(state, 'Comté', { storeId: 2 });
  assert.equal(usualStoreFor(state, multi, 'comte'), 2);
  rememberItem(state, 'Comté', { storeId: 4 }); // acheté chez Lidl : pas un magasin de cette liste
  rememberItem(state, 'Comté', { storeId: 4 });
  assert.equal(usualStoreFor(state, multi, 'Comté'), 2);
  moveItemStore(state, 'Comté', 2, 1);
  assert.equal(usualStoreFor(state, multi, 'Comté'), 1);
  assert.equal(historyStoreFor(multi, { storeId: 1 }), 1);
});

test('liste à magasin simple : rayon du magasin, sinon rayon général', () => {
  const { state } = multiSample();
  const lidl = { ...state.lists.get('A'), store: { id: 4, name: 'Lidl', active: true, isMulti: false } };
  assert.equal(usualAisleFor(state, lidl, 'Lait'), 10);
  rememberItem(state, 'Lait', { aisleId: 11, storeId: historyStoreFor(lidl, {}) });
  assert.equal(usualAisleFor(state, lidl, 'Lait'), 11);
  const other = { ...lidl, store: { id: 1, name: 'Boucherie', active: true, isMulti: false } };
  assert.equal(usualAisleFor(state, other, 'Lait'), 11, 'le rayon général suit le dernier choisi');
  assert.equal(historyStoreFor(state.lists.get('B'), {}), null, 'liste de tâches : pas de magasin');
});

// --- Photo (étape 7) ---

test('photo : réduite à 1 280 px sur le grand côté, proportions gardées, jamais agrandie', async () => {
  const { fitSize } = await import('../public/js/photo.js');
  assert.deepEqual(fitSize(4032, 3024), { width: 1280, height: 960 });
  assert.deepEqual(fitSize(3024, 4032), { width: 960, height: 1280 }, 'photo en hauteur');
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 }, 'petite photo inchangée');
  assert.deepEqual(fitSize(10000, 10), { width: 1280, height: 1 });
});

test("photo : l'adresse de l'image change avec la date de la photo", async () => {
  const { photoUrl } = await import('../public/js/api.js');
  const a = photoUrl({ id: 'abc', photoAt: '2026-10-17T10:00:00.000Z' });
  const b = photoUrl({ id: 'abc', photoAt: '2026-10-17T10:05:00.000Z' });
  assert.equal(a, '/api/items/abc/photo?v=2026-10-17T10%3A00%3A00.000Z');
  assert.notEqual(a, b);
});
