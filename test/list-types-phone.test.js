// Types de liste côté téléphone : formulaire « Type de liste », copie locale
// (changement de type sans perte, magasin conservé caché), ancienne
// opération de la file d'attente, et aucun accès aux anciens champs
// « catégorie » dans le nouveau code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { emptyState, loadSync, applyOp, computeListView, availableSorts, listOptions, remembersNames } from '../public/js/store.js';
import { isMultiList } from '../public/js/sorting.js';
import { itemWords } from '../public/js/words.js';
import { listIcon } from '../public/js/list-icons.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Code sans les commentaires
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
const me = { id: 1, username: 'guillaume', displayName: 'Guillaume' };
const store = { id: 3, name: 'Lidl', active: true, isMulti: false };

// Données comme les envoie le serveur : une liste de tâches qui a été une
// liste de courses (magasin caché, keptStore pour le propriétaire), avec ses
// rayons et codes-barres gardés
function serverData() {
  return {
    serverTime: '2026-11-01T10:00:00.000Z',
    listIds: ['L'],
    lists: [{
      id: 'L', name: 'Maison', icon: '', type: 'tasks', store: null, keptStore: store, isOwner: true, canEdit: true,
      priorityEnabled: true, dueEnabled: false, addMode: 'detail', members: [], updatedAt: '2026-11-01T09:00:00.000Z', deletedAt: null,
      // champ provisoire pour les anciens téléphones : jamais lu par le nouveau code
      category: { id: 1, name: 'Courses', isShopping: true, active: true },
    }],
    items: [
      { id: 'a', listId: 'L', name: 'Lait', aisleId: 4, storeId: null, ean: '3428272950019', priority: 'high', dueDate: null, checked: false, updatedAt: '2026-11-01T09:00:00.000Z', deletedAt: null },
      { id: 'b', listId: 'L', name: 'Vis', aisleId: null, storeId: 3, ean: null, priority: 'normal', dueDate: null, checked: false, updatedAt: '2026-11-01T09:00:00.000Z', deletedAt: null },
    ],
    categories: [{ id: 1, name: 'Courses', isShopping: true, active: true }],
    stores: [store, { id: 9, name: 'Marché', active: true, isMulti: true, storeIds: [3] }],
    aisles: [{ id: 4, name: 'Crèmerie', active: true }],
    history: [],
    users: [],
  };
}

test('liste de tâches qui a été de courses : le magasin conservé n\'apparaît nulle part (en-tête, groupes, tris, mots)', () => {
  const state = loadSync(emptyState(), serverData());
  const view = computeListView(state, 'L');
  assert.equal(view.list.store, null, 'en-tête : pas de magasin, le type à la place');
  assert.equal(view.multi, false);
  assert.equal(isMultiList(view.list), false);
  // Un seul groupe, sans rayon ni magasin (ni « Crèmerie », ni « Lidl »)
  assert.equal(view.groups.length, 1);
  assert.equal(view.groups[0].aisle ?? null, null);
  assert.equal(view.groups[0].store ?? null, null);
  assert.equal(JSON.stringify(view.groups).includes('Crèmerie'), false);
  assert.deepEqual(availableSorts(view.list), ['alpha', 'priority'], 'ni « Par rayon » ni « Par magasin »');
  assert.deepEqual(listOptions(view.list), { priority: true, due: false });
  assert.equal(remembersNames(view.list), false);
  assert.equal(itemWords(view.list).one, 'élément');
  assert.equal(listIcon(view.list), 'tasks');
  // En-tête de la liste : le magasin seulement s'il est donné, sinon le nom du type
  assert.match(code('public/js/screens/list.js'), /replace\(sub, list\.store \? \[icon\('store', 'icon--xs'\), list\.store\.name, view\.multi \? multiBadge\(\) : null\] : isWishList\(list\) \? wishForLabel\(list\) : typeLabel\(list\)\);/);
});

test('copie locale : courses → tâches → courses (propriétaire), magasin caché puis rendu, rien d\'effacé', () => {
  const data = serverData();
  data.lists[0] = { ...data.lists[0], type: 'shopping', store, keptStore: undefined };
  const state = loadSync(emptyState(), data);
  const now = '2026-11-01T11:00:00.000Z';
  assert.equal(computeListView(state, 'L').groups[0].aisle.name, 'Crèmerie', 'courses : par rayon');
  applyOp(state, { type: 'list.update', listId: 'L', listType: 'tasks' }, { user: me, now });
  let list = state.lists.get('L');
  assert.deepEqual([list.type, list.store, list.keptStore], ['tasks', null, store]);
  assert.equal(computeListView(state, 'L').groups[0].aisle ?? null, null);
  // Un ancien téléphone enverrait « aucun magasin » : ici, pour une liste de tâches, rien ne change
  applyOp(state, { type: 'list.update', listId: 'L', name: 'Maison' }, { user: me, now });
  assert.deepEqual(state.lists.get('L').keptStore, store);
  applyOp(state, { type: 'list.update', listId: 'L', listType: 'shopping' }, { user: me, now });
  list = state.lists.get('L');
  assert.deepEqual([list.type, list.store, 'keptStore' in list], ['shopping', store, false]);
  assert.equal(computeListView(state, 'L').groups[0].aisle.name, 'Crèmerie', 'rayons revenus');
  // Valeurs des éléments jamais touchées
  assert.deepEqual([state.items.get('a').aisleId, state.items.get('a').ean, state.items.get('a').priority], [4, '3428272950019', 'high']);
});

