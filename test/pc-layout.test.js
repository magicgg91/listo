// Interface ordinateur, étape 1 (design/maquettes/pc-A, disposition A) :
// bascule à 1 024 px, menu de gauche, « Mes listes » et listes. Le
// téléphone ne doit pas changer : les styles ajoutés ne touchent que de
// nouveaux éléments ou ce qui est sous .app--pc. Vérifications sur le code
// (le rendu est vérifié dans Chromium, voir le résumé de l'étape).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// Section 16.14 du kit (jusqu'à la fin de la copie de l'application)
const kit = read('public/css/listo.css');
const section = kit.slice(kit.indexOf('/* 16.14 Interface ordinateur'));
const before = kit.slice(0, kit.indexOf('/* 16.14 Interface ordinateur')) + read('public/css/app.css');

test('kit : section 16.14 identique dans design/ et public/, sans couleur en dur ni partie des maquettes', () => {
  assert.ok(section.length > 1000, 'section 16.14 présente');
  assert.ok(read('design/listo.css').includes(section.trim()), 'même section dans design/listo.css');
  assert.doesNotMatch(section, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'couleurs du kit seulement');
  // Rien des planches de maquettes
  assert.doesNotMatch(section, /\.(is-hover|is-focus|is-selected|pc-yes|pc-no|pc--wide|pc--narrow|desk|shot|stage|schema|cmp|rz)\b/);
  // Aide : noms propres au PC (l'écran d'aide du téléphone garde .help)
  assert.doesNotMatch(section.replace(/\/\*[\s\S]*?\*\//g, ''), /(^|[\s,}])\.(help|toc|prose)\b/m);
  assert.match(section, /\.pc-help \{/);
  assert.match(section, /\.pc-toc \{/);
  assert.match(section, /\.pc-prose \{/);
});

test('kit : le téléphone n\'est pas touché (classes existantes seulement sous .app--pc)', () => {
  // Classes déjà définies avant la section 16.14
  const existing = new Set([...before.matchAll(/\.([a-z][a-z0-9_-]*)/gi)].map((m) => m[1]));
  // Règles de la section (hors commentaires), sélecteur par sélecteur
  const rules = section.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  for (const match of rules.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const head = match[1].trim();
    if (head.startsWith('@media')) continue;
    selectors.push(...head.replace(/^@media[^{]*\{/, '').split(','));
  }
  assert.ok(selectors.length > 80);
  for (const raw of selectors) {
    const selector = raw.trim();
    if (selector.startsWith('.app--pc')) continue;
    // L'élément stylé, ou un de ses parents dans le sélecteur, porte une
    // classe nouvelle (pc-…, keycap, item__actions…) : rien d'existant sur
    // le téléphone n'est concerné
    const classes = [...selector.matchAll(/\.([a-z][a-z0-9_-]*)/gi)].map((m) => m[1]);
    assert.ok(classes.some((c) => !existing.has(c)), `« ${selector} » ne doit toucher qu'un élément nouveau, ou commencer par .app--pc`);
  }
});

test('bascule : app--pc à partir de 1 024 px, même écran redessiné, menu gardé d\'un écran à l\'autre', () => {
  const app = read('public/js/app.js');
  assert.match(app, /const desktop = window\.matchMedia\('\(min-width: 1024px\)'\);/);
  assert.match(app, /const markLayout = \(\) => root\.classList\.toggle\('app--pc', isDesktop\(\)\);/);
  assert.match(app, /desktop\.addEventListener\('change', \(\) => \{\s*markLayout\(\);\s*show\(app\.route\);\s*\}\);/);
  assert.match(app, /replace\(root, h\('div', \{ class: 'pc pc--a' \}, pcSideFor\(app\.route\), h\('main', \{ class: 'pc-main' \}, col\)\)\);/);
  // Menu refait si le compte change (autre compte, nom, rôle), retiré hors connexion
  assert.match(app, /const owner = JSON\.stringify\(\[app\.user\?\.id, app\.user\?\.displayName, app\.user\?\.role\]\);/);
  assert.match(app, /dropPcSide\(\);\s*replace\(root, h\('div', \{ class: 'shell' \}/);
  // Plus de saut automatique vers la liste la plus récente sur ordinateur
  assert.doesNotMatch(read('public/js/screens/lists.js'), /recent\[0\]/);
  // Nouveau fichier gardé pour l'ouverture sans réseau
  assert.match(read('public/sw.js'), /'\/js\/screens\/pc-side\.js',/);
});

test('menu de gauche : liens réels, liste ouverte repérée, Admin seulement comme rôle de compte, aucun focus forcé', () => {
  const side = read('public/js/screens/pc-side.js');
  assert.match(side, /href: pathFor\('list', \{ id: list\.id \}\),\s*'aria-current': current \? 'page' : null,/);
  assert.match(side, /user\.role === 'admin' \? h\('span', \{ class: 'pc-user__role' \}, 'Admin'\) : null/);
  assert.match(side, /'aria-label': 'Rechercher une liste'/);
  // Compteur lu « 3 articles restants sur 8 », pas seulement « 3/8 »
  assert.match(side, /h\('span', \{ class: 'pc-nav__count', role: 'img', 'aria-label': text, title: text \}/);
  assert.doesNotMatch(side, /\.focus\(|innerHTML|\.style\b|style:/);
});

test('liste : actions de ligne seulement si modifiable ; « Réserver » seulement avec les réservations (jamais au bénéficiaire)', () => {
  const list = read('public/js/screens/list.js');
  // Ligne en lecture seule : ni crayon ni corbeille (seulement « Réserver » possible)
  assert.match(list, /\.\.\.itemContent\(item, meta, false\), pc \? reserveButton\(item\) : null\), item, meta\);/);
  assert.match(list, /const slide = h\('div', \{ class: 'swipe__slide' \}, \.\.\.itemContent\(item, meta\), pc \? rowActions\(item\) : null\);/);
  // Le serveur n'envoie jamais les réservations au bénéficiaire : sans elles, aucun bouton
  assert.match(list, /if \(!view\?\.reservations \|\| item\.checked \|\| view\.reservations\.get\(item\.id\)\?\.participants\.length\) return null;/);
  // Corbeille au survol : même suppression annulable que le glissement
  assert.match(list, /'aria-label': `Supprimer \$\{item\.name\}`, onClick: \(\) => deleteWithUndo\(item\) \}/);
  // « Partager » : propriétaire seulement (le serveur refuse aussi)
  assert.match(list, /replace\(shareSlot, list\.isOwner\s*\? h\('button'/);
  // Bandeau du bénéficiaire : il ne voit jamais les réservations
  assert.match(list, /list\.isBeneficiary\s*\? \[icon\('eye-off', 'icon--sm'\), h\('span', \{\}, 'Vous ne voyez jamais les réservations : la surprise reste entière\.'\)\]/);
  assert.doesNotMatch(list, /innerHTML/);
});

test('recherche ordinateur : champ toujours visible, Échap vide puis quitte, jamais de curseur mis tout seul', () => {
  const row = read('public/js/search-row.js');
  assert.match(row, /if \(docked && event\.key === 'Escape'\) \{\s*event\.preventDefault\(\);\s*if \(input\.value !== ''\) clear\(\);\s*else releaseFocus\(\);/);
  assert.match(row, /const row = h\('div', \{ class: 'searchrow', hidden: true \}, docked \? null : field\);/);
  assert.doesNotMatch(row, /\.focus\(/);
  assert.match(read('public/js/screens/list.js'), /docked: pc,/);
  assert.match(read('public/js/screens/lists.js'), /createSearchRow\(content, \{ label: 'Rechercher une liste', onChange: \(\) => draw\(\), docked: true \}\);/);
});

test('icônes de l\'interface ordinateur : dans les deux sprites, sans doublon', () => {
  const app = read('public/index.html');
  const kitSprite = read('design/icons-sprite.html');
  for (const name of ['help', 'users', 'user', 'flag', 'ext-link', 'plug', 'keyboard', 'bookmark', 'tag', 'menu-lines', 'undo', 'calendar', 'book']) {
    const symbol = new RegExp(`<symbol id="i-${name}" [^\\n]*?</symbol>`);
    const inApp = app.match(symbol)?.[0];
    assert.ok(inApp, `i-${name} dans public/index.html`);
    assert.equal(kitSprite.match(symbol)?.[0], inApp, `i-${name} identique dans design/icons-sprite.html`);
    assert.equal(app.split(`id="i-${name}"`).length, 2, `i-${name} une seule fois`);
  }
});
