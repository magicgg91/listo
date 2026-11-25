// Projets, étape 1b : les écrans (docs/cadrage-projets.md, sections 3, 4, 6,
// 7, 14 et 17). Règles d'affichage pures (public/js/project-view.js),
// navigation (bandeau du bas à six, cinq, quatre ou trois boutons, tuile,
// premier écran, adresses), feuille du partage à trois droits (listes et
// notes inchangées), corbeilles, et vérifications par lecture du code
// (jamais de HTML, rôles dans l'interface, alternatives au glisser,
// accessibilité). Le rendu réel est vérifié dans Chromium (captures du
// téléphone et de l'ordinateur, comparées aux maquettes design/projets).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  liveProjects, trashedProjects, lastActivity, sortedProjects, projectMatches, columnCounts, cardCount, otherMembers,
  cardMatches, cleanLabelFilter, cardShown, visibleCards, labelUse, deletedCards, startColumn, neighbourColumn,
  loadProjectFilter, saveProjectFilter, loadProjectColumn, saveProjectColumn, homeProjects, projectUnread,
} from '../public/js/project-view.js';
import { tabScreens, firstScreen, startScreens, tilesFor, shownTiles, tileLayout } from '../public/js/home-tiles.js';
import { screenAllowed } from '../public/js/features.js';
import { matchRoute, pathFor } from '../public/js/router.js';
import { membersPayload, membersChanged } from '../public/js/sharing.js';
import { projectRights, cardRights } from '../public/js/projects.js';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';
import { translate } from '../public/js/i18n.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
// Code sans les commentaires de fin de ligne
const code = (file) => read(file).split('\n').map((line) => line.replace(/^\s*\/\/.*$/, '')).join('\n');

const SCREENS = ['projects', 'project', 'project-card', 'project-settings', 'project-trash'].map((name) => `public/js/screens/${name}.js`);
const MODULES = [...SCREENS, 'public/js/project-view.js', 'public/js/project-drag.js'];

// --- Une copie locale d'exemple (forme de project-store.js) ---
const P = 'p0000000-0000-4000-8000-000000000001';
const Q = 'p0000000-0000-4000-8000-000000000002';
const T = 'p0000000-0000-4000-8000-000000000003';
function sample() {
  const project = {
    id: P, name: 'DomoPi Articles', role: 'owner', updatedAt: '2026-11-20T10:00:00.000Z', createdAt: '2026-11-20T10:00:00.000Z', deletedAt: null,
    members: [{ id: 1, displayName: 'Guillaume', role: 'owner', active: true }, { id: 2, displayName: 'Léa', role: 'contributor', active: true }],
    columns: [{ id: 'c2', name: 'Relecture', color: 'bleu', position: 2048 }, { id: 'c1', name: 'Idées', color: 'orange', position: 1024 }],
    labels: [{ id: 'l1', name: 'Sécurité', color: 'gris' }, { id: 'l2', name: 'Docker', color: 'bleu' }],
  };
  const other = { ...project, id: Q, name: 'Travaux maison', role: 'reader', updatedAt: '2026-11-22T10:00:00.000Z', members: [{ id: 2, displayName: 'Léa', role: 'owner', active: true }], columns: [{ id: 'd1', name: 'À faire', color: 'rouge', position: 1 }], labels: [] };
  const trashed = { id: T, name: 'Anniversaire', role: 'owner', deletedAt: '2026-11-21T10:00:00.000Z', cardCount: 3, memberCount: 2 };
  const cards = [
    { id: 'a', projectId: P, columnId: 'c1', position: 2, title: 'PBS pour Proxmox', labelIds: [], updatedAt: '2026-11-23T09:00:00.000Z' },
    { id: 'b', projectId: P, columnId: 'c1', position: 1, title: 'Haute disponibilité', labelIds: ['l2'], updatedAt: '2026-11-20T09:00:00.000Z' },
    { id: 'c', projectId: P, columnId: 'c2', position: 1, title: '2FAuth', labelIds: ['l1'], updatedAt: '2026-11-20T09:00:00.000Z' },
    { id: 'd', projectId: P, columnId: null, position: 1, title: 'Vaultwarden', labelIds: [], deletedAt: '2026-11-22T09:00:00.000Z', updatedAt: '2026-11-22T09:00:00.000Z' },
    { id: 'e', projectId: Q, columnId: 'd1', position: 1, title: 'Peindre', labelIds: [], updatedAt: '2026-11-21T09:00:00.000Z' },
  ];
  return {
    projects: new Map([[P, project], [Q, other], [T, trashed]]),
    projectIds: new Set([P, Q, T]),
    cards: new Map(cards.map((card) => [card.id, card])),
    projectMine: { [P]: { unread: true, mutedNews: false, lastEvent: 4 }, [Q]: { unread: false } },
  };
}

