// Fiche « Modifier l'article » : « Enregistrer » et « Supprimer » dans
// l'en-tête, en icônes (poubelle, un espace, coche pleine, croix). La coche
// soumet le formulaire (Entrée dans un champ aussi) ; la poubelle supprime
// tout de suite, avec « Annuler » ensuite (même chemin que le glissement vers
// la gauche). Le rendu est aussi vérifié dans Chromium (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const list = read('public/js/screens/list.js');
const ui = read('public/js/ui.js');

test('plus de boutons « Enregistrer » / « Supprimer » en bas de la fiche', () => {
  assert.doesNotMatch(list, /h\('button', \{ class: 'btn btn--primary btn--block', type: 'submit' \}, 'Enregistrer'\)/);
  assert.doesNotMatch(list, /btn--danger-outline btn--block', type: 'button' \}, icon\('trash', 'icon--sm'\), 'Supprimer'\)/);
  assert.doesNotMatch(list, /h\('div', \{ class: 'sheet__actions' \}, save, remove\)/);
});

test('en-tête : poubelle, disquette « Enregistrer », croix dans cet ordre, avec leurs aria-label ; poubelle jamais collée à la croix', () => {
  assert.match(list, /const remove = iconButton\('trash', `Supprimer l'\$\{words\.one\}`, null, 'icon-btn--danger sheet__delete'\);/);
  assert.match(list, /const save = h\('button', \{ class: 'icon-btn icon-btn--primary', type: 'submit', form: formId, 'aria-label': 'Enregistrer' \}, icon\('disquette'\)\);/);
  // Disquette : dans le sprite (kit, application, components.html), même
  // style que les autres icônes, et en fichier séparé dans design/icones/
  const symbol = (file) => read(file).match(/<symbol id="i-disquette"[^\n]*<\/symbol>/)?.[0];
  assert.ok(symbol('design/icons-sprite.html'));
  assert.doesNotMatch(symbol('design/icons-sprite.html'), /stroke="#|fill="#|style=|stroke-width/);
  assert.equal(symbol('public/index.html'), symbol('design/icons-sprite.html'));
  assert.equal(symbol('design/components.html'), symbol('design/icons-sprite.html'));
  assert.match(read('design/icones/i-disquette.svg'), /stroke="currentColor" stroke-width="2"/);
  // Plus aucune coche sur le bouton « Enregistrer » d'une fiche
  assert.doesNotMatch(list, /'aria-label': 'Enregistrer' \}, icon\('check'\)/);
  assert.match(list, /tools: \[remove, save\],/);
  // La croix (« Fermer ») vient toujours après les boutons de la fiche
  assert.match(ui, /tools \? h\('div', \{ class: 'sheet__tools' \}, tools, iconButton\('close', 'Fermer', close\)\)/);
  // Un espace visible entre la poubelle et la disquette ; couleurs du kit
  const css = read('public/css/app.css');
  assert.match(css, /\.sheet__delete \{ margin-right: var\(--space-2\); \}/);
  assert.match(css, /\.icon-btn--danger \{ color: var\(--color-danger-ink\); \}/);
  assert.match(css, /\.icon-btn--primary \{ background: var\(--color-accent\); color: var\(--color-on-accent\); \}/);
  // Titre sur une ligne, tronqué proprement ; en-tête visible quand la feuille défile
  assert.match(css, /\.sheet__head--tools \.sheet__title \{ overflow: hidden; white-space: nowrap; text-overflow: ellipsis; \}/);
  assert.match(css, /\.sheet__head--tools \{ position: sticky;/);
  // Zones tactiles du kit : 44 px
  assert.match(read('public/css/listo.css'), /\.icon-btn \{[^}]*width: var\(--tap-min\); height: var\(--tap-min\);/);
});

test('la coche enregistre (formulaire relié), Entrée aussi ; la poubelle supprime avec « Annuler »', () => {
  assert.match(list, /const formId = `fiche-\$\{item\.id\}`;/);
  assert.match(list, /const form = h\('form', \{ class: 'stack', id: formId, novalidate: true \},/);
  assert.match(list, /form\.addEventListener\('submit', async \(event\) => \{/);
  // Poubelle : la fiche se ferme, puis la même suppression que le glissement
  assert.match(list, /remove\.addEventListener\('click', async \(\) => \{\s*mine = true;\s*sheet\.close\(\);\s*await deleteWithUndo\(item\);\s*\}\);/);
  assert.match(list, /async function deleteWithUndo\(item\) \{\s*if \(!editable\(\)\) return;\s*await actions\.deleteItem\(item\);\s*toast\(`« \$\{item\.name\} » supprimé`, \{ action: 'Annuler', onAction: \(\) => actions\.restoreItem\(item\.id\) \}\);\s*\}/);
  // Enregistrement impossible pendant qu'un autre téléphone supprime l'article
  assert.match(list, /save\.disabled = gone;\s*remove\.disabled = gone;/);
});
