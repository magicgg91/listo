// Refonte de la navigation du téléphone (décisions du 11 novembre 2026) :
// écran « Échéances », bandeau du bas, filtre des types retenu, loupe.
//
// Points sensibles vérifiés : jamais une liste d'envies ni de courses dans
// « Échéances » ; cocher seulement avec le droit de modifier, par la même
// opération que dans la liste (file d'attente hors ligne comprise) ; aucune
// donnée de réservation lue ; navigation du bandeau.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emptyState, loadTypeFilter, saveTypeFilter, TYPE_FILTER_KEY } from '../public/js/store.js';
import { computeDeadlines, deadlineBadge, deadlineGroup, endOfWeek, listHasDeadlines, DEADLINE_GROUPS } from '../public/js/deadlines.js';
import { matchRoute, pathFor } from '../public/js/router.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// Mercredi 11 novembre 2026
const TODAY = '2026-11-11';

function state() {
  const s = emptyState();
  s.loaded = true;
  const lists = [
    { id: 'maison', name: 'Maison', type: 'tasks', dueEnabled: true, priorityEnabled: true, canEdit: true },
    { id: 'ecole', name: 'École', type: 'tasks', dueEnabled: true, priorityEnabled: false, canEdit: false, access: 'read' },
    { id: 'sans', name: 'Sans échéance', type: 'tasks', dueEnabled: false, priorityEnabled: true, canEdit: true },
    { id: 'courses', name: 'Courses', type: 'shopping', dueEnabled: true, canEdit: true },
    { id: 'envies', name: 'Envies de Léa', type: 'wishes', dueEnabled: true, priorityEnabled: true, canEdit: true },
  ];
  for (const list of lists) s.lists.set(list.id, list);
  const items = [
    ['a', 'maison', 'Payer la cantine', '2026-11-04', 'normal'],
    ['b', 'maison', 'Relever le compteur', '2026-11-06', 'normal'],
    ['c', 'maison', 'Appeler le plombier', TODAY, 'normal'],
    ['d', 'maison', 'Arroser', TODAY, 'high'],
    ['e', 'maison', "Changer l'ampoule", '2026-11-12', 'normal'],
    ['f', 'maison', 'Réserver le contrôle', '2026-11-14', 'high'],
    ['g', 'maison', 'Trier le garage', '2026-11-20', 'low'],
    ['h', 'maison', 'Déjà fait', '2026-11-01', 'normal', true],
    ['i', 'maison', 'Sans date', null, 'normal'],
    ['j', 'ecole', 'Signer le carnet', TODAY, 'high'],
    ['k', 'sans', 'Caché (option désactivée)', '2026-11-01', 'normal'],
    ['l', 'courses', 'Lait (date gardée, type courses)', '2026-11-01', 'normal'],
    ['m', 'envies', 'Vélo (date gardée, envies)', '2026-11-01', 'high'],
  ];
  for (const [id, listId, name, dueDate, priority, checked = false] of items) {
    s.items.set(id, { id, listId, name, dueDate, priority, checked });
  }
  return s;
}

const ids = (groups) => groups.map((g) => [g.key, g.entries.map((e) => e.item.id)]);

test('groupes : En retard, Aujourd\'hui, Demain, Cette semaine (jusqu\'au dimanche), Plus tard', () => {
  assert.deepEqual(DEADLINE_GROUPS.map(([, title]) => title), ['En retard', "Aujourd'hui", 'Demain', 'Cette semaine', 'Plus tard']);
  assert.equal(endOfWeek(TODAY), '2026-11-15');
  assert.equal(endOfWeek('2026-11-15'), '2026-11-15', 'dimanche : la semaine finit aujourd\'hui');
  assert.equal(endOfWeek('2026-11-16'), '2026-11-22', 'lundi');
  assert.equal(deadlineGroup('2026-11-10', TODAY), 'late');
  assert.equal(deadlineGroup(TODAY, TODAY), 'today');
  assert.equal(deadlineGroup('2026-11-12', TODAY), 'tomorrow');
  assert.equal(deadlineGroup('2026-11-15', TODAY), 'week');
  assert.equal(deadlineGroup('2026-11-16', TODAY), 'later');
  // Samedi : demain (dimanche) est « Demain », plus rien dans « Cette semaine »
  assert.equal(deadlineGroup('2026-11-15', '2026-11-14'), 'tomorrow');
  assert.equal(deadlineGroup('2026-11-16', '2026-11-14'), 'later');
  // Changement d'année
  assert.equal(endOfWeek('2026-12-30'), '2027-01-03');
});

