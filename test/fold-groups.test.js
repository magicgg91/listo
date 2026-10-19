// Groupes repliables dans toutes les listes (rayons, magasins « multi »,
// priorités, zone des cochés) : identifiant des groupes, état mémorisé sur le
// téléphone (jamais envoyé au serveur), ménage, en-têtes accessibles, liste
// simple sans en-tête, groupe déplié par un ajout, état gardé au redessin
// (temps réel, changement de tri). Le comportement à l'écran est aussi vérifié
// dans Chromium (voir docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  emptyState, applyOp, computeListView, groupKey, possibleGroupKeys, loadFoldedGroups, saveFoldedGroups,
  pruneFoldedGroups, pruneListMemory, isZoneOpen, rememberZone, FOLDED_PREFIX,
} from '../public/js/store.js';
import { progressText, progressLabel } from '../public/js/words.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// Stockage du navigateur simulé
function memoryStorage() {
  const memory = new Map();
  const storage = () => ({
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
    key: (i) => [...memory.keys()][i] ?? null,
    get length() { return memory.size; },
  });
  return { memory, storage };
}
const broken = () => { throw new Error('stockage refusé'); };

// Une liste de courses (deux rayons), une liste « multi », une liste de tâches
function household() {
  const state = emptyState();
  state.loaded = true;
  state.aisles = [{ id: 1, name: 'Fruits et légumes' }, { id: 2, name: 'Crèmerie' }];
  state.stores = [{ id: 7, name: 'Marché', isMulti: false }, { id: 9, name: 'Multi', isMulti: true }];
  const list = (id, isShopping, store = null) => state.lists.set(id, { id, name: id, category: { isShopping }, store });
  list('courses', true);
  list('multi', true, { id: 9, name: 'Multi', isMulti: true });
  list('maison', false);
  for (const id of ['courses', 'multi', 'maison']) state.listIds.add(id);
  const item = (id, listId, fields) => state.items.set(id, { id, listId, name: id, checked: false, note: '', quantity: '', ...fields });
  item('Pommes', 'courses', { aisleId: 1 });
  item('Lait', 'courses', { aisleId: 2 });
  item('Sel', 'courses', { aisleId: null });
  item('Fromage', 'multi', { storeId: 7 });
  item('Pain', 'multi', { storeId: null });
  item('Peinture', 'maison', { priority: 'high' });
  item('Vis', 'maison', { priority: 'normal' });
  return state;
}

test('identifiant d\'un groupe : rayon, magasin, priorité, « sans » ; stable d\'un dessin à l\'autre', () => {
  const state = household();
  assert.deepEqual(computeListView(state, 'courses').groups.map(groupKey), ['a:2', 'a:1', 'a:aucun']);
  assert.deepEqual(computeListView(state, 'multi').groups.map(groupKey), ['s:7', 's:aucun']);
  assert.deepEqual(computeListView(state, 'maison', { sort: 'priority' }).groups.map(groupKey), ['p:high', 'p:normal']);
  // Tous connus de la liste des groupes possibles
  const possible = possibleGroupKeys(state);
  for (const key of ['a:1', 'a:2', 'a:aucun', 's:7', 's:9', 's:aucun', 'p:high', 'p:normal', 'p:low']) assert.ok(possible.has(key), key);
  assert.equal(possible.has('a:3'), false);
});

test('« N\'invente pas de catégories » : ordre alphabétique et par échéance sans en-tête', () => {
  const state = household();
  for (const sort of ['alpha', 'due']) {
    const { groups } = computeListView(state, 'maison', { sort });
    assert.equal(groups.length, 1, sort);
    assert.equal(groups[0].label, undefined, `${sort} : pas de nom de groupe`);
    assert.equal(groups[0].priority, undefined);
  }
  // À l'écran : une telle liste est dessinée sans en-tête ni bouton
  const list = read('public/js/screens/list.js');
  assert.match(list, /: group\.label \? foldableGroup\(list, group, group\.label\)\s*\/\/ Ordre alphabétique ou par échéance : liste simple, sans en-tête\s*: h\('section', \{\}, h\('ul', \{\}, group\.items\.map\(itemRow\)\)\)/);
});

