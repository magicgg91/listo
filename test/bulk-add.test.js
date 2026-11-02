// Saisie de plusieurs éléments d'un coup dans la barre d'ajout (courses et
// tâches) : découpage (public/js/bulk-add.js), tout ou rien, une opération
// par élément dans la file d'attente (un renvoi ne crée pas de doublon),
// droits inchangés, listes d'envies inchangées, un seul morceau = ajout habituel.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { splitItems, planBulkAdd, hasSeparator, joinPastedLines, BULK_MAX, BULK_INPUT_MAX, TOO_MANY } from '../public/js/bulk-add.js';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

test('découpage : virgules, points-virgules et retours à la ligne ; virgule décimale gardée ; espaces et morceaux vides', () => {
  assert.deepEqual(splitItems('lait, pain ; 6 oeufs'), ['lait', 'pain', '6 oeufs']);
  assert.deepEqual(splitItems('1,5 L de lait'), ['1,5 L de lait'], 'virgule entre deux chiffres');
  assert.deepEqual(splitItems('1,5 L de lait, 2,5 kg de farine'), ['1,5 L de lait', '2,5 kg de farine']);
  assert.deepEqual(splitItems('lait,5 pommes'), ['lait', '5 pommes'], 'une lettre avant : séparateur');
  assert.deepEqual(splitItems('pommes 3,'), ['pommes 3'], 'un chiffre seulement avant : séparateur');
  assert.deepEqual(splitItems('lait,, pain, '), ['lait', 'pain']);
  assert.deepEqual(splitItems('  lait   demi   écrémé ;;\n\n pain\r\nbeurre\rsel'), ['lait demi écrémé', 'pain', 'beurre', 'sel']);
  assert.deepEqual(splitItems(' , ; \n '), []);
  assert.deepEqual(splitItems(''), []);
  // Un seul morceau : le nom tel qu'un ajout à la main le nettoie
  assert.deepEqual(splitItems('  Lait  demi-écrémé '), ['Lait demi-écrémé']);
  assert.equal(hasSeparator('1,5 L'), false);
  assert.equal(hasSeparator('lait, pain'), true);
  assert.equal(hasSeparator('lait\npain'), true);
  // Collage sur plusieurs lignes
  assert.equal(joinPastedLines('lait\r\n\r\n  pain \nbeurre\n'), 'lait; pain; beurre');
  assert.deepEqual(splitItems(joinPastedLines('1,5 L de lait\n6 oeufs')), ['1,5 L de lait', '6 oeufs']);
});

test('20 éléments au plus : 20 acceptés, 21 refusés en entier avec une phrase claire', () => {
  const names = (n) => Array.from({ length: n }, (_, i) => `article ${i + 1}`).join(', ');
  assert.equal(BULK_MAX, 20);
  assert.equal(planBulkAdd(names(20)).names.length, 20);
  assert.deepEqual(planBulkAdd(names(21)), { error: TOO_MANY });
  assert.match(TOO_MANY, /^20 éléments au plus à la fois\./);
  // Les morceaux vides ne comptent pas
  assert.equal(planBulkAdd(`${names(20)},,;\n`).names.length, 20);
  // Le champ accepte 20 noms de 100 caractères et leurs séparateurs
  assert.ok(BULK_INPUT_MAX >= 20 * 100 + 19 * 2);
});

test('tout ou rien : un morceau trop long est nommé, et rien n\'est ajouté', () => {
  const long = 'x'.repeat(101);
  const res = planBulkAdd(`lait, ${long}, pain`);
  assert.equal(res.names, undefined);
  assert.equal(res.error, `L'élément 2 (« ${'x'.repeat(30)}… ») est trop long : 100 caractères au plus. Rien n'a été ajouté.`);
  assert.equal(planBulkAdd(long).error, `« ${'x'.repeat(30)}… » est trop long : 100 caractères au plus. Rien n'a été ajouté.`);
  assert.deepEqual(planBulkAdd(`lait, ${'x'.repeat(100)}`).names, ['lait', 'x'.repeat(100)]);
  // Un seul morceau sans séparateur : un seul nom, comme aujourd'hui
  assert.deepEqual(planBulkAdd('  6 oeufs  ').names, ['6 oeufs']);
});

async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const marieId = await addUser(app.db, { username: 'marie', password: 'MotDePasse-marie' });
  const marie = app.client();
  await login(marie, 'marie', 'MotDePasse-marie');
  const listId = uuid();
  const res = await guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId, name: 'Courses', listType: 'shopping' }] });
  assert.equal(res.body.results[0].status, 200);
  return { app, guillaume, marie, marieId, listId };
}

// Les opérations telles que le téléphone les met en file : une par élément,
// chacune avec son identifiant d'opération et son identifiant d'élément
const bulkOps = (listId, names) => splitItems(names).map((name) => ({ id: uuid(), type: 'item.create', listId, itemId: uuid(), name }));
const countItems = (app, listId) => app.db.prepare('SELECT COUNT(*) FROM items WHERE list_id = ? AND deleted_at IS NULL').pluck().get(listId);

