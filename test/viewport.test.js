// Android, application installée : viewport-fit=cover retiré par
// public/js/viewport.js, pour que la page reste au-dessus de la barre de
// navigation du système. iPhone et autres : balise inchangée (l'iPhone a
// besoin de cover et de env(safe-area-inset-bottom) pour l'indicateur
// d'accueil). Le rendu sur un vrai téléphone reste à confirmer à la main.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { CONTENT_SECURITY_POLICY } from '../server/app.js';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const script = read('js/viewport.js');
const html = read('index.html');
const ORIGINAL = html.match(/<meta name="viewport" content="([^"]*)">/)[1];

// Exécute viewport.js comme le navigateur, avec un faux document
function run(userAgent, content = ORIGINAL) {
  const meta = { value: content, getAttribute: () => meta.value, setAttribute: (name, value) => { meta.value = value; } };
  vm.runInNewContext(script, {
    navigator: { userAgent },
    document: { querySelector: (selector) => (selector === 'meta[name="viewport"]' ? meta : null) },
  });
  return meta.value;
}

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 16; 24113RK3AG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  desktop: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
};

test('index.html : viewport-fit=cover par défaut (iPhone), script viewport.js chargé tout en haut', () => {
  assert.equal(ORIGINAL, 'width=device-width, initial-scale=1, viewport-fit=cover');
  const tag = '<script src="/js/viewport.js"></script>';
  assert.ok(html.includes(tag), 'script classique (ni module, ni defer, ni async) : il agit avant le premier affichage');
  const at = html.indexOf(tag);
  assert.ok(at > html.indexOf('<meta name="viewport"'), 'après la balise viewport');
  assert.ok(at < html.indexOf('<link rel="stylesheet"'), 'avant les styles');
  assert.ok(at < html.indexOf('<script type="module"'), 'avant l\'application');
  // Aucun script écrit dans la page, CSP inchangée
  assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/.test(html), false);
  assert.match(CONTENT_SECURITY_POLICY, /script-src 'self'(;|$)/);
  assert.equal(CONTENT_SECURITY_POLICY.includes('unsafe-inline'), false);
});

test('Android → viewport-fit retiré ; iPhone, iPad, ordinateur → balise inchangée', () => {
  assert.equal(run(UA.android), 'width=device-width, initial-scale=1');
  assert.equal(run(UA.android.replace('Android', 'android')), 'width=device-width, initial-scale=1');
  for (const name of ['iphone', 'ipad', 'desktop']) assert.equal(run(UA[name]), ORIGINAL, name);
  // Autres écritures de la balise : seul viewport-fit disparaît
  assert.equal(run(UA.android, 'viewport-fit=cover,width=device-width'), 'width=device-width');
  assert.equal(run(UA.android, 'width=device-width, initial-scale=1'), 'width=device-width, initial-scale=1');
});

test('viewport.js ne casse jamais la page (balise absente, navigateur inattendu)', () => {
  assert.doesNotThrow(() => vm.runInNewContext(script, { navigator: { userAgent: UA.android }, document: { querySelector: () => null } }));
  assert.doesNotThrow(() => vm.runInNewContext(script, { navigator: {}, document: { querySelector: () => null } }));
  assert.doesNotThrow(() => vm.runInNewContext(script, { document: {} }));
});
