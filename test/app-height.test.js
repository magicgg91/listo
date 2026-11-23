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
function browser({ height = 800, width = 390, visualViewport = true, ios = false, stored = null } = {}) {
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
    // iPhone : navigator.standalone (Safari d'Apple seulement) et la hauteur
    // du clavier gardée sur l'appareil
    navigator: ios ? { standalone: false } : {},
    localStorage: (() => {
      const data = new Map(stored === null ? [] : [['listo.clavier', String(stored)]]);
      return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
    })(),
    addEventListener: on('window'),
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
    requestAnimationFrame: (fn) => frames.push(fn),
  };
  const doc = {
    visibilityState: 'visible',
    activeElement: null,
    documentElement: {
      style: { setProperty: (name, value) => writes.push([name, value]) },
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = String(value); },
      removeAttribute(name) { delete this.attributes[name]; },
    },
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
  b.runLater({ upTo: 1000 }); // relectures décalées (pas le délai de sécurité de 2 s)
  assert.equal(b.writes.length, before, 'rien ne bouge sous le doigt');
  // Relâchement : l'appui n'est fini qu'après le click qui suit ; la
  // dernière mesure s'applique alors, une seule fois
  b.fire('document', 'pointerup');
  assert.equal(b.writes.length, before, 'rien ne bouge entre le relâchement et le click');
  b.fire('document', 'click');
  b.runLater();
  assert.deepEqual(b.writes.slice(before), [['--app-top', '290px'], ['--app-h', '440px']]);
  b.fire('document', 'pointerup');
  b.fire('document', 'click');
  b.runLater();
  assert.equal(b.writes.length, before + 2);
  // pointercancel (le doigt a fait défiler) : pareil
  b.fire('document', 'pointerdown');
  b.vv.offsetTop = 300;
  b.fire('vv', 'scroll');
  assert.equal(b.writes.length, before + 2);
  b.fire('document', 'pointercancel');
  assert.deepEqual(b.writes.at(-1), ['--app-top', '300px']);
});

// Appui sur un bouton (disquette, croix, « Ajouter une photo »…) alors qu'un
// champ a le curseur : le navigateur envoie pointerdown, pointerup, puis
// mousedown (le champ perd le curseur : focusout), mouseup et click
function typingWithKeyboard() {
  const b = browser({ height: 800 });
  b.runLater();
  b.doc.activeElement = textInput();
  b.vv.height = 420;
  b.vv.offsetTop = 310;
  b.fire('vv', 'scroll');
  return b;
}
const leaveField = (b) => {
  b.doc.activeElement = null;
  b.fire('document', 'focusout');
};

test('appui sur un bouton avec un champ actif : aucun réajustement avant le click, puis un seul', () => {
  const b = typingWithKeyboard();
  const before = b.writes.length;
  b.fire('document', 'pointerdown');
  b.fire('document', 'pointerup');
  leaveField(b); // mousedown : le champ perd le curseur, le clavier commence à se replier
  b.runLater({ upTo: 0 }); // relectures immédiates (image suivante)
  assert.equal(b.writes.length, before, 'la page ne bouge pas avant le click');
  b.fire('document', 'click');
  b.runLater({ upTo: 0 });
  // Le clavier n'est pas encore replié : décalage à zéro (hauteur visible inchangée)
  assert.deepEqual(b.writes.slice(before), [['--app-top', '0px']]);
  // Le clavier se replie ensuite : réajustements habituels
  b.vv.height = 800;
  b.vv.offsetTop = 0;
  b.fire('vv', 'resize');
  assert.deepEqual(b.writes.at(-1), ['--app-h', '800px']);
});

test('sans appui (touche Entrée, clavier physique) : réajustement aussitôt, comme avant', () => {
  const b = typingWithKeyboard();
  const before = b.writes.length;
  leaveField(b);
  assert.deepEqual(b.writes.slice(before), [['--app-top', '0px']]);
});