test('écran Projets : projets ouverts, les plus récemment modifiés d\'abord (activité des cartes comprise) ; corbeille à part', () => {
  const state = sample();
  assert.deepEqual(liveProjects(state).map((p) => p.id).sort(), [P, Q].sort());
  assert.deepEqual(trashedProjects(state).map((p) => p.id), [T]);
  // Le nom de DomoPi date du 20, mais une de ses cartes du 23 : il passe devant
  assert.equal(lastActivity(state, state.projects.get(P)), '2026-11-23T09:00:00.000Z');
  assert.deepEqual(sortedProjects(state).map((p) => p.name), ['DomoPi Articles', 'Travaux maison']);
  assert.deepEqual(homeProjects(state, 1).map((p) => p.id), [P]);
  // Un projet absent de projectIds (quitté, supprimé ailleurs) n'est plus montré
  state.projectIds.delete(Q);
  assert.deepEqual(liveProjects(state).map((p) => p.id), [P]);
  // Recherche par nom (sans les accents ni les majuscules)
  assert.equal(projectMatches(state.projects.get(P), 'domopi'), true);
  assert.equal(projectMatches(state.projects.get(P), 'travaux'), false);
  assert.equal(projectMatches(state.projects.get(P), ''), true);
  // Nouveautés : celles que le serveur donne (sourdine déjà comptée)
  assert.equal(projectUnread(state, P), true);
  assert.equal(projectUnread(state, Q), false);
});

test('carte d\'un projet : colonnes dans l\'ordre avec leur nombre de cartes (hors cartes supprimées), autres personnes', () => {
  const state = sample();
  const project = state.projects.get(P);
  assert.deepEqual(columnCounts(state, project).map(({ column, count }) => [column.name, count]), [['Idées', 2], ['Relecture', 1]]);
  assert.equal(cardCount(state, P), 3);
  assert.deepEqual(otherMembers(project, 1).map((m) => m.displayName), ['Léa']);
  assert.deepEqual(deletedCards(state, P).map((c) => c.id), ['d']);
  assert.equal(labelUse(state, P, 'l2'), 1);
});

test('un projet : cartes d\'une colonne dans l\'ordre, recherche (titres et étiquettes), filtre par étiquettes (plusieurs choix)', () => {
  const state = sample();
  const project = state.projects.get(P);
  assert.deepEqual(visibleCards(state, project, 'c1').map((c) => c.id), ['b', 'a']);
  assert.deepEqual(visibleCards(state, project, 'c1', { query: 'proxmox' }).map((c) => c.id), ['a']);
  // La recherche trouve aussi le nom d'une étiquette
  assert.equal(cardMatches(state.cards.get('b'), project, 'docker'), true);
  assert.equal(cardMatches(state.cards.get('a'), project, 'docker'), false);
  // Filtre : une des étiquettes choisies ; aucune : toutes ; inconnues ignorées
  assert.deepEqual(cleanLabelFilter(project, ['l2', 'inconnue', 'l2']), ['l2']);
  assert.equal(cardShown(state.cards.get('b'), ['l2']), true);
  assert.equal(cardShown(state.cards.get('a'), ['l2']), false);
  assert.equal(cardShown(state.cards.get('a'), []), true);
  assert.deepEqual(visibleCards(state, project, 'c1', { labelIds: ['l1', 'l2'] }).map((c) => c.id), ['b']);
});

test('téléphone : colonne de départ (la dernière ouverte, sinon la première), colonne voisine (glisser de côté, flèches)', () => {
  const project = sample().projects.get(P);
  assert.equal(startColumn(project, null).id, 'c1');
  assert.equal(startColumn(project, 'c2').id, 'c2');
  assert.equal(startColumn(project, 'supprimée').id, 'c1');
  assert.equal(neighbourColumn(project, 'c1', 1).id, 'c2');
  assert.equal(neighbourColumn(project, 'c2', 1), null);
  assert.equal(neighbourColumn(project, 'c1', -1), null);
  assert.equal(startColumn({ columns: [] }, null), null);
});

