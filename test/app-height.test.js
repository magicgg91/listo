// Hauteur de l'application mesurée par public/js/app-height.js (variable CSS
// --app-h sur <html>), remesurée au retour dans l'application : sur Android,
// application installée, le bas de la page passait sous la barre de
// navigation après avoir réduit puis rouvert Listo. Le rendu sur un vrai
// téléphone reste à confirmer à la main.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const script = read('js/app-height.js');

// Faux navigateur : fenêtre, visualViewport, page, minuteurs et images
// (requestAnimationFrame) déclenchés à la main
function browser({ height = 800, width = 390, visualViewport = true } = {}) {
  const listeners = new Map();
  const on = (target) => (type, fn) => listeners.set(`${target}:${type}`, [...(listeners.get(`${target}:${type}`) ?? []), fn]);
  const writes = [];
  const timers = [];
  const frames = [];
  const vv = visualViewport ? { height, scale: 1, offsetTop: 0, addEventListener: on('vv') } : undefined;
  const scrolls = [];
  const win = {
    innerHeight: height,
    innerWidth: width,
    scrollY: 0,
    scrollTo(x, y) {
      scrolls.push([x, y]);
      win.scrollY = y;
    },
    visualViewport: vv,
    addEventListener: on('window'),
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
    requestAnimationFrame: (fn) => frames.push(fn),
  };
  const doc = {
    visibilityState: 'visible',
    activeElement: null,
    documentElement: { style: { setProperty: (name, value) => writes.push([name, value]) } },
    addEventListener: on('document'),
  };
  // Horloge du script (Date.now), avancée à la main
  const clock = { now: 1_000_000 };
  vm.runInNewContext(script, { window: win, document: doc, Date: { now: () => clock.now } });
  return {
    clock,
    win,
    doc,
    vv,
    writes,
    scrolls,
    // Hauteur visible annoncée par le navigateur
    setHeight(h) {
      win.innerHeight = h;
      if (vv) vv.height = h;
    },
    fire(target, type) {
      for (const fn of listeners.get(`${target}:${type}`) ?? []) fn();
    },
    listens: (target, type) => listeners.has(`${target}:${type}`),
    // Déclenche les relectures en attente (images, puis minuteurs dans l'ordre)
    runLater({ upTo = Infinity } = {}) {
      frames.splice(0).forEach((fn) => fn());
      const due = timers.filter((t) => t.ms <= upTo).sort((a, b) => a.ms - b.ms);
      for (const t of due) {
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
    },
    pendingDelays: () => timers.map((t) => t.ms).sort((a, b) => a - b),
  };
}

test('mesure au chargement : --app-h = hauteur visible (visualViewport), en px', () => {
  const b = browser({ height: 803.4321 });
  assert.deepEqual(b.writes, [['--app-h', '803.43px']]);
  // Relectures décalées prévues dès le chargement
  assert.deepEqual(b.pendingDelays(), [100, 300, 1000]);
});

test('valeur identique : jamais réécrite', () => {
  const b = browser({ height: 800 });
  b.runLater();
  b.fire('window', 'resize');
  b.fire('vv', 'resize');
  b.fire('window', 'focus');
  b.runLater();
  assert.deepEqual(b.writes, [['--app-h', '800px']]);
});

test('retour dans l\'application : remesure, puis relectures décalées (hauteur annoncée en retard)', () => {
  const b = browser({ height: 800 });
  b.runLater();
  // Réduite : en arrière-plan, rien n'est mesuré
  b.doc.visibilityState = 'hidden';
  b.setHeight(0);
  b.fire('document', 'visibilitychange');
  b.fire('window', 'resize');
  assert.equal(b.writes.length, 1);
  // Rouverte : le navigateur annonce d'abord une hauteur périmée…
  b.doc.visibilityState = 'visible';
  b.setHeight(860);
  b.fire('document', 'visibilitychange');
  assert.deepEqual(b.writes.at(-1), ['--app-h', '860px']);
  assert.deepEqual(b.pendingDelays(), [100, 300, 1000]);
  // … puis la bonne, un peu plus tard : la relecture à ~300 ms la prend
  b.runLater({ upTo: 100 });
  b.setHeight(812);
  b.runLater();
  assert.deepEqual(b.writes.at(-1), ['--app-h', '812px']);
  assert.deepEqual(b.writes.map(([, v]) => v), ['800px', '860px', '812px']);
});

test('événements écoutés : resize, visualViewport, visibilitychange, pageshow, focus, orientationchange', () => {
  const b = browser();
  for (const [target, type] of [['window', 'resize'], ['vv', 'resize'], ['vv', 'scroll'], ['document', 'visibilitychange'], ['window', 'pageshow'], ['window', 'focus'], ['window', 'orientationchange'], ['document', 'focusin'], ['document', 'focusout'], ['document', 'pointerdown'], ['document', 'pointerup'], ['document', 'pointercancel']]) {
    assert.ok(b.listens(target, type), `${target} ${type}`);
  }
  for (const type of ['pageshow', 'focus', 'orientationchange']) {
    b.runLater();
    b.setHeight(700 + type.length);
    b.fire('window', type);
    assert.deepEqual(b.writes.at(-1), ['--app-h', `${700 + type.length}px`], type);
    assert.deepEqual(b.pendingDelays(), [100, 300, 1000], `${type} : relectures`);
  }
});

test('sans visualViewport : repli sur window.innerHeight', () => {
  const b = browser({ height: 640, visualViewport: false });
  assert.deepEqual(b.writes, [['--app-h', '640px']]);
  b.win.innerHeight = 600;
  b.fire('window', 'resize');
  assert.deepEqual(b.writes.at(-1), ['--app-h', '600px']);
});

test('zoom à deux doigts : la hauteur de l\'écran ne rétrécit pas', () => {
  const b = browser({ height: 800 });
  b.vv.height = 400;
  b.vv.scale = 2;
  b.fire('vv', 'resize');
  assert.deepEqual(b.writes, [['--app-h', '800px']]);
});

test('clavier ouvert (curseur dans un champ) : hauteur inchangée, relue en quittant le champ', () => {
  const b = browser({ height: 800 });
  const input = { matches: (selector) => selector === 'input', type: 'text', isContentEditable: false };
  b.doc.activeElement = input;
  // Chrome, Brave… : le clavier recouvre la page (seule la zone visible rétrécit)
  b.vv.height = 480;
  b.fire('vv', 'resize');
  b.fire('window', 'resize');
  assert.deepEqual(b.writes, [['--app-h', '800px']], 'comme avant : la page garde sa hauteur');
  // Navigateur où le clavier rétrécit la page elle-même : elle suit, comme 100dvh
  b.win.innerHeight = 500;
  b.fire('window', 'resize');
  assert.deepEqual(b.writes.at(-1), ['--app-h', '500px']);
  b.win.innerHeight = 800;
  // Rotation pendant la saisie : la largeur change, on remesure
  b.win.innerWidth = 844;
  b.setHeight(360);
  b.fire('window', 'resize');
  assert.deepEqual(b.writes.at(-1), ['--app-h', '360px']);
  // Champ quitté, clavier fermé
  b.doc.activeElement = null;
  b.setHeight(390);
  b.fire('document', 'focusout');
  assert.deepEqual(b.writes.at(-1), ['--app-h', '390px']);
  // Une case à cocher n'est pas un champ de saisie
  b.doc.activeElement = { matches: (selector) => selector === 'input', type: 'checkbox', isContentEditable: false };
  b.setHeight(380);
  b.fire('window', 'resize');
  assert.deepEqual(b.writes.at(-1), ['--app-h', '380px']);
});

// Un champ de saisie qui a le curseur (le clavier est ouvert)
const textInput = () => ({ matches: (selector) => selector === 'input', type: 'text', isContentEditable: false });

test('iPhone : zone visible décalée avec un champ actif → l\'application recouvre exactement la zone visible', () => {
  const b = browser({ height: 800 });
  b.runLater();
  // Le curseur entre dans le champ « Ajouter un élément » : relectures prévues
  b.doc.activeElement = textInput();
  b.fire('document', 'focusin');
  assert.deepEqual(b.pendingDelays(), [100, 300, 1000]);
  assert.deepEqual(b.writes, [['--app-h', '800px']], 'rien ne bouge encore');
  // Le clavier s'anime : la zone visible rétrécit et remonte
  b.vv.height = 600;
  b.vv.offsetTop = 120.456;
  b.fire('vv', 'resize');
  assert.deepEqual(b.writes.slice(1), [['--app-top', '120.46px'], ['--app-h', '600px']]);
  b.vv.height = 420;
  b.vv.offsetTop = 310;
  b.fire('vv', 'scroll');
  assert.deepEqual(b.writes.slice(3), [['--app-top', '310px'], ['--app-h', '420px']]);
  // Valeurs identiques : rien n'est réécrit
  const count = b.writes.length;
  b.fire('vv', 'scroll');
  b.fire('vv', 'resize');
  b.fire('window', 'resize');
  b.runLater();
  assert.equal(b.writes.length, count);
  assert.deepEqual(b.scrolls, [], 'la page n\'est jamais ramenée en haut pendant la saisie');
});

test('page qui a défilé (window.scrollY > 0) avec un champ actif : même règle, position = offsetTop', () => {
  const b = browser({ height: 800 });
  b.doc.activeElement = textInput();
  b.vv.height = 430;
  b.win.scrollY = 250;
  b.fire('vv', 'resize');
  assert.deepEqual(b.writes.slice(1), [['--app-h', '430px']], '--app-top reste 0, la hauteur suit la zone visible');
});

test('clavier fermé : décalage à zéro, hauteur de base, page ramenée tout en haut, sans réécriture ensuite', () => {
  const b = browser({ height: 800 });
  b.doc.activeElement = textInput();
  b.vv.height = 420;
  b.vv.offsetTop = 310;
  b.win.scrollY = 40;
  b.fire('vv', 'scroll');
  assert.deepEqual(b.writes.slice(1), [['--app-top', '310px'], ['--app-h', '420px']]);
  // Champ quitté : le clavier se referme
  b.doc.activeElement = null;
  b.vv.height = 800;
  b.vv.offsetTop = 0;
  b.fire('document', 'focusout');
  assert.deepEqual(b.writes.slice(3), [['--app-top', '0px'], ['--app-h', '800px']]);
  assert.deepEqual(b.scrolls, [[0, 0]]);
  const count = b.writes.length;
  b.runLater();
  b.fire('vv', 'scroll');
  assert.equal(b.writes.length, count);
  assert.deepEqual(b.scrolls, [[0, 0]], 'une seule fois');
});

test('sans décalage (Android aujourd\'hui) : comportement inchangé, --app-top jamais écrit', () => {
  const b = browser({ height: 800 });
  b.doc.activeElement = textInput();
  b.vv.height = 480; // le clavier recouvre la page, la zone visible ne remonte pas
  b.fire('vv', 'resize');
  b.fire('vv', 'scroll');
  b.fire('document', 'focusin');
  b.runLater();
  b.doc.activeElement = null;
  b.vv.height = 800;
  b.fire('document', 'focusout');
  b.runLater();
  assert.deepEqual(b.writes, [['--app-h', '800px']]);
  assert.deepEqual(b.scrolls, []);
});

test('zone visible décalée sans champ actif (zoom à deux doigts) : rien ne bouge', () => {
  const b = browser({ height: 800 });
  b.vv.height = 400;
  b.vv.scale = 2;
  b.vv.offsetTop = 200;
  b.fire('vv', 'scroll');
  assert.deepEqual(b.writes, [['--app-h', '800px']]);
});

test('doigt posé : un changement de --app-top / --app-h attend le relâchement, puis s\'applique', () => {
  const b = browser({ height: 800 });
  b.runLater();
  b.doc.activeElement = textInput();
  b.vv.height = 420;
  b.vv.offsetTop = 310;
  b.fire('vv', 'scroll');
  const before = b.writes.length;
  // Le doigt se pose sur une suggestion ; pendant ce temps, la zone visible bouge
  b.fire('document', 'pointerdown');
  b.vv.offsetTop = 290;
  b.vv.height = 440;
  b.fire('vv', 'scroll');
  b.fire('vv', 'resize');
  b.fire('document', 'focusout');
  b.runLater();
  assert.equal(b.writes.length, before, 'rien ne bouge sous le doigt');
  // Relâchement : la dernière mesure s'applique aussitôt, une seule fois
  b.fire('document', 'pointerup');
  assert.deepEqual(b.writes.slice(before), [['--app-top', '290px'], ['--app-h', '440px']]);
  b.fire('document', 'pointerup');
  assert.equal(b.writes.length, before + 2);
  // pointercancel (le doigt a fait défiler) : pareil
  b.fire('document', 'pointerdown');
  b.vv.offsetTop = 300;
  b.fire('vv', 'scroll');
  assert.equal(b.writes.length, before + 2);
  b.fire('document', 'pointercancel');
  assert.deepEqual(b.writes.at(-1), ['--app-top', '300px']);
});

test('relâchement perdu : la mise en attente ne dure pas plus de 2 s', () => {
  const b = browser({ height: 800 });
  b.fire('document', 'pointerdown');
  b.setHeight(700);
  b.fire('window', 'resize');
  assert.deepEqual(b.writes, [['--app-h', '800px']]);
  b.clock.now += 2500;
  b.fire('window', 'resize');
  assert.deepEqual(b.writes.at(-1), ['--app-h', '700px']);
});

test('compensation du clavier isolée dans une seule fonction (keyboardShift)', () => {
  assert.match(script, /function keyboardShift\(win, typing\) \{/);
  assert.equal((script.match(/keyboardShift\(/g) ?? []).length, 2, 'définie une fois, utilisée une fois');
  assert.match(script, /var shift = keyboardShift\(win, typing\);/);
});

test('panne du script : rien ne casse (100dvh s\'applique)', () => {
  assert.doesNotThrow(() => vm.runInNewContext(script, { window: {}, document: {} }));
});

test('app.css : .app posée sur l\'écran, suit var(--app-top, 0px) et var(--app-h, 100dvh), marge de sécurité du haut', () => {
  const css = read('css/app.css');
  assert.match(css, /^\.app \{\n  position: fixed;\n  top: var\(--app-top, 0px\);\n  left: 0;\n  right: 0;\n  height: var\(--app-h, 100dvh\);\n  padding-top: env\(safe-area-inset-top, 0px\);\n  overflow: hidden;\n\}$/m);
  assert.doesNotMatch(css, /^\.app \{ height: 100dvh/m);
  // Les fenêtres se placent par rapport à .app (aucune position fixe ailleurs)
  for (const file of ['css/app.css', 'css/listo.css']) {
    assert.equal((read(file).match(/position: fixed/g) ?? []).length, file === 'css/app.css' ? 1 : 0, file);
  }
});

test('index.html : script externe, chargé tout en haut juste après viewport.js', () => {
  const html = read('index.html');
  const tag = '<script src="/js/app-height.js"></script>';
  assert.ok(html.includes(tag), 'fichier externe');
  assert.ok(html.indexOf('<script src="/js/viewport.js"></script>') < html.indexOf(tag), 'après viewport.js');
  assert.ok(html.indexOf(tag) < html.indexOf('<link rel="stylesheet"'), 'avant les styles');
  // Aucun script écrit dans la page (CSP stricte inchangée)
  assert.equal([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].length, 0);
  // Ni marque, ni modèle, ni hauteur de barre fixe dans le script
  // (dans le code, hors commentaires)
  const code = script.split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
  assert.doesNotMatch(code, /\b(Xiaomi|Samsung|Pixel|Redmi|Galaxy)\b|userAgent|\b(44|48|56)px/);
});
