// Corbeille unique (décision du propriétaire du 24 novembre 2026) : une
// seule ligne « Corbeille » dans les Réglages, une page à deux onglets
// « Listes » et « Notes ». Règles pures (public/js/trash-tabs.js), adresses
// (router.js, app.js) et page (screens/trash-page.js), vérifiées par
// lecture du code comme les autres écrans ; le contenu de chaque onglet est
// vérifié par test/list-trash.test.js et les tests des notes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';
import { translate } from '../public/js/i18n.js';
import { matchRoute, pathFor } from '../public/js/router.js';
import { TRASH_TABS, trashTabs, defaultTrashTab, askedTrashTab, singleTrash } from '../public/js/trash-tabs.js';
import { screenAllowed } from '../public/js/features.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

test('onglet de départ : « Listes », sauf corbeille des listes vide et notes à la corbeille ; un nombre inconnu ne compte pas pour vide', () => {
  // « Projets » (25 novembre 2026) : troisième onglet, quand la fonction est allumée
  assert.deepEqual(TRASH_TABS, ['listes', 'notes', 'projets']);
  assert.equal(defaultTrashTab({ lists: 0, notes: 0, projects: 1 }), 'projets');
  assert.equal(defaultTrashTab({ lists: 0, notes: 2, projects: 1 }), 'notes', '« Notes » avant « Projets »');
  assert.equal(defaultTrashTab({ lists: 1, notes: 0, projects: 1 }), 'listes');
  assert.equal(defaultTrashTab({ lists: 0, notes: 0, projects: null }), 'listes');
  assert.equal(defaultTrashTab({ lists: 4, notes: 2 }), 'listes');
  assert.equal(defaultTrashTab({ lists: 4, notes: 0 }), 'listes');
  assert.equal(defaultTrashTab({ lists: 0, notes: 0 }), 'listes', 'tout est vide : « Listes »');
  assert.equal(defaultTrashTab({ lists: 0, notes: 1 }), 'notes');
  assert.equal(defaultTrashTab({ lists: 0, notes: 12 }), 'notes');
  // Chargement ou hors ligne (corbeille des listes inconnue) : « Listes »
  assert.equal(defaultTrashTab({ lists: null, notes: 3 }), 'listes');
  assert.equal(defaultTrashTab({ lists: 0, notes: null }), 'listes', 'copie locale pas encore chargée');
  assert.equal(defaultTrashTab(), 'listes');
});

test('onglet demandé par l\'adresse : « listes » toujours, « notes » seulement avec les notes, inconnu : aucun', () => {
  assert.deepEqual(trashTabs(true), ['listes', 'notes']);
  assert.deepEqual(trashTabs(false), [], 'notes coupées : pas d\'onglets');
  // Projets allumés : leur onglet ; notes coupées et projets allumés : deux onglets
  assert.deepEqual(trashTabs(true, true), ['listes', 'notes', 'projets']);
  assert.deepEqual(trashTabs(false, true), ['listes', 'projets']);
  assert.deepEqual(trashTabs(true, false), ['listes', 'notes']);
  assert.equal(askedTrashTab('projets', true, true), 'projets');
  assert.equal(askedTrashTab('projets', true, false), null, 'projets coupés : pas d\'onglet « Projets »');
  assert.equal(askedTrashTab('projets', false, true), 'projets');
  assert.equal(askedTrashTab('notes', false, true), null);
  assert.equal(askedTrashTab('listes', true), 'listes');
  assert.equal(askedTrashTab('notes', true), 'notes');
  assert.equal(askedTrashTab('listes', false), 'listes');
  assert.equal(askedTrashTab('notes', false), null, 'notes coupées : la corbeille des listes');
  for (const tab of ['', 'Notes', 'NOTES', 'corbeille', 'constructor', '__proto__', 'toString', undefined, null]) {
    assert.equal(askedTrashTab(tab, true), null, String(tab));
  }
  // Invité sans Listes (docs/cadrage-comptes.md, étape 3) : pas d'onglet
  // « Listes » ; une seule corbeille restante s'affiche seule
  assert.deepEqual(trashTabs(true, true, false), ['notes', 'projets']);
  assert.deepEqual(trashTabs(false, true, false), [], 'projets seuls : pas d\'onglets');
  assert.equal(singleTrash(false, true, false), 'projets');
  assert.equal(singleTrash(true, false, false), 'notes');
  assert.equal(singleTrash(false, false, false), null, 'rien d\'utilisé : aucune corbeille');
  assert.equal(singleTrash(false, false), 'listes', 'famille : la corbeille des listes');
  assert.equal(askedTrashTab('listes', true, true, false), null);
  assert.equal(askedTrashTab('projets', true, true, false), 'projets');
});