test('tâches retenues : listes de tâches avec « Échéance » activée, non cochées, avec une date ; triées', () => {
  const groups = computeDeadlines(state(), { today: TODAY });
  assert.deepEqual(ids(groups), [
    ['late', ['a', 'b']],
    // même jour : priorité élevée d'abord, puis l'ordre alphabétique
    ['today', ['d', 'c', 'j']],
    ['tomorrow', ['e']],
    ['week', ['f']],
    ['later', ['g']],
  ]);
  // La liste de chaque tâche est donnée (nom affiché sur la ligne)
  assert.equal(groups[0].entries[0].list.name, 'Maison');
  // Groupes vides retirés
  const s = state();
  for (const id of ['e']) s.items.delete(id);
  assert.deepEqual(computeDeadlines(s, { today: TODAY }).map((g) => g.key), ['late', 'today', 'week', 'later']);
});

test('JAMAIS une liste d\'envies ni de courses, même avec des dates gardées en base', () => {
  const s = state();
  const all = computeDeadlines(s, { today: TODAY }).flatMap((g) => g.entries);
  assert.equal(all.some((e) => ['courses', 'envies', 'sans'].includes(e.list.id)), false);
  assert.equal(listHasDeadlines(s.lists.get('envies')), false);
  assert.equal(listHasDeadlines(s.lists.get('courses')), false);
  assert.equal(listHasDeadlines(s.lists.get('sans')), false);
  assert.equal(listHasDeadlines(s.lists.get('maison')), true);
  assert.equal(listHasDeadlines(undefined), false);
  // Ni l'écran ni le calcul ne lisent les réservations
  for (const file of ['public/js/deadlines.js', 'public/js/screens/deadlines.js', 'public/js/tabbar.js']) {
    assert.doesNotMatch(read(file).replace(/\/\/.*$/gm, ''), /reserv/i, file);
  }
});

test('pastille : tâches en retard + tâches du jour (comme le résumé de 8 h)', () => {
  const s = state();
  assert.equal(deadlineBadge(s, TODAY), 5); // a, b (retard) ; c, d, j (aujourd'hui)
  s.items.get('a').checked = true;
  assert.equal(deadlineBadge(s, TODAY), 4, 'une tâche cochée ne compte plus');
  assert.equal(deadlineBadge(s, '2026-11-01'), 0);
  assert.equal(deadlineBadge(emptyState(), TODAY), 0);
  // Libellé lu, et pastille cachée à zéro (tabbar.js et menu de l'ordinateur)
  const tabbar = read('public/js/tabbar.js');
  assert.match(tabbar, /return `Échéances, \$\{count\} \$\{count > 1 \? 'tâches' : 'tâche'\} en retard ou pour aujourd'hui`;/);
  assert.match(tabbar, /badge\.hidden = count === 0;/);
  assert.match(read('public/js/screens/pc-side.js'), /deadlinesCount\.hidden = count === 0;/);
});

test('recherche dans « Échéances » : sur le nom des tâches', () => {
  assert.deepEqual(ids(computeDeadlines(state(), { today: TODAY, query: 'PLOMB' })), [['today', ['c']]]);
  assert.deepEqual(computeDeadlines(state(), { today: TODAY, query: 'maison' }), [], 'pas sur le nom de la liste');
});

