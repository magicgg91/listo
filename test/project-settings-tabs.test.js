// Réglages d'un projet en deux onglets (décision du propriétaire du 25
// novembre 2026, variante A) : « Projet » et « Étiquettes · 25 ». Règles
// pures (public/js/project-settings-tabs.js : onglets, tri, recherche),
// adresses (router.js, app.js) et écran (screens/project-settings.js),
// vérifié par lecture du code comme les autres écrans ; le parcours dans un
// vrai navigateur est vérifié par les captures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';
import { translate } from '../public/js/i18n.js';
import { matchRoute, pathFor } from '../public/js/router.js';
import { SETTINGS_TABS, askedSettingsTab, sortedLabels, foundLabels } from '../public/js/project-settings-tabs.js';
import { projectRights, ROLES } from '../public/js/projects.js';
import { screenAllowed } from '../public/js/features.js';
import { highlightParts } from '../public/js/search.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
const SCREEN = 'public/js/screens/project-settings.js';
const P = '7f9c1e2a-0000-4000-8000-000000000001';
const names = (labels) => labels.map((l) => l.name);
const label = (name, id = name) => ({ id, name, color: 'bleu' });

test('adresses : #/projets/<id>/reglages ouvre « Projet » (adresse d\'avant), /etiquettes l\'onglet « Étiquettes », un nom inconnu ramène aux réglages', () => {
  assert.deepEqual(SETTINGS_TABS, ['projet', 'etiquettes']);
  // L'ancienne adresse marche toujours, sans changer de nom d'écran
  assert.deepEqual(matchRoute(`#/projets/${P}/reglages`), { name: 'projectSettings', params: { id: P } });
  assert.deepEqual(matchRoute(`#/projets/${P}/reglages/etiquettes`), { name: 'projectSettingsTab', params: { id: P, tab: 'etiquettes' } });
  assert.deepEqual(matchRoute(`#/projets/${P}/reglages/projet`), { name: 'projectSettingsTab', params: { id: P, tab: 'projet' } });
  assert.equal(pathFor('projectSettingsTab', { id: P, tab: 'etiquettes' }), `#/projets/${P}/reglages/etiquettes`);
  assert.equal(pathFor('projectSettings', { id: P }), `#/projets/${P}/reglages`);
  // Les autres adresses des projets ne changent pas
  assert.deepEqual(matchRoute(`#/projets/${P}/corbeille`), { name: 'projectTrash', params: { id: P } });
  assert.deepEqual(matchRoute(`#/projets/${P}/cartes/abc`), { name: 'projectCard', params: { id: P, cardId: 'abc' } });
  assert.equal(askedSettingsTab('etiquettes'), 'etiquettes');
  assert.equal(askedSettingsTab('projet'), 'projet');
  for (const bad of ['colonnes', 'Etiquettes', '', null, undefined, '__proto__', 'toString']) assert.equal(askedSettingsTab(bad), null, String(bad));
  // app.js : l'onglet de l'adresse, ou retour à #/projets/<id>/reglages
  const app = code('public/js/app.js');
  assert.match(app, /case 'projectSettings': mount\(\(onLeave\) => renderProjectSettings\(params\.id, 'projet', onLeave\)\); break;/);
  assert.match(app, /case 'projectSettingsTab': \{\s*const tab = askedSettingsTab\(params\.tab\);\s*if \(tab\) mount\(\(onLeave\) => renderProjectSettings\(params\.id, tab, onLeave\)\);\s*else navigate\('projectSettings', \{ id: params\.id \}, \{ replace: true \}\);/);
  // Fonction « Projets » coupée : l'adresse d'un onglet mène au premier
  // écran, comme les autres ; menu de gauche de l'ordinateur : « Projets »
  assert.equal(screenAllowed('projectSettingsTab', null), false);
  assert.equal(screenAllowed('projectSettingsTab', { projects: true }), true);
  assert.match(code('public/js/screens/pc-side.js'), /export const PROJECT_SCREENS = \[[^\]]*'projectSettingsTab'[^\]]*\];/);
});

