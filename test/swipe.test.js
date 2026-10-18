// Glissement d'une ligne vers la gauche (raccourci « Supprimer ») :
// décision du geste (fonctions simples), contrôleur (une seule ligne ouverte,
// vertical ignoré, bord gauche réservé au geste « retour »), suppression par
// le chemin existant (file d'attente, « Annuler » = item.restore), aucune
// suppression sur la page publique. Les vrais gestes sont aussi rejoués dans
// Chromium (événements tactiles), voir docs/developpement.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SWIPE, swipeIntent, swipeOffset, swipeRelease, createSwipeController } from '../public/js/swipe.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('sens du geste : nettement horizontal seulement ; diagonales et vertical = défilement', () => {
  assert.equal(swipeIntent(0, 0), 'undecided');
  assert.equal(swipeIntent(-6, 3), 'undecided', 'trop court');
  assert.equal(swipeIntent(-30, 4), 'horizontal');
  assert.equal(swipeIntent(30, -4), 'horizontal', 'vers la droite : pour refermer');
  assert.equal(swipeIntent(-30, 25), 'vertical', 'diagonale : laissée au défilement');
  assert.equal(swipeIntent(-30, 20), 'vertical', 'exactement 1,5 fois : pas assez net');
  assert.equal(swipeIntent(-31, 20), 'horizontal');
  assert.equal(swipeIntent(2, 40), 'vertical');
});

test('position pendant le glissement : jamais vers la droite, jamais au-delà de la ligne', () => {
  assert.equal(swipeOffset(-50, false, 358), -50);
  assert.equal(swipeOffset(40, false, 358), 0, 'vers la droite, ligne fermée : ne bouge pas');
  assert.equal(swipeOffset(-500, false, 358), -358);
  assert.equal(swipeOffset(30, true, 358), -SWIPE.reveal + 30, 'ligne ouverte, tirée vers la droite');
  assert.equal(swipeOffset(200, true, 358), 0);
});

test('au relâchement : ouverte au-delà de 80 px (ou d\'un tiers d\'une ligne étroite), sinon refermée', () => {
  assert.equal(swipeRelease(-79, 358), 'closed');
  assert.equal(swipeRelease(-80, 358), 'open');
  assert.equal(swipeRelease(-150, 358), 'open');
  assert.equal(swipeRelease(-70, 210), 'open', 'ligne de 210 px : un tiers = 70 px');
  assert.equal(swipeRelease(0, 358), 'closed');
});

// --- Contrôleur, avec un faux DOM minimal ---
class FakeEl {
  constructor(parent = null, classes = []) {
    this.parent = parent;
    this.listeners = {};
    this.style = {};
    this.classes = new Set(classes);
    this.offsetWidth = 358;
    this.classList = {
      add: (c) => this.classes.add(c),
      remove: (c) => this.classes.delete(c),
      toggle: (c, on) => (on ? this.classes.add(c) : this.classes.delete(c)),
      contains: (c) => this.classes.has(c),
    };
  }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn); }
  contains(node) { for (let n = node; n; n = n.parent) if (n === this) return true; return false; }
  closest(selector) { for (let n = this; n; n = n.parent) if (selector === '.swipe__delete' && n.classes.has('swipe__delete')) return n; return null; }
  emit(type, event) { for (const fn of this.listeners[type] ?? []) fn(event); }
}

function setup(t) {
  const doc = new FakeEl();
  globalThis.document = doc;
  t.after(() => { delete globalThis.document; });
  const scroller = new FakeEl();
  const swipes = createSwipeController(scroller);
  const rows = [1, 2].map(() => {
    const li = new FakeEl(scroller, ['item', 'swipe']);
    const slide = new FakeEl(li, ['swipe__slide']);
    const button = new FakeEl(li, ['swipe__delete']);
    swipes.attach(li, slide, button);
    return { li, slide, button };
  });
  // Un geste : contact, déplacements, relâchement (le document d'abord, puis la ligne)
  const gesture = (row, points, target = row.slide) => {
    const [x0, y0] = points[0];
    const start = { target, touches: [{ clientX: x0, clientY: y0 }] };
    doc.emit('touchstart', start);
    row.li.emit('touchstart', start);
    for (const [x, y] of points.slice(1)) row.li.emit('touchmove', { target, touches: [{ clientX: x, clientY: y }] });
    const [xe, ye] = points.at(-1);
    row.li.emit('touchend', { type: 'touchend', target, changedTouches: [{ clientX: xe, clientY: ye }] });
  };
  const click = (target) => {
    let stopped = false;
    doc.emit('click', { target, preventDefault() {}, stopPropagation() { stopped = true; } });
    return !stopped;
  };
  return { doc, scroller, swipes, rows, gesture, click };
}

test('glissement vers la gauche : la ligne reste ouverte ; vers la droite : refermée', (t) => {
  const { rows: [a], gesture } = setup(t);
  gesture(a, [[300, 100], [285, 101], [200, 102], [150, 102]]);
  assert.ok(a.li.classes.has('is-open'));
  assert.equal(a.slide.style.transform, `translateX(-${SWIPE.reveal}px)`);
  assert.ok(!a.li.classes.has('is-swiping'));
  gesture(a, [[150, 100], [170, 100], [280, 100]]);
  assert.ok(!a.li.classes.has('is-open'));
  assert.equal(a.slide.style.transform, '');
});