test('écran : cocher seulement avec le droit, par l\'opération de la liste (file hors ligne) ; rien d\'autre écrit', () => {
  const screen = read('public/js/screens/deadlines.js');
  assert.match(screen, /const canCheck = canEditList\(list\);/);
  assert.match(screen, /canCheck\s*\? h\('button', \{ class: 'check', type: 'button', 'aria-pressed': 'false', 'aria-label': `Cocher \$\{item\.name\}`, onClick: \(\) => check\(item\) \}/);
  assert.match(screen, /: h\('span', \{ class: 'check check--static', role: 'img', 'aria-label': 'Non coché, lecture seule' \}/);
  // Une seule écriture : checkItem (actions.js → perform → file d'attente)
  const writes = [...screen.matchAll(/actions\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(writes)], ['checkItem']);
  assert.match(read('public/js/actions.js'), /export const checkItem = \(item, checked\) => perform\(\{ type: 'item\.check', itemId: item\.id, checked \}\);/);
  assert.doesNotMatch(screen, /fetch\(|api\.js|innerHTML|\.focus\(/);
  // Toucher la ligne : la tâche s'ouvre dans sa liste (fiche à l'arrivée, à consulter en lecture seule)
  assert.match(screen, /app\.openItem = \{ listId: item\.listId, itemId: item\.id \};\s*navigate\('list', \{ id: item\.listId \}\);/);
  const list = read('public/js/screens/list.js');
  assert.match(list, /if \(app\.openItem\?\.listId === listId\) \{[\s\S]*?if \(!item \|\| !view \|\| item\.listId !== listId\) return;\s*if \(canEditList\(view\.list\)\) openItemSheet\(item\);\s*else openItemView\(item\);/);
  // Texte ET icône sur les pastilles (jamais la couleur seule) ; recalcul à minuit
  assert.match(screen, /icon\(due\.state === 'late' \? 'alert' : 'calendar', 'icon--xs'\), due\.text/);
  assert.match(screen, /onLeave\(watchNewDay\(draw\)\);/);
});

test('bandeau du bas : trois boutons, même place partout, loupe seulement là où l\'écran la branche', () => {
  const tabbar = read('public/js/tabbar.js');
  assert.match(tabbar, /\['lists', 'tasks', 'Mes listes'\],\s*\['deadlines', 'calendar', 'Échéances'\],\s*\['settings', 'sliders', 'Réglages'\],/);
  // Retour vers « Mes listes » : un retour en arrière ; entre les autres, un écran remplace l'autre
  assert.match(tabbar, /if \(name === 'lists'\) \{\s*goBack\('lists'\);\s*return;\s*\}\s*navigate\(name, \{\}, \{ replace: current !== 'lists' \}\);/);
  // La loupe est retirée à chaque écran ; « Mes listes » et « Échéances » la rebranchent, pas « Réglages »
  const app = read('public/js/app.js');
  assert.match(app, /if \(bar\) tabBar\(\)\.loupe\.set\(null\);\s*const content = /);
  assert.doesNotMatch(read('public/js/screens/settings.js'), /loupe/);
  // Place de la loupe gardée (cachée, pas retirée) : les boutons ne bougent pas
  const css = read('public/css/listo.css');
  assert.match(css, /\.loupe--off \{ visibility: hidden; \}/);
  assert.match(tabbar, /button\.classList\.toggle\('loupe--off', !search\);/);
  // Pas sur ordinateur ni dans une liste
  assert.match(app, /const bar = !pc && Boolean\(app\.user\) && withSide && hasTabs\(app\.route\?\.name\);/);
  // Bouton de l'écran affiché : aria-current ET pastille (jamais la couleur seule)
  assert.match(tabbar, /if \(tab === name\) button\.setAttribute\('aria-current', 'page'\);/);
  // Réglages sur téléphone : plus de bouton Retour
  assert.match(read('public/js/screens/settings.js'), /topbar\('Réglages'\),/);
  // Adresse de l'écran
  assert.deepEqual(matchRoute('#/echeances'), { name: 'deadlines', params: {} });
  assert.equal(pathFor('deadlines'), '#/echeances');
});

test('style verre : repli opaque sans flou ou avec « moins de transparence » ; mouvement réduit', () => {
  const css = read('public/css/listo.css');
  const section = css.slice(css.indexOf('/* 16.15 Navigation du bas'));
  assert.ok(section.length > 1000);
  assert.ok(read('design/listo.css').includes(section.trim()), 'même section dans design/listo.css');
  assert.doesNotMatch(section, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'couleurs du kit seulement');
  assert.match(section, /\.glass \{\s*background: var\(--color-surface\);\s*background: color-mix/);
  assert.match(section, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{\s*\.glass \{ background: var\(--color-surface\); \}/);
  assert.match(section, /@media \(prefers-reduced-transparency: reduce\) \{\s*\.glass \{ background: var\(--color-surface\); -webkit-backdrop-filter: none; backdrop-filter: none; \}/);
  // Mouvement réduit : toutes les transitions coupées (section 15 du kit)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.app \*, \.app \*::before, \.app \*::after \{ animation: none !important; transition: none !important; \}/);
  // Zones tactiles : 54 px (bandeau), 66 px (loupe)
  assert.match(section, /\.tabbar__tab \{[^}]*min-height: 54px;/);
  assert.match(section, /\.loupe \{[^}]*width: 66px; height: 66px;/);
});

test('filtre des types de « Mes listes » : retenu sur le téléphone, valeur inconnue = Toutes', () => {
  const memory = new Map();
  const storage = () => ({ getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) });
  assert.equal(loadTypeFilter(storage), 'all');
  saveTypeFilter('wishes', storage);
  assert.equal(memory.get(TYPE_FILTER_KEY), 'wishes');
  assert.equal(loadTypeFilter(storage), 'wishes');
  memory.set(TYPE_FILTER_KEY, 'n\'importe quoi');
  assert.equal(loadTypeFilter(storage), 'all');
  saveTypeFilter('<script>', storage);
  assert.equal(memory.get(TYPE_FILTER_KEY), 'all');
  // Stockage indisponible : « Toutes », sans erreur
  assert.equal(loadTypeFilter(() => { throw new Error('privé'); }), 'all');
  assert.doesNotThrow(() => saveTypeFilter('tasks', () => { throw new Error('privé'); }));
  // À l'écran : la recherche cherche dans le type choisi ; sous « Toutes », l'ordre du tri
  const lists = read('public/js/screens/lists.js');
  assert.match(lists, /const lists = all\.filter\(\(list\) => type === 'all' \|\| typeOf\(list\) === type\);/);
  assert.match(lists, /const found = filterLists\(lists, query\);/);
  assert.match(lists, /const all = computeSummaries\(app\.data, \{ sort: currentSort\(\) \}\);/);
});

test('service worker : nouveaux fichiers gardés pour l\'ouverture sans réseau', () => {
  const sw = read('public/sw.js');
  for (const file of ['/js/tabbar.js', '/js/deadlines.js', '/js/screens/deadlines.js']) assert.match(sw, new RegExp(`'${file.replace(/[/.]/g, '\\$&')}',`));
});

test('boutons arrondis (16.16) : tous les boutons en pilule, ni les champs ni les cartes de choix', () => {
  const css = read('public/css/listo.css');
  const section = css.slice(css.indexOf('/* 16.16 Boutons arrondis'));
  assert.ok(section.length > 200);
  assert.ok(read('design/listo.css').includes(section.trim()), 'même section dans design/listo.css');
  const rule = section.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  assert.match(rule, /^\.btn, \.btn--icon, \.icon-btn, \.item__actions \.icon-btn,\s*\.segmented, \.segmented__opt, \.duration__opt, \.cart__action, \.fold-all \{ border-radius: var\(--radius-pill\); \}$/);
  assert.doesNotMatch(rule, /\.input|\.choice__opt|\.icon-grid__opt|\.searchfield|\.card|\.glass|backdrop/);
});