test('adresses : #/reglages/corbeille, un onglet, les anciennes adresses de la corbeille des notes ; jamais réservées à la fonction « Notes »', () => {
  assert.deepEqual(matchRoute('#/reglages/corbeille'), { name: 'trash', params: {} });
  assert.deepEqual(matchRoute('#/reglages/corbeille/listes'), { name: 'trashTab', params: { tab: 'listes' } });
  assert.deepEqual(matchRoute('#/reglages/corbeille/notes'), { name: 'trashTab', params: { tab: 'notes' } });
  assert.equal(pathFor('trashTab', { tab: 'notes' }), '#/reglages/corbeille/notes');
  assert.deepEqual(matchRoute('#/reglages/corbeille-notes'), { name: 'noteTrash', params: {} });
  assert.deepEqual(matchRoute('#/notes/corbeille'), { name: 'oldNoteTrash', params: {} });
  // Notes coupées : ces adresses restent ouvertes (app.js mène à la corbeille des listes)
  for (const name of ['trash', 'trashTab', 'noteTrash', 'oldNoteTrash']) assert.equal(screenAllowed(name, { notes: false }), true, name);
  const app = code('public/js/app.js');
  assert.match(app, /case 'noteTrash':\s*case 'oldNoteTrash': navigate\('trashTab', \{ tab: 'notes' \}, \{ replace: true \}\); break;/);
  assert.match(app, /case 'trash': mount\(\(onLeave\) => renderTrash\(null, onLeave\)\); break;/);
  assert.match(app, /case 'trashTab': \{\s*const tab = askedTrashTab\(params\.tab, notesOn\(app\.data\.features\), projectsOn\(app\.data\.features\), shownFeatures\(\)\.lists\);\s*if \(tab\) mount\(\(onLeave\) => renderTrash\(tab, onLeave\)\);\s*else navigate\('trash', \{\}, \{ replace: true \}\);/);
  assert.match(app, /import \{ renderTrash \} from '\.\/screens\/trash-page\.js';/);
  assert.doesNotMatch(app, /renderNoteTrash/);
  // L'onglet choisi est posé dans l'adresse sans redessiner ni ajouter d'entrée
  assert.match(read('public/js/router.js'), /export function replaceAddress\(name, params = \{\}\) \{\s*history\.replaceState\(history\.state, '', pathFor\(name, params\)\);\s*\}/);
});

test('Réglages : une seule ligne « Corbeille », plus de « Corbeille des notes »', () => {
  const settings = code('public/js/screens/settings.js');
  assert.equal((settings.match(/navigate\('trash'\)/g) ?? []).length, 1);
  assert.doesNotMatch(settings, /noteTrash|corbeilleNotes|notesOn/);
  assert.equal(fr['reglages.corbeille'], 'Corbeille');
  assert.equal(en['reglages.corbeille'], 'Trash');
  assert.ok(!('reglages.corbeilleNotes' in fr) && !('reglages.corbeilleNotes' in en));
  assert.ok(!('notes.corbeille.titre' in fr) && !('notes.corbeille.titre' in en));
  // Chemin donné à la suppression d'une liste
  assert.equal(fr['mots.suppression.chemin.corbeille'], 'Corbeille');
  assert.equal(en['mots.suppression.chemin.corbeille'], 'Trash');
});

test('page : onglets de l\'Administration (nav, aria-current), nombres, contenu des deux corbeilles réutilisé, notes coupées sans onglets, jamais de HTML', () => {
  const page = code('public/js/screens/trash-page.js');
  assert.doesNotMatch(page, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\.focus\(/);
  // Même composant que l'Administration : navigation, aria-current="page"
  assert.match(page, /h\('nav', \{ class: 'tabs trash-tabs', 'aria-label': t\('corbeille\.onglets'\) \}, tabs\.map\(\(key\) => buttons\[key\]\)\)/);
  assert.match(page, /buttons\[key\] = h\('button', \{\s*class: 'tab',\s*type: 'button',/);
  assert.match(page, /if \(name === key\) buttons\[name\]\.setAttribute\('aria-current', 'page'\);\s*else buttons\[name\]\.removeAttribute\('aria-current'\);/);
  assert.doesNotMatch(page, /role: 'tab'|aria-selected/);
  // Changer d'onglet : l'adresse, sans entrée d'historique ni nouveau dessin
  assert.match(page, /show\(key\);\s*replaceAddress\('trashTab', \{ tab: key \}\);/);
  assert.doesNotMatch(page, /navigate\('trashTab'/);
  // Contenu : les deux corbeilles d'avant, sans logique copiée
  assert.match(page, /import \{ listTrash \} from '\.\/trash\.js';/);
  assert.match(page, /import \{ noteTrash \} from '\.\/note-trash\.js';/);
  assert.doesNotMatch(page, /\/api\/|actions\.|confirmDialog|trashRow/);
  // Nombres sur les onglets, seulement quand il y en a ; aussi dans le nom lu
  assert.match(page, /buttons\[key\]\.textContent = count \? t\(texts\.counted, \{ count \}\) : t\(texts\.label\);/);
  assert.match(page, /if \(count\) buttons\[key\]\.setAttribute\('aria-label', t\(texts\.name, \{ count \}\)\);/);
  // Onglet de départ : la règle pure
  assert.match(page, /const lists = panels\.listes \? panels\.listes\.count\(\) : 0;/);
  assert.match(page, /const wanted = defaultTrashTab\(\{ lists, notes, projects \}\);\s*show\(tabs\.includes\(wanted\) \? wanted : tabs\[0\]\);/);
  assert.match(page, /import \{ projectTrash \} from '\.\/project-trash\.js';/);
  assert.match(page, /if \(tabs\.includes\('projets'\)\) panels\.projets = projectTrash\(onLeave, changed\);/);
  // Une seule corbeille (notes et projets coupés : celle des listes ; un
  // invité sans Listes, projets seuls : celle des projets) : sans onglets
  assert.match(page, /if \(!tabs\.length\) \{\s*const only = \{ listes: \(\) => listTrash\(onLeave\), notes: \(\) => noteTrash\(onLeave, \(\) => \{\}\), projets: \(\) => projectTrash\(onLeave, \(\) => \{\}\) \}\[singleTrash\(withNotes, withProjects, withLists\)\];/);
  // Fonction changée sur un autre appareil : page refaite
  assert.match(page, /if \(featuresKey\(\) === shownFeatures\) return;/);
  // Deux onglets de même largeur, phrase détachée de leur trait
  const css = read('public/css/app.css');
  assert.match(css, /\.trash-tabs \.tab \{ flex: 1 1 0; \}/);
  assert.match(css, /\.trash-tabs \+ \.body--flush \{ padding-top: var\(--space-2\); \}/);
  for (const file of ['public/js/trash-tabs.js', 'public/js/screens/trash.js', 'public/js/screens/note-trash.js', 'public/js/screens/trash-parts.js']) {
    assert.doesNotMatch(code(file), /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, file);
  }
  assert.doesNotMatch(code('public/js/trash-tabs.js'), /document|window|import /, 'règles pures');
});

test('textes des onglets : français et anglais, pluriels justes, nombre dans le nom lu', () => {
  assert.equal(fr['corbeille.titre'], 'Corbeille');
  assert.equal(en['corbeille.titre'], 'Trash');
  assert.equal(fr['corbeille.onglet.listes'], 'Listes');
  assert.equal(en['corbeille.onglet.listes'], 'Lists');
  assert.equal(fr['corbeille.onglet.notes'], 'Notes');
  assert.equal(en['corbeille.onglet.notes'], 'Notes');
  assert.equal(translate('fr', 'corbeille.onglet.listes.nombre', { count: 4 }), 'Listes (4)');
  assert.equal(translate('en', 'corbeille.onglet.notes.nombre', { count: 2 }), 'Notes (2)');
  assert.equal(translate('fr', 'corbeille.onglet.listes.label', { count: 1 }), 'Listes, 1 liste supprimée');
  assert.equal(translate('fr', 'corbeille.onglet.listes.label', { count: 4 }), 'Listes, 4 listes supprimées');
  assert.equal(translate('fr', 'corbeille.onglet.notes.label', { count: 1 }), 'Notes, 1 note supprimée');
  assert.equal(translate('fr', 'corbeille.onglet.notes.label', { count: 2 }), 'Notes, 2 notes supprimées');
  assert.equal(translate('en', 'corbeille.onglet.listes.label', { count: 1 }), 'Lists, 1 deleted list');
  assert.equal(translate('en', 'corbeille.onglet.listes.label', { count: 4 }), 'Lists, 4 deleted lists');
  assert.equal(translate('en', 'corbeille.onglet.notes.label', { count: 1 }), 'Notes, 1 deleted note');
  assert.equal(translate('en', 'corbeille.onglet.notes.label', { count: 3 }), 'Notes, 3 deleted notes');
  for (const key of ['corbeille.onglets', 'corbeille.onglet.listes.nombre', 'corbeille.onglet.notes.nombre']) assert.ok(fr[key] && en[key], key);
  // Suppression d'une note : le chemin vers l'onglet « Notes »
  assert.match(fr['notes.supprimer.texte'], /corbeille des Réglages, onglet « Notes »/);
  assert.match(en['notes.supprimer.texte'], /trash in Settings, “Notes” tab/);
});

test('service worker : la page et ses règles gardées hors ligne', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /'\/js\/screens\/trash-page\.js',/);
  assert.match(sw, /'\/js\/trash-tabs\.js',/);
});
