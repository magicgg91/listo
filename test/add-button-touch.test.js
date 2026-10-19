// Bouton « + » du champ d'ajout : un seul appui suffit, clavier ouvert.
// Avant : le champ perdait le curseur dès l'appui, la page bougeait
// (app-height.js) et le click tombait à côté : il fallait toucher « + » deux
// fois. Logique dans public/js/tap.js (option persistent, testée ici avec de
// faux événements) ; l'écran (public/js/screens/list.js) s'en sert. Rejoué
// aussi dans Chromium avec de vrais événements tactiles et un clavier simulé
// (docs/developpement.md) ; les vrais téléphones restent à essayer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTapPicker, keepFieldFocus } from '../public/js/tap.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

// Faux événement : retient preventDefault et stopPropagation ; position du
// doigt (clientX, clientY) et bouton touché (currentTarget) facultatifs
const RECT = { left: 330, right: 378, top: 760, bottom: 812 };
const event = ({ x = 354, y = 786 } = {}) => ({
  prevented: false,
  stopped: false,
  clientX: x,
  clientY: y,
  currentTarget: { getBoundingClientRect: () => RECT },
  preventDefault() { this.prevented = true; },
  stopPropagation() { this.stopped = true; },
});

function setup() {
  const clock = { now: 1000 };
  const taps = createTapPicker({ now: () => clock.now });
  const added = [];
  const plus = taps.button(() => added.push(clock.now), { persistent: true });
  // Un click comme le navigateur l'envoie : d'abord l'écouteur du document
  // (phase de capture, click fantôme), puis le bouton s'il n'a pas été arrêté
  const click = () => {
    const e = event();
    taps.ghostClick(e);
    if (!e.stopped) plus.click(e);
    return e;
  };
  return { clock, taps, added, plus, click };
}

test('appui sur « + » : le champ garde le curseur (pointerdown et mousedown annulés)', () => {
  const { plus, added } = setup();
  const down = event();
  const mouse = event();
  plus.pointerdown(down);
  plus.mousedown(mouse);
  assert.equal(down.prevented, true);
  assert.equal(mouse.prevented, true);
  assert.deepEqual(added, [], 'rien n\'est ajouté au moment où le doigt se pose');
});

test('appui complet (pointerdown, pointerup, puis le click qui suit) : UN SEUL ajout, au relâchement', () => {
  const { plus, added, click, clock } = setup();
  plus.pointerdown(event());
  plus.pointerup(event());
  assert.equal(added.length, 1, 'ajouté au relâchement');
  clock.now += 80;
  const ghost = click();
  assert.equal(added.length, 1, 'le click qui suit n\'ajoute pas une deuxième fois');
  assert.equal(ghost.prevented, true, 'le formulaire n\'est pas envoyé non plus');
  // Même si le click arrive au bouton sans passer par le document
  plus.pointerdown(event());
  plus.pointerup(event());
  const direct = event();
  plus.click(direct);
  assert.equal(added.length, 2);
  assert.equal(direct.prevented, true);
});

test('le bouton sert à chaque appui (contrairement à une suggestion)', () => {
  const { plus, added, clock } = setup();
  for (let i = 0; i < 3; i++) {
    plus.pointerdown(event());
    plus.pointerup(event());
    clock.now += 700;
  }
  assert.equal(added.length, 3);
});

test('click seul (clavier, lecteur d\'écran, touche Entrée) : un ajout par click, formulaire non envoyé', () => {
  const { added, click, clock } = setup();
  const first = click();
  assert.equal(added.length, 1);
  assert.equal(first.prevented, true, 'l\'envoi du formulaire est annulé : pas de deuxième ajout par « submit »');
  clock.now += 10;
  click();
  assert.equal(added.length, 2, 'deux Entrée de suite : deux ajouts');
});

test('doigt posé sur « + » puis glissé hors du bouton : rien n\'est ajouté, ni au relâchement ni par le click', () => {
  const { plus, added, click, clock, taps } = setup();
  plus.pointerdown(event());
  assert.equal(taps.pressing, true);
  plus.pointerup(event({ x: 200, y: 786 }));
  assert.deepEqual(added, []);
  clock.now += 80;
  click();
  assert.deepEqual(added, [], 'le click qui suit ce relâchement est ignoré');
  assert.equal(taps.release(), true, 'le relâchement (document) remet l\'état à zéro');
  // Plus tard, un vrai click marche
  clock.now += 700;
  click();
  assert.equal(added.length, 1);
});

test('toucher annulé (pointercancel) : rien n\'est ajouté', () => {
  const { plus, added } = setup();
  plus.pointerdown(event());
  plus.pointercancel(event());
  plus.pointerup(event());
  assert.deepEqual(added, []);
});

test('suggestions inchangées : une suggestion ne sert qu\'une fois', () => {
  const taps = createTapPicker({ now: () => 0 });
  const picks = [];
  const option = taps.button(() => picks.push('Lait'));
  option.pointerdown(event());
  option.pointerup();
  option.click(event());
  option.click(event());
  assert.deepEqual(picks, ['Lait']);
});

test('écran : « + » branché sur tap.js, Entrée sans doublon, champ vide sans ajout', () => {
  const list = code('public/js/screens/list.js');
  assert.match(list, /const plus = taps\.button\(\(\) => addTyped\(input\.value\), \{ persistent: true \}\);/);
  for (const name of ['Pointerdown', 'Mousedown', 'Pointerup', 'Pointercancel', 'Click']) {
    assert.match(list, new RegExp(`on${name}: plus\\.${name.toLowerCase()},`), name);
  }
  // Le bouton reste le bouton d'envoi du formulaire (Entrée le « clique ») ;
  // l'envoi lui-même n'est qu'un secours qui passe par la même fonction
  assert.match(list, /type: 'submit',\s*'aria-label': 'Ajouter',/);
  assert.match(list, /addForm\.addEventListener\('submit', \(event\) => \{\s*event\.preventDefault\(\);\s*addTyped\(input\.value\);/);
  // Champ vide ou espaces seulement : rien n'est ajouté
  assert.match(list, /const name = text\.replace\(\/\\s\+\/g, ' '\)\.trim\(\);\s*if \(!name \|\| !view\) return;/);
  // Une seule fabrique d'appuis pour les suggestions et « + »
  assert.equal((list.match(/createTapPicker\(\)/g) ?? []).length, 1);
});

test('« Scanner » : l\'appui garde le curseur du champ, le click ouvre le sélecteur', () => {
  const down = event();
  const mouse = event();
  keepFieldFocus.pointerdown(down);
  keepFieldFocus.mousedown(mouse);
  assert.deepEqual([down.prevented, mouse.prevented], [true, true]);
  const scan = code('public/js/screens/scan.js');
  assert.match(scan, /onPointerdown: keepFieldFocus\.pointerdown,\s*onMousedown: keepFieldFocus\.mousedown,/);
  // Le click arrivé, le champ perd le curseur (clavier replié), puis le sélecteur s'ouvre
  assert.match(scan, /button\.addEventListener\('click', releaseFocus, true\);/);
});
