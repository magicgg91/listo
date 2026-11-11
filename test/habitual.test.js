// « Souvent ajoutés » (décisions du 11 novembre 2026) : liste de courses,
// champ d'ajout vide ; les 6 articles les plus ajoutés dans ce magasin ces
// deux derniers mois, sans ceux déjà à acheter ; « + » ouvre l'encart sans
// clavier ; un appui ajoute (ou remet dans la liste un article du panier).
// Tout est calculé sur la copie locale : rien de nouveau côté serveur.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { habitual, HABITUAL_DAYS, HABITUAL_LIMIT, normalizeItemName } from '../public/js/history.js';
import { emptyState, computeHabitual, checkedNamed } from '../public/js/store.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const NOW = '2026-11-11T10:00:00.000Z';
const daysAgo = (n) => new Date(Date.parse(NOW) - n * 24 * 3600 * 1000).toISOString();
const line = (name, storeId, useCount, lastUsedAt = daysAgo(1), aisleId = null) => ({ name, nameNormalized: normalizeItemName(name), storeId, aisleId, useCount, lastUsedAt });

test('règle : magasin de la liste, deux mois, les plus ajoutés d\'abord, sans les articles à exclure, 6 au plus', () => {
  assert.equal(HABITUAL_DAYS, 60);
  assert.equal(HABITUAL_LIMIT, 6);
  const history = [
    line('Lait', null, 40), line('Lait', 1, 30),
    line('Pain', null, 25), line('Pain', 1, 20),
    line('Œufs', null, 12), line('Œufs', 1, 12, daysAgo(3)),
    line('Beurre', null, 12), line('Beurre', 1, 12, daysAgo(2)), // égalité : le plus récent d'abord
    line('Vieux fromage', null, 90), line('Vieux fromage', 1, 90, daysAgo(61)), // plus de deux mois
    line('Baguette', null, 50), line('Baguette', 2, 50), // autre magasin
    line('Jamais', 1, 0),
  ];
  assert.deepEqual(habitual(history, { storeIds: [1], now: NOW }).map((e) => e.name), ['Lait', 'Pain', 'Beurre', 'Œufs']);
  // Exclus (déjà à acheter), par nom normalisé
  assert.deepEqual(habitual(history, { storeIds: [1], now: NOW, exclude: new Set(['lait', normalizeItemName('Œufs')]) }).map((e) => e.name), ['Pain', 'Beurre']);
  // Liste sans magasin : lignes générales (la vieille ligne générale est récente : elle compte)
  assert.deepEqual(habitual(history, { now: NOW, limit: 3 }).map((e) => e.name), ['Vieux fromage', 'Baguette', 'Lait']);
  // Liste « multi » : magasins additionnés
  const multi = [line('Pain', null, 5), line('Pain', 3, 4), line('Pain', 4, 4), line('Comté', null, 7), line('Comté', 4, 7)];
  assert.deepEqual(habitual(multi, { storeIds: [3, 4], now: NOW }).map((e) => [e.name, e.useCount]), [['Pain', 8], ['Comté', 7]]);
  // 6 au plus
  const many = Array.from({ length: 10 }, (_, i) => line(`Article ${i}`, 1, 10 - i));
  assert.equal(habitual(many, { storeIds: [1], now: NOW }).length, 6);
  // Nom affiché : celui de la ligne générale (première saisie)
  assert.equal(habitual([line('LAIT', null, 1), { ...line('lait', 1, 3) }], { storeIds: [1], now: NOW })[0].name, 'LAIT');
});

