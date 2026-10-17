// En-têtes de sécurité sur tout le site (étape 11) : pages, API, fichiers,
// photos, pages publiques, erreurs 404 et 500. Le test échoue si l'un manque.
// Aussi : rien qui révèle la technique, des erreurs sans trace ni chemin, et
// le cookie de session HttpOnly + Secure + SameSite en production.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, setupAdmin, ORIGIN, SETUP_CODE } from './helpers.js';
import { CONTENT_SECURITY_POLICY } from '../server/app.js';

const uuid = () => crypto.randomUUID();

// Petit JPEG valide (structure seulement)
const u16 = (n) => Buffer.from([n >> 8, n & 0xff]);
const block = (marker, payload) => Buffer.concat([Buffer.from([0xff, marker]), u16(payload.length + 2), payload]);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8]), block(0xdb, Buffer.alloc(65, 1)), block(0xc0, Buffer.from([8, 0, 8, 0, 8, 1, 1, 0x11, 0])),
  block(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0x12, 0x34]), Buffer.from([0xff, 0xd9]),
]);

// Les en-têtes exigés partout
function checkHeaders(res, label) {
  const csp = res.headers.get('content-security-policy');
  assert.equal(csp, CONTENT_SECURITY_POLICY, `${label} : Content-Security-Policy`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff', `${label} : X-Content-Type-Options`);
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer', `${label} : Referrer-Policy`);
  assert.equal(res.headers.get('x-frame-options'), 'DENY', `${label} : X-Frame-Options`);
  // Rien qui révèle la technique ; HSTS est ajouté par Nginx Proxy Manager
  assert.equal(res.headers.get('x-powered-by'), null, `${label} : X-Powered-By`);
  assert.equal(res.headers.get('server'), null, `${label} : Server`);
  assert.equal(res.headers.get('strict-transport-security'), null, `${label} : HSTS doublé`);
}

// Ni trace d'erreur ni chemin de fichier dans un texte de réponse
function checkNoLeak(text, label) {
  for (const leak of [/\bat [\w.<>]+ \(/, /node_modules/, /\/home\//, /\/app\//, /server\/\w+\.js/, /Error:/, /Cannot (GET|POST)/, /Express/i]) {
    assert.doesNotMatch(text, leak, `${label} : « ${leak} » ne doit pas apparaître`);
  }
}

test('la politique de sécurité du contenu est stricte', () => {
  const rules = Object.fromEntries(CONTENT_SECURITY_POLICY.split('; ').map((rule) => [rule.split(' ')[0], rule.split(' ').slice(1).join(' ')]));
  assert.equal(rules['default-src'], "'self'");
  for (const name of ['script-src', 'style-src', 'img-src', 'connect-src', 'font-src', 'worker-src']) assert.equal(rules[name], "'self'", name);
  assert.equal(rules['frame-ancestors'], "'none'");
  assert.equal(rules['object-src'], "'none'");
  assert.equal(rules['base-uri'], "'none'");
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /unsafe-inline|unsafe-eval|blob:|data:|\*|https?:/);
});

test('en-têtes de sécurité sur toutes les routes principales, y compris les erreurs', async (t) => {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const cookie = [...guillaume.jar].map(([n, v]) => `${n}=${v}`).join('; ');
  const listId = uuid();
  const itemId = uuid();
  await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId, name: 'Courses', categoryId: 1 },
    { id: uuid(), type: 'item.create', listId, itemId, name: 'Lait' },
  ] });
  await fetch(`${app.base}/api/items/${itemId}/photo`, { method: 'PUT', body: JPEG, headers: { origin: ORIGIN, cookie, 'content-type': 'image/jpeg' } });
  const share = await guillaume.request('PUT', `/api/lists/${listId}/share`, {});
  const token = share.body.share.url.split('/p/')[1];

  const routes = [
    // [libellé, méthode, adresse, avec session, corps, statut attendu]
    ['page', 'GET', '/', false, undefined, 200],
    ['page index', 'GET', '/index.html', false, undefined, 200],
    ['script', 'GET', '/js/app.js', false, undefined, 200],
    ['style', 'GET', '/css/listo.css', false, undefined, 200],
    ['icône', 'GET', '/icons/icon.svg', false, undefined, 200],
    ['manifeste', 'GET', '/manifest.webmanifest', false, undefined, 200],
    ['service worker', 'GET', '/sw.js', false, undefined, 200],
    ['surveillance', 'GET', '/healthz', false, undefined, 200],
    ['API sans session', 'GET', '/api/me', false, undefined, 401],
    ['API', 'GET', '/api/lists', true, undefined, 200],
    ['API sync', 'GET', '/api/sync', true, undefined, 200],
    ['photo', 'GET', `/api/items/${itemId}/photo`, true, undefined, 200],
    ['page publique', 'GET', `/p/${token}`, false, undefined, 200],
    ['données publiques', 'GET', `/api/public/${token}`, false, undefined, 200],
    ['photo publique', 'GET', `/api/public/${token}/photos/${itemId}`, false, undefined, 200],
    ['lien inconnu', 'GET', `/p/${'A'.repeat(43)}`, false, undefined, 404],
    ['page inconnue', 'GET', '/nimporte/quoi', false, undefined, 404],
    ['fichier inconnu', 'GET', '/js/inconnu.js', false, undefined, 404],
    ['API inconnue', 'GET', '/api/inconnue', true, undefined, 404],
    ['adresse mal formée', 'GET', '/p/%E0%A4%A', false, undefined, 400],
    ['paramètre mal formé', 'GET', '/api/lists/%E0%A4%A', true, undefined, 400],
    ['JSON mal formé', 'POST', '/api/ops', true, '{pas du json', 400],
    ['origine inconnue', 'DELETE', `/api/lists/${listId}/share`, 'sans-origine', undefined, 403],
  ];
  for (const [label, method, url, withSession, body, status] of routes) {
    const headers = {};
    if (withSession === true) Object.assign(headers, { cookie, origin: ORIGIN });
    if (withSession === 'sans-origine') headers.cookie = cookie;
    if (body) headers['content-type'] = 'application/json';
    const res = await fetch(`${app.base}${url}`, { method, headers, body });
    const text = await res.text();
    assert.equal(res.status, status, `${label} (${url})`);
    checkHeaders(res, label);
    if (status >= 400) checkNoLeak(text, label);
  }

  // Pages d'erreur en français, sans détail
  assert.equal(await (await fetch(`${app.base}/nimporte/quoi`)).text(), 'Page introuvable.');
  assert.equal(await (await fetch(`${app.base}/p/%E0%A4%A`)).text(), 'Requête invalide.');

  // Flux temps réel (on lit seulement les en-têtes)
  const controller = new AbortController();
  const events = await fetch(`${app.base}/api/events`, { headers: { cookie, origin: ORIGIN }, signal: controller.signal });
  assert.equal(events.status, 200);
  checkHeaders(events, 'flux temps réel');
  controller.abort();
});

test('erreur inattendue (500) : message neutre, sans trace ni chemin, en-têtes présents', async (t) => {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
  // Panne simulée au cœur d'une route de l'API
  t.mock.method(app.ctx.lists, 'myLists', () => { throw new Error('panne simulée dans /srv/listo/server/lists.js'); });
  const res = await guillaume.get('/api/lists');
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: 'Erreur interne du serveur.' });
  checkHeaders(res, '500');
  checkNoLeak(res.text, '500');
  assert.ok(errors.some((line) => line.includes('panne simulée')), 'le détail va dans les journaux du serveur');
});

test('cookie de session en production : HttpOnly, Secure, SameSite=Lax', async (t) => {
  const app = await startTestApp(t, { config: { production: true } });
  const res = await fetch(`${app.base}/api/setup`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ code: SETUP_CODE, username: 'guillaume', password: 'MotDePasseAdmin!', displayName: 'Guillaume' }),
  });
  assert.equal(res.status, 201);
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('listo_session='));
  assert.match(cookie, /; HttpOnly/i);
  assert.match(cookie, /; Secure/i);
  assert.match(cookie, /; SameSite=Lax/i);
  assert.match(cookie, /; Path=\//);
});
