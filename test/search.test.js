// Recherche dans une liste (nom des articles) et sur « Mes listes » (titre
// des listes) : une simple vue locale. Majuscules, accents et ligatures
// ignorés, texte tapé jamais lu comme une expression régulière, texte trouvé
// surligné au bon endroit (sans HTML), groupes sans résultat masqués,
// cochés gardés, repli mémorisé intact, droits et données inchangés. Le
// comportement à l'écran (champ masqué, clavier, temps réel) est aussi
// vérifié dans Chromium (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  foldText, foldQuery, isSearching, findHits, matches, highlightParts, filterListView, filterLists, resultsLabel, listsLabel,
} from '../public/js/search.js';
import { emptyState, computeListView, canEditList, loadFoldedGroups, saveFoldedGroups } from '../public/js/store.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Morceaux surlignés seulement
const hitsOf = (text, query) => highlightParts(text, query).filter((part) => part.hit).map((part) => part.text);

test('filtrage : majuscules, accents et ligatures ignorés', () => {
  assert.ok(matches('Éclair au café', 'eclair'));
  assert.ok(matches('Éclair au café', 'ÉCLAIR'));
  assert.ok(matches('eclair', 'Éclair'), 'dans les deux sens');
  assert.ok(matches('Crème brûlée', 'creme brulee'));
  assert.ok(matches('Œufs', 'oeufs'));
  assert.ok(matches('Lait de coco', 'DE CO'));
  assert.ok(matches('Café', 'Café'), 'accent écrit à part (forme décomposée)');
  assert.ok(!matches('Pain', 'lait'));
  assert.equal(foldQuery('  Pâte  À  '), 'pate a', 'espaces autour retirés, espaces successifs réunis');
});

test('filtrage : nom vide, recherche vide ou faite d\'espaces', () => {
  assert.ok(!matches('', 'lait'), 'nom vide : jamais trouvé');
  assert.ok(matches('', ''), 'recherche vide : tout passe');
  assert.ok(matches('Pain', '   '), 'des espaces seuls ne cherchent rien');
  assert.equal(isSearching(''), false);
  assert.equal(isSearching('  '), false);
  assert.equal(isSearching('a'), true);
  assert.deepEqual(findHits('Pain', ''), []);
  assert.deepEqual(findHits(undefined, 'x'), []);
});

test('caractères spéciaux : <, & et expressions régulières cherchés tels quels, jamais interprétés', () => {
  assert.ok(matches('Tom & Jerry', '&'));
  assert.ok(matches('a <b> c', '<b>'));
  assert.ok(!matches('ab', '<b>'));
  assert.ok(!matches('abc', '.*'), '« .* » n\'est pas « n\'importe quoi »');
  assert.ok(matches('Prix .* fou', '.*'));
  assert.ok(!matches('aaa', 'a+'));
  assert.ok(matches('C++', '+'));
  assert.ok(!matches('abc', '[abc]'));
  assert.ok(matches('Lait (1 L)', '(1 l)'));
  assert.ok(matches('a\\b', '\\'));
  assert.ok(!matches('ab', '^a'));
  assert.ok(!matches('xyz', 'x|y'));
  for (const query of ['(', ')', '[', '*', '?', '{2}', '$', '^', '\\']) assert.doesNotThrow(() => matches('texte', query), query);
  // Le code compare des textes : aucune expression construite à partir de la saisie
  const code = read('public/js/search.js');
  assert.doesNotMatch(code, /new RegExp|RegExp\(/);
  assert.match(code, /folded\.indexOf\(wanted\)/);
});

test('surlignage au bon endroit, accents compris (le texte affiché garde ses accents)', () => {
  assert.deepEqual(highlightParts('Éclair au café', 'eclair'), [{ text: 'Éclair', hit: true }, { text: ' au café', hit: false }]);
  assert.deepEqual(highlightParts('Pâte à tartiner', 'a t'), [{ text: 'Pâte ', hit: false }, { text: 'à t', hit: true }, { text: 'artiner', hit: false }]);
  assert.deepEqual(hitsOf('Chocolat au lait', 'LAIT'), ['lait']);
  assert.deepEqual(hitsOf('Lait et lait', 'lait'), ['Lait', 'lait'], 'toutes les occurrences');
  assert.deepEqual(hitsOf('Œufs frais', 'oeufs'), ['Œufs'], 'ligature : le caractère entier');
  assert.deepEqual(hitsOf('Œufs', 'o'), ['Œ']);
  assert.deepEqual(hitsOf('Café noir', 'cafe'), ['Café'], 'accent écrit à part : surligné avec sa lettre');
  assert.deepEqual(hitsOf('pomme de  terre', 'de terre'), ['de  terre'], 'espaces doublés dans le nom');
  // Recollés, les morceaux redonnent exactement le nom
  for (const [name, query] of [['Éclair au café', 'clair'], ['Œufs', 'eu'], ['Straße', 'ss'], ['a <b> & c', '<b> &'], ['', 'x'], ['Pain', '']]) {
    assert.equal(highlightParts(name, query).map((part) => part.text).join(''), name, `${name} / ${query}`);
  }
  assert.deepEqual(highlightParts('Pain', ''), [{ text: 'Pain', hit: false }]);
  // Correspondance texte plié → texte d'origine
  const { folded, from, to } = foldText('Été');
  assert.equal(folded, 'ete');
  assert.deepEqual([from, to], [[0, 1, 2], [1, 2, 3]]);
});

test('écran : le texte trouvé est posé comme texte dans <mark class="hit">, jamais comme du HTML', () => {
  for (const file of ['public/js/search.js', 'public/js/search-row.js', 'public/js/screens/list.js', 'public/js/screens/lists.js']) {
    assert.doesNotMatch(read(file), /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, file);
  }
  const mark = /highlightParts\((name|name), (search\.value|query)\)\.map\(\(part\) => \(part\.hit \? h\('mark', \{ class: 'hit' \}, part\.text\) : part\.text\)\)/;
  assert.match(read('public/js/screens/list.js'), mark);
  assert.match(read('public/js/screens/lists.js'), mark);
  // Mise en évidence : gras ET souligné, jamais la couleur seule
  const css = read('public/css/listo.css');
  assert.match(css, /\.hit \{[^}]*font-weight: 700;[^}]*text-decoration: underline;/);
});