test('colonne ouverte et filtres : gardés sur cet appareil seulement, stockage absent ou abîmé sans erreur', () => {
  const box = new Map();
  const store = () => ({ getItem: (k) => box.get(k) ?? null, setItem: (k, v) => box.set(k, v), removeItem: (k) => box.delete(k) });
  saveProjectColumn(P, 'c2', store);
  assert.equal(loadProjectColumn(P, store), 'c2');
  saveProjectFilter(P, { people: [7, 'none'], labels: ['l1'] }, store);
  assert.deepEqual(loadProjectFilter(P, store), { people: [7, 'none'], labels: ['l1'] });
  saveProjectFilter(P, { people: [], labels: [] }, store);
  assert.deepEqual(loadProjectFilter(P, store), { people: [], labels: [] });
  // Filtre gardé par l'étape 1 (étiquettes seulement) : relu comme { labels }
  box.set(`listo-projet-filtre-${P}`, JSON.stringify(['l1']));
  assert.deepEqual(loadProjectFilter(P, store), { people: [], labels: ['l1'] });
  box.set(`listo-projet-filtre-${P}`, 'abîmé');
  assert.deepEqual(loadProjectFilter(P, store), { people: [], labels: [] });
  const broken = () => { throw new Error('bloqué'); };
  assert.equal(loadProjectColumn(P, broken), null);
  assert.deepEqual(loadProjectFilter(P, broken), { people: [], labels: [] });
  assert.doesNotThrow(() => saveProjectFilter(P, ['x'], broken));
});

test('bandeau du bas : six boutons quand Projets est allumé, cinq, quatre ou trois sinon, toujours dans le même ordre', () => {
  const on = { notes: true, projects: true };
  assert.deepEqual(tabScreens(null, on), ['home', 'deadlines', 'lists', 'notes', 'projects', 'settings']);
  // Projets coupés (le départ) : rien ne change (cinq)
  assert.deepEqual(tabScreens(null, null), ['home', 'deadlines', 'lists', 'notes', 'settings']);
  // Notes coupées : « Projets » prend leur place (cinq)
  assert.deepEqual(tabScreens(null, { notes: false, projects: true }), ['home', 'deadlines', 'lists', 'projects', 'settings']);
  // Accueil coupé : sans « Accueil »
  assert.deepEqual(tabScreens({ enabled: false }, on), ['deadlines', 'lists', 'notes', 'projects', 'settings']);
  assert.deepEqual(tabScreens({ enabled: false }, { notes: false, projects: true }), ['deadlines', 'lists', 'projects', 'settings']);
  assert.deepEqual(tabScreens({ enabled: false }, { notes: false, projects: false }), ['deadlines', 'lists', 'settings']);
  // Kit : pastille sur six places, libellés serrés
  for (const file of ['public/css/listo.css', 'design/listo.css']) {
    const css = read(file);
    assert.match(css, /\.tabbar--6 \.tabbar__pill \{ width: calc\(\(100% - 10px\) \/ 6\); \}/);
    assert.match(css, /\.tabbar\[data-current="5"\] \.tabbar__pill \{ transform: translateX\(500%\); \}/);
    assert.match(css, /\.tabbar--6 \.tabbar__tab \{ padding: 0; font-size: 11px; letter-spacing: -0\.02em; \}/);
  }
  // Le nom lu reste entier : le libellé est le texte du bouton (coupé par CSS seulement)
  assert.match(read('public/js/tabbar.js'), /\['projects', 'kanban', \(\) => t\('navigation\.projets'\)\],/);
});

