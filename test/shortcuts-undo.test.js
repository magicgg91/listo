// Interface ordinateur, étape 3 : annulation (Ctrl+Z) et raccourcis clavier.
// Annulable : supprimer, cocher ou décocher, modifier un article ; rien ne
// s'écrase si quelqu'un a changé l'article entre-temps ; l'action inverse
// passe par les opérations habituelles (copie locale puis file d'attente :
// hors ligne compris). Raccourcis : aucun pendant la saisie, désactivables,
// jamais un bouton qu'un rôle n'a pas.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recordUndo, undoLast, undoCount, clearUndo, forgetUndo, beforeOf, UNDO_MAX, CHANGED_MEANWHILE, NOTHING_TO_UNDO } from '../public/js/undo.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// Faux magasin : applique les actions inverses comme le ferait la copie locale
function fakeStore(items) {
  const map = new Map(items.map((i) => [i.id, { ...i }]));
  const done = [];
  const act = {
    restore: async (id) => { done.push(['restore', id]); map.set(id, { id, name: 'revenu', checked: false }); },
    check: async (item, checked) => { done.push(['check', item.id, checked]); map.get(item.id).checked = checked; },
    update: async (item, changes) => { done.push(['update', item.id, changes]); Object.assign(map.get(item.id), changes); },
  };
  return { map, done, act };
}

test('annulation : suppression, cochage, modification, dans l\'ordre inverse, liste par liste', async () => {
  clearUndo();
  const { map, done, act } = fakeStore([{ id: 'a', name: 'Lait', checked: false, quantity: '1 L' }, { id: 'b', name: 'Pain', checked: false }]);
  recordUndo('L1', { kind: 'check', itemId: 'a', name: 'Lait', checked: true });
  map.get('a').checked = true;
  recordUndo('L1', { kind: 'update', itemId: 'a', name: 'Lait', before: beforeOf(map.get('a'), { quantity: '2 L' }), after: { quantity: '2 L' } });
  map.get('a').quantity = '2 L';
  recordUndo('L1', { kind: 'delete', itemId: 'b', name: 'Pain' });
  map.delete('b');
  recordUndo('L2', { kind: 'delete', itemId: 'z', name: 'Autre liste' });
  assert.equal(undoCount('L1'), 3);
  assert.equal(await undoLast('L1', map, act), 'Annulé : « Pain » est de retour.');
  assert.equal(await undoLast('L1', map, act), 'Annulé : modification de « Lait ».');
  assert.equal(map.get('a').quantity, '1 L');
  assert.equal(await undoLast('L1', map, act), 'Annulé : « Lait » décoché.');
  assert.equal(map.get('a').checked, false);
  assert.equal(await undoLast('L1', map, act), NOTHING_TO_UNDO);
  assert.deepEqual(done.map((d) => d[0]), ['restore', 'update', 'check']);
  assert.equal(undoCount('L2'), 1, 'l\'autre liste garde son action');
});

test('annulation : rien n\'est écrasé si l\'article a changé entre-temps (temps réel, autre appareil)', async () => {
  clearUndo();
  const { map, done, act } = fakeStore([{ id: 'a', name: 'Café', checked: false }]);
  // Modifié par moi, puis renommé par quelqu'un d'autre
  recordUndo('L', { kind: 'update', itemId: 'a', name: 'Café', before: { name: 'Café' }, after: { name: 'Café moulu' } });
  map.get('a').name = 'Café de Léa';
  assert.equal(await undoLast('L', map, act), CHANGED_MEANWHILE);
  // Coché par moi, décoché par quelqu'un d'autre
  recordUndo('L', { kind: 'check', itemId: 'a', name: 'Café', checked: true });
  assert.equal(await undoLast('L', map, act), CHANGED_MEANWHILE);
  // Supprimé par moi, déjà remis ailleurs
  recordUndo('L', { kind: 'delete', itemId: 'a', name: 'Café' });
  assert.equal(await undoLast('L', map, act), CHANGED_MEANWHILE);
  // Modifié par moi, supprimé par quelqu'un d'autre
  recordUndo('L', { kind: 'check', itemId: 'x', name: 'Disparu', checked: true });
  assert.equal(await undoLast('L', map, act), CHANGED_MEANWHILE);
  assert.deepEqual(done, [], 'aucune écriture');
});

