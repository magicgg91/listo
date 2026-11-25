// Ordinateur (décisions du 24 novembre 2026) : une seule largeur pour tous
// les écrans (colonne centrée de 1 040 px), et la pastille « À jour » sur la
// ligne du titre de chaque écran, comme dans une liste ouverte. Le
// téléphone ne change pas (captures avant/après identiques, voir le résumé).
// Vérifications sur le code.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const SCREENS = ['home', 'lists', 'deadlines', 'list', 'gifts', 'notes'];

// Appel h(...) complet qui commence à « start » (parenthèses équilibrées)
function callAt(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('appel non fermé');
}
// Tous les appels h('<balise>', { class: '<classe>' } ...) d'un fichier
function calls(source, tag, className) {
  const found = [];
  const marker = `h('${tag}', { class: '${className}' }`;
  for (let at = source.indexOf(marker); at !== -1; at = source.indexOf(marker, at + 1)) found.push(callAt(source, at));
  return found;
}

test('une seule largeur : --pc-col à 1 040 px, plus de variante large ni pleine largeur (sauf un projet ouvert)', () => {
  for (const file of ['public/css/listo.css', 'design/listo.css']) {
    const css = read(file);
    assert.deepEqual([...css.matchAll(/--pc-col:\s*([^;]+);/g)].map((m) => m[1]), ['1040px'], file);
    assert.match(css, /\.pc-col \{[^}]*max-width: var\(--pc-col\); margin-inline: auto; \}/, file);
    assert.doesNotMatch(css, /pc-col--(wide|full)/, file);
  }
  // Aucun écran ne demande une autre largeur, sauf UNE exception : un
  // projet ouvert prend toute la largeur (.pc-col--board ; validée par le
  // propriétaire le 25 novembre 2026, docs/cadrage-projets.md 3.4 : les
  // colonnes ont besoin de place). La liste des projets et les réglages
  // d'un projet gardent la colonne centrée.
  const app = read('public/js/app.js');
  assert.match(app, /function mount\(screen, \{ withSide = true, listId = null, board = null \} = \{\}\) \{/);
  assert.match(app, /const col = h\('div', \{ class: pc \? \(board \? 'pc-col pc-col--board' : 'pc-col'\) : 'shell__col' \}\);/);
  assert.doesNotMatch(app, /wide: true/);
  assert.deepEqual([...app.matchAll(/pc-col--\w+/g)].map((m) => m[0]), ['pc-col--board', 'pc-col--board'], 'le commentaire de mount et la colonne');
  assert.deepEqual([...app.matchAll(/board: params\.id/g)].length, 2, 'seulement un projet ouvert (et sa carte ouverte par-dessus)');
  for (const file of ['public/css/listo.css', 'design/listo.css']) {
    assert.deepEqual([...read(file).matchAll(/pc-col--\w+/g)].map((m) => m[0]), ['pc-col--board', 'pc-col--board'], file);
    assert.match(read(file), /\.app--pc \.pc-col--board \{ max-width: none; \}/, file);
  }
  for (const file of fs.readdirSync(new URL('../public/js/screens/', import.meta.url))) {
    assert.doesNotMatch(read(`public/js/screens/${file}`), /pc-col--/, file);
  }
});

test('notes : les cartes seules dans la colonne ; plus de zone de droite (24 novembre 2026)', () => {
  for (const file of ['public/css/listo.css', 'design/listo.css']) {
    const css = read(file);
    assert.match(css, /\.pc-notes__cards \{ display: flex; flex-direction: column;/, file);
    assert.doesNotMatch(css, /\.pc-notes(--closed|__list)?[ ,{]|\.pc-note \{|minmax\(0, 1fr\) (560|440)px/, file);
  }
});

test('« À jour » sur la ligne du titre de chaque écran (ordinateur), jamais dans la ligne d\'outils', () => {
  for (const name of SCREENS) {
    const source = read(`public/js/screens/${name}.js`);
    const heads = calls(source, 'header', 'pc-head');
    assert.equal(heads.length, 1, `${name} : un en-tête .pc-head`);
    // La pastille (ou la variable qui la tient, sur l'Accueil) est dans l'en-tête
    assert.match(heads[0], /syncPill\(\(\) => refreshData\(\{ full: true \}\)\)|\bpill\b/, name);
    for (const tools of calls(source, 'div', 'pc-tools')) assert.doesNotMatch(tools, /syncPill|\bpill\b/, name);
  }
  // Ordre : titre, pastille, autres boutons, recherche (comme la liste ouverte)
  assert.match(read('public/js/screens/lists.js'), /h\('div', \{ class: 'pc-head__main' \}, title, sub\),\s*syncPill\(\(\) => refreshData\(\{ full: true \}\)\), topBell\(onLeave\),\s*search\.field\),/);
  assert.match(read('public/js/screens/notes.js'), /h\('div', \{ class: 'pc-head__main' \}, h\('h1', \{ class: 'pc-head__title' \}, t\('notes\.titre'\)\), sub\),\s*syncPill\(\(\) => refreshData\(\{ full: true \}\)\), topBell\(onLeave\),\s*search\.field\),/);
  assert.match(read('public/js/screens/deadlines.js'), /syncPill\(\(\) => refreshData\(\{ full: true \}\)\), topBell\(onLeave\),\s*search\.field\),\s*h\('div', \{ class: 'pc-tools' \}, scope, searchMeta\),/);
  assert.match(read('public/js/screens/gifts.js'), /h\('div', \{ class: 'pc-head__tools' \}, syncPill\(\(\) => refreshData\(\{ full: true \}\)\), autoChip\(\)\)\),\s*h\('div', \{ class: 'pc-tools' \}, count\),/);
  assert.match(read('public/js/screens/list.js'), /h\('div', \{ class: 'pc-head__main' \}, title, sub\),\s*syncPill\(\(\) => refreshData\(\{ full: true \}\)\),\s*shareSlot,\s*search\.field,\s*menuButton\),/);
});

test('en-tête : un long titre passe sur deux lignes partout ; si la place manque, la fin passe à la ligne, à droite', () => {
  const css = read('public/css/listo.css');
  assert.match(css, /\.pc-head__title \{ display: -webkit-box; overflow: hidden; overflow-wrap: anywhere; -webkit-line-clamp: 2; -webkit-box-orient: vertical;/);
  assert.doesNotMatch(css, /pc-head--list/);
  assert.match(css, /\.pc-head \{ display: flex; flex-wrap: wrap;/);
  assert.match(css, /\.pc-head > :last-child:not\(:first-child\) \{ margin-left: auto; \}/);
  assert.match(css, /\.pc-head__main \{ flex: 1; min-width: 120px; \}/);
  assert.doesNotMatch(read('public/js/screens/list.js'), /pc-head--list/);
});

test('kit : design/listo.css = public/css/listo.css + la section 17 des planches', () => {
  const app = read('public/css/listo.css');
  const kit = read('design/listo.css');
  assert.ok(kit.startsWith(app.trimEnd()));
  assert.match(kit.slice(app.trimEnd().length), /^\s*\/\* -{10} 17\. Présentation des maquettes/);
});