test('copie locale : sans les articles à acheter, avec ceux du panier ; rayon ou magasin à droite ; courses seulement', () => {
  const state = emptyState();
  state.aisles = [{ id: 10, name: 'Crèmerie', active: true }, { id: 11, name: 'Boulangerie', active: true }];
  state.stores = [{ id: 1, name: 'Carrefour', active: true }, { id: 3, name: 'Boulangerie', active: true }, { id: 4, name: 'Fromagerie', active: true }, { id: 9, name: 'Centre-ville', active: true, isMulti: true, storeIds: [3, 4] }];
  state.history = [
    line('Lait', null, 9, daysAgo(1), 10), line('Lait', 1, 9, daysAgo(1), 10),
    line('Pain', null, 8, daysAgo(1), 11), line('Pain', 1, 8, daysAgo(1), 11), line('Pain', 3, 5),
    line('Yaourts', null, 7, daysAgo(1), 10), line('Yaourts', 1, 7, daysAgo(1), 10),
    line('Comté', null, 6), line('Comté', 4, 6),
  ];
  const courses = { id: 'c', type: 'shopping', store: { id: 1, name: 'Carrefour', isMulti: false } };
  const centre = { id: 'm', type: 'shopping', store: { id: 9, name: 'Centre-ville', isMulti: true } };
  const taches = { id: 't', type: 'tasks' };
  for (const list of [courses, centre, taches]) state.lists.set(list.id, list);
  state.items.set('a', { id: 'a', listId: 'c', name: 'lait', checked: false }); // à acheter : exclu
  state.items.set('b', { id: 'b', listId: 'c', name: 'Yaourts', checked: true }); // dans le panier : proposé
  const now = new Date(Date.parse(NOW)).toISOString();
  assert.deepEqual(computeHabitual(state, courses, { now }), [{ name: 'Pain', hint: 'Boulangerie' }, { name: 'Yaourts', hint: 'Crèmerie' }]);
  assert.deepEqual(computeHabitual(state, centre, { now }), [{ name: 'Comté', hint: 'Fromagerie' }, { name: 'Pain', hint: 'Boulangerie' }]);
  assert.deepEqual(computeHabitual(state, taches, { now }), []);
  assert.equal(checkedNamed(state, 'c', 'yaourts').id, 'b');
  assert.equal(checkedNamed(state, 'c', 'Lait'), null, 'à acheter : pas dans le panier');
});

test('écran : « + » champ vide ouvre l\'encart sans curseur ; croix, toucher ailleurs ; appui sans fiche ni fermeture', () => {
  const list = read('public/js/screens/list.js');
  const body = (name) => list.slice(list.indexOf(`function ${name}(`), list.indexOf('\n  }\n', list.indexOf(`function ${name}(`)));
  assert.match(list, /const plus = taps\.button\(\(\) => \(input\.value\.trim\(\) \? addTyped\(input\.value\) : openHabitual\(\)\), \{ persistent: true \}\);/);
  // Ouvrir par « + » : jamais de curseur dans le champ (règle « aucun curseur automatique »)
  assert.doesNotMatch(body('openHabitual'), /focus\(/);
  assert.match(body('openHabitual'), /if \(!editable\(\) \|\| !remembersNames\(view\?\.list\)\) return;/);
  // Croix « Fermer » : ferme aussi le clavier
  assert.match(list, /h\('button', \{ class: 'icon-btn', type: 'button', 'aria-label': 'Fermer', onClick: \(\) => closeHabitual\(\) \}, icon\('close'\)\)/);
  assert.match(body('closeHabitual'), /if \(document\.activeElement === input\) releaseFocus\(\);/);
  assert.match(list, /if \(habitualOpen && !addbar\.contains\(event\.target\)\) closeHabitual\(\);/);
  // Appui : panier -> remis dans la liste ; sinon ajout ; jamais de fiche ouverte, l'encart se redessine
  const pick = body('pickHabitual');
  assert.match(pick, /const inCart = checkedNamed\(app\.data, listId, name\);/);
  assert.match(pick, /await actions\.checkItem\(inCart, false\);/);
  assert.match(pick, /const item = await addNamed\(name\);/);
  assert.match(pick, /drawSuggestions\(\);$/);
  assert.doesNotMatch(pick, /openItemSheet|releaseFocus|revealItem/);
  // Champ vide : l'encart ; on tape : les suggestions habituelles
  assert.match(list, /if \(!input\.value\.trim\(\)\) \{\s*if \(document\.activeElement === input \|\| habitualOpen\) drawHabitual\(\);/);
  // Texte toujours écrit en textContent (h()), jamais en HTML
  assert.doesNotMatch(body('drawHabitual'), /innerHTML/);
  assert.match(read('public/css/app.css'), /\.suggest__head \{/);
});
