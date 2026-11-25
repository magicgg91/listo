// Accueil et navigation (étape 1 du cadrage du 23 novembre 2026,
// docs/cadrage-accueil-notes-notifications.md) :
// - l'Accueil est le premier écran ; une adresse vide ou inconnue y mène ;
//   les liens directs (#/listes, une liste, #/autoriser/…) ouvrent toujours
//   leur écran ;
// - les nombres des tuiles sont ceux des écrans Échéances et Listes (mêmes
//   calculs, mêmes données d'essai) ;
// - bandeau du bas : Accueil, Échéances, Listes, Réglages, absent de
//   l'Accueil ; « Listes » partout, jamais « Mes listes » ;
// - ordinateur : le menu de gauche suit l'écran ;
// - aucun curseur mis tout seul, aucun texte en dur (tests communs).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emptyState, computeSummaries, listCountsByType, newsBadge } from '../public/js/store.js';
import { computeDeadlines, deadlineCounts, deadlineSectionFor, effectiveMine, scopeOffered, loadDeadlineScope, saveDeadlineScope, SCOPE_KEY, HOME_DEADLINE_ROWS } from '../public/js/deadlines.js';
import { typeOf, LIST_TYPES } from '../public/js/list-types.js';
import { matchRoute, pathFor, DEFAULT_ROUTE } from '../public/js/router.js';
import { longToday } from '../public/js/format.js';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';
import { translate } from '../public/js/i18n.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Code sans les commentaires de ligne
const code = (file) => read(file).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

// Mercredi 11 novembre 2026, 10:00
const TODAY = '2026-11-11';
const NOW = '10:00';

// Données d'essai : des tâches avec échéance dans deux listes (dont une avec
// l'attribution), une liste sans l'option, des listes de courses et
// d'envies (jamais dans Échéances), des nouveautés sur une liste de tâches
function state({ assign = true } = {}) {
  const s = emptyState();
  s.loaded = true;
  const lists = [
    { id: 'maison', name: 'Maison', type: 'tasks', dueEnabled: true, assignEnabled: assign, canEdit: true, members: [] },
    { id: 'ecole', name: 'École', type: 'tasks', dueEnabled: true, canEdit: false, members: [] },
    { id: 'sans', name: 'Sans échéance', type: 'tasks', dueEnabled: false, canEdit: true, members: [] },
    { id: 'courses', name: 'Courses', type: 'shopping', canEdit: true, members: [] },
    { id: 'drive', name: 'Drive', type: 'shopping', canEdit: true, members: [] },
    { id: 'envies', name: 'Envies de Léa', type: 'wishes', canEdit: true, members: [] },
  ];
  for (const list of lists) s.lists.set(list.id, { updatedAt: '2026-11-10T10:00:00.000Z', ...list });
  s.listIds = lists.map((list) => list.id);
  const items = [
    // [id, liste, nom, échéance, heure, à qui, cochée]
    ['a', 'maison', 'Payer la cantine', '2026-11-04', null, 1],
    ['b', 'maison', 'Relever le compteur', TODAY, '09:00', 2],    // heure passée : en retard
    ['c', 'maison', 'Appeler le plombier', TODAY, '18:00', 1],
    ['d', 'maison', 'Arroser', TODAY, null, null],
    ['e', 'maison', "Changer l'ampoule", '2026-11-12', null, 1],   // demain
    ['f', 'maison', 'Réserver le contrôle', '2026-11-14', null, 2], // cette semaine
    ['g', 'maison', 'Trier le garage', '2026-11-20', null, 1],      // plus tard
    ['h', 'maison', 'Déjà fait', '2026-11-01', null, 1, true],
    ['j', 'ecole', 'Signer le carnet', TODAY, null, null],
    ['k', 'sans', 'Caché (option désactivée)', '2026-11-01', null, null],
    ['l', 'courses', 'Lait (date gardée, type courses)', '2026-11-01', null, null],
    ['m', 'envies', 'Vélo (date gardée, envies)', '2026-11-01', null, null],
  ];
  for (const [id, listId, name, dueDate, dueTime, assignedTo, checked = false] of items) {
    s.items.set(id, { id, listId, name, dueDate, dueTime, assignedTo, checked, priority: 'normal', updatedAt: '2026-11-10T10:00:00.000Z' });
  }
  s.news = { enabled: true, checks: false, lists: { maison: { count: 2, behind: false, muted: false, seen: 1, lastEventId: 3, items: [] } } };
  return s;
}

// Nombres de l'écran Échéances, groupe par groupe
const screenSizes = (s, options) => Object.fromEntries(computeDeadlines(s, { today: TODAY, now: NOW, ...options }).map((g) => [g.key, g.entries.length]));