test('Accueil et premier écran : tuile « Projets » en dernier, toute la largeur, seulement quand la fonction est allumée', () => {
  const on = { projects: true };
  assert.deepEqual(tilesFor(null, on).at(-1), 'projects');
  assert.equal(tilesFor(null, null).includes('projects'), false);
  assert.equal(shownTiles({ hidden: ['projects'] }, on).includes('projects'), false);
  assert.deepEqual(tileLayout(['deadlines', 'lists', 'notes', 'account', 'projects']).filter((t) => t.wide).map((t) => t.name), ['projects']);
  assert.deepEqual(startScreens(on), ['deadlines', 'lists', 'notes', 'projects']);
  assert.deepEqual(startScreens(null), ['deadlines', 'lists', 'notes']);
  assert.equal(firstScreen({ enabled: false, start: 'projects' }, on), 'projects');
  assert.equal(firstScreen({ enabled: false, start: 'projects' }, null), 'lists');
  // La tuile (étape 2) : nombre de « mes cartes », les trois plus urgentes
  // (une ligne ouvre la carte), « Aucune carte pour vous », « Nouveau
  // projet » sans projet
  const home = code('public/js/screens/home.js');
  assert.match(home, /function projectsTile\(\) \{/);
  assert.match(home, /urgentCards\(app\.data, app\.user\.id, today, nowTime\(\)\)/);
  assert.match(home, /navigate\('projectCard', \{ id: card\.projectId, cardId: card\.id \}\)/);
  assert.match(home, /tile__sub\$\{late \? ' tile__sub--late' : ''\}/);
  assert.match(home, /emptyText\(t\('accueil\.projets\.aucuneCarte'\)\)/);
  assert.match(home, /addRow\(t\('accueil\.projets\.nouveau'\), \(\) => openNewProject\(\)\)/);
  assert.match(code('public/js/screens/home-settings.js'), /projects: \{ iconName: 'kanban', name: \(\) => t\('accueil\.projets'\) \},/);
  assert.equal(translate('fr', 'accueil.projets.cartes.lu', { count: 5 }), 'Projets, 5 cartes pour vous');
  assert.equal(translate('en', 'accueil.projets.cartes.lu', { count: 1 }), 'Projects, 1 card for you');
});

test('adresses : écrans des projets, tous fermés quand la fonction est coupée', () => {
  assert.deepEqual(matchRoute('#/projets'), { name: 'projects', params: {} });
  assert.deepEqual(matchRoute(`#/projets/${P}`), { name: 'project', params: { id: P } });
  assert.deepEqual(matchRoute(`#/projets/${P}/cartes/abc`), { name: 'projectCard', params: { id: P, cardId: 'abc' } });
  assert.deepEqual(matchRoute(`#/projets/${P}/reglages`), { name: 'projectSettings', params: { id: P } });
  assert.deepEqual(matchRoute(`#/projets/${P}/corbeille`), { name: 'projectTrash', params: { id: P } });
  assert.equal(pathFor('projectCard', { id: P, cardId: 'x/y' }), `#/projets/${P}/cartes/x%2Fy`);
  assert.deepEqual(matchRoute('#/reglages/corbeille/projets'), { name: 'trashTab', params: { tab: 'projets' } });
  for (const name of ['projects', 'project', 'projectCard', 'projectSettings', 'projectTrash']) {
    assert.equal(screenAllowed(name, null), false, `${name} : coupé au départ`);
    assert.equal(screenAllowed(name, { projects: true }), true, name);
  }
  const app = code('public/js/app.js');
  assert.match(app, /case 'projects': mount\(\(onLeave\) => renderProjects\(onLeave\)\); break;/);
  assert.match(app, /else mount\(\(onLeave\) => renderProject\(params\.id, onLeave\), \{ board: params\.id \}\);/);
  assert.match(app, /openProjectCardPanel\(params\.id, params\.cardId\);/);
  assert.match(app, /\} else mount\(\(onLeave\) => renderProjectCard\(params\.id, params\.cardId, onLeave\)\);/);
});

