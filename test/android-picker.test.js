// Photo et scan : choix « Prendre une photo / Choisir dans la galerie » sur
// Android seulement (createImagePicker de public/js/photo.js, partagé par la
// photo d'un article, le code-barres de la fiche et le mode scan). Ailleurs,
// un seul geste comme avant. Un petit faux document suffit ici ; le rendu
// réel est vérifié dans Chromium avec un navigateur Android simulé
// (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createImagePicker, isAndroid } from '../public/js/photo.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// --- Faux document : juste ce qu'utilisent h() et icon() de dom.js ---
class FakeNode {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
    this.listeners = {};
    this.clicks = 0;
  }
  setAttribute(name, value) { this.attrs[name] = value; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  hasAttribute(name) { return name in this.attrs; }
  append(...nodes) { this.children.push(...nodes); }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  click() {
    this.clicks++;
    for (const fn of this.listeners.click ?? []) fn({});
  }
  get textContent() { return this.children.map((c) => (typeof c === 'string' ? c : c.textContent ?? '')).join(''); }
  // Tous les descendants (et soi-même) qui vérifient test
  findAll(check) {
    const found = check(this) ? [this] : [];
    for (const child of this.children) if (child instanceof FakeNode) found.push(...child.findAll(check));
    return found;
  }
}
class FakeText extends FakeNode {
  constructor(text) {
    super('#text');
    this.text = text;
  }
  get textContent() { return this.text; }
}

function fakeDom(t) {
  globalThis.Node = FakeNode;
  globalThis.document = {
    createElement: (tag) => new FakeNode(tag),
    createElementNS: (ns, tag) => new FakeNode(tag),
    createTextNode: (text) => new FakeText(text),
  };
  t.after(() => {
    delete globalThis.Node;
    delete globalThis.document;
  });
}

const fileInputs = (root) => root.findAll((n) => n.tag === 'input' && n.attrs.type === 'file');

test('détection d\'Android : navigateurs Android, iPhone, iPad, ordinateurs', () => {
  const android = [
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', // tablette
  ];
  const others = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
    '',
  ];
  for (const ua of android) assert.equal(isAndroid(ua), true, ua);
  for (const ua of others) assert.equal(isAndroid(ua), false, ua);
  // Détection isolée dans une seule petite fonction, utilisée par défaut
  const source = read('public/js/photo.js');
  assert.match(source, /export function isAndroid\(userAgent = globalThis\.navigator\?\.userAgent \?\? ''\) \{\s*return \/\\bAndroid\\b\/i\.test\(String\(userAgent\)\);\s*\}/);
  assert.match(source, /export function createImagePicker\(onFile, \{ title = 'Choisir une image', android = isAndroid\(\), sheet = null \} = \{\}\)/);
  assert.equal((source.match(/isAndroid\(/g) ?? []).length, 2, 'définie une fois, appelée une fois');
});

test('hors Android : un seul champ, sans capture, ouvert directement par le bouton (inchangé)', (t) => {
  fakeDom(t);
  let opened = 0;
  const picker = createImagePicker(() => {}, { android: false, sheet: () => { opened++; } });
  assert.equal(picker.input.tag, 'input');
  assert.deepEqual(fileInputs(picker.input).map((i) => [i.attrs.accept, i.hasAttribute('capture')]), [['image/*', false]]);
  const button = picker.button({ class: 'btn', 'aria-label': 'Scanner un produit' }, 'x');
  button.click();
  assert.equal(picker.input.clicks, 1, 'le sélecteur du téléphone s\'ouvre tout de suite');
  assert.equal(opened, 0, 'aucune feuille');
});

