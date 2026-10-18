// En-têtes de sécurité sur tout le site (étape 11) : pages, API, fichiers,
// photos, pages publiques, erreurs 404 et 500. Le test échoue si l'un manque.
// Aussi : rien qui révèle la technique, des erreurs sans trace ni chemin, et
// le cookie de session HttpOnly + Secure + SameSite en production.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, setupAdmin, ORIGIN, SETUP_CODE } from './helpers.js';
import { CONTENT_SECURITY_POLICY, APP_CONTENT_SECURITY_POLICY, PERMISSIONS_POLICY } from '../server/app.js';
import { totpCode, totpStep } from '../server/totp.js';
import { openTotpSecret } from '../server/twofactor.js';

const uuid = () => crypto.randomUUID();

// Petit JPEG valide (structure seulement)
const u16 = (n) => Buffer.from([n >> 8, n & 0xff]);
const block = (marker, payload) => Buffer.concat([Buffer.from([0xff, marker]), u16(payload.length + 2), payload]);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8]), block(0xdb, Buffer.alloc(65, 1)), block(0xc0, Buffer.from([8, 0, 8, 0, 8, 1, 1, 0x11, 0])),
  block(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0x12, 0x34]), Buffer.from([0xff, 0xd9]),
]);

// Les en-têtes exigés partout. CSP : politique stricte pour le lien public
// (/p/…, /api/public/…), la même avec 'wasm-unsafe-eval' pour l'application
// (lecteur de codes-barres du mode scan)
function checkHeaders(res, label, url = '/') {
  const csp = res.headers.get('content-security-policy');
  const publicLink = /^\/(p|api\/public)(\/|$)/.test(url);
  assert.equal(csp, publicLink ? CONTENT_SECURITY_POLICY : APP_CONTENT_SECURITY_POLICY, `${label} : Content-Security-Policy`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff', `${label} : X-Content-Type-Options`);
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer', `${label} : Referrer-Policy`);
  assert.equal(res.headers.get('x-frame-options'), 'DENY', `${label} : X-Frame-Options`);
  assert.equal(res.headers.get('permissions-policy'), PERMISSIONS_POLICY, `${label} : Permissions-Policy`);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow', `${label} : X-Robots-Tag`);
  assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin', `${label} : Cross-Origin-Opener-Policy`);
  assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin', `${label} : Cross-Origin-Resource-Policy`);
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

test("la politique de l'application ajoute seulement 'wasm-unsafe-eval' (jamais 'unsafe-eval')", () => {
  assert.equal(APP_CONTENT_SECURITY_POLICY, CONTENT_SECURITY_POLICY.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'"));
  const rules = Object.fromEntries(APP_CONTENT_SECURITY_POLICY.split('; ').map((rule) => [rule.split(' ')[0], rule.split(' ').slice(1).join(' ')]));
  assert.equal(rules['script-src'], "'self' 'wasm-unsafe-eval'");
  // Le lecteur tourne dans un worker venu de Listo lui-même
  assert.equal(rules['worker-src'], "'self'");
  assert.equal(rules['connect-src'], "'self'");
  assert.doesNotMatch(APP_CONTENT_SECURITY_POLICY, /'unsafe-eval'|unsafe-inline|blob:|data:|\*|https?:/);
});

test('Permissions-Policy : fonctions inutiles interdites, appareil photo laissé libre', () => {
  for (const feature of ['geolocation', 'microphone', 'payment', 'usb']) assert.match(PERMISSIONS_POLICY, new RegExp(`(^|, )${feature}=\\(\\)`));
  assert.doesNotMatch(PERMISSIONS_POLICY, /camera/, 'la prise de photo doit rester possible');
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
    checkHeaders(res, label, url);
    if (status >= 400) checkNoLeak(text, label);
  }

  // Page d'accueil : consigne « noindex » aussi dans le HTML ; pas de
  // robots.txt (il empêcherait les moteurs de lire cette consigne)
  assert.match(await (await fetch(`${app.base}/`)).text(), /<meta name="robots" content="noindex, nofollow">/);
  assert.equal((await fetch(`${app.base}/robots.txt`)).status, 404);

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

// Cookies de connexion en production : préfixe __Host- (Secure, Path=/, sans
// domaine), HttpOnly, SameSite ; effacés à la déconnexion ; l'ancien nom
// n'ouvre plus de session. En développement, noms inchangés.
const setCookie = (res, name) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
const send = (app, method, url, cookie, body) => fetch(`${app.base}${url}`, {
  method,
  headers: { origin: ORIGIN, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: body && JSON.stringify(body),
});

test('production : cookie de session __Host-listo_session (HttpOnly, Secure, SameSite=Lax, Path=/), effacé à la déconnexion', async (t) => {
  const app = await startTestApp(t, { config: { production: true } });
  const res = await send(app, 'POST', '/api/setup', null, { code: SETUP_CODE, username: 'guillaume', password: 'MotDePasseAdmin!', displayName: 'Guillaume' });
  assert.equal(res.status, 201);
  assert.equal(setCookie(res, 'listo_session'), undefined, 'plus de cookie sans préfixe');
  const cookie = setCookie(res, '__Host-listo_session');
  assert.match(cookie, /; HttpOnly/i);
  assert.match(cookie, /; Secure/i);
  assert.match(cookie, /; SameSite=Lax/i);
  assert.match(cookie, /; Path=\/(;|$)/);
  assert.doesNotMatch(cookie, /Domain=/i, '__Host- interdit Domain');
  const session = cookie.split(';')[0];
  const token = session.split('=')[1];
  assert.equal((await send(app, 'GET', '/api/me', session)).status, 200);

  // L'ancien nom n'ouvre plus de session
  assert.equal((await send(app, 'GET', '/api/me', `listo_session=${token}`)).status, 401);

  // Déconnexion : le cookie est effacé (même nom, même chemin)
  const out = await send(app, 'POST', '/api/logout', session);
  const cleared = setCookie(out, '__Host-listo_session');
  assert.match(cleared, /Expires=Thu, 01 Jan 1970/);
  assert.match(cleared, /; Path=\/(;|$)/);
  assert.match(cleared, /; Secure/i);
  assert.equal((await send(app, 'GET', '/api/me', session)).status, 401);
});

test('production : cookie 2FA en attente __Host-listo_2fa (HttpOnly, Secure, SameSite=Strict, Path=/), effacé après le code', async (t) => {
  const app = await startTestApp(t, { config: { production: true } });
  const setup = await send(app, 'POST', '/api/setup', null, { code: SETUP_CODE, username: 'guillaume', password: 'MotDePasseAdmin!', displayName: 'Guillaume' });
  const session = setCookie(setup, '__Host-listo_session').split(';')[0];
  await send(app, 'POST', '/api/me/2fa/enable', session);
  const user = app.db.prepare('SELECT * FROM users').get();
  const code = () => totpCode(openTotpSecret(app.ctx, app.db.prepare('SELECT * FROM users').get()), totpStep(app.clock.now));
  assert.equal((await send(app, 'POST', '/api/me/2fa/verify', session, { code: code() })).status, 200);
  app.clock.now += 30 * 1000;

  const step1 = await send(app, 'POST', '/api/login', null, { username: user.username, password: 'MotDePasseAdmin!' });
  assert.equal(step1.status, 200);
  const pending = setCookie(step1, '__Host-listo_2fa');
  assert.ok(pending, 'cookie 2FA préfixé');
  assert.equal(setCookie(step1, 'listo_2fa'), undefined);
  assert.match(pending, /; HttpOnly/i);
  assert.match(pending, /; Secure/i);
  assert.match(pending, /; SameSite=Strict/i);
  assert.match(pending, /; Path=\/(;|$)/);
  assert.doesNotMatch(pending, /Domain=/i);

  // Ancien nom : refusé
  const token = pending.split(';')[0].split('=')[1];
  assert.equal((await send(app, 'POST', '/api/login/2fa', `listo_2fa=${token}`, { code: code() })).status, 401);
  // Bon nom : session ouverte, cookie 2FA effacé
  const step2 = await send(app, 'POST', '/api/login/2fa', pending.split(';')[0], { code: code() });
  assert.equal(step2.status, 200);
  assert.ok(setCookie(step2, '__Host-listo_session'));
  assert.match(setCookie(step2, '__Host-listo_2fa'), /Expires=Thu, 01 Jan 1970/);
});

test('développement (http) : noms de cookies inchangés, sans préfixe', async (t) => {
  const app = await startTestApp(t);
  const res = await send(app, 'POST', '/api/setup', null, { code: SETUP_CODE, username: 'guillaume', password: 'MotDePasseAdmin!', displayName: 'Guillaume' });
  assert.ok(setCookie(res, 'listo_session'));
  assert.equal(setCookie(res, '__Host-listo_session'), undefined);
  assert.doesNotMatch(setCookie(res, 'listo_session'), /; Secure/i, 'pas de Secure en http');
});