test('onglets : role="tablist", aria-selected, tabindex, zones role="tabpanel", flèches, adresse posée sans redessiner', () => {
  const screen = code(SCREEN);
  assert.match(screen, /h\('div', \{ class: 'tabs kset-tabs', role: 'tablist', 'aria-label': t\('projets\.reglages\.titre'\) \}/);
  assert.match(screen, /class: 'tab', type: 'button', role: 'tab', id: `reglages-\$\{key\}-onglet`, 'aria-controls': `reglages-\$\{key\}-zone`,/);
  assert.match(screen, /role: 'tabpanel', id: 'reglages-projet-zone', 'aria-labelledby': 'reglages-projet-onglet'/);
  assert.match(screen, /role: 'tabpanel', id: 'reglages-etiquettes-zone', 'aria-labelledby': 'reglages-etiquettes-onglet'/);
  assert.match(screen, /tabButtons\[key\]\.setAttribute\('aria-selected', String\(on\)\);\s*tabButtons\[key\]\.tabIndex = on \? 0 : -1;\s*panels\[key\]\.hidden = !on;/);
  // Flèches gauche et droite, d'un bout à l'autre ; le focus suit l'onglet
  assert.match(screen, /const step = \{ ArrowRight: 1, ArrowLeft: -1 \}\[event\.key\];/);
  assert.match(screen, /\(SETTINGS_TABS\.indexOf\(tab\) \+ step \+ SETTINGS_TABS\.length\) % SETTINGS_TABS\.length/);
  assert.match(screen, /select\(next\);\s*const nextTab = tabButtons\[next\];\s*nextTab\.focus\(\);/);
  // Adresse de l'onglet : replaceAddress (ni redessin, ni entrée d'historique)
  assert.match(screen, /if \(key === 'projet'\) replaceAddress\('projectSettings', \{ id: projectId \}\);\s*else replaceAddress\('projectSettingsTab', \{ id: projectId, tab: key \}\);/);
  // Onglets hors de la zone qui défile (toujours visibles) : téléphone et ordinateur
  assert.match(screen, /topbar\(t\('projets\.reglages\.titre'\), back\),\s*tabBar,\s*scroll\);/);
  assert.match(screen, /h\('h1', \{ class: 'pc-head__title' \}, t\('projets\.reglages\.titre'\)\)\)\),\s*tabBar,\s*offlineBanner\(\),\s*scroll\);/);
  assert.match(screen, /const scroll = h\('div', \{ class: 'scroll' \}, panels\.projet, panels\.etiquettes\);/);
  // Nom de l'onglet « Étiquettes » : écrit « Étiquettes · 25 », lu en entier
  assert.match(screen, /button\.textContent = count \? t\('projets\.reglages\.onglet\.etiquettes\.nombre', \{ count \}\) : t\('projets\.reglages\.onglet\.etiquettes'\);/);
  assert.match(screen, /if \(count\) button\.setAttribute\('aria-label', t\('projets\.reglages\.onglet\.etiquettes\.lu', \{ count \}\)\);/);
  assert.equal(translate('fr', 'projets.reglages.onglet.etiquettes.nombre', { count: 25 }), 'Étiquettes · 25');
  assert.equal(translate('fr', 'projets.reglages.onglet.etiquettes.lu', { count: 25 }), 'Étiquettes, 25 étiquettes');
  assert.equal(translate('fr', 'projets.reglages.onglet.etiquettes.lu', { count: 1 }), 'Étiquettes, 1 étiquette');
  assert.equal(translate('en', 'projets.reglages.onglet.etiquettes.nombre', { count: 25 }), 'Labels · 25');
  assert.equal(translate('en', 'projets.reglages.onglet.etiquettes.lu', { count: 1 }), 'Labels, 1 label');
  assert.equal(translate('en', 'projets.reglages.onglet.etiquettes.lu', { count: 25 }), 'Labels, 25 labels');
  // Kit : même composant que les onglets d'une carte, nouvelle section 16.53
  for (const file of ['public/css/listo.css', 'design/listo.css']) {
    const css = read(file);
    assert.match(css, /\/\* 16\.53 Réglages du projet en deux onglets/);
    assert.match(css, /\.kset-tabs \{ flex: none; \}/);
    assert.match(css, /\.kset__found:empty \{ display: none; \}/);
    assert.match(css, /\.app--pc \.kset__labels \{ margin-bottom: -1px; column-count: 2;/);
  }
});