test('Android : la feuille propose les deux choix, chacun ouvre le bon champ ; Annuler ne fait rien', async (t) => {
  fakeDom(t);
  const received = [];
  const sheets = [];
  const sheet = (options) => {
    const entry = { ...options, closed: 0 };
    sheets.push(entry);
    return { close: () => { entry.closed++; } };
  };
  const picker = createImagePicker((file) => received.push(file), { title: 'Photo de l\'article', android: true, sheet });
  // Deux champs dans la page : appareil photo (capture) et galerie (sans)
  const [camera, gallery] = fileInputs(picker.input);
  assert.equal(camera.attrs.capture, 'environment');
  assert.equal(camera.attrs.accept, 'image/*');
  assert.equal(gallery.hasAttribute('capture'), false);
  assert.equal(gallery.attrs.accept, 'image/*');
  for (const input of [camera, gallery]) assert.equal(input.attrs['aria-hidden'], 'true');

  const choicesOf = (entry) => entry.content.findAll((n) => n.tag === 'button');
  const open = async () => {
    picker.button({ 'aria-label': 'Ajouter une photo' }, 'Ajouter une photo').click();
    await new Promise((resolve) => setImmediate(resolve));
    return sheets.at(-1);
  };

  // 1. « Prendre une photo » : le champ avec capture, puis la feuille se ferme
  let entry = await open();
  assert.equal(entry.title, 'Photo de l\'article');
  assert.equal(camera.clicks + gallery.clicks, 0, 'rien ne s\'ouvre avant le choix');
  const buttons = choicesOf(entry);
  assert.deepEqual(buttons.map((b) => [b.textContent, b.attrs['aria-label'] ?? null, b.attrs.type]),
    [['Prendre une photo', 'Prendre une photo', 'button'], ['Choisir dans la galerie', 'Choisir dans la galerie', 'button'], ['Annuler', null, 'button']]);
  assert.ok(buttons.every((b) => /\bbtn\b/.test(b.attrs.class) && /btn--block/.test(b.attrs.class)), 'grandes zones tactiles du kit');
  buttons[0].click();
  assert.deepEqual([camera.clicks, gallery.clicks, entry.closed], [1, 0, 1]);

  // 2. « Choisir dans la galerie » : le champ sans capture
  entry = await open();
  choicesOf(entry)[1].click();
  assert.deepEqual([camera.clicks, gallery.clicks, entry.closed], [1, 1, 1]);

  // 3. « Annuler » : la feuille se ferme, aucun champ ne s'ouvre
  entry = await open();
  choicesOf(entry)[2].click();
  assert.deepEqual([camera.clicks, gallery.clicks, entry.closed], [1, 1, 1]);

  // Le fichier choisi suit le même chemin, quel que soit le champ
  for (const input of [camera, gallery]) {
    const file = { name: `${input.attrs.capture ?? 'galerie'}.jpg` };
    input.files = [file];
    for (const fn of input.listeners.change) fn();
    assert.equal(input.value, '', 'la même image pourra être choisie de nouveau');
  }
  assert.deepEqual(received.map((f) => f.name), ['environment.jpg', 'galerie.jpg']);
});

test('les trois usages passent par le même composant, avec un titre ; textes en texte, jamais en HTML', () => {
  const list = read('public/js/screens/list.js');
  const scan = read('public/js/screens/scan.js');
  assert.match(list, /createImagePicker\(\(file\) => readEan\(file\), \{ title: 'Scanner un code-barres' \}\)/);
  assert.match(list, /createImagePicker\(\(file\) => sendPhoto\(file\), \{ title: `Photo \$\{words\.of\}` \}\)/);
  assert.match(scan, /\}, \{ title: 'Scanner un produit' \}\);/);
  const photo = read('public/js/photo.js');
  assert.doesNotMatch(photo, /innerHTML|insertAdjacentHTML|outerHTML|getUserMedia/);
  // La feuille : celle de ui.js (par-dessus la fiche, fond grisé), sans
  // champ de saisie (donc aucun clavier ni focus dans un champ)
  assert.match(photo, /const openSheet = sheet \?\? \(await import\('\.\/ui\.js'\)\)\.openSheet;/);
  assert.doesNotMatch(photo.slice(photo.indexOf('async function chooseSource')), /h\('input'|\.focus\(/);
  // Aucune règle de sécurité du navigateur changée (caméra jamais ouverte par la page)
  assert.doesNotMatch(read('server/app.js'), /camera=\(self\)|camera=\*/);
});
