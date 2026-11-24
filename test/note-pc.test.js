// Ordinateur : une note ouverte prend toute la colonne, comme une liste
// ouverte (décision du propriétaire du 24 novembre 2026). Plus de zone de
// droite à côté des cartes : #/notes montre les cartes seules, #/notes/<id>
// la note seule, avec « Retour aux notes » à gauche de sa barre (Échap y
// ramène aussi), sans croix « Fermer ». Le téléphone ne change pas
// (captures avant/après identiques, voir le résumé). Vérifications sur le code.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Code sans les commentaires de fin de ligne
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
// Section 16.28 du kit (jusqu'à 16.29)
const section = (css) => css.slice(css.indexOf('/* 16.28 Ordinateur'), css.indexOf('/* 16.29 '));

test('#/notes/<id> et #/notes/nouvelle : l\'écran de la note, seul, sur l\'ordinateur comme sur le téléphone', () => {
  const app = code('public/js/app.js');
  assert.match(app, /case 'note':\s*case 'newNote': \{\s*const id = name === 'note' \? params\.id : null;\s*mount\(\(onLeave\) => renderNote\(id, onLeave\)\);/);
  const note = code('public/js/screens/note.js');
  assert.match(note, /export function renderNote\(noteId, onLeave\) \{\s*return noteEditor\(noteId, onLeave, \{ pc: isDesktop\(\) \}\);/);
  // L'éditeur n'est plus posé dans l'écran Notes
  assert.doesNotMatch(note, /export function noteEditor/);
  const notes = code('public/js/screens/notes.js');
  assert.doesNotMatch(notes, /noteEditor|openId|selectedId|is-selected|pc-notes(--closed|__list)?['` ]/);
  assert.match(notes, /export function renderNotes\(onLeave\) \{\s*if \(isDesktop\(\)\) return renderNotesPc\(onLeave\);/);
  // Une carte ouvre la note par une nouvelle entrée de l'historique (Retour revient aux cartes)
  assert.match(notes, /onClick: \(event\) => \{\s*event\.preventDefault\(\);\s*navigate\('note', \{ id: note\.id \}\);\s*\},/);
});

test('barre de la note (ordinateur) : « Retour aux notes » à gauche, puis la mention, les personnes, l\'épingle, le menu ; pas de croix', () => {
  const note = code('public/js/screens/note.js');
  assert.match(note, /const bar = h\('div', \{ class: 'pc-note__bar' \},\s*iconButton\('chev-l', t\('notes\.retour'\), \(\) => back\(\), 'pc-note__back'\),\s*status, h\('span', \{ class: 'grow' \}\), peopleButton, pinButton, menuButton\);/);
  assert.match(note, /return h\('div', \{ class: 'screen pc-note' \}, heading, bar, offlineBanner\(\), banner, scroll, foot\);/);
  assert.doesNotMatch(note, /iconButton\('close'|notes\.fermer/);
  // Retour : comme sur le téléphone (écran précédent, sinon « Notes »)
  assert.match(note, /const back = \(\) => goBack\('notes'\);/);
  // Titre de l'écran : un h1 (titre de l'onglet, focus après changement d'écran)
  assert.match(note, /const heading = h\('h1', \{ class: 'visually-hidden' \}\);/);
  assert.match(note, /if \(n\) document\.title = `\$\{heading\.textContent\} · Listo`;/);
  // Même zone qui défile que sur le téléphone
  assert.match(note, /const scroll = h\('div', \{ class: 'scroll' \}, fields\);/);
  assert.equal(fr['notes.retour'], 'Retour aux notes');
  assert.equal(en['notes.retour'], 'Back to notes');
  assert.ok(!('notes.fermer' in fr) && !('notes.fermer' in en), 'plus de « Fermer la note »');
});

test('téléphone : la barre de la note ne change pas', () => {
  const note = code('public/js/screens/note.js');
  assert.match(note, /return h\('div', \{ class: 'screen' \},\s*h\('header', \{ class: 'topbar' \},\s*iconButton\('chev-l', t\('notes\.retour'\), \(\) => back\(\)\),\s*status,\s*h\('span', \{ class: 'grow' \}\),\s*peopleButton,\s*menuButton\),\s*heading,\s*banner,\s*scroll,\s*foot\);/);
  // Le défilement vers l'endroit touché reste propre au téléphone
  assert.match(note, /if \(!pc\) \{\s*fields\.classList\.add\('note-edit--writing'\);/);
});

test('Échap dans une note ouverte (hors saisie, sans fenêtre ouverte) : appuie sur « Retour aux notes »', () => {
  const shortcuts = code('public/js/shortcuts.js');
  const typing = shortcuts.indexOf('if (typing || mod || event.altKey) return;');
  const escape = shortcuts.indexOf("if (event.key === 'Escape') {");
  const singleKeys = shortcuts.indexOf('if (!singleKeysOn()) return;');
  assert.ok(typing > 0 && escape > typing, 'jamais pendant la saisie');
  assert.ok(singleKeys > escape, 'reste active quand les raccourcis à une touche sont coupés');
  assert.match(shortcuts, /if \(event\.key === 'Escape'\) \{\s*const back = \$\('\.pc-col \.pc-note__back'\);\s*if \(!topLayer\(\) && visible\(back\)\) \{\s*event\.preventDefault\(\);\s*back\.click\(\);\s*\}\s*return;\s*\}/);
  assert.equal(fr['raccourcis.partout.fermer'], 'Fermer la fenêtre, effacer la recherche, quitter une note');
  assert.equal(en['raccourcis.partout.fermer'], 'Close the window, clear the search, leave a note');
});

test('kit 16.28 : note seule dans la colonne, texte sur 70 caractères au plus ; identique dans design/ et public/', () => {
  const kit = section(read('public/css/listo.css'));
  assert.ok(kit.length > 500, 'section 16.28 présente');
  assert.equal(section(read('design/listo.css')), kit, 'même section dans design/listo.css');
  assert.doesNotMatch(kit, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'couleurs du kit seulement');
  assert.match(kit, /\.pc-note \.note-edit \{ max-width: 70ch; padding: 8px 0 0; font-size: var\(--text-lg\); \}/);
  assert.match(kit, /\.pc-note \.note-edit__body \{ font-size: inherit; \}/);
  // Titre et texte alignés après le bouton de retour ; pied sous un trait
  assert.match(kit, /\.pc-note > \.scroll \{ padding: 0 var\(--pc-gutter\) var\(--pc-gutter\) calc\(var\(--pc-gutter\) \+ var\(--tap-min\) \+ 12px\); \}/);
  assert.match(kit, /\.pc-note \.note-foot \{[^}]*border-top: 1px solid var\(--color-border\);/);
  // Plus de zone de droite, de note sélectionnée, ni de trait de chaque côté
  for (const file of ['public/css/listo.css', 'design/listo.css']) {
    const css = read(file);
    assert.doesNotMatch(css, /\.pc-notes--closed|\.pc-notes__list|\.note-card\.is-selected|border-inline: 1px solid var\(--color-border\); background: var\(--color-surface\)/, file);
  }
  // Toutes les règles de la section visent des classes propres à l'ordinateur
  for (const rule of kit.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.trim()).filter(Boolean)) {
    assert.match(rule, /^(\.pc-|\.app--pc )/, rule);
  }
});

test('aide (français et anglais) : la note s\'ouvre seule, « Retour aux notes », Échap', () => {
  const frHelp = read('public/js/help-content.js');
  const enHelp = read('public/js/help-en/quotidien.js');
  assert.doesNotMatch(frHelp, /à droite des cartes/);
  assert.doesNotMatch(enHelp, /to the right of the cards/);
  assert.match(frHelp, /Une carte ouvre sa note à la place des cartes, seule au centre, comme une liste ouverte : en haut, « Retour aux notes »/);
  assert.match(enHelp, /A card opens its note in place of the cards, alone in the middle, like an open list: at the top, “Back to notes”/);
  assert.match(frHelp, /\['Échap', 'Fermer la fenêtre ; vider puis quitter la recherche ; quitter une note ouverte \(retour aux notes\)'\]/);
  assert.match(enHelp, /\['Esc', 'Close the window; clear, then leave the search; leave an open note \(back to notes\)'\]/);
});
