// Étiquettes des notes (24 novembre 2026) : écrans vérifiés par lecture du
// code (comme les autres écrans) : jamais de HTML, noms lus (listes,
// cases, palette), ligne du bas des cartes (étiquettes à gauche, personnes
// à droite), filtre, aucun curseur automatique, onglet « Étiquettes » de
// l'Administration (même notes coupées), recherche par nom d'étiquette,
// kit de design identique, textes en français et en anglais, aide, service
// worker.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';
import { noteMatches, LABEL_COLORS } from '../public/js/labels.js';
import { GUIDE } from '../public/js/help-content.js';
import { GUIDE as GUIDE_EN } from '../public/js/help-content-en.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

test('recherche des notes : le titre, le texte et les noms des étiquettes (majuscules et accents ignorés)', () => {
  const labels = [{ id: 1, name: 'Été', color: 'jaune' }, { id: 2, name: 'Maison', color: 'bleu' }];
  const note = { title: 'Courses', body: 'Pain', labelIds: [1] };
  assert.ok(noteMatches(note, 'ete', labels));
  assert.ok(noteMatches(note, 'pain', labels));
  assert.ok(!noteMatches(note, 'maison', labels), 'une étiquette que la note ne porte pas');
  assert.ok(!noteMatches({ title: 'x', body: '', labelIds: [99] }, 'ete', labels), 'étiquette inconnue');
  assert.match(code('public/js/screens/notes.js'), /const found = \(notes, query\) => \(isSearching\(query\) \? notes\.filter\(\(note\) => noteMatches\(note, query, app\.data\.labels \?\? \[\]\)\) : notes\);/);
});