test('file d\'attente : 20 éléments en un envoi ; le même envoi rejoué (réseau coupé, renvoi) ne crée aucun doublon', async (t) => {
  const h = await household(t);
  const ops = bulkOps(h.listId, Array.from({ length: 20 }, (_, i) => `article ${i + 1}`).join('\n'));
  assert.equal(ops.length, 20);
  const first = await h.guillaume.post('/api/ops', { ops });
  assert.deepEqual(first.body.results.map((r) => r.status), ops.map(() => 200));
  assert.equal(countItems(h.app, h.listId), 20);
  // Renvoi du même lot (réponse perdue), puis de la moitié du lot
  const again = await h.guillaume.post('/api/ops', { ops });
  assert.ok(again.body.results.every((r) => r.status === 200 && r.duplicate === true));
  await h.guillaume.post('/api/ops', { ops: ops.slice(5, 15) });
  assert.equal(countItems(h.app, h.listId), 20, 'aucun doublon');
  // Aucune limite de débit ne gêne : un deuxième lot de 20 passe aussi
  const second = await h.guillaume.post('/api/ops', { ops: bulkOps(h.listId, 'a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t') });
  assert.ok(second.body.results.every((r) => r.status === 200));
  assert.equal(countItems(h.app, h.listId), 40);
});

test('droits inchangés : une personne en lecture seule ne peut rien ajouter, même plusieurs éléments d\'un coup', async (t) => {
  const h = await household(t);
  assert.equal((await h.guillaume.request('PUT', `/api/lists/${h.listId}/members`, { userIds: [h.marieId], access: { [h.marieId]: 'lecture' } })).status, 200);
  const res = await h.marie.post('/api/ops', { ops: bulkOps(h.listId, 'lait, pain, beurre') });
  assert.deepEqual(res.body.results.map((r) => r.status), [403, 403, 403]);
  assert.equal(countItems(h.app, h.listId), 0);
});

test('écran : découpage seulement pour les courses et les tâches ; tout ou rien ; toujours sur la liste ; phrase annoncée', () => {
  const list = code('public/js/screens/list.js');
  const add = list.slice(list.indexOf('async function addTyped('), list.indexOf('function whenKeyboardClosed('));
  // Liste d'envies (et suggestion choisie) : l'ajout habituel, jamais découpé
  assert.match(add, /if \(!whole && !isWishList\(view\.list\)\) \{\s*const plan = planBulkAdd\(text\);/);
  assert.match(list, /input\.maxLength = isWishList\(list\) \? ITEM_NAME_MAX : BULK_INPUT_MAX;/);
  assert.match(list, /if \(isWishList\(view\?\.list\) \|\| !\/\[\\r\\n\]\/\.test\(text\)\) return;/);
  // Refus : une phrase, le texte reste, rien n'est ajouté
  assert.match(add, /if \(plan\.error\) \{\s*toast\(plan\.error\);[^\n]*\n\s*return;\s*\}/);
  // Plusieurs : addSeveral ; un seul morceau : l'ajout habituel (avec « Ouvrir la fiche » si réglé)
  assert.match(add, /const entries = plan\.names\.map\(\(piece\) => quantityFor\(view\.list, piece\)\);\s*if \(entries\.length > 1\) \{\s*await addSeveral\(entries\);\s*return;\s*\}/);
  // Tout ou rien : toutes les questions (rayon, magasin) d'abord, puis les ajouts
  const several = list.slice(list.indexOf('async function addSeveral('), list.indexOf('function whenKeyboardClosed('));
  assert.ok(several.indexOf('await placeFor(') < several.indexOf("input.value = '';"));
  assert.ok(several.indexOf("input.value = '';") < several.indexOf('await createItem('));
  assert.match(several, /if \(place === undefined\) return;/);
  // Jamais de fiche ouverte ; une phrase annoncée (toast role="status")
  assert.doesNotMatch(several, /openItemSheet|addModeOf/);
  assert.match(several, /toast\(`\$\{countItems\(entries\.length, list\)\} ajoutés`\);/);
  assert.match(read('public/js/ui.js'), /h\('div', \{ class: `toast\$\{low \? ' toast--low' : ''\}`, role: 'status' \}/);
  // Chaque élément : le même chemin qu'un ajout à la main (une opération, son propre identifiant)
  assert.match(list, /async function createItem\(name, fields = \{\}\) \{\s*if \(!editable\(\)\) return false;[^\n]*\n\s*return actions\.addItem\(\{ listId, name, \.\.\.fields \}\);/);
  assert.match(read('public/js/actions.js'), /const itemId = uuid\(\);[\s\S]*await perform\(\{ type: 'item\.create', \.\.\.fields \}, \{ hint \}\);/);
  // Pas de suggestions pour une saisie multiple
  assert.match(list, /if \(!remembersNames\(view\?\.list\) \|\| splitItems\(input\.value\)\.length > 1\) \{/);
  // Module simple : aucune syntaxe d'expression régulière récente (anciens iPhone), aucun HTML
  const bulk = read('public/js/bulk-add.js');
  assert.doesNotMatch(bulk, /\(\?<[=!]|innerHTML|import /);
  // Gardé hors ligne
  assert.ok(read('public/sw.js').includes("'/js/bulk-add.js'"));
});
