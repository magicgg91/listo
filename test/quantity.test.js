// Lecture de la quantité dans le texte de la barre d'ajout (public/js/quantity.js) :
// formats reconnus, cas où rien n'est lu, saisie multiple, suggestions et
// rayon retrouvés à partir du nom seul, file d'attente hors ligne, listes
// d'envies et droits inchangés.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { readQuantity, isUnit, QUANTITY_MAX } from '../public/js/quantity.js';
import { splitItems, planBulkAdd } from '../public/js/bulk-add.js';
import { emptyState, rememberItem, computeSuggestions, usualAisleFor, isKnownItem } from '../public/js/store.js';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
const q = (text) => readQuantity(text);

test('quantité au début : nombre, unité facultative, « de » ou « d\' » retiré', () => {
  assert.deepEqual(q('6 oeufs'), { name: 'oeufs', quantity: '6' });
  assert.deepEqual(q('2 kg pommes'), { name: 'pommes', quantity: '2 kg' });
  assert.deepEqual(q('2 kg de pommes'), { name: 'pommes', quantity: '2 kg' });
  assert.deepEqual(q('2 kg d\'oignons'), { name: 'oignons', quantity: '2 kg' });
  assert.deepEqual(q('2 kg d’oignons'), { name: 'oignons', quantity: '2 kg' }, 'apostrophe typographique');
  assert.deepEqual(q('500 g farine'), { name: 'farine', quantity: '500 g' });
  assert.deepEqual(q('500g farine'), { name: 'farine', quantity: '500g' }, 'unité de mesure collée');
  assert.deepEqual(q('1,5 L lait'), { name: 'lait', quantity: '1,5 L' });
  assert.deepEqual(q('1.5 l de lait'), { name: 'lait', quantity: '1.5 l' });
  assert.deepEqual(q('1,5L lait'), { name: 'lait', quantity: '1,5L' });
  assert.deepEqual(q('2 KG De pommes'), { name: 'pommes', quantity: '2 KG' }, 'majuscules');
  assert.deepEqual(q('25 CL bière'), { name: 'bière', quantity: '25 CL' });
  assert.deepEqual(q('3 boîtes de thon'), { name: 'thon', quantity: '3 boîtes' });
  assert.deepEqual(q('1 boite de sardines'), { name: 'sardines', quantity: '1 boite' });
  assert.deepEqual(q('4 paquets de pâtes'), { name: 'pâtes', quantity: '4 paquets' });
  assert.deepEqual(q('2 rouleaux d\'essuie-tout'), { name: 'essuie-tout', quantity: '2 rouleaux' });
  assert.deepEqual(q('  6   oeufs  bio '), { name: 'oeufs bio', quantity: '6' }, 'espaces en trop');
  assert.deepEqual(q('2 kg delicatessen'), { name: 'delicatessen', quantity: '2 kg' }, '« de » seulement comme mot entier');
  for (const unit of ['g', 'kg', 'mg', 'ml', 'cl', 'dl', 'l', 'L', 'boîte', 'boîtes', 'paquet', 'sachets', 'bouteille', 'pots', 'barquette', 'lots', 'pack', 'tranches', 'briques', 'canette', 'rouleaux']) {
    assert.equal(isUnit(unit), true, unit);
  }
  assert.equal(isUnit('parts'), false);
});

test('quantité à la fin : « x6 », « ×6 », « x 6 »', () => {
  assert.deepEqual(q('oeufs x6'), { name: 'oeufs', quantity: '6' });
  assert.deepEqual(q('oeufs ×6'), { name: 'oeufs', quantity: '6' });
  assert.deepEqual(q('oeufs X 6'), { name: 'oeufs', quantity: '6' });
  assert.deepEqual(q('yaourts nature x12'), { name: 'yaourts nature', quantity: '12' });
  assert.deepEqual(q('oeufs x6x'), { name: 'oeufs x6x', quantity: '' });
  assert.deepEqual(q('x6'), { name: 'x6', quantity: '' });
});

test('dans le doute, rien n\'est lu : tout le texte reste le nom', () => {
  for (const text of ['6', '2 kg', '2 kg de', '2 kg d\'', '7up', '7up light', '3suisses', 'tarte 6 parts', 'vitamine C 1000', '2 en 1 shampoing', '3 pour 2 lessive', '6 !!', 'lait', 'shampoing 2 en 1']) {
    assert.deepEqual(q(text), { name: text, quantity: '' }, text);
  }
  // Quantité de plus de 30 caractères : rien n'est lu
  const long = `${'1'.repeat(QUANTITY_MAX - 2)} kg riz`;
  assert.equal(q(long).quantity, '', `${long.length} caractères`);
  assert.deepEqual(q(`${'1'.repeat(QUANTITY_MAX - 3)} kg riz`).name, 'riz', '30 caractères : lu');
  assert.equal(QUANTITY_MAX, 30);
});

test('saisie multiple : chaque morceau est lu après le découpage', () => {
  const entries = splitItems('6 oeufs, 2 kg pommes ; lait\n1,5 L de lait').map(readQuantity);
  assert.deepEqual(entries, [
    { name: 'oeufs', quantity: '6' },
    { name: 'pommes', quantity: '2 kg' },
    { name: 'lait', quantity: '' },
    { name: 'lait', quantity: '1,5 L' },
  ]);
  assert.deepEqual(planBulkAdd('6 oeufs, 2 kg pommes ; lait').names.map(readQuantity).map((e) => e.name), ['oeufs', 'pommes', 'lait']);
});