// Une liste de courses : deux rayons, un sans rayon, un coché
function shopping() {
  const state = emptyState();
  state.loaded = true;
  state.aisles = [{ id: 1, name: 'Crèmerie', active: true }, { id: 2, name: 'Épicerie sucrée', active: true }, { id: 3, name: 'Boulangerie', active: true }];
  state.lists.set('c', { id: 'c', name: 'Courses', type: 'shopping', store: null, members: [], canEdit: true, access: 'edit' });
  const item = (id, name, aisleId, checked = false) => state.items.set(id, { id, listId: 'c', name, aisleId, checked, note: '', quantity: '', ...(checked ? { checkedAt: '2026-10-19T10:00:00Z' } : {}) });
  item('a', 'Lait demi-écrémé', 1);
  item('b', 'Lait ribot', 1);
  item('d', 'Chocolat au lait', 2);
  item('e', 'Pain', 3);
  item('f', 'Lait de coco', null, true);
  item('g', 'Beurre', 1, true);
  state.items.get('e').note = 'lait'; // la note n'est jamais cherchée
  return state;
}

test('liste : groupes sans résultat masqués, cochés trouvés gardés, note ignorée, nombre de résultats', () => {
  const view = computeListView(shopping(), 'c');
  const shown = filterListView(view, 'LAIT');
  assert.deepEqual(shown.groups.map((g) => g.aisle?.name ?? 'Sans rayon'), ['Crèmerie', 'Épicerie sucrée'], 'Boulangerie (Pain) disparaît');
  assert.deepEqual(shown.groups.map((g) => g.items.map((i) => i.name)), [['Lait demi-écrémé', 'Lait ribot'], ['Chocolat au lait']]);
  assert.deepEqual(shown.done.map((i) => i.name), ['Lait de coco'], 'coché trouvé : dans « Dans le panier » ; Beurre non');
  assert.equal(shown.count, 4);
  // La vue d'origine n'est pas touchée
  assert.equal(view.groups.length, 3);
  assert.equal(view.done.length, 2);
  // Rien trouvé
  assert.deepEqual(filterListView(view, 'sirop'), { groups: [], done: [], count: 0 });
  // Recherche vide : tout
  assert.equal(filterListView(view, '').count, 6);
});