test('relâchement sans click (doigt glissé hors du bouton) : réajustement au bout de 400 ms', () => {
  const b = typingWithKeyboard();
  const before = b.writes.length;
  b.fire('document', 'pointerdown');
  b.fire('document', 'pointerup');
  leaveField(b);
  b.runLater({ upTo: 300 });
  assert.equal(b.writes.length, before);
  b.runLater({ upTo: 400 });
  assert.deepEqual(b.writes.slice(before), [['--app-top', '0px']]);
});

test('pointercancel (le doigt fait défiler la page) : réajustement aussitôt', () => {
  const b = typingWithKeyboard();
  const before = b.writes.length;
  b.fire('document', 'pointerdown');
  leaveField(b);
  assert.equal(b.writes.length, before);
  b.fire('document', 'pointercancel');
  assert.deepEqual(b.writes.slice(before), [['--app-top', '0px']]);
});

test('délai de sécurité : sans relâchement, la mesure s\'applique au bout de 2 s ; une fin prévue d\'un ancien appui est ignorée', () => {
  const b = typingWithKeyboard();
  const before = b.writes.length;
  b.fire('document', 'pointerdown');
  leaveField(b);
  b.runLater({ upTo: 1999 });
  assert.equal(b.writes.length, before);
  b.runLater({ upTo: 2000 });
  assert.deepEqual(b.writes.slice(before), [['--app-top', '0px']]);
  // Ancien appui relâché sans click, nouvel appui aussitôt : les 400 ms du
  // premier ne terminent pas le second
  const c = typingWithKeyboard();
  const start = c.writes.length;
  c.fire('document', 'pointerdown');
  c.fire('document', 'pointerup');
  c.fire('document', 'pointerdown');
  leaveField(c);
  c.runLater({ upTo: 400 });
  assert.equal(c.writes.length, start, 'le second appui est toujours en cours');
  c.fire('document', 'pointerup');
  c.fire('document', 'click');
  c.runLater({ upTo: 0 });
  assert.equal(c.writes.length, start + 1);
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

// Bande vide entre la barre d'ajout et le clavier de l'iPhone : la marge
// de sécurité du bas (trait de l'iPhone) est retirée quand le clavier est
// ouvert et que l'application touche le clavier
const keyboardAttr = (b) => b.doc.documentElement.attributes['data-keyboard'];

test('clavier ouvert (zone visible décalée et réduite) : data-keyboard="open" ; fermé : retiré ; suit chaque ouverture et fermeture', () => {
  const b = browser({ height: 800 });
  assert.equal(keyboardAttr(b), undefined, 'au départ : pas de clavier');
  for (let round = 0; round < 2; round++) {
    // Le champ prend le curseur, le clavier s'ouvre
    b.doc.activeElement = textInput();
    b.fire('document', 'focusin');
    b.vv.height = 420;
    b.vv.offsetTop = 310;
    b.fire('vv', 'resize');
    assert.equal(keyboardAttr(b), 'open');
    // Le champ perd le curseur, le clavier se replie
    b.doc.activeElement = null;
    b.fire('document', 'focusout');
    assert.equal(keyboardAttr(b), undefined, 'marge de sécurité revenue');
    b.vv.height = 800;
    b.vv.offsetTop = 0;
    b.fire('vv', 'resize');
    assert.equal(keyboardAttr(b), undefined);
  }
});

test('sans décalage (Android, zoom à deux doigts sans champ) : data-keyboard jamais posé', () => {
  const b = browser({ height: 800 });
  // Android : clavier ouvert, zone visible non décalée
  b.doc.activeElement = textInput();
  b.vv.height = 500;
  b.fire('vv', 'resize');
  assert.equal(keyboardAttr(b), undefined);
  // Zoom à deux doigts, aucun champ actif : zone visible décalée
  b.doc.activeElement = null;
  b.vv.height = 400;
  b.vv.offsetTop = 200;
  b.fire('vv', 'scroll');
  assert.equal(keyboardAttr(b), undefined);
});

test('appui en cours : data-keyboard change à la fin de l\'appui, avec le reste', () => {
  const b = browser({ height: 800 });
  b.doc.activeElement = textInput();
  b.vv.height = 420;
  b.vv.offsetTop = 310;
  b.fire('vv', 'resize');
  b.fire('document', 'pointerdown');
  b.fire('document', 'pointerup');
  b.doc.activeElement = null;
  b.fire('document', 'focusout');
  assert.equal(keyboardAttr(b), 'open', 'rien ne bouge avant le click');
  b.fire('document', 'click');
  b.runLater({ upTo: 0 });
  assert.equal(keyboardAttr(b), undefined);
});

test('app.css : clavier ouvert, plus de marge de sécurité en bas de la barre d\'ajout, des feuilles, des boutons du bas et des messages', () => {
  const kit = read('css/listo.css');
  const app = read('css/app.css');
  // Sans clavier : la marge de sécurité du kit reste (le trait de l'iPhone ne recouvre pas le champ)
  assert.match(kit, /\.addbar \{[^}]*padding: var\(--space-1\) 12px calc\(12px \+ env\(safe-area-inset-bottom, 0px\)\);/);
  assert.match(kit, /\.sheet \{[^}]*calc\(var\(--space-3\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(kit, /\.footer \{[^}]*calc\(var\(--space-3\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
  // Clavier ouvert : la même marge, sans la zone de sécurité (0 pour la barre d'ajout)
  assert.match(app, /html\[data-keyboard\] \.addbar \{ padding-bottom: 12px; \}/);
  assert.match(app, /html\[data-keyboard\] \.sheet,\nhtml\[data-keyboard\] \.footer \{ padding-bottom: var\(--space-3\); \}/);
  assert.match(app, /html\[data-keyboard\] \.body:last-child,\nhtml\[data-keyboard\] \.body:has\(\+ \.footer\[hidden\]\) \{ padding-bottom: var\(--space-3\); \}/);
  assert.match(app, /html\[data-keyboard\] \.toast \{ bottom: 96px; \}/);
  assert.match(app, /html\[data-keyboard\] \.toast--low \{ bottom: var\(--space-3\); \}/);
  assert.match(app, /html\[data-keyboard\] \.public-foot \{ padding-bottom: 0; \}/);
  // Aucune règle data-keyboard ne touche à autre chose que ces marges
  for (const rule of app.match(/html\[data-keyboard\][^{]*\{[^}]*\}/g)) {
    assert.match(rule, /\{ (padding-bottom|bottom): [^;]+; \}$/, rule);
  }
});

test('compensation du clavier isolée dans une seule fonction (keyboardShift)', () => {
  assert.match(script, /function keyboardShift\(win, typing, fit\) \{/);
  assert.equal((script.match(/keyboardShift\(/g) ?? []).length, 2, 'définie une fois, utilisée une fois');
  assert.match(script, /var shift = keyboardShift\(win, typing, fit\);/);
});

test('panne du script : rien ne casse (100dvh s\'applique)', () => {
  assert.doesNotThrow(() => vm.runInNewContext(script, { window: {}, document: {} }));
});

test('app.css : .app posée sur l\'écran, suit var(--app-top, 0px) et var(--app-h, 100dvh), marges de sécurité du haut et des côtés (paysage)', () => {
  const css = read('css/app.css');
  const rule = css.match(/^\.app \{\n([\s\S]*?)\n\}$/m)?.[1].replace(/\s*\/\*[\s\S]*?\*\//g, '');
  assert.equal(rule, '  position: fixed;\n  top: var(--app-top, 0px);\n  left: 0;\n  right: 0;\n  height: var(--app-h, 100dvh);\n  padding-top: env(safe-area-inset-top, 0px);\n  padding-left: env(safe-area-inset-left, 0px);\n  padding-right: env(safe-area-inset-right, 0px);\n  overflow: hidden;');
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

// Texte d'une note (data-fit-keyboard, 23 novembre 2026) : le haut de
// l'écran ne doit pas sauter quand le clavier s'ouvre ou se ferme
test('champ data-fit-keyboard : sans décalage, l\'application rétrécit avec le clavier, le haut reste en place ; un champ ordinaire ne change pas', () => {
  const fitField = () => ({ ...textInput(), hasAttribute: (name) => name === 'data-fit-keyboard' });
  const b = browser({ height: 800 });
  b.runLater();
  b.doc.activeElement = fitField();
  b.fire('document', 'focusin');
  // Le clavier s'ouvre sans que la page remonte (curseur déjà au-dessus)
  b.vv.height = 430;
  b.fire('vv', 'resize');
  assert.deepEqual(b.writes.slice(1), [['--app-h', '430px']], 'hauteur = zone au-dessus du clavier, --app-top jamais écrit');
  assert.equal(b.doc.documentElement.attributes['data-keyboard'], 'open');
  // Clavier fermé : hauteur de base, sans décalage
  b.doc.activeElement = null;
  b.vv.height = 800;
  b.fire('document', 'focusout');
  b.fire('vv', 'resize');
  assert.equal(b.writes.at(-1)[1], '800px');
  assert.equal(b.doc.documentElement.attributes['data-keyboard'], undefined);
  assert.ok(!b.writes.some(([name]) => name === '--app-top'));
  // Champ ordinaire, même situation : hauteur inchangée (comportement d'avant)
  const c = browser({ height: 800 });
  c.runLater();
  c.doc.activeElement = { ...textInput(), hasAttribute: () => false };
  c.fire('document', 'focusin');
  c.vv.height = 430;
  c.fire('vv', 'resize');
  assert.deepEqual(c.writes, [['--app-h', '800px']]);
});

// iPhone (23 novembre 2026, « le haut saute aussi dans les listes ») : la
// hauteur du clavier est retenue ; à l'ouverture suivante, l'application se
// cale au-dessus avant que le clavier n'arrive, sans --app-top
test('iPhone : hauteur du clavier retenue, puis place faite dès l\'entrée dans un champ (haut fixe) ; jamais pendant un appui', () => {
  const b = browser({ height: 800, ios: true });
  b.runLater();
  // Première ouverture : l'iPhone fait remonter la page (comportement d'avant)
  b.doc.activeElement = textInput();
  b.fire('document', 'focusin');
  b.vv.height = 420;
  b.vv.offsetTop = 310;
  b.fire('vv', 'resize');
  assert.equal(b.win.localStorage.data.get('listo.clavier'), '380', 'clavier de 380 px retenu');
  // Clavier fermé
  b.doc.activeElement = null;
  b.vv.height = 800;
  b.vv.offsetTop = 0;
  b.fire('document', 'focusout');
  b.runLater();
  assert.equal(b.writes.at(-1)[1], '800px');
  // Deuxième fois, avec un doigt posé : rien ne bouge avant le click
  const before = b.writes.length;
  b.fire('document', 'pointerdown');
  b.doc.activeElement = textInput();
  b.fire('document', 'focusin');
  assert.equal(b.writes.length, before, 'rien pendant l\'appui');
  b.fire('document', 'click');
  b.runLater({ upTo: 0 });
  assert.deepEqual(b.writes.slice(before), [['--app-h', '420px']], 'place faite au-dessus du clavier, --app-top inchangé');
  assert.equal(b.doc.documentElement.attributes['data-keyboard'], 'open');
  // Le clavier arrive sans que la page remonte : même hauteur, rien de réécrit
  b.vv.height = 420;
  b.fire('vv', 'resize');
  assert.deepEqual(b.writes.slice(before), [['--app-h', '420px']]);
});

test('iPhone : hauteur retenue lue au démarrage ; ailleurs (Android) aucune place faite d\'avance', () => {
  const b = browser({ height: 800, ios: true, stored: 300 });
  b.runLater();
  b.doc.activeElement = textInput();
  b.fire('document', 'focusin');
  assert.equal(b.writes.at(-1)[1], '500px');
  const a = browser({ height: 800, stored: 300 });
  a.runLater();
  a.doc.activeElement = textInput();
  a.fire('document', 'focusin');
  assert.deepEqual(a.writes, [['--app-h', '800px']]);
});