test('partager un projet : directement la feuille des personnes, trois droits sous la personne ; listes et notes gardent les deux', () => {
  const picker = code('public/js/screens/share-picker.js');
  // Deux droits sans « three », trois avec ; même composant .segmented, radiogroup, aria-checked
  assert.match(picker, /const choices = three\s*\? \[\['modification', t\('partage\.droit\.modifier'\)\], \['contribution', t\('partage\.droit\.contribuer'\)\], \['lecture', t\('partage\.droit\.lire'\)\]\]\s*: \[\['modification', t\('partage\.droit\.modifier'\)\], \['lecture', t\('partage\.droit\.lire'\)\]\];/);
  assert.match(picker, /role: 'radiogroup', 'aria-label': label/);
  assert.match(picker, /option\.setAttribute\('aria-checked', String\(option\.dataset\.value === current\)\)/);
  // Seulement pour une personne cochée (projet) ; une personne ajoutée commence en « Lire »
  assert.match(picker, /if \(project && access\) access\.hidden = !on;/);
  assert.match(picker, /rights\.get\(person\.id\) \?\? 'lecture'/);
  // Une phrase par droit, sous la carte
  assert.match(picker, /export function roleLegend\(\) \{/);
  const panel = code('public/js/screens/share-panel.js');
  // Pas de choix « lien » pour un projet : la feuille des personnes ou « Personnes »
  assert.match(panel, /return subject\.owner\(item\) \? openPeopleSheet\(subject\) : openPeopleView\(subject\);/);
  assert.match(panel, /url: `\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/members`,/);
  assert.match(panel, /const ACCESS_OF_ROLE = \{ editor: 'modification', contributor: 'contribution', reader: 'lecture' \};/);
  // Les listes et les notes : toujours le choix, puis deux droits
  assert.match(panel, /export const openListShare = \(listId\) => openShare\(listSubject\(listId\)\);/);
  assert.match(panel, /export const openNoteShare = \(noteId\) => openShare\(noteSubject\(noteId\)\);/);
  // Ce que « OK » envoie : le droit de chaque personne cochée, « Lire » par défaut
  assert.deepEqual(membersPayload({ guests: new Set([2, 3]), rights: new Map([[2, 'contribution']]) }), { userIds: [2, 3], access: { 2: 'contribution', 3: 'lecture' } });
  assert.equal(membersChanged([{ id: 1, isOwner: true }, { id: 2, access: 'modification' }], { userIds: [2], access: { 2: 'contribution' } }), true);
  // Textes
  assert.equal(fr['partage.droit.contribuer'], 'Contribuer');
  assert.equal(en['partage.droit.contribuer'], 'Contribute');
  assert.equal(translate('fr', 'partage.projet.titre', { name: 'DomoPi' }), 'Partager « DomoPi »');
  assert.match(fr['partage.projet.intro'], /pas de lien public/);
  // Kit : sous la personne, sur toute la largeur, caché quand elle n'est pas cochée
  for (const file of ['public/css/listo.css', 'design/listo.css']) {
    assert.match(read(file), /\.share__access\.share__access--3\[hidden\] \{ display: none; \}/);
  }
});

test('rôles dans l\'interface : seulement les boutons permis (la règle partagée avec le serveur, qui revérifie)', () => {
  // La même règle que le serveur
  assert.equal(projectRights('reader').createCards, false);
  assert.equal(projectRights('reader').duplicate, true);
  assert.equal(projectRights('contributor').columns, false);
  assert.equal(cardRights({ createdByMe: false, assigneeIds: [] }, 2, 'contributor').move, false);
  assert.equal(cardRights({ createdByMe: true, assigneeIds: [] }, 2, 'contributor').remove, true);
  // Menu ⋮ d'un projet : la règle partagée (project-view.js, projectMenuEntries ; test/projects-options.test.js)
  const view = code('public/js/project-view.js');
  assert.match(view, /rights\.share \? 'share' : 'people',/);
  assert.match(view, /rights\.settings \? 'settings' : null,/);
  assert.match(view, /rights\.duplicate \? 'duplicate' : null,/);
  assert.match(view, /rights\.trash \? 'delete' : 'leave',/);
  const projects = code('public/js/screens/projects.js');
  assert.match(projects, /share: \(\) => \(\{ icon: 'users', label: t\('projets\.menu\.partager'\)/);
  assert.match(projects, /delete: \(\) => \(\{ icon: 'trash', label: t\('projets\.menu\.supprimer'\), danger: true, separated: true,/);
  const project = code('public/js/screens/project.js');
  // Menu d'une carte : Déplacer vers…, Monter, Descendre (les alternatives au glisser), Dupliquer, Supprimer
  assert.match(project, /can\.move \? \{ icon: 'move', label: t\('projets\.carte\.deplacer'\)/);
  assert.match(project, /can\.move && up !== undefined \? \{ icon: 'arrow-up', label: t\('projets\.carte\.monter'\)/);
  assert.match(project, /can\.move && down !== undefined \? \{ icon: 'arrow-down', label: t\('projets\.carte\.descendre'\)/);
  assert.match(project, /can\.remove \? \{ icon: 'trash', label: t\('projets\.carte\.supprimer'\)/);
  // Barre d'ajout : pas en lecture seule ; colonnes : propriétaire et « Peut modifier »
  assert.match(project, /addbar\.hidden = !rights\.createCards \|\| !column \|\| search\.open;/);
  assert.match(project, /const colMenu = rights\.columns \?/);
  assert.match(project, /rights\.columns && !isSearching\(query\) \? h\('button', \{ class: 'kcol kcol--new'/);
  // Une carte qui ne peut pas être déplacée ne se soulève pas
  assert.match(project, /canMove: \(cardId\) => \{/);
  assert.match(code('public/js/project-drag.js'), /if \(!canMove\(card\.dataset\.card\)\) return;/);
  // Ordinateur : le glisser du navigateur (lien de la carte) n'interrompt
  // jamais celui de la carte (il enverrait pointercancel : carte retombée)
  assert.match(project, /class: 'kcard__link',[\s\S]{0,300}draggable: 'false',/);
  assert.match(code('public/js/project-drag.js'), /root\.addEventListener\('dragstart', onNativeDrag\);/);
  assert.match(code('public/js/project-drag.js'), /if \(event\.target\.closest\?\.\('\[data-card\]'\)\) event\.preventDefault\(\);/);
  // Carte ouverte : « + » et saisie seulement pour qui peut modifier ; la ligne qui le dit sinon
  const card = code('public/js/screens/project-card.js');
  assert.match(card, /if \(rightsOn\(card, project\)\.edit\) return null;/);
  assert.match(card, /canEdit \? h\('button', \{ class: 'kadd'/);
  // Réglages du projet : Contributeur et Lecture seule n'y vont pas
  const settings = code('public/js/screens/project-settings.js');
  assert.match(settings, /if \(!rights\.settings\) \{\s*navigate\('project', \{ id: projectId \}, \{ replace: true \}\);/);
  assert.match(settings, /nameInput\.readOnly = !rights\.rename;/);
  // Corbeille des cartes : seulement les boutons permis sur chaque carte
  const trash = code('public/js/screens/project-trash.js');
  assert.match(trash, /if \(!owner\) line\.querySelector\('\[data-trash-action="purge"\]'\)\?\.remove\(\);/);
  assert.match(trash, /if \(!can\.restore\) line\.querySelector\('\[data-trash-action="restore"\]'\)\?\.remove\(\);/);
});

test('accessibilité : onglets des colonnes (tablist, aria-selected, flèches), filtres aria-pressed, cartes lisibles, mouvement réduit', () => {
  const project = code('public/js/screens/project.js');
  assert.match(project, /h\('div', \{ class: 'coltabs', role: 'tablist', 'aria-label': t\('projets\.colonnes'\) \}\)/);
  assert.match(project, /role: 'tab',\s*'data-column': c\.id,\s*'aria-selected': String\(selected\),\s*'aria-controls': panelId,/);
  assert.match(project, /const step = \{ ArrowRight: 1, ArrowLeft: -1 \}\[event\.key\];/);
  // Le nom de la colonne est toujours écrit ; le nombre dans le nom lu (« 2 sur 5 » avec un filtre)
  assert.equal(translate('fr', 'projets.onglet.filtre', { name: 'Relecture', shown: 2, count: 5 }), 'Relecture, 2 sur 5 cartes');
  assert.match(project, /'aria-pressed': String\(on\)/);
  // Une carte est lue avec ses repères (échéance, cases, liens, personnes)
  // et, si je ne peux pas la modifier, le dit au lecteur d'écran ; les
  // repères visibles sont cachés aux lecteurs d'écran (déjà lus)
  assert.match(project, /can\.edit \? null : t\('projets\.carte\.lectureSeulePourVous\.court'\),/);
  assert.match(project, /h\('span', \{ class: 'visually-hidden' \}, `, \$\{spoken\.join\(', '\)\}`\)/);
  assert.match(project, /h\('div', \{ class: 'kcard__meta', 'aria-hidden': 'true' \},/);
  // Ordinateur : flèches, M ; carte ouverte : M, Échap (fenêtre du kit)
  assert.match(project, /if \(event\.key\.toLowerCase\(\) === 'm' && singleKeysOn\(\)\) \{/);
  assert.match(code('public/js/screens/project-card.js'), /'data-shortcut': 'm', 'aria-keyshortcuts': 'M'/);
  // Glisser : pas de rotation si le téléphone demande moins de mouvement ; le
  // bord gauche reste au retour de l'iPhone
  for (const file of ['public/css/listo.css', 'design/listo.css']) {
    assert.match(read(file), /@media \(prefers-reduced-motion: reduce\) \{\s*\.kghost \{ transform: none; \}\s*\}/);
    assert.match(read(file), /\.kswipe \{ touch-action: pan-y; \}/);
  }
  assert.match(code('public/js/project-drag.js'), /start = event\.clientX > SWIPE_EDGE \?/);
  // Zones tactiles : onglets et « + » de 44 px au moins (kit)
  assert.match(read('public/css/listo.css'), /\.coltab \{[^}]*min-height: var\(--tap-min\);/);
});

test('sécurité de l\'affichage : jamais de HTML, liens et textes posés par textContent, aucune requête en dehors des routes prévues', () => {
  for (const file of MODULES) {
    const source = code(file);
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|setAttribute\('style'|\bstyle: /, file);
    assert.doesNotMatch(source, /fetch\(|\bget\(`|\bpost\(`|\bput\(`/, file);
  }
  // Les seuls appels au réseau passent par project-actions.js (file d'attente, ou routes en ligne)
  const actions = code('public/js/project-actions.js');
  assert.deepEqual([...actions.matchAll(/(?:post|put)\(`([^`]+)`/g)].map((m) => m[1]).sort(), [
    '/api/projects/${enc(projectId)}/cards/purge',
    '/api/projects/${enc(projectId)}/leave',
    '/api/projects/${enc(projectId)}/members',
    '/api/projects/${enc(projectId)}/purge',
  ]);
});

test('corbeilles : onglet « Projets » des Réglages (propriétaire), « Cartes supprimées » de chaque projet ; effacer : en ligne', () => {
  const trash = code('public/js/screens/project-trash.js');
  assert.match(trash, /export function projectTrash\(onLeave, onCount = \(\) => \{\}\) \{/);
  assert.match(trash, /export function renderProjectTrash\(projectId, onLeave\) \{/);
  assert.match(trash, /await online\(\(\) => projectActions\.emptyProjectTrash\(ids\), t\('projets\.corbeille\.horsLigne'\)\);/);
  assert.match(trash, /await online\(\(\) => projectActions\.purgeCards\(project\.id, \[card\.id\]\), t\('projets\.corbeille\.horsLigne'\)\);/);
  assert.match(trash, /await projectActions\.restoreProject\(project\.id\);/);
  assert.match(trash, /await projectActions\.restoreCard\(card\.id\);/);
  assert.equal(translate('fr', 'corbeille.onglet.projets.nombre', { count: 1 }), 'Projets (1)');
  assert.equal(translate('en', 'corbeille.onglet.projets.label', { count: 2 }), 'Projects, 2 deleted projects');
});

test('kit : sections 16.35 à 16.45 identiques dans design/ et public/, couleurs du kit seulement ; nouvelles icônes dans les deux sprites', () => {
  const kit = read('public/css/listo.css');
  const section = kit.slice(kit.indexOf('/* 16.35 Projets'));
  assert.ok(section.length > 8000);
  assert.ok(read('design/listo.css').includes(section.trim()), 'même section dans design/listo.css');
  assert.doesNotMatch(section, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  for (const n of ['16.35', '16.36', '16.37', '16.38', '16.39', '16.40', '16.41', '16.42', '16.43', '16.44', '16.45']) assert.ok(section.includes(`/* ${n} `), n);
  for (const sprite of ['public/index.html', 'design/icons-sprite.html']) {
    for (const name of ['kanban', 'comment', 'move', 'grip', 'filter', 'history']) assert.match(read(sprite), new RegExp(`<symbol id="i-${name}" viewBox="0 0 24 24">`), `${sprite} ${name}`);
  }
});

test('service worker : les nouveaux fichiers sont gardés hors ligne ; aide en deux langues', () => {
  const sw = read('public/sw.js');
  for (const file of ['/js/project-view.js', '/js/project-drag.js', '/js/screens/projects.js', '/js/screens/project.js', '/js/screens/project-card.js', '/js/screens/project-settings.js', '/js/screens/project-trash.js', '/js/help-en/projets.js']) {
    assert.ok(sw.includes(`'${file}'`), file);
  }
  assert.match(read('public/js/help-content-en.js'), /import projets from '\.\/help-en\/projets\.js';/);
});