test('tuile Échéances : exactement les nombres de l\'écran Échéances (Plus tard = Demain + Cette semaine + Plus tard)', () => {
  for (const options of [{}, { mine: true, me: 1 }, { mine: true, me: 2 }, { mine: true, me: 99 }]) {
    const s = state();
    const sizes = screenSizes(s, options);
    const counts = deadlineCounts(s, { today: TODAY, now: NOW, ...options });
    assert.equal(counts.late, sizes.late ?? 0, JSON.stringify(options));
    assert.equal(counts.today, sizes.today ?? 0, JSON.stringify(options));
    assert.equal(counts.later, (sizes.tomorrow ?? 0) + (sizes.week ?? 0) + (sizes.later ?? 0), JSON.stringify(options));
    // Total : toutes les tâches de l'écran, ni plus ni moins
    assert.equal(counts.late + counts.today + counts.later, Object.values(sizes).reduce((a, b) => a + b, 0));
  }
  // Valeurs attendues : jamais une liste de courses, d'envies, ni une liste sans l'option
  assert.deepEqual(deadlineCounts(state(), { today: TODAY, now: NOW }), { late: 2, today: 3, later: 3 });
  assert.deepEqual(deadlineCounts(state(), { today: TODAY, now: NOW, mine: true, me: 1 }), { late: 1, today: 1, later: 2 });
  // Rien : « Aucune échéance »
  const empty = emptyState();
  empty.loaded = true;
  assert.deepEqual(deadlineCounts(empty, { today: TODAY, now: NOW }), { late: 0, today: 0, later: 0 });
  assert.deepEqual(HOME_DEADLINE_ROWS.map(([row]) => row), ['late', 'today', 'later']);
});

test('tuile Échéances : même choix « Toutes / Les miennes » que l\'écran (retenu sur l\'appareil, seulement s\'il est proposé)', () => {
  const memory = new Map();
  const storage = () => ({ getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) });
  assert.equal(loadDeadlineScope(storage), false);
  saveDeadlineScope(true, storage);
  assert.equal(memory.get(SCOPE_KEY), '1');
  assert.equal(SCOPE_KEY, 'listo-echeances-miennes', 'même clé qu\'avant : le choix déjà fait est gardé');
  assert.equal(loadDeadlineScope(storage), true);
  saveDeadlineScope(false, storage);
  assert.equal(memory.has(SCOPE_KEY), false);
  assert.equal(loadDeadlineScope(() => { throw new Error('privé'); }), false);
  assert.doesNotThrow(() => saveDeadlineScope(true, () => { throw new Error('privé'); }));
  // « Les miennes » ne vaut que si une liste a l'attribution activée (comme l'écran)
  assert.equal(scopeOffered(state()), true);
  assert.equal(scopeOffered(state({ assign: false })), false);
  assert.equal(effectiveMine(state(), true), true);
  assert.equal(effectiveMine(state({ assign: false }), true), false);
  assert.equal(effectiveMine(state(), false), false);
  // L'écran et la tuile lisent le même choix, par les mêmes fonctions
  const screen = read('public/js/screens/deadlines.js');
  assert.match(screen, /let mine = loadDeadlineScope\(\);/);
  assert.match(screen, /saveDeadlineScope\(mine\);/);
  assert.match(screen, /const offered = scopeOffered\(app\.data\);/);
  const home = read('public/js/screens/home.js');
  assert.match(home, /mine: effectiveMine\(app\.data, loadDeadlineScope\(\)\), me: app\.user\.id/);
  assert.match(home, /const counts = deadlineCounts\(app\.data, options\);/);
});

