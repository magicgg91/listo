// Ordinateur au clavier, lot 3 des bonnes pratiques du web moderne
// (décisions du 15 novembre 2026). Le comportement est vérifié dans
// Chromium (docs/developpement.md, point 55) ; ici, les règles dans le code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('menus : flèches en boucle, Début et Fin, Tab ferme, premier choix au clavier, aria-expanded', () => {
  const ui = read('public/js/ui.js');
  assert.match(ui, /const go = \{ ArrowDown: index \+ 1, ArrowUp: index < 0 \? choices\.length - 1 : index - 1, Home: 0, End: choices\.length - 1 \}\[event\.key\];/);
  assert.match(ui, /if \(event\.key === 'Tab'\) \{\n        closeMenu\(\);/);
  assert.match(ui, /const firstChoice = lastInputWasKeyboard \? panel\.querySelector\('\.menu__item'\) : null;/);
  assert.match(ui, /trigger\?\.setAttribute\('aria-expanded', 'true'\);/);
  assert.match(ui, /onClose: \(\) => \{ trigger\?\.setAttribute\('aria-expanded', 'false'\); onClose\?\.\(\); \}/);
  assert.match(read('public/js/screens/list.js'), /sortButton\.setAttribute\('aria-expanded', 'false'\);/);
});

test('choix à options : une règle pour tous les role="radiogroup" (flèches, Début, Fin)', () => {
  const ui = read('public/js/ui.js');
  assert.match(ui, /const group = radio\?\.closest\('\[role="radiogroup"\]'\);/);
  assert.match(ui, /const step = \{ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 \}\[event\.key\];/);
  assert.match(ui, /radioTarget\.focus\(\);\n  radioTarget\.click\(\);/);
});

test('Administration : une navigation (nav, aria-current), même aspect que l\'onglet choisi du kit', () => {
  const admin = read('public/js/screens/admin.js');
  assert.doesNotMatch(admin, /role: 'tab|tabpanel|aria-selected/);
  assert.match(read('public/css/app.css'), /\.tab\[aria-current="page"\] \{ border-bottom-color: var\(--color-accent\); color: var\(--color-text\); \}/);
  // Même règle que le kit pour l'onglet choisi
  assert.match(read('public/css/listo.css'), /\.tab\[aria-selected="true"\] \{ border-bottom-color: var\(--color-accent\); color: var\(--color-text\); \}/);
});

test('suggestions : un groupe de boutons, plus de faux listbox ni d\'options', () => {
  const list = read('public/js/screens/list.js');
  assert.doesNotMatch(list, /'listbox'|role: 'option'/);
  assert.doesNotMatch(read('design/components.html'), /role="listbox"|role="option"/);
});

test('contraste élevé de Windows : un contour système sur le champ qui a le curseur', () => {
  assert.match(read('public/css/app.css'), /@media \(forced-colors: active\) \{\n  \.input:focus, \.addbar__field:focus-within, \.searchfield:focus-within \{ outline: 2px solid Highlight; outline-offset: 1px; \}/);
});

test('ordinateur : « Aller au contenu » en premier arrêt de Tab, caché sans le focus', () => {
  const app = read('public/js/app.js');
  assert.match(app, /h\('div', \{ class: 'pc pc--a' \}, skipLink\(col\), pcSideFor/);
  const css = read('public/css/app.css');
  assert.match(css, /\.skip-link \{ position: absolute; left: -10000px;/);
  assert.match(css, /\.skip-link:focus \{ left: 12px; \}/);
});
