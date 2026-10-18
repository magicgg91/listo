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
  const vv = visualViewport ? { height, scale: 1, addEventListener: on('vv') } : undefined;
  const win = {
    innerHeight: height,
    innerWidth: width,
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
  vm.runInNewContext(script, { window: win, document: doc });
  return {
    win,
    doc,
    vv,
    writes,
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
  for (const [target, type] of [['window', 'resize'], ['vv', 'resize'], ['document', 'visibilitychange'], ['window', 'pageshow'], ['window', 'focus'], ['window', 'orientationchange'], ['document', 'focusout']]) {
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

test('panne du script : rien ne casse (100dvh s\'applique)', () => {
  assert.doesNotThrow(() => vm.runInNewContext(script, { window: {}, document: {} }));
});

test('app.css : .app utilise var(--app-h, 100dvh)', () => {
  const css = read('css/app.css');
  assert.match(css, /^\.app \{ height: var\(--app-h, 100dvh\); overflow: hidden; \}$/m);
  assert.doesNotMatch(css, /^\.app \{ height: 100dvh/m);
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