test('liste : tous les tris (par rayon, « multi », alphabétique « À acheter », tâches)', () => {
  const state = shopping();
  const alpha = filterListView(computeListView(state, 'c', { sort: 'alpha' }), 'lait');
  assert.equal(alpha.groups.length, 1);
  assert.equal(alpha.groups[0].label, 'À acheter', 'l\'en-tête « À acheter » reste (avec le nombre de résultats)');
  assert.equal(alpha.groups[0].all, true);
  assert.deepEqual(alpha.groups[0].items.map((i) => i.name), ['Chocolat au lait', 'Lait demi-écrémé', 'Lait ribot']);
  // Liste de tâches par priorité, puis alphabétique (sans en-tête)
  state.lists.set('t', { id: 't', name: 'Maison', type: 'tasks', priorityEnabled: true, members: [], canEdit: true });
  state.items.set('t1', { id: 't1', listId: 't', name: 'Réparer la porte', checked: false, priority: 'high' });
  state.items.set('t2', { id: 't2', listId: 't', name: 'Peindre le volet', checked: false, priority: 'normal' });
  const byPriority = filterListView(computeListView(state, 't', { sort: 'priority' }), 'REPARER');
  assert.deepEqual(byPriority.groups.map((g) => g.items.map((i) => i.name)), [['Réparer la porte']]);
  assert.ok(byPriority.groups[0].label, 'groupe de priorité gardé');
  assert.equal(filterListView(computeListView(state, 't'), 'volet').count, 1);
});

test('repli mémorisé intact : la recherche ouvre les groupes sans rien enregistrer', () => {
  const memory = new Map();
  const storage = () => ({ getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) });
  saveFoldedGroups('c', new Set(['a:1']), storage);
  const before = JSON.stringify([...memory]);
  filterListView(computeListView(shopping(), 'c'), 'lait');
  assert.equal(JSON.stringify([...memory]), before);
  assert.deepEqual([...loadFoldedGroups('c', storage)], ['a:1']);
  // À l'écran : pendant la recherche, l'en-tête d'un groupe n'a pas de bouton
  // de repli (et ne lit ni n'écrit l'état mémorisé) ; la zone des cochés est
  // ouverte sans être mémorisée, ses actions masquées, hors de « Tout replier »
  const list = read('public/js/screens/list.js');
  assert.match(list, /function foldableGroup\(list, group, name, lead = null\) \{\s*if \(searching\(\)\) return resultGroup\(group, name, lead\);\s*const key/);
  const resultGroup = list.slice(list.indexOf('function resultGroup('), list.indexOf('function noResults('));
  assert.doesNotMatch(resultGroup, /folded|saveFoldedGroups|aisle__toggle|aria-expanded/);
  assert.match(resultGroup, /h\('span', \{ class: 'aisle__count', 'aria-label': resultsLabel\(count\) \}, String\(count\)\)/);
  assert.match(list, /if \(!inSearch\) rememberZone\(listId, open\); \/\/ recherche : rien de mémorisé/);
  assert.match(list, /show\(inSearch \|\| isZoneOpen\(listId\)\);\s*if \(!inSearch\) foldables\.push\(foldable\);/);
  assert.match(list, /actionsRow\.hidden = !open \|\| !canEdit \|\| !mayCheck\(list\) \|\| inSearch;/);
  assert.match(list, /foldAll\.hidden = foldables\.length < 2 \|\| search\.active;/);
});

test('nombre de résultats : singulier et pluriel', () => {
  assert.equal(resultsLabel(0), '0 résultat');
  assert.equal(resultsLabel(1), '1 résultat');
  assert.equal(resultsLabel(2), '2 résultats');
  assert.equal(resultsLabel(12), '12 résultats');
  assert.equal(listsLabel(0), '0 liste');
  assert.equal(listsLabel(1), '1 liste');
  assert.equal(listsLabel(3), '3 listes');
  // Annoncé aux lecteurs d'écran
  assert.match(read('public/js/screens/list.js'), /const searchMeta = h\('p', \{ class: 'search-meta', role: 'status' \}\);/);
  assert.match(read('public/js/screens/lists.js'), /const searchMeta = h\('p', \{ class: 'search-meta', role: 'status' \}\);/);
});

test('« Mes listes » : titre seulement, listes partagées avec moi comprises', () => {
  const lists = [
    { id: '1', name: 'Courses Leclerc', isOwner: true },
    { id: '2', name: 'Cadeaux Noël/anniv Julie', isOwner: false, access: 'read' },
    { id: '3', name: 'Courses en ville', isOwner: false, access: 'edit' },
    { id: '4', name: 'Travaux', isOwner: true, category: { name: 'Courses' } },
  ];
  assert.deepEqual(filterLists(lists, 'cour').map((l) => l.id), ['1', '3'], 'ni la catégorie ni le reste de la carte');
  assert.deepEqual(filterLists(lists, 'NOEL').map((l) => l.id), ['2'], 'liste partagée en lecture seule comprise');
  assert.deepEqual(filterLists(lists, '').map((l) => l.id), ['1', '2', '3', '4']);
  assert.deepEqual(filterLists(lists, 'xyz'), []);
});

