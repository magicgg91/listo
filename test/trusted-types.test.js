// Trusted Types (lot 4 des bonnes pratiques du web moderne, décision du
// 15 novembre 2026) : la CSP l'exige partout, et la seule politique
// autorisée n'accepte que les deux scripts que Listo lance par adresse.
// Vérifié aussi dans Chromium, qui l'applique : aucune violation sur les
// écrans, la page publique, le service worker et le lecteur de codes-barres.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONTENT_SECURITY_POLICY, APP_CONTENT_SECURITY_POLICY } from '../server/app.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('CSP : Trusted Types exigé, une seule politique « listo », application et page publique', () => {
  for (const csp of [CONTENT_SECURITY_POLICY, APP_CONTENT_SECURITY_POLICY]) {
    assert.match(csp, /(^|; )require-trusted-types-for 'script'(;|$)/);
    assert.match(csp, /(^|; )trusted-types listo(;|$)/);
    assert.doesNotMatch(csp, /allow-duplicates|'unsafe-eval'/);
  }
});

test('politique « listo » : seulement /sw.js et /js/barcode-worker.js de Listo', async () => {
  const created = [];
  globalThis.location = { origin: 'https://listo.test' };
  globalThis.trustedTypes = {
    createPolicy: (name, rules) => {
      created.push(name);
      return { createScriptURL: (value) => ({ trusted: rules.createScriptURL(value) }) };
    },
  };
  const { scriptUrl } = await import(`../public/js/trusted.js?t=${Date.now()}`);
  assert.deepEqual(scriptUrl('/sw.js'), { trusted: 'https://listo.test/sw.js' });
  assert.deepEqual(scriptUrl('https://listo.test/js/barcode-worker.js'), { trusted: 'https://listo.test/js/barcode-worker.js' });
  for (const refused of ['/js/app.js', 'https://ailleurs.test/sw.js', '//ailleurs.test/sw.js', 'data:text/javascript,alert(1)', 'javascript:alert(1)']) {
    assert.throws(() => scriptUrl(refused), /Adresse de script refusée/, refused);
  }
  assert.deepEqual(created, ['listo'], 'politique créée une seule fois, sous le nom autorisé par la CSP');
  delete globalThis.trustedTypes;
  delete globalThis.location;
});

test('les deux scripts lancés par adresse passent par la politique', () => {
  assert.match(read('public/js/app.js'), /navigator\.serviceWorker\.register\(scriptUrl\('\/sw\.js'\)/);
  assert.match(read('public/js/barcode.js'), /new Worker\(scriptUrl\(new URL\('\.\/barcode-worker\.js', import\.meta\.url\)\.href\), \{ type: 'module' \}\)/);
  // Aucun autre point d'entrée de code dans l'interface
  for (const file of fs.readdirSync(new URL('../public/js', import.meta.url), { recursive: true }).filter((f) => f.endsWith('.js'))) {
    const code = read(`public/js/${file}`).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(code, /\.innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML|document\.write|new Function\(|\beval\(/, file);
    if (!['app.js', 'barcode.js'].includes(file)) assert.doesNotMatch(code, /new Worker\(|serviceWorker\.register\(/, file);
  }
});
