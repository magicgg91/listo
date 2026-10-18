// Thème de Listo posé avant le premier affichage (public/js/theme-boot.js) et
// tenu à jour au changement dans les réglages (public/js/theme.js) :
// data-theme sur <html>, balises color-scheme et theme-color. Sur iPhone, le
// bandeau du haut suivait le mode du téléphone à l'ouverture à froid. Le
// vrai iPhone reste à essayer (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { syncThemeMeta, THEME_BG } from '../public/js/theme.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const script = read('public/js/theme-boot.js');

// Fausse page : <html> et les trois balises de index.html
function fakePage() {
  const meta = (attrs) => ({ attrs: { ...attrs }, getAttribute(n) { return this.attrs[n] ?? null; }, setAttribute(n, v) { this.attrs[n] = v; } });
  const scheme = meta({ name: 'color-scheme', content: 'light dark' });
  const light = meta({ name: 'theme-color', content: '#F4F7FB', media: '(prefers-color-scheme: light)' });
  const dark = meta({ name: 'theme-color', content: '#0C1422', media: '(prefers-color-scheme: dark)' });
  const html = { attrs: { 'data-theme': 'auto' }, setAttribute(n, v) { this.attrs[n] = v; } };
  return {
    doc: {
      documentElement: html,
      querySelector: (sel) => (sel === 'meta[name="color-scheme"]' ? scheme : null),
      querySelectorAll: (sel) => (sel === 'meta[name="theme-color"]' ? [light, dark] : []),
    },
    state: () => ({ theme: html.attrs['data-theme'], scheme: scheme.attrs.content, light: light.attrs.content, dark: dark.attrs.content }),
  };
}

function boot(storage) {
  const page = fakePage();
  const win = {};
  if (storage === 'throws') Object.defineProperty(win, 'localStorage', { get() { throw new Error('bloqué'); } });
  else win.localStorage = storage;
  vm.runInNewContext(script, { window: win, document: page.doc });
  return page.state();
}
const stored = (value) => ({ getItem: (key) => (key === 'listo-theme' ? value : null) });

test('thème clair enregistré : clair partout, même si le téléphone est en sombre', () => {
  assert.deepEqual(boot(stored('light')), { theme: 'light', scheme: 'light', light: '#F4F7FB', dark: '#F4F7FB' });
});

test('thème sombre enregistré : sombre partout', () => {
  assert.deepEqual(boot(stored('dark')), { theme: 'dark', scheme: 'dark', light: '#0C1422', dark: '#0C1422' });
});

test('automatique, absent, valeur inconnue, stockage indisponible : suit le téléphone, sans erreur', () => {
  const auto = { theme: 'auto', scheme: 'light dark', light: '#F4F7FB', dark: '#0C1422' };
  assert.deepEqual(boot(stored('auto')), auto);
  assert.deepEqual(boot(stored(null)), auto);
  assert.deepEqual(boot(stored('violet')), auto);
  assert.deepEqual(boot({ getItem() { throw new Error('navigation privée'); } }), auto);
  assert.deepEqual(boot('throws'), auto);
  assert.doesNotThrow(() => vm.runInNewContext(script, { window: {}, document: {} }));
});

test('theme.js : changement de thème dans les réglages → balises mises à jour tout de suite', () => {
  const page = fakePage();
  syncThemeMeta(page.doc, 'light');
  assert.deepEqual(page.state(), { theme: 'auto', scheme: 'light', light: '#F4F7FB', dark: '#F4F7FB' });
  syncThemeMeta(page.doc, 'dark');
  assert.deepEqual(page.state(), { theme: 'auto', scheme: 'dark', light: '#0C1422', dark: '#0C1422' });
  syncThemeMeta(page.doc, 'auto');
  assert.deepEqual(page.state(), { theme: 'auto', scheme: 'light dark', light: '#F4F7FB', dark: '#0C1422' });
  assert.match(read('public/js/theme.js'), /document\.documentElement\.setAttribute\('data-theme', value\);\s*syncThemeMeta\(document, value\);/);
});

test('mêmes couleurs que --color-bg de listo.css, dans les deux scripts, index.html et le manifeste', () => {
  const css = read('public/css/listo.css');
  const light = css.match(/\[data-theme="light"\] \{\s*--color-bg: (#[0-9A-F]{6});/)[1];
  const dark = css.match(/\[data-theme="dark"\] \{\s*--color-bg: (#[0-9A-F]{6});/)[1];
  assert.deepEqual(THEME_BG, { light, dark });
  assert.match(script, new RegExp(`var BG = \\{ light: '${light}', dark: '${dark}' \\};`));
  const html = read('public/index.html');
  assert.ok(html.includes(`<meta name="theme-color" content="${light}" media="(prefers-color-scheme: light)">`));
  assert.ok(html.includes(`<meta name="theme-color" content="${dark}" media="(prefers-color-scheme: dark)">`));
  assert.ok(html.includes('<meta name="color-scheme" content="light dark">'));
  assert.doesNotMatch(html, /#2F6FED/i, 'plus de bleu dans le bandeau');
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.deepEqual([manifest.theme_color, manifest.background_color], [light, light], 'manifeste : thème clair par défaut');
});

test('index.html : script externe, tout en haut de <head>, après les balises de couleur, avant les autres scripts et les styles', () => {
  const html = read('public/index.html');
  const tag = '<script src="/js/theme-boot.js"></script>';
  assert.ok(html.indexOf('<meta name="theme-color"') < html.indexOf(tag));
  assert.ok(html.indexOf(tag) < html.indexOf('<script src="/js/viewport.js"></script>'));
  assert.ok(html.indexOf(tag) < html.indexOf('<link rel="stylesheet"'));
  assert.equal([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].length, 0, 'aucun script écrit dans la page');
  assert.match(read('public/sw.js'), /'\/js\/theme-boot\.js',/);
});

test('fonds : <html> et <body> ont la couleur du thème ; marge du haut inchangée (une seule)', () => {
  const css = read('public/css/app.css');
  assert.match(css, /^html, body \{ background: var\(--color-bg\); \}$/m);
  assert.equal((css.match(/safe-area-inset-top/g) ?? []).length, 1, 'une seule marge de sécurité en haut (.app)');
  assert.doesNotMatch(read('public/css/listo.css'), /safe-area-inset-top/);
});