test('annulation : 20 actions au plus par liste ; « Annuler » du message l\'oublie ; champs vides équivalents', async () => {
  clearUndo();
  for (let i = 0; i < UNDO_MAX + 5; i++) recordUndo('L', { kind: 'delete', itemId: `i${i}`, name: `n${i}` });
  assert.equal(undoCount('L'), UNDO_MAX);
  const entry = { kind: 'delete', itemId: 'last', name: 'Dernier' };
  recordUndo('L', entry);
  forgetUndo('L', (e) => e === entry);
  assert.equal(undoCount('L'), UNDO_MAX - 1, 'la plus ancienne est partie, la dernière est oubliée');
  // Note effacée (null) puis remise : '' et null se valent
  const { map, act } = fakeStore([{ id: 'a', name: 'Riz', note: '' }]);
  recordUndo('M', { kind: 'update', itemId: 'a', name: 'Riz', before: beforeOf({ note: 'bio' }, { note: '' }), after: { note: null } });
  assert.match(await undoLast('M', map, act), /Annulé/);
  assert.equal(map.get('a').note, 'bio');
  assert.deepEqual(beforeOf({ name: 'A' }, { priority: 'high', dueDate: '2026-11-12' }), { priority: 'normal', dueDate: null });
});

test('annulation : les actions inverses sont les opérations habituelles (file d\'attente, hors ligne compris)', () => {
  const app = read('public/js/app.js');
  assert.match(app, /restore: \(itemId\) => actions\.restoreItem\(itemId\),\s*check: \(item, checked\) => actions\.checkItem\(item, checked\),\s*update: \(item, changes\) => actions\.updateItem\(item, changes\),/);
  // Liste en lecture seule : rien n'est tenté (le serveur refuserait de toute façon)
  assert.match(app, /if \(!canEditList\(app\.data\.lists\.get\(listId\)\)\) \{\s*toast\('Liste en lecture seule : rien n\\'est annulé\.'\);/);
  const actions = read('public/js/actions.js');
  assert.match(actions, /export const restoreItem = \(itemId\) => perform\(\{ type: 'item\.restore', itemId \}\);/);
  assert.match(actions, /export function checkItem\(item, checked\) \{\s*const next = checked \? nextDueOf\(item\) : null;\s*return perform\(\{ type: 'item\.check', itemId: item\.id, checked, \.\.\.\(next \? \{ nextDue: next \} : \{\}\) \}\);\s*\}/);
  // Ce qui est noté : suppression, cochage, modification (jamais un ajout, une photo, une réservation)
  const list = read('public/js/screens/list.js');
  // (5 : suppression, cochage, modification, et pour une tâche qui se
  // répète, son cochage et « Passer cette fois », notés comme une
  // modification de l'échéance)
  assert.equal((list.match(/recordUndo\(listId, /g) ?? []).length, 5);
  assert.equal((list.match(/const entry = \{ kind: 'update', itemId: item\.id, name: (item|saved)\.name, before, after: \{ dueDate: next \} \};/g) ?? []).length, 2);
  assert.match(list, /recordUndo\(listId, \{ kind: 'check', itemId: item\.id, name: item\.name, checked: !item\.checked \}\);\s*actions\.checkItem\(item, !item\.checked\);/);
  assert.match(list, /recordUndo\(listId, \{ kind: 'update', itemId: item\.id, name: item\.name, before: beforeOf\(latest, changes\), after: changes \}\);\s*await actions\.updateItem\(item, changes\);/);
  assert.doesNotMatch(read('public/js/undo.js').replace(/\/\/.*$/gm, ''), /reserv|photo|addItem|createItem/i);
});

test('raccourcis : aucun pendant la saisie, désactivables (gardé sur l\'appareil), une fenêtre ouverte ne laisse que ? et Échap', () => {
  const keys = read('public/js/shortcuts.js');
  assert.match(keys, /if \(typing \|\| mod \|\| event\.altKey\) return;/);
  assert.match(keys, /if \(!singleKeysOn\(\)\) return;/);
  assert.match(keys, /if \(topLayer\(\) && event\.key !== '\?'\) return;/);
  assert.match(keys, /return localStorage\.getItem\(KEY\) !== 'off';/);
  // Ctrl+Z ne vole pas l'annulation d'un champ ; Ctrl+Entrée marche en saisie
  assert.match(keys, /if \(typing \|\| topLayer\(\)\) return;\s*event\.preventDefault\(\);\s*onUndo\(\);/);
  assert.ok(keys.indexOf("event.key === 'Enter'") < keys.indexOf('if (typing || mod || event.altKey) return;'));
  // Seulement sur ordinateur
  assert.match(keys, /if \(event\.defaultPrevented \|\| !onPc\(\)\) return;/);
  // Les 17 raccourcis de la maquette, ni plus ni moins (fenêtre « ? »)
  const listed = [...keys.matchAll(/\[\[((?:'[^']*'(?:, )?)+)\], '/g)].map((m) => m[1]);
  assert.deepEqual(listed, ["'?'", "'N'", "'/'", "','", "'Échap'", "'[', ']'", "'Ctrl', 'Z'", "'Ctrl', 'Entrée'", "'P'", "'A'", "'↓', '↑'", "'Espace'", "'Entrée'", "'E'", "'Suppr'", "'Menu'", "'S'"]);
  // Réglages : l'interrupteur, sur ordinateur
  const settings = read('public/js/screens/settings.js');
  assert.match(settings, /section\('Général', h\('div', \{ class: 'group' \}, keysRow\(\), generalRows\(isAdmin\)\)\),/);
  assert.match(settings, /'Raccourcis à une touche'/);
  assert.match(read('public/sw.js'), /'\/js\/shortcuts\.js',\s*'\/js\/undo\.js',/);
});

test('raccourcis : ils n\'appuient que sur des boutons présents ; rien pour un rôle sans droit, jamais de réservation', () => {
  const keys = read('public/js/shortcuts.js');
  // E, Espace, Suppr : le crayon, la case et la corbeille de la ligne (absents en lecture seule)
  assert.match(keys, /e: \(\) => pressInRow\('\[data-action="edit"\]'\),/);
  assert.match(keys, /' ': \(\) => pressInRow\('button\.check'\),/);
  assert.match(keys, /const trash = rowButton\(row, '\[data-action="delete"\]'\);\s*if \(!trash\) return false;/);
  // A : seulement si le champ d'ajout est visible (lecture seule : caché)
  assert.match(keys, /if \(!visible\(field\)\) return false; \/\/ lecture seule : pas de champ d'ajout/);
  assert.doesNotMatch(keys, /reserv/i);
  // Ces boutons n'existent que pour qui a le droit (étape 1)
  const list = read('public/js/screens/list.js');
  assert.match(list, /const slide = h\('div', \{ class: 'swipe__slide' \}, \.\.\.itemContent\(item, meta\), pc \? rowActions\(item\) : null\);/);
  assert.match(list, /canEdit && mayCheck\(view\?\.list\) \? h\('button', \{\s*class: 'check',/);
  // Menu de la ligne : les mêmes boutons, sinon « Voir la fiche »
  assert.match(keys, /edit \? \{ icon: 'pencil', label: 'Modifier'/);
  assert.match(keys, /: \{ icon: 'eye', label: 'Voir la fiche'/);
  assert.match(keys, /check \? \{ icon: 'check'/);
  assert.match(keys, /trash \? \{ icon: 'trash', label: 'Supprimer'/);
});

test('Espace (cocher) : son relâchement ne clique jamais en plus, quel que soit le bouton de la ligne (Firefox)', () => {
  const keys = read('public/js/shortcuts.js');
  assert.match(keys, /let spaceHandled = false;/);
  assert.match(keys, /if \(run && run\(\)\) \{\s*event\.preventDefault\(\);\s*if \(key === ' '\) spaceHandled = true;/);
  assert.match(keys, /if \(event\.key !== ' ' \|\| !onPc\(\)\) return;\s*if \(spaceHandled \|\| event\.target\.closest\?\.\('\.item__body'\)\) event\.preventDefault\(\);\s*spaceHandled = false;/);
});
