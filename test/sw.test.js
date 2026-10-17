// Tests du service worker (étape 9) : liste des fichiers gardés pour
// l'ouverture sans réseau, et règles de ce qui n'est jamais gardé.
// (Le fonctionnement réel, réseau coupé, est vérifié dans un vrai navigateur.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { startTestApp } from './helpers.js';

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));
const source = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');
const listed = JSON.parse(`[${source.match(/const APP_FILES = \[([\s\S]*?)\];/)[1].replace(/'/g, '"').replace(/,\s*$/, '')}]`);

function filesIn(dir, base = '') {
  return fs.readdirSync(path.join(dir, base), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${base}/${entry.name}`;
    return entry.isDirectory() ? filesIn(dir, rel) : [rel];
  });
}

// Fichiers de la page publique (lien /p/…) : jamais gardés par le service
// worker, qui ne s'occupe pas de cette page
const PUBLIC_PAGE_FILES = ['/js/public.js'];

test("service worker : chaque fichier de l'application est gardé pour l'ouverture sans réseau", () => {
  const expected = filesIn(PUBLIC).filter((file) => file !== '/sw.js' && !PUBLIC_PAGE_FILES.includes(file)).sort();
  const files = listed.filter((url) => url !== '/').sort();
  assert.deepEqual(files, expected, 'APP_FILES (sw.js) doit lister exactement les fichiers de public/');
  assert.ok(listed.includes('/'));
});

test("service worker : l'API, le flux temps réel et le lien public ne sont jamais gardés", () => {
  assert.equal(listed.some((url) => url.startsWith('/api') || url.startsWith('/p/')), false);
  // Seules les photos d'articles échappent à la règle « /api/ jamais gardé »
  assert.match(source, /if \(url\.pathname\.startsWith\('\/api\/'\)\) \{\s*\/\/[^\n]*\n\s*if \(PHOTO_PATH\.test\(url\.pathname\)\)[^\n]*\n\s*return;/);
  assert.match(source, /if \(url\.pathname\.startsWith\('\/p\/'\)\) return;/);
  assert.match(source, /if \(request\.method !== 'GET'\) return;/);
  assert.match(source, /PHOTO_PATH = \/\^\\\/api\\\/items\\\/\[0-9a-f-\]\{36\}\\\/photo\$\//);
});

test('sw.js est servi sans cache (une nouvelle version est vue tout de suite)', async (t) => {
  const app = await startTestApp(t);
  const res = await fetch(`${app.base}/sw.js`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  assert.match(res.headers.get('content-type'), /javascript/);
});

// Fait tourner sw.js dans un faux navigateur et renvoie son gestionnaire
// « fetch » : on peut alors lui présenter des requêtes et voir s'il les prend
// en charge (respondWith) ou s'il les laisse passer vers le serveur.
function workerFetchHandler() {
  const listeners = {};
  const fakeCache = { match: async () => undefined, put: async () => {}, keys: async () => [], delete: async () => true, addAll: async () => {} };
  const context = {
    self: { addEventListener: (type, fn) => { listeners[type] = fn; }, location: { origin: 'https://listo.test' } },
    caches: { open: async () => fakeCache, keys: async () => [], delete: async () => true },
    fetch: () => Promise.reject(new Error('pas de réseau')),
    indexedDB: { open: () => ({}) },
    URL, Request, Response, setTimeout, clearTimeout, Promise,
  };
  vm.runInNewContext(source, context);
  return (url, { mode = 'no-cors', method = 'GET' } = {}) => {
    let taken = false;
    listeners.fetch({
      request: { url: `https://listo.test${url}`, mode, method },
      respondWith: (promise) => { taken = true; Promise.resolve(promise).catch(() => {}); },
    });
    return taken;
  };
}

test('service worker (exécuté) : ne garde ni ne détourne jamais /p/ ni /api/public/', () => {
  const takes = workerFetchHandler();
  const token = 'A'.repeat(43);
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  // Lien public : page, données, photos, mot de passe, fichier de la page
  assert.equal(takes(`/p/${token}`, { mode: 'navigate' }), false);
  assert.equal(takes('/p/', { mode: 'navigate' }), false);
  assert.equal(takes(`/api/public/${token}`, { mode: 'cors' }), false);
  assert.equal(takes(`/api/public/${token}/photos/${id}`), false);
  assert.equal(takes(`/api/public/${token}/acces`, { method: 'POST', mode: 'cors' }), false);
  assert.equal(takes('/js/public.js', { mode: 'cors' }), false);
  // Reste de l'API : jamais pris non plus (sauf les photos d'articles)
  assert.equal(takes('/api/sync', { mode: 'cors' }), false);
  assert.equal(takes('/api/events', { mode: 'cors' }), false);
  assert.equal(takes(`/api/items/${id}/photo?v=1`), true);
  // Contrôle : l'application elle-même est bien prise en charge
  assert.equal(takes('/', { mode: 'navigate' }), true);
  assert.equal(takes('/js/app.js', { mode: 'cors' }), true);
});
