// Barre du haut fixe : sur chaque écran qui en a une, elle est HORS de la
// zone qui défile (.scroll, .body, .sheet), directement dans la colonne de
// l'écran ; seule cette zone défile. Avec le clavier ouvert sur iPhone, .app
// recouvre exactement la zone visible (js/app-height.js) : la barre reste en
// haut. Vérifié aussi dans Chromium (clavier simulé), voir
// docs/developpement.md ; le vrai clavier de l'iPhone reste à essayer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const SCREENS = ['lists', 'list', 'list-form', 'settings', 'account', 'admin', 'login'];

// Texte d'un appel h(…) qui commence à « start » (parenthèses équilibrées,
// chaînes et commentaires ignorés)
function callAt(source, start) {
  let depth = 0;
  let quote = null;
  for (let i = source.indexOf('(', start); i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') i = source.indexOf('\n', i); // commentaire
    else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

test('chaque écran : la barre du haut n\'est jamais dans une zone qui défile', () => {
  // Le contrôle sait reconnaître une barre mal placée
  assert.match(callAt("h('div', { class: 'body' }, // l'aide\n  topbar('Réglages'))", 0), /topbar/);
  let bars = 0;
  for (const name of SCREENS) {
    const source = read(`js/screens/${name}.js`);
    bars += (source.match(/class: 'topbar[ ']|topbar\('/g) ?? []).length;
    // Les zones qui défilent : leur contenu ne contient jamais de barre du haut
    for (const match of source.matchAll(/h\('div', \{ class: '(body|scroll)[ ']/g)) {
      assert.doesNotMatch(callAt(source, match.index), /topbar/, `${name}.js : barre du haut dans .${match[1]}`);
    }
  }
  assert.ok(bars >= 12, `barres trouvées : ${bars}`);
  // list.js : la zone des éléments est créée à part, la barre du haut est
  // la première enfant de l'écran, puis le bandeau « Lecture seule », la
  // barre d'état, la zone qui défile et la barre d'ajout (en bas)
  const list = read('js/screens/list.js');
  assert.match(list, /const content = h\('div', \{ class: 'scroll' \}\);/);
  assert.match(list, /return h\('div', \{ class: 'screen' \},\s*h\('header', \{ class: 'topbar' \},[\s\S]*?menuButton\),\s*readOnlyBanner,\s*h\('div', \{ class: 'statusbar' \}[^\n]*\n\s*content,\s*addbar\);/);
});

test('styles : seules les zones prévues défilent ; la page, .app et la barre du haut jamais', () => {
  const kit = read('css/listo.css');
  const app = read('css/app.css');
  // La barre du haut : ni collante ni fixe, elle n'a pas besoin d'astuce de position
  const topbar = kit.match(/^\.topbar \{[^}]*\}/m)[0];
  assert.doesNotMatch(topbar, /position|overflow/);
  assert.match(kit, /\.topbar__title \{[^}]*overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/, 'titre long tronqué');
  // Zones qui défilent : .scroll et .body (et les feuilles), rebond contenu
  assert.match(kit, /^\.scroll \{ flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; \}/m);
  assert.match(kit, /^\.body \{ flex: 1; min-height: 0; overflow: hidden auto;/m);
  // .app : posée sur l'écran, rien ne déborde
  assert.match(app, /^\.app \{\n  position: fixed;[\s\S]*?overflow: hidden;\n\}/m);
});
