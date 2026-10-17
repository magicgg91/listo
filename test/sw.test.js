// Tests du service worker (étape 9) : liste des fichiers gardés pour
// l'ouverture sans réseau, et règles de ce qui n'est jamais gardé.
// (Le fonctionnement réel, réseau coupé, est vérifié dans un vrai navigateur.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

test("service worker : chaque fichier de l'application est gardé pour l'ouverture sans réseau", () => {
  const expected = filesIn(PUBLIC).filter((file) => file !== '/sw.js').sort();
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