test('écrans : textContent seulement, jamais de HTML ; aucun curseur mis tout seul dans le champ de la feuille', () => {
  for (const file of ['public/js/screens/note-labels.js', 'public/js/screens/notes.js', 'public/js/screens/note.js', 'public/js/screens/admin.js', 'public/js/labels.js']) {
    assert.doesNotMatch(code(file), /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, file);
  }
  const sheet = code('public/js/screens/note-labels.js');
  assert.doesNotMatch(sheet, /\.focus\(|autofocus|\.select\(\)/);
  // Le nom d'une étiquette est un enfant texte (h() le pose en nœud texte)
  assert.match(sheet, /h\('span', \{ class: 'label__name' \}, label\.name\)/);
  // Une couleur inconnue ne fabrique jamais de classe : gris
  assert.match(sheet, /class: `label label--\$\{LABEL_COLORS\.includes\(label\.color\) \? label\.color : 'gris'\}`/);
});

test('noms lus : liste « Étiquettes », cases (role="checkbox"), palette (role="radiogroup", chaque couleur nommée), bouton « + Étiquette »', () => {
  const sheet = code('public/js/screens/note-labels.js');
  assert.match(sheet, /h\('span', \{ class: `labels\$\{extraClass\}`, role: 'list', 'aria-label': t\('notes\.etiquettes\.titre'\) \},\s*labels\.map\(\(label\) => labelChip\(label, \{ role: 'listitem' \}\)\)\)/);
  assert.match(sheet, /h\('button', \{ class: 'tick-row', type: 'button', role: 'checkbox', onClick: \(\) => toggle\(label\) \}/);
  assert.match(sheet, /line\.setAttribute\('aria-checked', String\(on\)\);/);
  assert.match(sheet, /h\('div', \{ class: 'label-palette', role: 'radiogroup', 'aria-label': label \}, swatches\)/);
  assert.match(sheet, /role: 'radio',\s*'aria-label': colorName\(color\),\s*'aria-checked': String\(color === current\),/);
  for (const color of LABEL_COLORS) assert.match(sheet, new RegExp(`${color}: 'notes\\.etiquettes\\.couleur\\.${color}'`), color);
  // « + Étiquette » : une feuille s'ouvre ; seulement pour qui peut modifier la note
  assert.match(sheet, /editable \? h\('button', \{\s*class: 'note-labels__add',\s*type: 'button',\s*'aria-haspopup': 'dialog',/);
  assert.match(sheet, /const editable = Boolean\(note\) && canEditNote\(note\);/);
  // Lecture seule : la feuille ne s'ouvre pas
  assert.match(sheet, /if \(!note\(\) \|\| !canEditNote\(note\(\)\)\) return null;/);
  // Note sans étiquette : la rangée est cachée (aucune place prise)
  assert.match(sheet, /slot\.hidden = !labels\.length && !editable;/);
  // 10 au plus : la case de trop n'est pas cochée
  assert.match(sheet, /else if \(ids\.size >= LABELS_PER_NOTE_MAX\) \{\s*toast\(t\('notes\.etiquettes\.limite', \{ max: LABELS_PER_NOTE_MAX \}\)\);\s*return;/);
  // Créer demande le réseau : bouton désactivé hors ligne, avec la phrase
  assert.match(sheet, /type: 'submit', disabled: offline \|\| busy \}/);
  assert.match(sheet, /offline \? h\('p', \{ class: 'note', role: 'status' \}, icon\('cloud-off', 'icon--sm'\), h\('span', \{\}, t\('notes\.etiquettes\.horsLigne'\)\)\) : null/);
  // Menu ⋮ : « Étiquettes » pour le propriétaire et « Peut modifier »
  assert.match(code('public/js/screens/notes.js'), /canEditNote\(note\) && !note\.deletedAt \? \{ icon: 'tag', label: t\('notes\.menu\.etiquettes'\), onSelect: \(\) => openNoteLabelsSheet\(note\.id\) \} : null,/);
});

test('carte : une seule ligne du bas, étiquettes à gauche, personnes à droite (correction du propriétaire)', () => {
  const notes = code('public/js/screens/notes.js');
  assert.match(notes, /const labels = labelList\(labelsOfNote\(note\)\);/);
  assert.match(notes, /readOnly \? h\('span', \{ class: 'chip chip--readonly' \}[^\n]*\n\s*labels,\n\s*\]\.filter\(Boolean\);/);
  assert.match(notes, /chips\.length \|\| right \? h\('div', \{ class: 'note-card__foot' \}, chips\.length \? h\('span', \{ class: 'note-card__chips' \}, chips\) : null, right\) : null\);/);
  const css = read('public/css/listo.css');
  assert.match(css, /\.note-card__foot \{ display: flex; flex-wrap: wrap; align-items: center;/);
  assert.match(css, /\.note-card__people \{ display: inline-flex; align-items: center; gap: 6px; margin-left: auto;/);
});

test('filtre : « Toutes » + étiquettes de mes notes, un choix (aria-pressed), retenu sur l\'appareil, caché sans étiquette ; avec la recherche', () => {
  const sheet = code('public/js/screens/note-labels.js');
  assert.match(sheet, /h\('div', \{ class: 'label-filter', role: 'group', 'aria-label': t\('notes\.filtre\.libelle'\), hidden: true \}\)/);
  assert.match(sheet, /container\.hidden = !labels\.length;/);
  assert.match(sheet, /button\.setAttribute\('aria-pressed', String\(on\)\);/);
  assert.match(sheet, /const FILTER_KEY = 'listo-etiquette-notes';/);
  // Une étiquette choisie qui n'est plus utilisée : « Toutes »
  assert.match(sheet, /return id && labelsUsedBy\(notes\)\.some\(\(label\) => label\.id === id\) \? id : null;/);
  const notes = code('public/js/screens/notes.js');
  assert.equal((notes.match(/const notes = found\(withLabel\(all, activeLabelFilter\(all\)\), query\);/g) ?? []).length, 2, 'téléphone et ordinateur');
  // Téléphone : sous la barre du haut ; ordinateur : dans la ligne sous le titre
  assert.match(notes, /search\.bar,\s*filter,\s*content\);/);
  assert.match(notes, /h\('div', \{ class: 'pc-tools' \},\s*filter,/);
});

test('administration : onglet « Étiquettes » (toujours là, même notes coupées), routes de l\'Admin, confirmation de suppression', () => {
  const admin = code('public/js/screens/admin.js');
  assert.match(admin, /\{ key: 'etiquettes', get label\(\) \{ return t\('administration\.onglets\.etiquettes'\); \} \}/);
  assert.doesNotMatch(admin, /notesOn|features/, 'l\'onglet ne dépend pas du réglage « Fonctions »');
  assert.match(admin, /get\('\/api\/admin\/labels'\)/);
  assert.match(admin, /patch\(`\/api\/admin\/labels\/\$\{label\.id\}`, change\)/);
  assert.match(admin, /del\(`\/api\/admin\/labels\/\$\{label\.id\}`\)/);
  assert.match(admin, /text: label\.notes \? t\('administration\.etiquettes\.supprimer\.texte', \{ count: label\.notes \}\) : t\('administration\.etiquettes\.supprimer\.texte\.aucune'\),/);
  assert.equal(fr['administration.etiquettes.supprimer.question'], 'Supprimer l\'étiquette « {name} » ?');
  assert.deepEqual(fr['administration.etiquettes.supprimer.texte'], { one: 'Elle sera retirée de {count} note, sans toucher à la note.', other: 'Elle sera retirée de {count} notes, sans toucher aux notes.' });
  // Le serveur : routes sous /api/admin, derrière requireAdmin
  assert.match(code('server/routes/admin.js'), /router\.use\(requireAdmin\);[\s\S]*router\.use\(adminLabelRoutes\(ctx\)\);/);
});

test('kit de design : section 16.32 identique dans design/ et public/ ; huit couleurs, en clair, en sombre et en automatique', () => {
  const section = (file) => read(file).match(/\/\* 16\.32 Étiquettes des notes[\s\S]*?\.label-row__delete \{[^}]*\}/)?.[0];
  assert.ok(section('design/listo.css'));
  assert.equal(section('public/css/listo.css'), section('design/listo.css'));
  assert.doesNotMatch(section('public/css/listo.css'), /#[0-9a-f]{3,6}\b/i, 'couleurs du kit seulement (variables)');
  for (const file of ['design/listo.css', 'public/css/listo.css']) {
    const css = read(file);
    const blocks = [
      css.match(/:root,\n\[data-theme="light"\] \{[\s\S]*?\n\}/)[0],
      css.match(/\[data-theme="dark"\] \{[\s\S]*?\n\}/)[0],
      css.match(/\[data-theme="auto"\] \{[\s\S]*?\n {2}\}/)[0],
    ];
    for (const color of LABEL_COLORS) {
      for (const block of blocks) assert.match(block, new RegExp(`--label-${color}-bg: #[0-9A-F]{6}; --label-${color}-ink: #[0-9A-F]{6};`), `${file} ${color}`);
      assert.match(css, new RegExp(`\\.label--${color} \\{ --label-bg: var\\(--label-${color}-bg\\); --label-ink: var\\(--label-${color}-ink\\); \\}`));
    }
    // Le thème automatique reprend exactement les valeurs du sombre
    const pairs = (block) => [...block.matchAll(/--label-[a-z]+-(?:bg|ink): #[0-9A-F]{6}/g)].map((m) => m[0]);
    assert.deepEqual(pairs(blocks[2]), pairs(blocks[1]));
  }
  // Zones tactiles : filtre et « + Étiquette » (44 px), ronds de la palette (44 px)
  const css = read('public/css/listo.css');
  assert.match(css, /\.label-filter__opt \{[^}]*min-height: var\(--tap-min\);/);
  assert.match(css, /\.note-labels__add::after \{ content: ""; position: absolute; inset: -8px -2px; \}/);
  assert.match(css, /\.label-swatch \{[^}]*width: var\(--tap-min\); height: var\(--tap-min\);/);
  // Le choix du filtre : coche ET contour (jamais la couleur seule)
  assert.match(css, /\.label-filter__opt\[aria-pressed="true"\] \.label \{ border-color: var\(--label-ink\); \}/);
  // Documenté dans le kit
  assert.match(read('design/README.md'), /16\.32/);
  assert.match(read('design/components.html'), /class="label label--vert"/);
});

test('textes : français et anglais, mêmes noms ; erreurs du serveur traduites', () => {
  const keys = Object.keys(fr).filter((key) => /^(notes\.(etiquettes|filtre)\.|notes\.menu\.etiquettes$|administration\.(etiquettes\.|onglets\.etiquettes$)|ops\.(etiquette|nomEtiquette|couleurEtiquette|tropDEtiquettes|etiquettes))/.test(key));
  assert.ok(keys.length >= 45, String(keys.length));
  for (const key of keys) assert.ok(key in en, key);
  assert.equal(fr['notes.etiquettes.existe'], '« {name} » existe déjà : elle est proposée au lieu d\'en créer une seconde.');
  assert.equal(en['notes.etiquettes.couleur.vert'], 'Green');
});

test('service worker : nouveaux fichiers gardés hors ligne, version changée', () => {
  const sw = read('public/sw.js');
  for (const file of ['/js/labels.js', '/js/screens/note-labels.js']) assert.match(sw, new RegExp(`'${file.replace(/\//g, '\\/')}',`), file);
  assert.match(sw, /const VERSION = `v(16[2-9]|1[7-9]\d|[2-9]\d\d|\d{4,})-/);
});

test('aide : les étiquettes dans le chapitre des notes et l\'onglet « Étiquettes » de l\'Administration, en français et en anglais', () => {
  const text = (guide, id) => JSON.stringify(guide.flatMap((c) => c.sections ?? []).find((s) => s.id === id));
  assert.match(text(GUIDE, 'notes'), /Étiquettes/);
  assert.match(text(GUIDE, 'role-admin'), /« Étiquettes »/);
  assert.match(text(GUIDE_EN, 'notes'), /Labels/);
  assert.match(text(GUIDE_EN, 'role-admin'), /“Labels”/);
});
