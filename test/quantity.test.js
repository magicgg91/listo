// Lecture de la quantité dans le texte de la barre d'ajout (public/js/quantity.js) :
// formats reconnus, cas où rien n'est lu, saisie multiple, suggestions et
// rayon retrouvés à partir du nom seul, file d'attente hors ligne, listes
// d'envies et droits inchangés.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { readQuantity, quantityFor, isUnit, QUANTITY_MAX } from '../public/js/quantity.js';
import { splitItems, planBulkAdd } from '../public/js/bulk-add.js';
import { emptyState, rememberItem, computeSuggestions, usualAisleFor, isKnownItem } from '../public/js/store.js';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import fr from '../public/js/i18n/fr.js';

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

// Anglais (langue donnée explicitement : l'anglais n'est pas encore proposé
// dans « Mon compte », READY_LOCALES)
const en = (text) => readQuantity(text, 'en');

test('anglais : nombre, unité métrique ou américaine, conditionnement, « of » retiré', () => {
  assert.deepEqual(en('6 eggs'), { name: 'eggs', quantity: '6' });
  assert.deepEqual(en('2 kg apples'), { name: 'apples', quantity: '2 kg' });
  assert.deepEqual(en('2 kg of apples'), { name: 'apples', quantity: '2 kg' });
  assert.deepEqual(en('2 KG Of apples'), { name: 'apples', quantity: '2 KG' }, 'majuscules');
  assert.deepEqual(en('1.5 l milk'), { name: 'milk', quantity: '1.5 l' });
  assert.deepEqual(en('1,5 L milk'), { name: 'milk', quantity: '1,5 L' }, 'virgule aussi');
  assert.deepEqual(en('500g flour'), { name: 'flour', quantity: '500g' }, 'unité de mesure collée');
  assert.deepEqual(en('12 oz cheese'), { name: 'cheese', quantity: '12 oz' });
  assert.deepEqual(en('12oz cheese'), { name: 'cheese', quantity: '12oz' });
  assert.deepEqual(en('2 lbs ground beef'), { name: 'ground beef', quantity: '2 lbs' });
  assert.deepEqual(en('1 lb of butter'), { name: 'butter', quantity: '1 lb' });
  assert.deepEqual(en('1 gal milk'), { name: 'milk', quantity: '1 gal' });
  assert.deepEqual(en('2 pt cream'), { name: 'cream', quantity: '2 pt' });
  assert.deepEqual(en('2 pounds beef'), { name: 'beef', quantity: '2 pounds' }, 'mesure écrite en entier');
  // « dozen » : lu comme un conditionnement, gardé dans la quantité
  assert.deepEqual(en('1 dozen eggs'), { name: 'eggs', quantity: '1 dozen' });
  assert.deepEqual(en('2 dozen eggs'), { name: 'eggs', quantity: '2 dozen' });
  assert.deepEqual(en('1 dozen of eggs'), { name: 'eggs', quantity: '1 dozen' });
  assert.deepEqual(en('3 boxes eggs'), { name: 'eggs', quantity: '3 boxes' });
  assert.deepEqual(en('3 boxes of cereal'), { name: 'cereal', quantity: '3 boxes' });
  assert.deepEqual(en('2 bunches of bananas'), { name: 'bananas', quantity: '2 bunches' });
  assert.deepEqual(en('2 loaves bread'), { name: 'bread', quantity: '2 loaves' });
  assert.deepEqual(en('4 rolls paper towels'), { name: 'paper towels', quantity: '4 rolls' });
  assert.deepEqual(en('6 cans of tuna'), { name: 'tuna', quantity: '6 cans' });
  assert.deepEqual(en('2 kg offal'), { name: 'offal', quantity: '2 kg' }, '« of » seulement comme mot entier');
  for (const unit of ['mg', 'g', 'kg', 'ml', 'cl', 'dl', 'l', 'L', 'lb', 'lbs', 'oz', 'pt', 'gal', 'dozen', 'pack', 'packs', 'box', 'boxes', 'bag', 'bags', 'bottle', 'bottles', 'can', 'cans', 'jar', 'jars', 'carton', 'cartons', 'bunch', 'bunches', 'roll', 'rolls', 'tin', 'tins', 'tub', 'tubs', 'packet', 'packets', 'slice', 'slices', 'loaf', 'loaves']) {
    assert.equal(isUnit(unit, 'en'), true, unit);
  }
  for (const word of ['slices', 'boxes', 'oz', 'lbs', 'dozen']) assert.equal(isUnit(word, 'fr'), false, `${word} : pas une unité en français`);
  assert.equal(isUnit('boîtes', 'en'), false, 'boîtes : pas une unité en anglais');
});