test('état replié : par liste et par téléphone, déplié par défaut, stockage indisponible sans erreur', () => {
  const { memory, storage } = memoryStorage();
  assert.deepEqual([...loadFoldedGroups('courses', storage)], [], 'tout déplié par défaut');
  saveFoldedGroups('courses', new Set(['a:1', 's:aucun']), storage);
  saveFoldedGroups('maison', new Set(['p:low']), storage);
  assert.equal(memory.get(`${FOLDED_PREFIX}courses`), '["a:1","s:aucun"]');
  assert.deepEqual([...loadFoldedGroups('courses', storage)], ['a:1', 's:aucun']);
  assert.deepEqual([...loadFoldedGroups('maison', storage)], ['p:low'], 'chaque liste son état');
  // Tout déplié : la clé disparaît
  saveFoldedGroups('maison', new Set(), storage);
  assert.equal(memory.has(`${FOLDED_PREFIX}maison`), false);
  // Contenu abîmé : ignoré
  memory.set(`${FOLDED_PREFIX}courses`, '{pas du json');
  assert.deepEqual([...loadFoldedGroups('courses', storage)], []);
  memory.set(`${FOLDED_PREFIX}courses`, '["a:1", 3, null, {"a":1}]');
  assert.deepEqual([...loadFoldedGroups('courses', storage)], ['a:1']);
  memory.set(`${FOLDED_PREFIX}courses`, '"a:1"');
  assert.deepEqual([...loadFoldedGroups('courses', storage)], []);
  // Stockage indisponible (navigation privée…) : rien ne casse
  assert.deepEqual([...loadFoldedGroups('courses', broken)], []);
  assert.doesNotThrow(() => saveFoldedGroups('courses', new Set(['a:1']), broken));
  assert.equal(isZoneOpen('courses', broken), true);
  assert.doesNotThrow(() => rememberZone('courses', false, broken));
  assert.doesNotThrow(() => pruneListMemory([], broken));
});

test('zone des cochés : même principe (repliée, puis rouverte)', () => {
  const { memory, storage } = memoryStorage();
  assert.equal(isZoneOpen('courses', storage), true);
  rememberZone('courses', false, storage);
  assert.equal(memory.get('listo-zone-repliee-courses'), '1');
  assert.equal(isZoneOpen('courses', storage), false);
  rememberZone('courses', true, storage);
  assert.equal(memory.size, 0);
});

test('ménage : groupes qui n\'existent plus, listes qui ne sont plus sur le téléphone', () => {
  const state = household();
  const folded = new Set(['a:1', 'a:99', 's:aucun', 's:42', 'p:high', 'p:urgent']);
  assert.equal(pruneFoldedGroups(folded, possibleGroupKeys(state)), true);
  assert.deepEqual([...folded], ['a:1', 's:aucun', 'p:high']);
  assert.equal(pruneFoldedGroups(folded, possibleGroupKeys(state)), false, 'rien à retirer');
  // Rayon supprimé par l'Admin : oublié au dessin suivant
  state.aisles = state.aisles.filter((aisle) => aisle.id !== 1);
  pruneFoldedGroups(folded, possibleGroupKeys(state));
  assert.deepEqual([...folded], ['s:aucun', 'p:high']);
  // Listes disparues : tri, groupes repliés et zone des cochés oubliés ;
  // les autres réglages ne sont pas touchés
  const { memory, storage } = memoryStorage();
  for (const id of ['garde', 'partie']) {
    memory.set(`listo-tri-liste-${id}`, 'priority');
    memory.set(`${FOLDED_PREFIX}${id}`, '["p:high"]');
    memory.set(`listo-zone-repliee-${id}`, '1');
  }
  memory.set('listo-tri-listes', 'alpha');
  pruneListMemory(['garde'], storage);
  assert.deepEqual([...memory.keys()].sort(), ['listo-groupes-replies-garde', 'listo-tri-liste-garde', 'listo-tri-listes', 'listo-zone-repliee-garde']);
  const lists = read('public/js/screens/lists.js');
  assert.match(lists, /pruneListMemory\(lists\.map\(\(list\) => list\.id\)\);/);
});

test('jamais envoyé au serveur : l\'état ne vit que dans le stockage du téléphone', () => {
  for (const file of ['public/js/api.js', 'public/js/actions.js', 'public/js/sync.js', 'public/js/app.js'].filter((f) => fs.existsSync(new URL(`../${f}`, import.meta.url)))) {
    const source = read(file);
    assert.doesNotMatch(source, /folded|Folded|groupes-replies|zone-repliee/, file);
  }
  for (const file of fs.readdirSync(new URL('../server/', import.meta.url))) {
    if (file.endsWith('.js')) assert.doesNotMatch(read(`server/${file}`), /groupes-replies|folded/i, file);
  }
});