test('court glissement : la ligne revient ; rien n\'est supprimé au simple glissement', (t) => {
  const { rows: [a], gesture } = setup(t);
  let deleted = false;
  a.button.addEventListener('click', () => { deleted = true; });
  gesture(a, [[300, 100], [280, 100], [250, 100]]);
  assert.ok(!a.li.classes.has('is-open'));
  gesture(a, [[300, 100], [280, 100], [100, 100]]);
  assert.ok(a.li.classes.has('is-open'));
  assert.equal(deleted, false, 'il faut appuyer sur la zone rouge');
});

test('glissement vertical ou diagonal : rien ; bord gauche de l\'écran : rien', (t) => {
  const { rows: [a], gesture } = setup(t);
  gesture(a, [[300, 100], [298, 130], [150, 140]]);
  assert.ok(!a.li.classes.has('is-open'));
  assert.equal(a.slide.style.transform ?? '', '', 'la ligne n\'a jamais bougé');
  gesture(a, [[300, 100], [270, 125], [150, 200]]);
  assert.ok(!a.li.classes.has('is-open'));
  gesture(a, [[10, 100], [5, 100], [2, 100]]);
  assert.ok(!a.li.classes.has('is-open'));
});

test('une seule ligne ouverte à la fois ; toucher ailleurs ou défiler la referme', (t) => {
  const { rows: [a, b], gesture, scroller, doc, click } = setup(t);
  gesture(a, [[300, 100], [280, 100], [120, 100]]);
  gesture(b, [[300, 200], [280, 200], [120, 200]]);
  assert.ok(!a.li.classes.has('is-open'));
  assert.ok(b.li.classes.has('is-open'));
  // Toucher la ligne ouverte (hors zone rouge) : refermée, et cet appui
  // n'ouvre pas la fiche
  doc.emit('touchstart', { target: b.slide, touches: [{ clientX: 100, clientY: 200 }] });
  assert.ok(!b.li.classes.has('is-open'));
  assert.equal(click(b.slide), false, 'appui ignoré');
  // Défilement
  gesture(a, [[300, 100], [280, 100], [120, 100]]);
  scroller.emit('scroll', {});
  assert.ok(!a.li.classes.has('is-open'));
});

test('la zone rouge d\'une ligne ouverte répond tout de suite ; fin de glissement sans fiche', (t) => {
  const { rows: [a], gesture, click } = setup(t);
  gesture(a, [[300, 100], [280, 100], [120, 100]]);
  assert.equal(click(a.slide), false, 'la fin du glissement n\'ouvre pas la fiche');
  gesture(a, [[300, 100], [280, 100], [120, 100]]);
  assert.equal(click(a.button), true, 'appui sur « Supprimer » juste après l\'ouverture : pris en compte');
});

test('écran : chaque ligne glisse, zone rouge = vrai bouton « Supprimer <nom> », suppression avec « Annuler »', () => {
  const list = read('public/js/screens/list.js');
  assert.match(list, /const swipes = createSwipeController\(content\);\s*onLeave\(\(\) => swipes\.stop\(\)\);/);
  assert.match(list, /const remove = h\('button', \{ class: 'swipe__delete', type: 'button', 'aria-label': `Supprimer \$\{item\.name\}`, onClick: \(\) => \{\s*swipes\.close\(\);\s*deleteWithUndo\(item\);/);
  assert.match(list, /icon\('trash'\), h\('span', \{\}, 'Supprimer'\)\);/);
  assert.match(list, /swipes\.attach\(row, slide, remove\);/);
  // Même chemin que la poubelle de la fiche : file d'attente, puis « Annuler »
  assert.match(list, /await actions\.deleteItem\(item\);\s*toast\(`« \$\{item\.name\} » supprimé`, \{ action: 'Annuler', onAction: \(\) => actions\.restoreItem\(item\.id\) \}\);/);
  const actionsJs = read('public/js/actions.js');
  assert.match(actionsJs, /export const deleteItem = \(item\) => perform\(\{ type: 'item\.delete', itemId: item\.id \}\);/);
  assert.match(actionsJs, /export const restoreItem = \(itemId\) => perform\(\{ type: 'item\.restore', itemId \}\);/);
  // Ouvrir une fiche referme la ligne ouverte
  assert.match(list, /function openItemSheet\(item\) \{\s*swipes\.close\(\);/);
  // Toucher seulement (jamais la souris), défilement vertical gardé, animation coupée si mouvement réduit
  const swipe = read('public/js/swipe.js');
  assert.doesNotMatch(swipe, /pointerdown|mousedown|mousemove/);
  const css = read('public/css/app.css');
  assert.match(css, /\.item\.swipe \{ position: relative; padding-right: 0; touch-action: pan-y; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.swipe__slide \{ transition: none; \} \}/);
  // Zone rouge visible seulement pendant le glissement ou ouverte ; icône ET texte
  assert.match(css, /\.item\.is-swiping \.swipe__delete, \.item\.is-open \.swipe__delete \{ visibility: visible; \}/);
  assert.match(css, /\.swipe__delete \{[^}]*min-height: var\(--tap-min\);[^}]*visibility: hidden; \}/);
  assert.doesNotMatch(swipe, /innerHTML/);
});

test('page publique (lecture seule) : aucun glissement, aucune suppression', () => {
  const pub = read('public/js/public.js');
  assert.doesNotMatch(pub, /swipe|item\.delete|deleteItem/);
});

test('service worker : le module est gardé pour l\'ouverture sans réseau', () => {
  assert.match(read('public/sw.js'), /'\/js\/swipe\.js',/);
});
