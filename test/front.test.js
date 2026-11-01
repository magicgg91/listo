// Tests de la logique de l'interface qui ne dépend pas de l'écran :
// routeur (adresses), mise en forme des textes, copie locale des données.
// (Les écrans eux-mêmes se vérifient à la main : voir docs/developpement.md.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRoute, pathFor } from '../public/js/router.js';
import { relativeTime, splitPrefix, namesList, defaultDisplayName, dateTimeLabel, timeLeftLabel } from '../public/js/format.js';
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
    ['#/reglages/compte', { name: 'account', params: {} }],
    ['#/reglages/mot-de-passe', { name: 'password', params: {} }],
    ['#/reglages/double-authentification', { name: 'twoFactor', params: {} }],
    ['#/administration/rayons', { name: 'admin', params: { tab: 'rayons' } }],
    ['#/administration/noms', { name: 'admin', params: { tab: 'noms' } }],
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

test('liste de prénoms', () => {
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
    type: isShopping ? 'shopping' : 'tasks',
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

test('une liste : à acheter groupés par rayon, cochés dans la zone ; liste inconnue → null', () => {
  const state = sample();
  const view = computeListView(state, 'A');
  // « Pain » est coché : il quitte la Boulangerie, qui n'a plus rien à acheter
  assert.deepEqual(view.groups.map((g) => g.aisle?.name ?? 'Sans rayon'), ['Crèmerie', 'Sans rayon']);
  assert.deepEqual(view.done.map((i) => i.name), ['Pain']);
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

// --- Temps réel (étape 8) ---

test('synchro partielle : listes et articles changés, supprimés, liste retirée du partage', async () => {
  const { mergeSync } = await import('../public/js/store.js');
  const state = sample();
  const listA = state.lists.get('A');
  mergeSync(state, {
    serverTime: '2026-10-16T13:00:00.000Z',
    listIds: ['A', 'C', 'N'], // B n'est plus partagée avec moi ; N vient de l'être
    lists: [
      { ...listA, name: 'Courses renommées' },
      { ...listA, id: 'N', name: 'Nouvelle partagée' },
    ],
    items: [
      { id: '1', listId: 'A', name: 'Lait', checked: true, aisleId: 10, updatedAt: '2026-10-16T12:30:00.000Z', deletedAt: null },
      { id: '2', listId: 'A', name: 'Pain', checked: true, aisleId: 11, updatedAt: '2026-10-16T12:31:00.000Z', deletedAt: '2026-10-16T12:31:00.000Z' },
      { id: '7', listId: 'N', name: 'Œufs', checked: false, aisleId: null, updatedAt: '2026-10-16T12:32:00.000Z', deletedAt: null },
    ],
    categories: state.categories,
    stores: state.stores,
    aisles: state.aisles,
    history: [{ name: 'Lait', nameNormalized: 'lait', storeId: null, aisleId: 10, useCount: 6, lastUsedAt: '2026-10-16T12:30:00.000Z' }],
  });
  assert.equal(state.serverTime, '2026-10-16T13:00:00.000Z');
  assert.deepEqual([...state.lists.keys()].sort(), ['A', 'C', 'N']);
  assert.equal(state.lists.get('A').name, 'Courses renommées');
  assert.equal(state.items.get('1').checked, true);
  assert.equal(state.items.has('2'), false, 'article supprimé ailleurs');
  assert.equal(state.items.has('4'), false, 'articles de la liste B retirés avec elle');
  assert.equal(state.items.has('3'), true, 'article inchangé gardé');
  assert.equal(state.items.get('7').name, 'Œufs');
  assert.equal(state.history.filter((e) => e.nameNormalized === 'lait').length, 1);
  assert.equal(state.history.find((e) => e.nameNormalized === 'lait').useCount, 6);
});

test('reconnexion : délai croissant (1, 2, 4… jusqu\'à 30 s), un peu au hasard', async () => {
  const { reconnectDelay } = await import('../public/js/live.js');
  const middle = () => 0.5;
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 20].map((n) => reconnectDelay(n, middle)), [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  assert.equal(reconnectDelay(0, () => 0), 800);
  assert.equal(reconnectDelay(10, () => 1), 36000);
});

test('messages rapprochés : une seule synchronisation', async () => {
  const { groupCalls } = await import('../public/js/live.js');
  const timers = [];
  const fake = { setTimeout: (fn) => timers.push(fn), clearTimeout: () => {} };
  let syncs = 0;
  const onMessage = groupCalls(() => { syncs += 1; }, 300, fake);
  onMessage();
  onMessage();
  onMessage();
  assert.equal(timers.length, 1, 'un seul minuteur pour trois messages');
  timers[0]();
  assert.equal(syncs, 1);
  onMessage();
  assert.equal(timers.length, 2, 'un nouveau groupe après la synchronisation');
});

// --- Copie locale gardée sur le téléphone (étape 9) ---

test('copie locale : enregistrée puis relue à l\'identique ; illisible ou d\'une autre version → null', async () => {
  const { toSnapshot, fromSnapshot } = await import('../public/js/store.js');
  const state = sample();
  state.users = [{ id: 2, username: 'lea', displayName: 'Léa' }];
  const snapshot = JSON.parse(JSON.stringify(toSnapshot(state, '2026-10-17T10:00:00.000Z')));
  const back = fromSnapshot(snapshot);
  assert.deepEqual([...back.lists.keys()].sort(), [...state.lists.keys()].sort());
  assert.deepEqual([...back.items.keys()].sort(), [...state.items.keys()].sort());
  assert.deepEqual([...back.listIds].sort(), [...state.listIds].sort());
  assert.deepEqual(back.history, state.history);
  assert.deepEqual(back.users, state.users);
  assert.equal(back.serverTime, state.serverTime);
  assert.equal(back.loaded, true);
  assert.equal(fromSnapshot(null), null);
  assert.equal(fromSnapshot({ ...snapshot, version: 99 }), null);
  // Copie d'avant les types de liste (version 1, avec les catégories) : écartée, tout est rechargé
  assert.equal(snapshot.version, 3);
  assert.equal(fromSnapshot({ ...snapshot, version: 1, categories: [] }), null);
  assert.equal(fromSnapshot({ ...snapshot, lists: 'abîmé' }), null);
  // Aucun secret dans la copie : seulement des données de listes
  assert.deepEqual(Object.keys(snapshot).sort(), ['aisles', 'history', 'items', 'listIds', 'lists', 'news', 'reservations', 'savedAt', 'serverTime', 'stores', 'users', 'version']);
});

test('copie locale : trop ancienne au-delà de 25 jours sans synchronisation', async () => {
  const { isTooOld } = await import('../public/js/store.js');
  const now = Date.parse('2026-10-17T12:00:00.000Z');
  assert.equal(isTooOld({ serverTime: '2026-10-10T12:00:00.000Z' }, now), false);
  assert.equal(isTooOld({ serverTime: '2026-09-20T12:00:00.000Z' }, now), true);
  assert.equal(isTooOld({ serverTime: null }, now), true);
});

test('base locale en mémoire : même interface ; deux comptes ne partagent rien', async () => {
  const { memoryLocal, dbName } = await import('../public/js/localdb.js');
  assert.equal(dbName(3), 'listo-u3');
  assert.notEqual(dbName(3), dbName(4));
  const a = memoryLocal();
  const b = memoryLocal();
  await a.saveSnapshot({ version: 1, lists: [1] });
  const s1 = await a.queueAdd({ kind: 'op', op: { type: 'item.check' } });
  const s2 = await a.queueAdd({ kind: 'op', op: { type: 'item.delete' } });
  assert.ok(s2 > s1);
  assert.deepEqual((await a.queueAll()).map((e) => e.op.type), ['item.check', 'item.delete']);
  assert.equal(await b.loadSnapshot(), undefined);
  assert.deepEqual(await b.queueAll(), []);
  await a.queueDelete(s1);
  assert.deepEqual((await a.queueAll()).map((e) => e.seq), [s2]);
});

// --- Écriture d'abord locale (étape 9) ---

test('application locale des opérations : même effet que le serveur', async () => {
  const { applyOp } = await import('../public/js/store.js');
  const state = sample();
  state.stores = [{ id: 7, name: 'Lidl', active: true, isMulti: false, storeIds: [] }];
  const ctx = { user: { id: 1, username: 'guillaume', displayName: 'Guillaume' }, now: '2026-10-17T10:00:00.000Z' };

  applyOp(state, { type: 'list.create', listId: 'N', name: 'Nouvelle', listType: 'shopping', storeId: 7 }, ctx);
  const list = state.lists.get('N');
  assert.equal(list.isOwner, true);
  assert.equal(list.store.name, 'Lidl');
  assert.ok(state.listIds.has('N'));

  // Ajout : rayon prévu sur le téléphone quand le serveur le choisira lui-même
  applyOp(state, { type: 'item.create', listId: 'N', itemId: 'x1', name: 'Lait' }, { ...ctx, hint: { aisleId: 10 } });
  assert.equal(state.items.get('x1').aisleId, 10);
  applyOp(state, { type: 'item.create', listId: 'N', itemId: 'x2', name: 'Pain', aisleId: null }, { ...ctx, hint: { aisleId: 11 } });
  assert.equal(state.items.get('x2').aisleId, null, 'un choix explicite l\'emporte sur la prévision');
  applyOp(state, { type: 'item.check', itemId: 'x1', checked: true }, ctx);
  applyOp(state, { type: 'item.update', itemId: 'x1', quantity: '2' }, ctx);
  assert.deepEqual([state.items.get('x1').checked, state.items.get('x1').quantity], [true, '2']);

  assert.equal(state.items.get('x1').checkedAt, ctx.now, 'date du coché (téléphone, en attendant le serveur)');
  applyOp(state, { type: 'list.uncheckAll', listId: 'N' }, ctx);
  assert.deepEqual([state.items.get('x1').checked, state.items.get('x1').checkedAt], [false, null], 'tout décoché');
  applyOp(state, { type: 'item.check', itemId: 'x1', checked: true }, ctx);
  applyOp(state, { type: 'list.removeChecked', listId: 'N' }, ctx);
  assert.equal(state.items.has('x1'), false, 'les cochés sont retirés');
  applyOp(state, { type: 'item.delete', itemId: 'x2' }, ctx);
  assert.equal(state.items.has('x2'), false);
  applyOp(state, { type: 'item.restore', itemId: 'x2' }, ctx);
  assert.equal(state.items.get('x2').name, 'Pain', '« Annuler » remet l\'article');

  applyOp(state, { type: 'list.update', listId: 'N', listType: 'tasks' }, ctx);
  assert.equal(state.lists.get('N').store, null, 'une liste de tâches perd son magasin');
  applyOp(state, { type: 'list.delete', listId: 'N' }, ctx);
  assert.equal(state.lists.has('N'), false);
  assert.equal(state.items.has('x2'), false, 'ses articles partent avec elle');

  // Opérations sur un article ou une liste inconnus : sans effet
  applyOp(state, { type: 'item.check', itemId: 'inconnu', checked: true }, ctx);
  applyOp(state, { type: 'item.create', listId: 'inconnue', itemId: 'y', name: 'X' }, ctx);
  assert.equal(state.items.has('y'), false);
});

test('lien public : date d\'expiration et temps restant (feuille et page publique)', () => {
  const now = Date.UTC(2026, 9, 17, 16, 30);
  const iso = (ms) => new Date(now + ms).toISOString();
  const HOUR = 60 * 60 * 1000;
  assert.match(dateTimeLabel('2026-10-24T16:30:00.000Z'), /^24 oct\. 2026 à \d{2}:30$/);
  assert.equal(dateTimeLabel('pas une date'), '');
  assert.equal(timeLeftLabel(iso(7 * 24 * HOUR - 5000), now), 'Il reste 7 jours', 'tout juste créé : 7 jours');
  assert.equal(timeLeftLabel(iso(6.6 * 24 * HOUR), now), 'Il reste 7 jours');
  assert.equal(timeLeftLabel(iso(48 * HOUR), now), 'Il reste 2 jours');
  assert.equal(timeLeftLabel(iso(24 * HOUR), now), 'Il reste 24 heures');
  assert.equal(timeLeftLabel(iso(2 * HOUR), now), 'Il reste 2 heures');
  assert.equal(timeLeftLabel(iso(HOUR), now), 'Il reste 60 minutes');
  assert.equal(timeLeftLabel(iso(90 * 1000), now), 'Il reste 2 minutes');
  assert.equal(timeLeftLabel(iso(30 * 1000), now), "Il reste moins d'une minute");
  assert.equal(timeLeftLabel(iso(-1), now), 'Expiré');
});

test('vocabulaire : « article » pour les courses, « élément » pour les autres listes', async () => {
  const { isShopping, itemWords, countItems } = await import('../public/js/words.js');
  const courses = { type: 'shopping' };
  const taches = { type: 'tasks' };
  assert.equal(isShopping(courses), true);
  assert.equal(isShopping(taches), false);
  assert.equal(isShopping(true), true);
  assert.equal(isShopping(undefined), false, 'liste inconnue : pas des courses');
  const pick = ({ one, many }) => ({ one, many });
  assert.deepEqual(pick(itemWords(courses)), { one: 'article', many: 'articles' });
  assert.deepEqual(pick(itemWords(taches)), { one: 'élément', many: 'éléments' });
  // Liste d'envies : « souhait », mot qui commence par une consonne (formes complètes)
  const envies = itemWords({ type: 'wishes' });
  assert.deepEqual([envies.one, envies.many, envies.the, envies.this, envies.aNew, envies.New, envies.of], ['souhait', 'souhaits', 'le souhait', 'ce souhait', 'un nouveau souhait', 'Nouveau souhait', 'du souhait']);
  assert.deepEqual([itemWords(taches).the, itemWords(taches).New, itemWords(courses).of], ["l'élément", 'Nouvel élément', "de l'article"]);
  assert.equal(countItems(1, taches), '1 élément');
  assert.equal(countItems(2, taches), '2 éléments');
  assert.equal(countItems(1, courses), '1 article');
  // Les phrases de l'application, avec chacun des deux mots
  const { one } = itemWords(taches);
  assert.equal(`L'${one} barré sera retiré`, "L'élément barré sera retiré");
  assert.equal(`Nouvel ${one}`, 'Nouvel élément');
  assert.equal(`Modifier l'${one}`, "Modifier l'élément");
  assert.equal(`Cet ${one} a été supprimé par une autre personne.`, 'Cet élément a été supprimé par une autre personne.');
});

test('vocabulaire : aucun « article » écrit en dur dans les écrans (tout passe par words.js)', async () => {
  const fs = await import('node:fs');
  const dir = new URL('../public/js/', import.meta.url);
  // Textes qui ne concernent que les listes de courses (magasins, rayons) :
  // « article » y reste correct
  const allowed = [/Les articles seront classés par/, /les articles sont classés par magasin/, /Les articles sans magasin passent en dernier/, /classent leurs articles par rayon/, /choisissez le magasin de l'article/];
  const files = ['public.js', 'format.js', 'screens/list.js', 'screens/lists.js', 'screens/list-form.js', 'screens/admin.js', 'screens/settings.js', 'screens/share.js', 'screens/login.js', 'app.js', 'ui.js', 'actions.js'];
  for (const file of files) {
    const lines = fs.readFileSync(new URL(file, dir), 'utf8').split('\n');
    for (const [i, line] of lines.entries()) {
      const code = line.replace(/\/\/.*$/, ''); // commentaires ignorés
      if (/[Aa]rticle/.test(code) && !allowed.some((re) => re.test(code))) assert.fail(`${file}:${i + 1} : « article » écrit en dur : ${line.trim()}`);
    }
  }
});
