// Accueil « Mes listes » : une seule barre du haut (titre, pastille d'état,
// tri des listes, réglages) ; la pastille se réduit à l'icône quand la place
// manque, sans jamais cacher son texte aux lecteurs d'écran. (Rendu réel :
// vérifié dans un vrai navigateur, à 360, 390 et 430 px, texte à 130 %.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const lists = read('public/js/screens/lists.js');
const ui = read('public/js/ui.js');

test('barre de l\'accueil : titre, pastille, tri, réglages, sur une ligne ; plus de ligne d\'état dessous', () => {
  const screen = lists.slice(lists.indexOf('export function renderLists'), lists.indexOf('// --- Colonne de gauche'));
  const bar = screen.slice(screen.indexOf("h('header', { class: 'topbar topbar--plain topbar--status' }"));
  const order = ["h('h1', { class: 'topbar__title' }, 'Mes listes')", 'syncPill(() => refreshData({ full: true }), { inBar: true })', 'sorter.button', "iconButton('sliders', 'Réglages'"];
  const at = order.map((text) => bar.indexOf(text));
  for (const [i, text] of order.entries()) assert.ok(at[i] >= 0, text);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'ordre de la barre');
  assert.equal(screen.includes("class: 'statusbar'"), false, 'la ligne sous la barre a disparu');
});

test('pastille : rôle d\'état, texte toujours lu, réduite à l\'icône (et au nombre) seulement si la place manque', () => {
  // Rôle et annonce polie, comme avant ; même action (actualiser)
  assert.match(ui, /h\('button', \{ type: 'button', role: 'status', 'aria-live': 'polite', title: 'Actualiser', onClick: onRefresh \}\)/);
  // Texte dans .sync__text ; nombre en attente à part, caché aux lecteurs d'écran (déjà dans le texte)
  assert.match(ui, /h\('span', \{ class: 'sync__text' \}, info\.text\(\)\)/);
  assert.match(ui, /h\('span', \{ class: 'sync__count', 'aria-hidden': 'true' \}, String\(pendingCount\)\)/);
  // Réduite seulement si le texte dépasse la place laissée
  assert.match(ui, /if \(pill\.scrollWidth > slot\.clientWidth \+ 0\.5\) \{\s*pill\.classList\.add\('sync--compact'\);/);
  // Textes d'état inchangés
  for (const text of ["'À jour'", "'Synchronisation…'", '`Hors ligne · ${pendingCount} en attente`', "'Hors ligne'"]) assert.ok(ui.includes(text), text);
  // Réduite : texte masqué visuellement (pas display: none), donc toujours lu
  const css = read('public/css/listo.css');
  const rule = css.match(/\.sync--compact \.sync__text \{([^}]*)\}/)[1];
  assert.match(rule, /position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect\(0 0 0 0\)/);
  assert.equal(rule.includes('display: none'), false);
  assert.match(css, /\.topbar__status button\.sync::after \{ content: ""; position: absolute; inset: -8px -2px; \}/, 'zone tactile de 44 px');
  // Kit et application identiques
  const section = (text) => text.slice(text.indexOf('/* 16.10'), text.indexOf('.sync--compact .sync__count'));
  assert.equal(section(read('design/listo.css')), section(css));
});

test('écran d\'une liste : pastille laissée sous la barre (le titre y perdrait la moitié de sa place)', () => {
  const list = read('public/js/screens/list.js');
  // (à droite, « Tout replier / Tout déplier » quand la liste a des groupes)
  assert.match(list, /h\('div', \{ class: 'statusbar' \}, syncPill\(\(\) => refreshData\(\{ full: true \}\)\), foldAll\)/);
});