test('suggestions, produit connu et rayon habituel retrouvés à partir du nom seul', () => {
  const state = emptyState();
  state.aisles = [{ id: 4, name: 'Crèmerie', active: true }];
  rememberItem(state, 'Oeufs', { aisleId: 4 });
  const list = { type: 'shopping', store: null };
  const typed = readQuantity('6 oeu');
  assert.deepEqual(computeSuggestions(state, typed.name).map((s) => s.name), ['Oeufs']);
  assert.deepEqual(computeSuggestions(state, '6 oeu'), [], 'sans la lecture, rien n\'était trouvé');
  const added = readQuantity('6 oeufs');
  assert.equal(isKnownItem(state, added.name), true);
  assert.equal(usualAisleFor(state, list, added.name), 4);
  assert.equal(usualAisleFor(state, list, readQuantity('oeufs x12').name), 4);
});

async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const marieId = await addUser(app.db, { username: 'marie', password: 'MotDePasse-marie' });
  const marie = app.client();
  await login(marie, 'marie', 'MotDePasse-marie');
  const ids = { courses: uuid(), envies: uuid() };
  const res = await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: ids.courses, name: 'Courses', listType: 'shopping' },
    { id: uuid(), type: 'list.create', listId: ids.envies, name: 'Envies', listType: 'wishes' },
    // L'historique apprend le rayon des oeufs
    { id: uuid(), type: 'item.create', listId: ids.courses, itemId: uuid(), name: 'Oeufs', aisleId: 4 },
  ] });
  assert.ok(res.body.results.every((r) => r.status === 200));
  return { app, guillaume, marie, marieId, ids };
}

// Opérations comme le téléphone les met en file : une par élément, avec la quantité lue
const opsFor = (listId, text) => splitItems(text).map(readQuantity).map(({ name, quantity }) => ({
  id: uuid(), type: 'item.create', listId, itemId: uuid(), name, ...(quantity ? { quantity } : {}),
}));
const rows = (app, listId) => app.db.prepare('SELECT name, quantity, aisle_id AS aisleId FROM items WHERE list_id = ? AND deleted_at IS NULL ORDER BY created_at, name').all(listId);

test('serveur : quantité enregistrée, rayon habituel retrouvé par le nom seul ; renvoi hors ligne sans doublon', async (t) => {
  const h = await household(t);
  const ops = opsFor(h.ids.courses, '6 oeufs, 2 kg de pommes ; 1,5 L lait');
  const first = await h.guillaume.post('/api/ops', { ops });
  assert.ok(first.body.results.every((r) => r.status === 200));
  const again = await h.guillaume.post('/api/ops', { ops }); // réponse perdue : même lot renvoyé
  assert.ok(again.body.results.every((r) => r.duplicate === true));
  const items = rows(h.app, h.ids.courses).filter((r) => r.quantity);
  assert.deepEqual(items.map((r) => [r.name, r.quantity]).sort(), [['lait', '1,5 L'], ['oeufs', '6'], ['pommes', '2 kg']]);
  assert.equal(items.find((r) => r.name === 'oeufs').aisleId, 4, 'rayon habituel des « Oeufs »');
  assert.equal(rows(h.app, h.ids.courses).length, 4, 'aucun doublon');
});

test('droits inchangés : lecture seule refusée, même avec une quantité', async (t) => {
  const h = await household(t);
  await h.guillaume.request('PUT', `/api/lists/${h.ids.courses}/members`, { userIds: [h.marieId], access: { [h.marieId]: 'lecture' } });
  const res = await h.marie.post('/api/ops', { ops: opsFor(h.ids.courses, '6 oeufs') });
  assert.equal(res.body.results[0].status, 403);
  assert.equal(rows(h.app, h.ids.courses).length, 1);
});

test('écran : lecture dans la barre d\'ajout des courses et des tâches seulement ; jamais pour les envies ; suggestion choisie avec la quantité tapée', () => {
  const list = code('public/js/screens/list.js');
  const add = list.slice(list.indexOf('async function addTyped('), list.indexOf('function whenKeyboardClosed('));
  // Envies : le bloc de découpage et de lecture n'est jamais atteint
  assert.match(add, /if \(!whole && !isWishList\(view\.list\)\) \{\s*const plan = planBulkAdd\(text\);[\s\S]*const entries = plan\.names\.map\(readQuantity\);/);
  assert.match(add, /const item = await addNamed\(name, quantity \? \{ quantity \} : \{\}, \(\) => \{/);
  assert.match(add, /last = \(await createItem\(name, \{ \.\.\.places\[index\], \.\.\.\(quantity \? \{ quantity \} : \{\}\) \}\)\) \|\| last;/);
  // Le rayon (placeFor) est cherché avec le nom seul
  assert.match(add, /for \(const \[index, \{ name \}\] of entries\.entries\(\)\) \{\s*const key = normalizeItemName\(name\);/);
  // Suggestions : sur le nom lu ; suggestion choisie avec la quantité tapée
  assert.match(list, /const read = readQuantity\(typed\);\s*const suggestions = read\.name\.length >= 2 \? computeSuggestions\(app\.data, read\.name\) : \[\];/);
  assert.match(list, /addTyped\(s\.name, \{ whole: true, quantity: read\.quantity \}\)/);
  // La fiche d'un article reste la façon de corriger (champ « Quantité » inchangé)
  assert.match(list, /field\('Quantité', quantity, \{ aside: 'par exemple 2 ou 500 g' \}\)/);
  // Module simple, gardé hors ligne
  const module = read('public/js/quantity.js');
  assert.doesNotMatch(module, /\(\?<[=!]|innerHTML|^import /m);
  assert.ok(read('public/sw.js').includes("'/js/quantity.js'"));
});
