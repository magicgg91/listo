// Liste de suggestions du champ d'ajout : un appui choisit la suggestion,
// une seule fois, même si la page bouge sous le doigt (iPhone, clavier
// ouvert). Logique dans public/js/tap.js (testée ici avec de faux
// événements) ; l'écran (public/js/screens/list.js) s'en sert. Rejoué aussi
// dans Chromium avec de vrais événements tactiles (docs/developpement.md) ;
// le vrai iPhone reste à essayer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTapPicker } from '../public/js/tap.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// Faux événement : retient preventDefault et stopPropagation
const event = () => ({ prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } });

function setup() {
  const clock = { now: 1000 };
  const taps = createTapPicker({ now: () => clock.now });
  const picks = [];
  const button = (name) => taps.button(() => picks.push(name));
  return { clock, taps, picks, button };
}

test('toucher : choisie au relâchement, UN SEUL ajout même si le click suit', () => {
  const { taps, picks, button } = setup();
  const lait = button('Lait');
  const down = event();
  lait.pointerdown(down);
  assert.equal(down.prevented, true, 'le champ garde le curseur (clavier ouvert)');
  assert.equal(taps.pressing, true);
  lait.pointerup();
  assert.deepEqual(picks, ['Lait']);
  assert.equal(taps.pressing, false);
  lait.click();
  lait.pointerup();
  assert.deepEqual(picks, ['Lait'], 'jamais deux fois');
});

test('le click qui suit un choix au relâchement est ignoré (une demi-seconde), pas les suivants', () => {
  const { clock, taps, button } = setup();
  const lait = button('Lait');
  lait.pointerdown(event());
  lait.pointerup();
  // La liste s'est fermée : le click tomberait sur la ligne dessous, ou sur le fond de la feuille « Dans quel rayon ? »
  const ghost = event();
  clock.now += 120;
  taps.ghostClick(ghost);
  assert.deepEqual([ghost.prevented, ghost.stopped], [true, true]);
  // Un vrai appui ensuite : laissé passer
  const next = event();
  clock.now += 50;
  taps.ghostClick(next);
  assert.deepEqual([next.prevented, next.stopped], [false, false]);
  // Pas de click du tout : au-delà d'une demi-seconde, rien n'est ignoré
  lait.pointerdown(event());
  const other = button('Pain');
  other.pointerdown(event());
  other.pointerup();
  clock.now += 600;
  const late = event();
  taps.ghostClick(late);
  assert.equal(late.prevented, false);
});

test('souris, clavier, lecteur d\'écran : le click seul choisit (secours), sans click ignoré ensuite', () => {
  const { taps, picks, button } = setup();
  const lait = button('Lait');
  lait.click();
  assert.deepEqual(picks, ['Lait']);
  const after = event();
  taps.ghostClick(after);
  assert.equal(after.prevented, false);
});

test('doigt posé ailleurs, ou toucher annulé (défilement) : rien n\'est choisi au relâchement', () => {
  const { taps, picks, button } = setup();
  const lait = button('Lait');
  const pain = button('Pain');
  lait.pointerup(); // relâché sur Lait sans s'y être posé
  assert.deepEqual(picks, []);
  pain.pointerdown(event());
  pain.pointercancel();
  pain.pointerup();
  assert.deepEqual(picks, []);
  assert.equal(taps.release(), true, 'fin du toucher sans choix');
  assert.equal(taps.release(), false);
});

test('écran : liste ni redessinée ni fermée pendant un toucher ; choix au relâchement branché sur chaque suggestion', () => {
  const list = read('public/js/screens/list.js');
  assert.match(list, /function drawSuggestions\(\) \{\s*if \(taps\.pressing\) \{ \/\/ jamais sous le doigt : après le relâchement\s*redrawLater = true;\s*return;\s*\}/);
  assert.match(list, /if \(document\.activeElement !== input && !taps\.pressing\) suggestBox\.hidden = true;/);
  assert.match(list, /onPointerdown: on\.pointerdown,\s*onMousedown: on\.mousedown,\s*onPointerup: on\.pointerup,\s*onPointercancel: on\.pointercancel,\s*onClick: on\.click,/);
  // Relâchement n'importe où : phase de remontée (après le bouton) ; click ignoré : phase de capture
  assert.match(list, /document\.addEventListener\(type, releaseSuggestions\); \/\/ après le bouton lui-même/);
  assert.match(list, /document\.addEventListener\('click', ghostClick, true\);/);
  // La fin d'ajout reste la même (champ vidé, clavier replié, article montré)
  assert.match(list, /suggestBox\.hidden = true;\s*releaseFocus\(\);\s*revealItem\(item\.id\);/);
  assert.match(read('public/sw.js'), /'\/js\/tap\.js',/);
  const code = read('public/js/tap.js').split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
  assert.doesNotMatch(code, /document|window|focus\(/, 'aucune dépendance à la page');
});
