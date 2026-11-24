// Compteur d'avancement d'une liste ouverte (décision du 24 novembre 2026) :
// petite barre (part cochée) et « 5/6 » (téléphone) ou « 5/6 restants »
// (ordinateur), sous le titre ; sur ordinateur, « À jour » monte sur la ligne
// du titre, juste avant « Partager ». Les nombres sont ceux de la carte de la
// liste dans « Listes » : un seul calcul, listProgress (store.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin } from './helpers.js';
import { emptyState, loadSync, computeSummaries, listProgress } from '../public/js/store.js';
import { progressShare, progressText, progressLabel } from '../public/js/words.js';
import { translate } from '../public/js/i18n.js';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Code sans les lignes de commentaire
const code = (file) => read(file).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

test('listProgress : restants / total ; tout coché ; liste vide ; une autre liste ne compte pas', () => {
  const state = emptyState();
  const add = (id, listId, checked) => state.items.set(id, { id, listId, name: id, checked });
  for (const [i, checked] of [false, false, false, false, false, true].entries()) add(`a${i}`, 'A', checked);
  add('b1', 'B', true);
  add('b2', 'B', true);
  add('c1', 'C', false);
  assert.deepEqual(listProgress(state, 'A'), { remaining: 5, total: 6 });
  assert.deepEqual(listProgress(state, 'B'), { remaining: 0, total: 2 }, 'tout coché');
  assert.deepEqual(listProgress(state, 'vide'), { remaining: 0, total: 0 }, 'liste vide : rien à montrer');
  // Part cochée de la petite barre
  assert.equal(progressShare(5, 6), 17);
  assert.equal(progressShare(0, 2), 100);
  assert.equal(progressShare(6, 6), 0);
  assert.equal(progressShare(0, 0), 0, 'liste vide : 0, jamais une division par zéro');
  assert.equal(progressShare(11, 15), 27);
});

test('mêmes nombres que la carte de « Listes » : sous-tâches comprises, supprimés exclus, envies', async (t) => {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const tasks = uuid();
  const wishes = uuid();
  const empty = uuid();
  const id = Object.fromEntries(['main', 'sub1', 'sub2', 'other', 'gone', 'w1', 'w2'].map((name) => [name, uuid()]));
  const res = await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: tasks, name: 'Maison', listType: 'tasks', subtasksEnabled: true },
    { id: uuid(), type: 'item.create', listId: tasks, itemId: id.main, name: 'Peindre' },
    { id: uuid(), type: 'item.create', listId: tasks, itemId: id.sub1, name: 'Poncer', parentId: id.main },
    { id: uuid(), type: 'item.create', listId: tasks, itemId: id.sub2, name: 'Laver', parentId: id.main },
    { id: uuid(), type: 'item.check', itemId: id.sub1, checked: true },
    { id: uuid(), type: 'item.create', listId: tasks, itemId: id.other, name: 'Arroser' },
    { id: uuid(), type: 'item.create', listId: tasks, itemId: id.gone, name: 'Supprimé' },
    { id: uuid(), type: 'item.delete', itemId: id.gone },
    { id: uuid(), type: 'list.create', listId: wishes, name: 'Envies', listType: 'wishes' },
    { id: uuid(), type: 'item.create', listId: wishes, itemId: id.w1, name: 'Vélo' },
    { id: uuid(), type: 'item.create', listId: wishes, itemId: id.w2, name: 'Livre' },
    { id: uuid(), type: 'item.check', itemId: id.w2, checked: true },
    { id: uuid(), type: 'list.create', listId: empty, name: 'Vide', listType: 'tasks' },
  ] });
  assert.ok(res.body.results.every((r) => r.status === 200), JSON.stringify(res.body));
  const state = loadSync(emptyState(), (await guillaume.get('/api/sync')).body);
  // Une principale, deux sous-tâches (une cochée), une autre tâche ; le supprimé exclu
  assert.deepEqual(listProgress(state, tasks), { remaining: 3, total: 4 });
  assert.deepEqual(listProgress(state, wishes), { remaining: 1, total: 2 });
  assert.deepEqual(listProgress(state, empty), { remaining: 0, total: 0 });
  // La carte de chaque liste donne exactement les mêmes nombres
  for (const card of computeSummaries(state)) {
    assert.deepEqual(listProgress(state, card.id), { remaining: card.remaining, total: card.total }, card.name);
  }
  // Phrase des lecteurs d'écran : celle de la carte
  assert.equal(progressLabel(3, 4, state.lists.get(tasks)), '3 éléments restants sur 4');
  assert.equal(progressLabel(1, 2, state.lists.get(wishes)), '1 souhait restant sur 2');
  assert.equal(progressText(3, 4), '3/4');
  // Un seul calcul : la carte passe par listProgress
  assert.match(read('public/js/store.js'), /\.\.\.listProgress\(state, list\.id\),/);
});