test('droits inchangés : un invité en lecture seule peut chercher ; rien n\'est écrit ni envoyé', () => {
  const state = shopping();
  const list = state.lists.get('c');
  list.canEdit = false;
  list.access = 'read';
  assert.equal(canEditList(list), false);
  assert.equal(filterListView(computeListView(state, 'c'), 'lait').count, 4, 'même résultat en lecture seule');
  // Le champ ne dépend pas du droit (seul « rien à chercher » le masque)
  const screen = read('public/js/screens/list.js');
  assert.match(screen, /const search = createSearchRow\(content, \{\s*label: 'Rechercher dans la liste',/);
  assert.doesNotMatch(screen.slice(screen.indexOf('const search = createSearchRow('), screen.indexOf('const menuButton')), /canEdit|editable/);
  // Barre d'ajout : toujours masquée en lecture seule, et pendant la saisie d'une recherche
  assert.match(screen, /function showAddbar\(\) \{\s*addbar\.hidden = !editable\(\) \|\| search\.focused;/);
  // Une vue locale : aucune opération, aucune requête, aucun stockage
  for (const file of ['public/js/search.js', 'public/js/search-row.js']) {
    const code = read(file);
    assert.doesNotMatch(code, /actions|api\.js|fetch\(|localStorage|indexedDB|perform\(/, file);
  }
  // Pas de recherche sur le lien public
  assert.doesNotMatch(read('public/js/public.js'), /search/);
});

test('recherche vidée au changement de liste ou en quittant l\'écran (état propre à chaque écran)', () => {
  // Le texte cherché vit dans le champ, créé à chaque ouverture de l'écran ;
  // search-row.js ne garde rien d'un écran à l'autre
  const row = read('public/js/search-row.js');
  const topLevel = row.split('\n').filter((line) => /^(let|var|const) /.test(line));
  assert.deepEqual(topLevel, [], 'aucune variable de module');
  const list = read('public/js/screens/list.js');
  const body = list.slice(list.indexOf('export function renderList(listId, onLeave) {'));
  assert.ok(body.indexOf('const search = createSearchRow(') > 0, 'champ créé à chaque ouverture d\'une liste');
  const home = read('public/js/screens/lists.js');
  const homeBody = home.slice(home.indexOf('export function renderLists(onLeave) {'), home.indexOf('export function renderSidePanel('));
  assert.ok(homeBody.includes('const search = createSearchRow(content, {'), 'champ créé à chaque ouverture de « Mes listes »');
  // Changer de liste monte un nouvel écran (app.js), donc un champ vide
  assert.match(read('public/js/app.js'), /case 'list': mount\(\(onLeave\) => renderList\(params\.id, onLeave\)/);
});

test('champ : jamais de curseur mis tout seul ; touche « rechercher », croix, « Effacer la recherche »', () => {
  const row = read('public/js/search-row.js');
  assert.doesNotMatch(row, /\.focus\(|autofocus|\.select\(/);
  assert.match(row, /enterkeyhint: 'search'/);
  assert.match(row, /if \(event\.key !== 'Enter'\) return;\s*event\.preventDefault\(\);\s*releaseFocus\(\);/, 'Entrée : clavier fermé, texte gardé');
  // Croix et « Effacer la recherche » : l'appui ne retire pas le curseur du champ
  assert.match(row, /'aria-label': 'Effacer la saisie',\s*hidden: true,\s*onPointerdown: keepFieldFocus\.pointerdown,\s*onMousedown: keepFieldFocus\.mousedown,/);
  for (const file of ['public/js/screens/list.js', 'public/js/screens/lists.js']) {
    assert.match(read(file), /onPointerdown: search\.keepFocus\.pointerdown,\s*onMousedown: search\.keepFocus\.mousedown,\s*onClick: \(\) => search\.clear\(\),\s*\}, 'Effacer la recherche'\)/, file);
  }
  // Aucune loupe dans les barres du haut
  for (const file of ['public/js/screens/list.js', 'public/js/screens/lists.js']) assert.doesNotMatch(read(file), /iconButton\('search'/, file);
  // « Nouvelle liste » masqué pendant la recherche
  assert.match(read('public/js/screens/lists.js'), /onActive: \(active\) => \{ fab\.hidden = active; \}/);
});