test('copie locale : création selon listType ; ancienne opération (catégorie) en attente → tâches jusqu\'à la réponse du serveur', () => {
  const state = loadSync(emptyState(), serverData());
  const now = '2026-11-01T11:00:00.000Z';
  applyOp(state, { type: 'list.create', listId: 'N', name: 'Courses', listType: 'shopping', storeId: 3 }, { user: me, now });
  assert.deepEqual([state.lists.get('N').type, state.lists.get('N').store?.name, state.lists.get('N').addMode], ['shopping', 'Lidl', 'quick']);
  applyOp(state, { type: 'list.create', listId: 'T', name: 'Tâches', listType: 'tasks', storeId: 3 }, { user: me, now });
  assert.deepEqual([state.lists.get('T').type, state.lists.get('T').store], ['tasks', null], 'pas de magasin pour une liste de tâches');
  applyOp(state, { type: 'list.create', listId: 'O', name: 'Ancienne', categoryId: 1 }, { user: me, now });
  assert.equal(state.lists.get('O').type, 'tasks', 'la catégorie n\'est pas lue ; le serveur traduit');
  assert.equal('category' in state.lists.get('O'), false);
});

test('formulaire : « Type » (Courses, Tâches, Envies à la création ; Envies figé), avertissement avant l\'enregistrement, magasin gardé', () => {
  const form = code('public/js/screens/list-form.js');
  assert.match(form, /h\('span', \{ class: 'field__label', id: 'type-label' \}, 'Type'\), typeGroup, typeWarning\)/);
  assert.match(form, /const offered = !list \? CREATABLE_TYPES : wishesLocked \? \['wishes'\] : CHANGEABLE_TYPES;/);
  assert.match(form, /const typeButtons = offered\.map\(\(type\) => \{/);
  // Même composant qu'avant (choix en cartes du kit), avec coche ET texte,
  // trois cartes de même largeur sur une seule ligne (choice--row), même à 320 px
  assert.match(form, /h\('div', \{ class: 'choice choice--row', role: 'radiogroup', 'aria-labelledby': 'type-label', 'aria-describedby': 'type-warning' \}, typeButtons\)/);
  assert.match(form, /const typeWarning = h\('p', \{ class: 'field__hint', id: 'type-warning', 'aria-live': 'polite', hidden: !wishesLocked \}, wishesLocked \? WISHES_LOCKED_HINT : ''\);/);
  assert.match(form, /const warning = list \? typeChangeWarning\(savedType, listType\) : '';/);
  // Envoyé seulement s'il change ; magasin conservé repris, renvoyé seulement s'il change
  assert.match(form, /if \(listType !== savedType\) switches\.listType = listType;/);
  assert.match(form, /const currentStore = list\?\.store \?\? list\?\.keptStore \?\? null;/);
  assert.match(form, /if \(shopping && chosenStore !== \(currentStore\?\.id \?\? null\)\) switches\.storeId = chosenStore;/);
  assert.doesNotMatch(form, /innerHTML|\.focus\(/);
  // Kit : aucune nouvelle classe pour ce champ, sauf la disposition en ligne
  const css = read('public/css/app.css');
  assert.match(css, /\.choice--row \.choice__opt \{ flex: 1 1 0; min-width: 0; align-items: center;[^}]*overflow-wrap: anywhere; \}/);
  assert.doesNotMatch(css, /choice--wrap/);
  assert.match(form, /icon\(TYPE_ICONS\[type\]\), TYPE_LABELS\[type\]\);/);
  assert.doesNotMatch(css, /type-warning|list-type/);
});

test('le nouveau code du téléphone ne lit jamais les anciens champs « catégorie » (list.category, categories, categoryId)', () => {
  const dir = new URL('../public/js/', import.meta.url);
  const files = [];
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(dir.pathname);
  files.push(new URL('../public/sw.js', import.meta.url).pathname, new URL('../public/index.html', import.meta.url).pathname);
  assert.ok(files.length > 30);
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8').split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
    assert.doesNotMatch(source, /categor/i, path.relative(process.cwd(), file));
  }
});