test('écran d\'une liste : compteur construit avec listProgress, phrase de la carte, jamais innerHTML', () => {
  const list = code('public/js/screens/list.js');
  assert.match(list, /const \{ remaining, total \} = list \? listProgress\(app\.data, listId\) : \{ remaining: 0, total: 0 \};/);
  // Liste vide (ou introuvable, ou pas encore chargée) : pas de compteur
  assert.match(list, /progress\.hidden = total === 0;\s*if \(total === 0\) return;/);
  // Même phrase que la carte, tout coché compris ; aria-label ET infobulle
  assert.match(list, /const sentence = progressLabel\(remaining, total, list\);/);
  assert.match(list, /const label = done \? t\('listes\.carte\.toutCoche', \{ progress: sentence \}\) : sentence;/);
  assert.match(list, /progress\.setAttribute\('aria-label', label\);\s*progress\.title = label;/);
  assert.match(list, /const progress = h\('p', \{ class: 'list-progress', role: 'img', hidden: true \}\);/);
  // Tout coché : classe (barre verte) ET coche après le texte (jamais la couleur seule)
  assert.match(list, /progress\.classList\.toggle\('list-progress--done', done\);/);
  assert.match(list, /done \? icon\('check', 'icon--sm'\) : null\);/);
  // Largeur du remplissage posée par le script (aucun style en ligne dans le HTML)
  assert.match(list, /progressFill\.style\.width = `\$\{progressShare\(remaining, total\)\}%`;/);
  // Ordinateur : « 5/6 restants » (phrase entière, le nombre à la place de {progress})
  assert.match(list, /t\('liste\.progression\.restants', \{ count: remaining \}\)\.split\('\{progress\}'\)/);
  // À jour en direct (synchronisation, temps réel, coche), sans attendre la fin d'un appui ;
  // et à chaque dessin, avant la recherche (le filtre ne change pas les nombres)
  assert.match(list, /onLeave\(onDataChange\(drawProgress\)\);/);
  assert.match(list, /foldables = \[\];\s*drawProgress\(\);/);
  assert.doesNotMatch(list, /innerHTML|outerHTML|insertAdjacentHTML/);
});

test('ordinateur : « À jour » sur la ligne du titre, avant « Partager » ; le compteur ouvre la ligne du dessous', () => {
  const list = code('public/js/screens/list.js');
  assert.match(list, /h\('header', \{ class: 'pc-head pc-head--list' \},\s*h\('div', \{ class: 'pc-head__main' \}, title, sub\),\s*syncPill\(\(\) => refreshData\(\{ full: true \}\)\),\s*shareSlot,\s*search\.field,\s*menuButton\),/);
  assert.match(list, /h\('div', \{ class: 'pc-tools' \}, progress, searchMeta,\s*h\('div', \{ class: 'pc-tools__end' \}, sortButton, foldAll\)\),/);
  // Une seule pastille par écran (ordinateur : dans l'en-tête ; téléphone : sous le titre)
  assert.equal(list.match(/syncPill\(/g).length, 2);
});

test('téléphone : la pastille reste sous le titre, le compteur juste après, « Tout replier » à droite sur la même ligne', () => {
  const list = code('public/js/screens/list.js');
  // Pastille qui se réduit à son icône quand la place manque (fitPill, ui.js)
  assert.match(list, /statusbar\.classList\.add\('statusbar--progress'\);\s*replace\(statusbar, syncPill\(\(\) => refreshData\(\{ full: true \}\), \{ inBar: true \}\), progress, foldAll\);/);
  const css = read('public/css/app.css');
  assert.match(css, /\.statusbar--progress \{ flex-wrap: nowrap; \}/);
  assert.match(css, /\.statusbar--progress > \.topbar__status \{ flex: 0 100 auto; \}/);
  assert.match(css, /\.statusbar--progress > \.fold-all \{ flex: none; \}/);
  assert.match(css, /\.statusbar--progress > \.list-progress \{ margin-right: auto; \}/);
  // Barre : 36 px (téléphone), 56 px (ordinateur), 6 px de haut, en pilule
  assert.match(css, /\.list-progress__track \{[^}]*width: 36px;[^}]*height: 6px;[^}]*border-radius: var\(--radius-pill\);[^}]*background: var\(--color-neutral-soft\);/);
  assert.match(css, /\.app--pc \.list-progress__track \{ width: 56px; \}/);
  assert.match(css, /\.list-progress__fill \{[^}]*background: var\(--color-accent\);/);
  assert.match(css, /\.list-progress--done \.list-progress__fill \{ background: var\(--color-success-ink\); \}/);
  assert.match(css, /\.list-progress__count \{ font-weight: 700; color: var\(--color-text\); \}/);
});

test('textes : « restant / restants » en français, “left” en anglais, pluriel selon les restants', () => {
  assert.deepEqual(fr['liste.progression.restants'], { one: '{progress} restant', other: '{progress} restants' });
  assert.deepEqual(en['liste.progression.restants'], { one: '{progress} left', other: '{progress} left' });
  // {progress} reste à sa place (le nombre en gras y est posé par l'écran)
  assert.equal(translate('fr', 'liste.progression.restants', { count: 5 }), '{progress} restants');
  assert.equal(translate('fr', 'liste.progression.restants', { count: 1 }), '{progress} restant');
  assert.equal(translate('fr', 'liste.progression.restants', { count: 0 }), '{progress} restant');
  assert.equal(translate('en', 'liste.progression.restants', { count: 5 }), '{progress} left');
  assert.equal(translate('fr', 'listes.carte.toutCoche', { progress: '0 élément restant sur 2' }), '0 élément restant sur 2, tout est coché');
});

test('aide : le compteur de la liste ouverte est décrit, en français et en anglais', () => {
  assert.match(read('public/js/help-content.js'), /Dans une liste ouverte, sous le titre, une petite barre/);
  assert.match(read('public/js/help-en/quotidien.js'), /In an open list, under the title, a small bar/);
});