test('tuile Échéances : une ligne ouvre Échéances à sa section (la première qui a des tâches)', () => {
  const s = state();
  const at = (row, options = {}) => deadlineSectionFor(s, row, { today: TODAY, now: NOW, ...options });
  assert.equal(at('late'), 'late');
  assert.equal(at('today'), 'today');
  assert.equal(at('later'), 'tomorrow');
  // Seulement les tâches de la personne 2 : rien demain, « Cette semaine »
  assert.equal(at('later', { mine: true, me: 2 }), 'week');
  assert.equal(at('late', { mine: true, me: 99 }), null);
  const screen = read('public/js/screens/deadlines.js');
  assert.match(screen, /h\('section', \{ 'data-group': group\.key \},/);
  assert.match(screen, /let section = app\.openDeadlines;\s*app\.openDeadlines = null;/);
  assert.doesNotMatch(code('public/js/screens/deadlines.js'), /\.focus\(/);
});

test('tuile Listes : une ligne par type que la personne a, mêmes nombres que l\'écran Listes, point des nouveautés', () => {
  const s = state();
  const summaries = computeSummaries(s);
  const counts = listCountsByType(s);
  assert.deepEqual(counts.map((c) => c.type), ['shopping', 'tasks', 'wishes']);
  for (const { type, count, news } of counts) {
    const ofType = summaries.filter((list) => typeOf(list) === type);
    assert.equal(count, ofType.length, type);
    assert.equal(news, ofType.some((list) => newsBadge(s, list.id) !== ''), type);
  }
  assert.deepEqual(counts, [{ type: 'shopping', count: 2, news: false }, { type: 'tasks', count: 3, news: true }, { type: 'wishes', count: 1, news: false }]);
  // Liste en sourdine ou « Nouveautés » désactivé : plus de point
  s.news.lists.maison.muted = true;
  assert.equal(listCountsByType(s).find((c) => c.type === 'tasks').news, false);
  s.news.lists.maison.muted = false;
  s.news.enabled = false;
  assert.equal(listCountsByType(s).find((c) => c.type === 'tasks').news, false);
  // Un type absent n'a pas de ligne ; aucune liste : aucune ligne
  s.lists.delete('envies');
  assert.deepEqual(listCountsByType(s).map((c) => c.type), ['shopping', 'tasks']);
  assert.deepEqual(listCountsByType(emptyState()), []);
  assert.deepEqual(LIST_TYPES, ['shopping', 'tasks', 'wishes']);
});

test('premier écran : l\'Accueil, après la connexion aussi ; liens directs intacts', () => {
  assert.deepEqual(DEFAULT_ROUTE, { name: 'home', params: {} });
  assert.deepEqual(matchRoute(''), { name: 'home', params: {} });
  assert.deepEqual(matchRoute('#/nimporte/quoi'), { name: 'home', params: {} });
  assert.equal(pathFor('home'), '#/accueil');
  assert.deepEqual(matchRoute('#/listes'), { name: 'lists', params: {} });
  assert.deepEqual(matchRoute('#/autoriser/abc'), { name: 'authorize', params: { id: 'abc' } });
  const app = read('public/js/app.js');
  // Après la connexion : l'écran demandé avant (lien direct), sinon le
  // premier écran (l'Accueil, ou celui choisi quand il est coupé :
  // Réglages › Accueil, test/home-tiles.test.js)
  assert.match(app, /export const openingScreen = \(\) => firstScreen\(app\.data\.home, shownFeatures\(\)\);/);
  assert.match(app, /const next = app\.afterLogin && app\.afterLogin\.name !== 'login' \? app\.afterLogin : \{ name: openingScreen\(\), params: \{\} \};/);
  assert.match(app, /if \(name === 'login'\) \{\s*navigate\(openingScreen\(\), \{\}, \{ replace: true \}\);/);
  assert.match(app, /default: navigate\(openingScreen\(\), \{\}, \{ replace: true \}\);/);
  assert.match(app, /case 'home':\s*if \(openingScreen\(\) !== 'home'\) navigate\(openingScreen\(\), \{\}, \{ replace: true \}\);\s*else mount\(\(onLeave\) => renderHome\(onLeave\)\);\s*break;/);
  assert.match(app, /case 'lists': mount\(\(onLeave\) => renderLists\(onLeave\)\); break;/);
  assert.match(read('public/js/router.js'), /history\.replaceState\(\{ depth: 0 \}, '', location\.hash \|\| pathFor\('home'\)\);/);
});

test('Accueil : ni bandeau du bas ni loupe ; nombres lus avec leur libellé ; copie locale seulement', () => {
  const home = code('public/js/screens/home.js');
  assert.doesNotMatch(home, /tabBar|loupe|createSearchRow/);
  // Plus de bandeau sur l'Accueil (décision du propriétaire, de nouveau le 23 novembre 2026)
  assert.match(read('public/js/tabbar.js'), /export const hasTabs = \(routeName\) => routeName !== 'home' && tabOf\(routeName\) !== null;/);
  // Aucune demande au serveur en dehors de la synchronisation habituelle
  assert.doesNotMatch(home, /api\.js|fetch\(|\bget\(|\bpost\(/);
  // Texte simple, aucun curseur, aucune mise en page en dur
  assert.doesNotMatch(home, /innerHTML|\.focus\(|\.style\b|style:/);
  // Chaque ligne est un bouton ; le nombre est dans le nom lu (pluriel par Intl.PluralRules)
  assert.match(home, /h\('button', \{ class: 'tile__row', type: 'button', 'aria-label': spoken, onClick \}/);
  assert.match(home, /h\('span', \{ class: `count\$\{tone \? ` count--\$\{tone\}` : ''\}`, 'aria-hidden': 'true' \}, String\(count\)\)/);
  assert.equal(translate('fr', 'accueil.echeances.retard.lu', { count: 1 }), 'En retard, 1 tâche');
  assert.equal(translate('fr', 'accueil.echeances.retard.lu', { count: 2 }), 'En retard, 2 tâches');
  assert.equal(translate('en', 'accueil.echeances.aujourdhui.lu', { count: 1 }), 'Today, 1 task');
  assert.equal(translate('fr', 'listes.type.lu.nouveautes', { type: 'Tâches', count: 4 }), 'Tâches, 4 listes, nouveautés');
  assert.equal(translate('en', 'listes.type.lu', { type: 'Shopping', count: 1 }), 'Shopping, 1 list');
  // Temps réel, minuit et minute (une tâche passe « En retard » à son heure)
  for (const text of ['onLeave(onDataChange(idle.request));', 'onLeave(watchNewDay(draw));', 'onLeave(watchMinute(() => idle.request()));']) assert.ok(home.includes(text), text);
  // Tuiles dans l'ordre choisi (au départ : Échéances, Listes, « À offrir »
  // si j'ai des réservations, Notes, Compte, puis Projets quand la
  // fonction est allumée ; test/home-tiles.test.js)
  assert.match(home, /const build = \{ deadlines: deadlinesTile, lists: \(\) => listsTile\(pc\), gifts: giftsTile, notes: \(\) => notesTile\(pc\), account: accountTile, projects: projectsTile \};/);
  assert.match(home, /const present = shownTiles\(app\.data\.home, shownFeatures\(\)\)\.map\(\(\[?name\]?\) => \[name, build\[name\]\(\)\]\)\.filter\(\(\[, el\]\) => el\);/);
  // « Demandes de compte » : Admin seulement, et seulement s'il y en a
  assert.match(home, /const requests = app\.user\.role === 'admin' \? app\.user\.accountRequests \?\? 0 : 0;/);
  assert.match(home, /requests > 0 \? row\(\{/);
  // Une ligne de type ouvre « Listes » sur ce type : filtre retenu (téléphone), type du menu (ordinateur)
  assert.match(home, /if \(pc\) setPcListType\(type\);\s*else if \(type !== null\) saveTypeFilter\(type\);/);
  // Compte : Mon compte, Notifications (Réglages › Notifications pour l'instant), Réglages
  assert.match(home, /navigate\('account'\)[\s\S]*navigate\('inbox'\)[\s\S]*navigate\('settings'\)/);
  assert.equal(pathFor('notifications'), '#/reglages/notifications');
});

test('date du jour en toutes lettres, dans la langue du compte', () => {
  const day = new Date(2026, 10, 23, 9, 0);
  assert.equal(longToday(day, { locale: 'fr' }), 'Lundi 23 novembre');
  assert.equal(longToday(day, { locale: 'en' }), 'Monday, November 23');
  assert.equal(translate('fr', 'accueil.bonjour', { name: 'Guillaume' }), 'Bonjour Guillaume');
  assert.equal(translate('en', 'accueil.bonjour', { name: 'Guillaume' }), 'Hello Guillaume');
});

test('« Listes » partout, jamais « Mes listes » (interface en français et en anglais)', () => {
  assert.equal(fr['listes.titre'], 'Listes');
  assert.equal(en['listes.titre'], 'Lists');
  assert.equal(fr['navigation.listes'], 'Listes');
  assert.equal(en['navigation.listes'], 'Lists');
  assert.equal(fr['navigation.accueil'], 'Accueil');
  assert.equal(en['navigation.accueil'], 'Home');
  const values = (texts) => Object.values(texts).flatMap((v) => (typeof v === 'object' ? Object.values(v) : [v]));
  assert.deepEqual(values(fr).filter((v) => /Mes listes|mes listes\b(?! Listo)/.test(v) && !/Toutes mes listes/.test(v)), []);
  assert.deepEqual(values(en).filter((v) => /My lists|my lists/.test(v) && !/All my lists/.test(v)), []);
});

test('ordinateur : menu de gauche qui suit l\'écran (entrées fixes ; Types sur les écrans des listes ; plus le filtre en haut)', () => {
  const side = code('public/js/screens/pc-side.js');
  // Entrées fixes, dans l'ordre du bandeau : Accueil, Échéances, Listes,
  // Notes (étape 2), Projets (quand la fonction est allumée, 25 novembre 2026)
  assert.match(side, /const main = h\('div', \{ class: 'pc-side__main' \}, homeLink, deadlinesLink, listsLink, notesLink, projectsLink\);/);
  assert.match(side, /const homeLink = fixedLink\('home', 'home', t\('navigation\.accueil'\)\);/);
  assert.match(side, /const listsLink = fixedLink\('lists', 'tasks', t\('navigation\.listes'\), listsCount\);/);
  // Écrans des listes seulement : « Types » ; ailleurs, rien de plus
  assert.match(side, /const LIST_SCREENS = \['lists', 'list', 'editList', 'newList', 'gifts'\];/);
  assert.match(side, /if \(!LIST_SCREENS\.includes\(selected\.name\) \|\| !shownFeatures\(\)\.lists\) \{\s*showNav\(false\);/);
  assert.match(side, /const types = listCountsByType\(app\.data\);/);
  // Plus de liste nommée une à une dans le menu, sauf les résultats d'une recherche
  assert.equal((side.match(/entry\(list, query\)/g) ?? []).length, 1);
  assert.match(side, /if \(searching\) \{/);
  // Type choisi : aria-current="page" ; type de la liste ouverte : aria-current="true"
  assert.match(side, /'aria-current': chosen \? 'page' : ofOpenList \? 'true' : null,/);
  // La marque mène à l'Accueil ; « Nouvelle liste » reste en bas (touche N)
  assert.match(side, /href: pathFor\('home'\),/);
  assert.match(side, /'aria-keyshortcuts': 'N', onClick: \(\) => navigate\('newList'\)/);
  assert.equal(fr['navigation.marque.accueil'], ': Accueil');
  // Écran « Listes » de l'ordinateur : plus de filtre Toutes / Courses / Tâches / Envies ; le téléphone le garde
  const lists = code('public/js/screens/lists.js');
  const pc = lists.slice(lists.indexOf('function renderListsPc'), lists.indexOf('function noListsPc'));
  assert.ok(pc.length > 500);
  assert.doesNotMatch(pc, /segmented|radiogroup|listes\.filtre/);
  assert.match(pc, /const type = all\.some\(\(list\) => typeOf\(list\) === pcListType\(\)\) \? pcListType\(\) : 'all';/);
  assert.match(pc, /title\.textContent = type === 'all' \? t\('listes\.titre'\) : TYPE_LABELS\[type\];/);
  const phone = lists.slice(lists.indexOf('export function renderLists'), lists.indexOf('function renderListsPc'));
  assert.match(phone, /let type = loadTypeFilter\(\);/);
  assert.match(phone, /filter\.el,/);
  // Touches [ et ] : liste voisine, dans l'ordre que donne le menu
  const shortcuts = read('public/js/shortcuts.js');
  assert.match(shortcuts, /'\[': \(\) => listsShown\(\) && \(onGoList\(-1\), true\),\s*'\]': \(\) => listsShown\(\) && \(onGoList\(1\), true\),/);
  assert.match(read('public/js/app.js'), /onGoList: \(delta\) => pcSide\?\.goList\(delta\),/);
  assert.match(side, /goList\(delta\) \{/);
});

test('kit : sections 16.19 à 16.21 identiques dans design/ et public/, couleurs du kit seulement, bandeau à quatre boutons', () => {
  const kit = read('public/css/listo.css');
  const section = kit.slice(kit.indexOf('/* 16.19 Accueil'));
  assert.ok(section.length > 2000);
  assert.ok(read('design/listo.css').includes(section.trim()), 'même section dans design/listo.css');
  assert.doesNotMatch(section, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  assert.match(section, /\.tabbar--4 \.tabbar__pill \{ width: calc\(\(100% - 10px\) \/ 4\); \}/);
  assert.match(section, /\.tabbar\[data-current="3"\] \.tabbar__pill \{ transform: translateX\(300%\); \}/);
  // Lignes des tuiles : 44 px, rectangles arrondis (Accueil compact, 23 novembre 2026), une colonne sous 340 px
  assert.match(section, /\.tile__row \{[^}]*min-height: var\(--tap-min\);[^}]*border-radius: var\(--radius-sm\);/);
  assert.match(section, /@media \(max-width: 339\.98px\) \{ \.tiles \{ grid-template-columns: minmax\(0, 1fr\); \} \}/);
  // Nouveaux fichiers gardés pour l'ouverture sans réseau
  const sw = read('public/sw.js');
  for (const file of ['/js/screens/home.js', '/js/i18n/fr/accueil.js', '/js/i18n/en/accueil.js']) assert.ok(sw.includes(`'${file}',`), file);
});