test('onglet « Projet » : nom, options, colonnes, puis « Supprimer le projet » ; ordinateur : deux colonnes', () => {
  const screen = code(SCREEN);
  assert.match(screen, /if \(pc\) replace\(body, h\('div', \{ class: 'kset__col' \}, namePart, options, danger\), h\('div', \{ class: 'kset__col' \}, columnsPart\(p\)\)\);/);
  assert.match(screen, /else replace\(body, namePart, options, columnsPart\(p\), danger\);/);
  // Plus d'étiquettes dans cet onglet
  assert.doesNotMatch(screen, /labelsPart/);
});

test('droits : qui ouvre les réglages, ce que chaque rôle y voit (inchangé)', () => {
  // Propriétaire et « Peut modifier » : l'écran, colonnes ET étiquettes ;
  // Contributeur et Lecture seule : pas d'écran (retour au projet)
  const expected = {
    owner: { settings: true, labels: true, columns: true, rename: true, priority: true, deadlines: true, trash: true },
    editor: { settings: true, labels: true, columns: true, rename: false, priority: false, deadlines: true, trash: false },
    contributor: { settings: false, labels: false, columns: false, rename: false, priority: false, deadlines: false, trash: false },
    reader: { settings: false, labels: false, columns: false, rename: false, priority: false, deadlines: false, trash: false },
  };
  assert.deepEqual([...ROLES].sort(), Object.keys(expected).sort());
  for (const [role, rights] of Object.entries(expected)) {
    const got = projectRights(role);
    for (const [key, value] of Object.entries(rights)) assert.equal(got[key], value, `${role} : ${key}`);
    // Qui ouvre l'écran peut gérer les étiquettes : l'onglet n'a pas de
    // mode lecture seule, il n'est jamais caché
    if (got.settings) assert.equal(got.labels, true, role);
  }
  assert.equal(projectRights('admin').settings, false, 'Admin non membre : rien');
  const screen = code(SCREEN);
  assert.match(screen, /if \(!rights\.settings\) \{\s*navigate\('project', \{ id: projectId \}, \{ replace: true \}\);/);
  assert.match(screen, /nameInput\.readOnly = !rights\.rename;/);
  assert.match(screen, /rights\.rename \? null : h\('p', \{ class: 'field__hint' \}, t\('projets\.reglages\.nomProprietaire'\)\)/);
  assert.match(screen, /const danger = rights\.trash \? h\('div', \{ class: 'kset__danger' \}/);
  assert.match(screen, /if \(!p \|\| !projectRights\(p\.role\)\.labels\) return;/);
  // Feuilles : revérifient les droits à l'ouverture (le serveur aussi)
  assert.match(screen, /if \(!project \|\| !projectRights\(project\.role\)\.labels\) return null;/);
  assert.match(screen, /if \(!project \|\| !projectRights\(project\.role\)\.columns\) return null;/);
});

test('tri des étiquettes : nombres lus comme des nombres, majuscules et accents ignorés, liste reçue intacte', () => {
  const given = [label('2026 10'), label('Tool'), label('2026 2'), label('éco'), label('Article'), label('Eco', 'b'), label('2025 12'), label('ZZ'), label('abri'), label('News / Link')];
  const copy = JSON.parse(JSON.stringify(given));
  assert.deepEqual(names(sortedLabels(given, 'fr')), ['2025 12', '2026 2', '2026 10', 'abri', 'Article', 'Eco', 'éco', 'News / Link', 'Tool', 'ZZ']);
  assert.deepEqual(given, copy, 'la liste reçue n\'est pas modifiée');
  // Même nom à la comparaison (« Eco », « éco ») : l'identifiant décide, jamais l'ordre reçu
  assert.deepEqual(names(sortedLabels([label('éco', 'a'), label('Eco', 'b')], 'fr')), names(sortedLabels([label('Eco', 'b'), label('éco', 'a')], 'fr')));
  assert.deepEqual(names(sortedLabels([label('Item 9'), label('item 10'), label('Item 1')], 'en')), ['Item 1', 'Item 9', 'item 10']);
  assert.deepEqual(names(sortedLabels([label('Œuvre'), label('Oeuf'), label('Orange')], 'fr')), ['Oeuf', 'Œuvre', 'Orange']);
  assert.deepEqual(sortedLabels(null), []);
  // L'écran trie dans la langue du compte (t, getLocale)
  assert.match(code(SCREEN), /const shown = sortedLabels\(foundLabels\(all, query\)\);/);
});

test('recherche : majuscules et accents ignorés, partie trouvée marquée, « 12 étiquettes sur 25 », croix, nom proposé', () => {
  const labels = ['2025 03', '2026 01', '2026 02', 'Énergie', 'Sécurité', 'Réseau (Wi-Fi)', 'Docker', 'Cœur'].map((n) => label(n));
  assert.deepEqual(names(foundLabels(labels, '2026')), ['2026 01', '2026 02']);
  assert.deepEqual(names(foundLabels(labels, 'ENER')), ['Énergie']);
  assert.deepEqual(names(foundLabels(labels, 'securite')), ['Sécurité']);
  assert.deepEqual(names(foundLabels(labels, 'coeur')), ['Cœur']);
  // Le texte tapé n'est jamais une expression régulière
  assert.deepEqual(names(foundLabels(labels, '(wi')), ['Réseau (Wi-Fi)']);
  assert.deepEqual(names(foundLabels(labels, '.*')), []);
  // Recherche vide ou faite d'espaces : toutes
  assert.equal(foundLabels(labels, '').length, labels.length);
  assert.equal(foundLabels(labels, '   ').length, labels.length);
  // Partie trouvée : en morceaux, posés dans <mark class="hit"> à l'intérieur de la pastille
  assert.deepEqual(highlightParts('Sécurité', 'secu'), [{ text: 'Sécu', hit: true }, { text: 'rité', hit: false }]);
  const screen = code(SCREEN);
  assert.match(screen, /labelChip\(label, \{ content: searching \? highlightParts\(label\.name, query\)\.map\(\(part\) => \(part\.hit \? h\('mark', \{ class: 'hit' \}, part\.text\) : part\.text\)\) : null \}\)/);
  assert.match(code('public/js/screens/note-labels.js'), /h\('span', \{ class: 'label__name' \}, content \?\? label\.name\)/);
  // Nombre trouvé : pendant une recherche seulement, role="status"
  assert.match(screen, /const found = h\('p', \{ class: 'field__hint kset__found', role: 'status' \}\);/);
  assert.match(screen, /found\.textContent = searching \? t\('projets\.reglages\.recherche\.trouvees', \{ count: shown\.length, total: all\.length \}\) : '';/);
  assert.equal(translate('fr', 'projets.reglages.recherche.trouvees', { count: 12, total: 25 }), '12 étiquettes sur 25');
  assert.equal(translate('fr', 'projets.reglages.recherche.trouvees', { count: 1, total: 25 }), '1 étiquette sur 25');
  assert.equal(translate('fr', 'projets.reglages.recherche.trouvees', { count: 0, total: 25 }), '0 étiquette sur 25');
  assert.equal(translate('en', 'projets.reglages.recherche.trouvees', { count: 12, total: 25 }), '12 labels of 25');
  assert.equal(translate('en', 'projets.reglages.recherche.trouvees', { count: 1, total: 25 }), '1 label of 25');
  // Champ du kit, nom lu ; croix cachée sans texte, qui vide le champ sans y mettre le curseur
  assert.match(screen, /placeholder: t\('projets\.reglages\.recherche'\), 'aria-label': t\('projets\.reglages\.recherche'\),/);
  assert.match(screen, /h\('label', \{ class: 'searchfield' \}, icon\('search', 'icon--sm'\), searchInput, clearButton\)/);
  assert.match(screen, /clearButton\.hidden = query === '';/);
  assert.match(screen, /'aria-label': t\('projets\.reglages\.recherche\.effacer'\), hidden: true,\s*onPointerdown: keepFieldFocus\.pointerdown, onMousedown: keepFieldFocus\.mousedown,\s*onClick: \(\) => \{\s*searchInput\.value = '';\s*paintLabels\(\);/);
  assert.match(screen, /searchInput\.addEventListener\('input', \(\) => paintLabels\(\)\);/);
  // « Nouvelle étiquette » en tête ; pendant une recherche, le nom proposé est le texte cherché
  assert.match(screen, /replace\(labelsGroup,\s*all\.length < PROJECT_LABELS_MAX \? h\('button', \{\s*class: 'label-row label-row--add'/);
  assert.match(screen, /onClick: \(\) => openLabelSheet\(projectId, null, \{ name: isSearching\(searchInput\.value\) \? searchInput\.value\.trim\(\) : '' \}\),/);
  assert.match(screen, /export function openLabelSheet\(projectId, labelId, \{ onCreated = null, name: proposed = '' \} = \{\}\)/);
  assert.match(screen, /value: label\?\.name \?\? proposed\.slice\(0, PROJECT_LABEL_NAME_MAX\)/);
});

test('aucun curseur mis tout seul, aucun innerHTML, textes en français et en anglais', () => {
  const screen = code(SCREEN);
  // Le champ de recherche ne reçoit jamais le focus de lui-même ; le seul
  // .focus() de l'onglet est sur un onglet (flèches, geste de la personne)
  assert.doesNotMatch(screen, /searchInput\??\.focus\(/);
  assert.doesNotMatch(screen, /autofocus|\.select\(\)|setSelectionRange/);
  assert.equal([...screen.matchAll(/\.focus\(/g)].length, 2, 'nextTab (flèches) et le bouton gardé après un redessin (data-key)');
  for (const file of [SCREEN, 'public/js/project-settings-tabs.js']) assert.doesNotMatch(read(file), /innerHTML|insertAdjacentHTML|outerHTML/, file);
  const keys = [
    'projets.reglages.onglet.projet', 'projets.reglages.onglet.etiquettes', 'projets.reglages.onglet.etiquettes.nombre',
    'projets.reglages.onglet.etiquettes.lu', 'projets.reglages.recherche', 'projets.reglages.recherche.effacer', 'projets.reglages.recherche.trouvees',
  ];
  for (const key of keys) {
    assert.ok(fr[key], `fr : ${key}`);
    assert.ok(en[key], `en : ${key}`);
    assert.equal(typeof fr[key], typeof en[key], key);
  }
  assert.equal(fr['projets.reglages.onglet.projet'], 'Projet');
  assert.equal(fr['projets.reglages.recherche'], 'Rechercher une étiquette');
  assert.equal(en['projets.reglages.recherche'], 'Search labels');
  // Anciens textes du groupe « Étiquettes du projet » retirés
  assert.equal(fr['projets.reglages.etiquettes'], undefined);
  assert.equal(fr['projets.reglages.nombreEtiquettes'], undefined);
  // Service worker : nouveau fichier gardé hors ligne
  assert.match(read('public/sw.js'), /'\/js\/project-settings-tabs\.js',/);
});