test('en-tête de groupe : vrai bouton, aria-expanded, aria-controls, replié lisible sans la couleur', () => {
  const list = read('public/js/screens/list.js');
  assert.match(list, /const toggle = h\('button', \{\s*class: 'aisle__toggle',\s*type: 'button',\s*'aria-controls': listEl\.id,/);
  assert.match(list, /toggle\.setAttribute\('aria-expanded', String\(open\)\);\s*listEl\.hidden = !open;/);
  // Ouvert comme replié : compteur « X/Y » à droite, en texte ; lecteurs
  // d'écran et infobulle : « 2 articles restants sur 5 »
  assert.match(list, /const counter = h\('span', \{ class: 'aisle__count', 'aria-hidden': 'true' \}, progressText\(remaining, total\)\);/);
  assert.match(list, /'aria-label': `\$\{name\}, \$\{progressLabel\(remaining, total, list\)\}`,/);
  assert.equal(progressText(2, 5), '2/5');
  assert.equal(progressLabel(2, 5, { category: { isShopping: true } }), '2 articles restants sur 5');
  assert.equal(progressLabel(3, 3, { category: { isShopping: false } }), '3 éléments restants sur 3');
  // Les trois sortes de groupes passent par le même en-tête
  assert.match(list, /view\.multi \? foldableGroup\(list, group, group\.store\?\.name \?\? 'Sans magasin', icon\('store', 'icon--xs'\)\)/);
  assert.match(list, /: list\.category\.isShopping \? foldableGroup\(list, group, group\.aisle\?\.name \?\? 'Sans rayon'\)/);
  // Textes posés en texte, jamais en HTML
  assert.doesNotMatch(list, /innerHTML|insertAdjacentHTML|outerHTML/);
  // 48 px de haut, chevron qui tourne, kit et application identiques
  const css = read('public/css/listo.css');
  assert.match(css, /\.aisle__toggle \{[^}]*min-height: var\(--tap\);/);
  assert.match(css, /\.aisle__toggle\[aria-expanded="false"\] > \.icon \{ transform: rotate\(-90deg\); \}/);
  const section = (text) => text.slice(text.indexOf('/* 16.11'), text.indexOf('.fold-all--open .icon'));
  assert.ok(section(css).length > 200);
  assert.equal(section(read('design/listo.css')), section(css));
});

test('« Tout replier / Tout déplier » : au moins deux groupes, zone des cochés comprise', () => {
  const list = read('public/js/screens/list.js');
  assert.match(list, /foldAll\.hidden = foldables\.length < 2;/);
  assert.match(list, /anyOpen \? 'Tout replier' : 'Tout déplier'/);
  assert.match(list, /const open = !foldables\.some\(\(f\) => f\.isOpen\(\)\);\s*for \(const f of foldables\) f\.setOpen\(open\);/);
  assert.match(list, /foldables\.push\(foldable\); \/\/ « Tout replier » la replie aussi/);
  assert.match(list, /h\('div', \{ class: 'statusbar' \}, syncPill\(\(\) => refreshData\(\{ full: true \}\)\), foldAll\)/);
});

test('ajout dans un groupe replié : le groupe se déplie (toutes les listes)', () => {
  const list = read('public/js/screens/list.js');
  // Champ, suggestion, scan, dans toutes les listes : revealItem déplie avant de défiler
  assert.match(list, /function revealItem\(itemId\) \{\s*whenRow\(itemId, \(row\) => \{\s*unfoldRow\(row\);/);
  assert.match(list, /if \(item\) revealItem\(item\.id\);\s*return item;/);
  assert.match(list, /releaseFocus\(\);\s*revealItem\(item\.id\);\s*\}\s*\/\/ Attend la ligne/);
  assert.match(list, /if \(group && !group\.isOpen\(\)\) \{\s*group\.setOpen\(true\);/);
});

test('état gardé au redessin : temps réel, changement de tri, coche', () => {
  const list = read('public/js/screens/list.js');
  // Lu une fois à l'ouverture de la liste, puis relu par chaque dessin
  assert.match(list, /const folded = loadFoldedGroups\(listId\);\s*\/\/ Groupes repliables du dernier dessin/);
  assert.match(list, /show\(!folded\.has\(key\)\);/);
  assert.equal((list.match(/loadFoldedGroups\(/g) ?? []).length, 1);
  // Un changement venu de l'autre téléphone ne touche pas à l'état : seuls le
  // bouton de l'en-tête, « Tout replier » et un ajout d'ici le modifient
  assert.equal((list.match(/folded\.(add|delete)\(/g) ?? []).length, 2);
  assert.equal((list.match(/\.setOpen\(/g) ?? []).length, 4); // en-tête, zone des cochés, Tout replier, ajout
  // Le même dessin, avec un article de plus (temps réel) : mêmes groupes
  const state = household();
  const before = computeListView(state, 'courses').groups.map(groupKey);
  applyOp(state, { type: 'item.create', listId: 'courses', itemId: 'Fraises', name: 'Fraises', aisleId: 1 }, { user: { id: 1, username: 'guillaume' }, now: '2026-10-18T10:00:00.000Z' });
  assert.deepEqual(computeListView(state, 'courses').groups.map(groupKey), before);
});