test('anglais : quantité à la fin, et dans le doute rien n\'est lu', () => {
  assert.deepEqual(en('apples x6'), { name: 'apples', quantity: '6' });
  assert.deepEqual(en('apples ×6'), { name: 'apples', quantity: '6' });
  assert.deepEqual(en('plain yogurt X 12'), { name: 'plain yogurt', quantity: '12' });
  for (const text of ['6', '2 kg', '2 kg of', '7up', '7 up', '7up zero', '2 in 1 shampoo', '3 for 2 detergent', '2 for 1 pizza', '1 a day vitamins', '2 x 4 lumber', '3 times a day', 'pie 6 slices', 'vitamin C 1000', 'shampoo 2 in 1', 'milk', '6 !!']) {
    assert.deepEqual(en(text), { name: text, quantity: '' }, text);
  }
  // Les mots d'une langue ne valent pas dans l'autre
  assert.deepEqual(readQuantity('2 kg of apples', 'fr'), { name: 'of apples', quantity: '2 kg' });
  assert.deepEqual(en('2 kg de pommes'), { name: 'de pommes', quantity: '2 kg' });
  assert.deepEqual(en('3 boîtes de thon'), { name: 'boîtes de thon', quantity: '3' });
  assert.deepEqual(en('2 en 1 shampoing'), { name: 'en 1 shampoing', quantity: '2' });
  assert.deepEqual(readQuantity('2 in 1 shampoo', 'fr'), { name: 'in 1 shampoo', quantity: '2' });
  // Langue absente ou inconnue : langue des écrans (le français ici)
  assert.deepEqual(readQuantity('2 kg de pommes'), { name: 'pommes', quantity: '2 kg' });
  assert.deepEqual(readQuantity('2 kg de pommes', 'xx'), { name: 'pommes', quantity: '2 kg' });
  assert.deepEqual(['2 kg de pommes'].map(readQuantity), [{ name: 'pommes', quantity: '2 kg' }], 'map : le numéro du texte n\'est pas une langue');
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

test('courses seulement : une liste de tâches ou d\'envies garde tout le texte comme nom, ajout simple ou saisie multiple', () => {
  const shopping = { type: 'shopping' };
  const tasks = { type: 'tasks' };
  const wishes = { type: 'wishes' };
  // Mêmes textes : lus sur une liste de courses, entiers sur une liste de tâches
  assert.deepEqual(quantityFor(shopping, '3 appels à passer'), { name: 'appels à passer', quantity: '3' });
  assert.deepEqual(quantityFor(shopping, '2 kg pommes'), { name: 'pommes', quantity: '2 kg' });
  assert.deepEqual(quantityFor(tasks, '3 appels à passer'), { name: '3 appels à passer', quantity: '' });
  assert.deepEqual(quantityFor(tasks, '2 kg pommes'), { name: '2 kg pommes', quantity: '' });
  assert.deepEqual(quantityFor(tasks, '  2   lessives à lancer '), { name: '2 lessives à lancer', quantity: '' }, 'espaces en trop retirés, comme avant');
  assert.deepEqual(quantityFor(tasks, 'linge x3'), { name: 'linge x3', quantity: '' });
  // Envies : jamais
  assert.deepEqual(quantityFor(wishes, '2 kg de bonbons'), { name: '2 kg de bonbons', quantity: '' });
  // Saisie multiple : découpage inchangé, sans lecture sur une liste de tâches
  assert.deepEqual(splitItems('3 appels à passer, 2 lessives à lancer ; ranger').map((piece) => quantityFor(tasks, piece)), [
    { name: '3 appels à passer', quantity: '' },
    { name: '2 lessives à lancer', quantity: '' },
    { name: 'ranger', quantity: '' },
  ]);
  assert.deepEqual(splitItems('6 oeufs, 2 kg pommes ; lait').map((piece) => quantityFor(shopping, piece)).map((e) => e.quantity), ['6', '2 kg', '']);
  // Liste inconnue (écran pas encore chargé) : rien n'est lu
  assert.deepEqual(quantityFor(undefined, '6 oeufs'), { name: '6 oeufs', quantity: '' });
});

test('écran : la quantité n\'est lue que par quantityFor (courses seulement) ; jamais pour les envies ; suggestion choisie avec la quantité tapée sur une liste de courses', () => {
  const list = code('public/js/screens/list.js');
  const add = list.slice(list.indexOf('async function addTyped('), list.indexOf('function whenKeyboardClosed('));
  // Envies : le bloc de découpage et de lecture n'est jamais atteint
  assert.match(add, /if \(!whole && !isWishList\(view\.list\)\) \{\s*const plan = planBulkAdd\(text\);[\s\S]*const entries = plan\.names\.map\(\(piece\) => quantityFor\(view\.list, piece\)\);/);
  // Un seul point de décision : l'écran n'appelle jamais readQuantity directement
  assert.doesNotMatch(list, /readQuantity/);
  assert.match(read('public/js/quantity.js'), /export function quantityFor\(list, text\) \{\s*if \(isShoppingList\(list\)\) return readQuantity\(text\);/);
  assert.match(add, /const item = await addNamed\(name, quantity \? \{ quantity \} : \{\}, \(\) => \{/);
  assert.match(add, /last = \(await createItem\(name, \{ \.\.\.places\[index\], \.\.\.\(quantity \? \{ quantity \} : \{\}\) \}\)\) \|\| last;/);
  // Le rayon (placeFor) est cherché avec le nom seul
  assert.match(add, /for \(const \[index, \{ name \}\] of entries\.entries\(\)\) \{\s*const key = normalizeItemName\(name\);/);
  // Suggestions : sur le nom lu ; suggestion choisie avec la quantité tapée
  // Suggestions (listes de courses seulement : une liste de tâches n'en a pas,
  // et quantityFor ne lirait rien) ; suggestion choisie avec la quantité lue
  assert.match(list, /if \(!remembersNames\(view\?\.list\) \|\| splitItems\(input\.value\)\.length > 1\) \{/);
  assert.match(list, /const read = quantityFor\(view\?\.list, typed\);\s*const suggestions = read\.name\.length >= 2 \? computeSuggestions\(app\.data, read\.name, undefined, view\?\.list\) : \[\];/);
  assert.match(list, /addTyped\(s\.name, \{ whole: true, quantity: read\.quantity \}\)/);
  // La fiche d'un article reste la façon de corriger (champ « Quantité » inchangé)
  assert.match(list, /field\(t\('liste\.fiche\.quantite'\), quantity, \{ aside: t\('liste\.fiche\.quantite\.exemple'\) \}\)/);
  assert.equal(fr['liste.fiche.quantite'], 'Quantité');
  assert.equal(fr['liste.fiche.quantite.exemple'], 'par exemple 2 ou 500 g');
  // Module simple, gardé hors ligne
  const module = read('public/js/quantity.js');
  assert.doesNotMatch(module, /\(\?<[=!]|innerHTML/);
  assert.deepEqual(module.match(/^import .*$/gm), ["import { isShoppingList } from './list-types.js';", "import { getLocale } from './i18n.js';"]);
  assert.ok(read('public/sw.js').includes("'/js/quantity.js'"));
});
