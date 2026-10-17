// Vérification de mise à jour (Réglages › À propos, Admin) : GET
// /api/admin/update-check. GitHub est toujours simulé : aucun test ne fait de
// vraie demande sur Internet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { loadConfig } from '../server/config.js';
import { createUpdateCheck, fetchGithub, latestCommitFrom, RUNS_PATH, CACHE_MS, FORCE_MS } from '../server/update-check.js';

const INSTALLED = '3a1b2c4d5e6f708192a3b4c5d6e7f8091a2b3c4d';
const NEWER = '9f8e7d6c5b4a39281706f5e4d3c2b1a098765432';

// Réponse de GitHub telle qu'elle arrive (réduite aux champs utiles)
const runs = (sha, extra = {}) => ({ total_count: 1, workflow_runs: [{ head_sha: sha, head_branch: 'main', conclusion: 'success', name: 'Image Docker', ...extra }] });

// Faux GitHub : compte les demandes et renvoie ce que le test a prévu
function fakeGithub(reply) {
  const calls = [];
  const request = async (path) => {
    calls.push(path);
    return typeof reply === 'function' ? reply() : reply;
  };
  return { calls, request };
}

async function adminApp(t, { reply = runs(NEWER), config = {} } = {}) {
  const github = fakeGithub(reply);
  const app = await startTestApp(t, { config: { commit: INSTALLED, ...config }, githubRequest: github.request });
  const admin = await setupAdmin(app);
  return { app, admin, github, check: (force) => admin.get(`/api/admin/update-check${force ? '?force=1' : ''}`) };
}

test('update-check : refusé sans connexion (401) et aux comptes non Admin (403)', async (t) => {
  const { app, github } = await adminApp(t);
  assert.equal((await app.client().get('/api/admin/update-check')).status, 401);
  await addUser(app.db, { username: 'marie', password: 'MotDePasse-marie' });
  const marie = app.client();
  await login(marie, 'marie', 'MotDePasse-marie');
  assert.equal((await marie.get('/api/admin/update-check')).status, 403);
  assert.equal((await marie.get('/api/admin/update-check?force=1')).status, 403);
  assert.equal(github.calls.length, 0, 'aucune demande à GitHub pour eux');
});

test('update-check : nouvelle version disponible, puis à jour ; cinq champs seulement, jamais en cache', async (t) => {
  let latest = NEWER;
  const { app, check, github } = await adminApp(t, { reply: () => runs(latest) });
  const res = await check();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(res.body, { current: INSTALLED, latest: NEWER, upToDate: false, checkedAt: '2026-10-16T12:00:00.000Z', state: 'ok' });
  assert.deepEqual(github.calls, [RUNS_PATH]);
  assert.equal(RUNS_PATH, '/repos/magicgg91/listo/actions/workflows/docker.yml/runs?branch=main&status=success&per_page=1');

  latest = INSTALLED;
  app.clock.now += CACHE_MS;
  const after = await check();
  assert.deepEqual(after.body, { current: INSTALLED, latest: INSTALLED, upToDate: true, checkedAt: '2026-10-16T13:00:00.000Z', state: 'ok' });
});

test('update-check : une seule demande à GitHub par heure, quel que soit le nombre de visites', async (t) => {
  const { app, check, github } = await adminApp(t);
  await Promise.all([check(), check(), check()]); // visites simultanées
  for (let i = 0; i < 5; i++) {
    app.clock.now += 11 * 60 * 1000; // 55 minutes en tout
    assert.equal((await check()).body.state, 'ok');
  }
  assert.equal(github.calls.length, 1);
  app.clock.now += 5 * 60 * 1000; // une heure après la demande
  await check();
  assert.equal(github.calls.length, 2);
});

test('update-check : « Vérifier maintenant » force une demande, une fois par minute au plus', async (t) => {
  const { app, check, github } = await adminApp(t);
  await check();
  await check(true);
  await check(true);
  assert.equal(github.calls.length, 1, 'moins d\'une minute : la réponse gardée');
  app.clock.now += FORCE_MS;
  const res = await check(true);
  assert.equal(github.calls.length, 2);
  assert.equal(res.body.checkedAt, '2026-10-16T12:01:00.000Z');
  await check(true);
  await check();
  assert.equal(github.calls.length, 2);
});

test('update-check : pannes et réponses inattendues → « indisponible », jamais une erreur', async (t) => {
  const cases = [
    ['commit invalide (trop court)', () => runs('3a1b2c4')],
    ['commit invalide (majuscules)', () => runs(NEWER.toUpperCase())],
    ['commit invalide (texte injecté)', () => runs(`<img src=x onerror=alert(1)>${NEWER}`)],
    ['aucun passage', () => ({ total_count: 0, workflow_runs: [] })],
    ['passage en échec', () => runs(NEWER, { conclusion: 'failure' })],
    ['autre branche', () => runs(NEWER, { head_branch: 'dev' })],
    ['réponse inattendue', () => ({ message: 'Not Found' })],
    ['réponse vide', () => null],
    ['erreur réseau', () => { throw new Error('getaddrinfo ENOTFOUND api.github.com'); }],
    ['délai dépassé', () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }],
  ];
  for (const [name, reply] of cases) {
    const { check } = await adminApp(t, { reply });
    const res = await check();
    assert.equal(res.status, 200, name);
    assert.deepEqual(res.body, { current: INSTALLED, latest: null, upToDate: null, checkedAt: '2026-10-16T12:00:00.000Z', state: 'indisponible' }, name);
  }
});

test('update-check : une panne laisse une ligne discrète dans les journaux, sans détail sensible', async () => {
  const logs = [];
  const updates = createUpdateCheck({ config: { commit: INSTALLED, updateCheck: true }, now: () => 0, request: async () => { throw new Error('réseau coupé'); }, log: (line) => logs.push(line) });
  assert.equal((await updates.status()).state, 'indisponible');
  assert.deepEqual(logs, ['Vérification de mise à jour impossible : réseau coupé']);
});

test('update-check : une panne n\'entraîne aucune nouvelle tentative automatique (gardée une heure)', async (t) => {
  const { app, check, github } = await adminApp(t, { reply: () => { throw new Error('réseau coupé'); } });
  for (let i = 0; i < 4; i++) {
    assert.equal((await check()).body.state, 'indisponible');
    app.clock.now += 5 * 60 * 1000;
  }
  assert.equal(github.calls.length, 1);
});

test('update-check : LISTO_UPDATE_CHECK=off → aucune demande à GitHub', async (t) => {
  assert.equal(loadConfig({}).updateCheck, true, 'activée par défaut');
  assert.equal(loadConfig({ LISTO_UPDATE_CHECK: 'off' }).updateCheck, false);
  assert.equal(loadConfig({ LISTO_UPDATE_CHECK: ' OFF ' }).updateCheck, false);
  assert.equal(loadConfig({ LISTO_UPDATE_CHECK: 'on' }).updateCheck, true);
  const { check, github } = await adminApp(t, { config: { updateCheck: false } });
  assert.deepEqual((await check()).body, { current: INSTALLED, latest: null, upToDate: null, checkedAt: null, state: 'desactive' });
  assert.deepEqual((await check(true)).body.state, 'desactive');
  assert.equal(github.calls.length, 0);
});

test('update-check : commit installé « non précisé » → « developpement », aucune demande', async (t) => {
  const { check, github } = await adminApp(t, { config: { commit: null } });
  assert.deepEqual((await check(true)).body, { current: null, latest: null, upToDate: null, checkedAt: null, state: 'developpement' });
  assert.equal(github.calls.length, 0);
});

// --- La demande elle-même (fetchGithub), avec un faux fetch ---

// Faux fetch : note l'adresse et les options, renvoie la réponse prévue
function fakeFetch(makeResponse) {
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push({ url, options });
    return makeResponse(options);
  };
  return { seen, fetchImpl };
}

test('fetchGithub : api.github.com seulement, User-Agent « Listo », sans jeton, redirections non suivies', async () => {
  const { seen, fetchImpl } = fakeFetch(() => Response.json(runs(NEWER)));
  const data = await fetchGithub(RUNS_PATH, { fetchImpl });
  assert.equal(latestCommitFrom(data), NEWER);
  assert.equal(seen[0].url, `https://api.github.com${RUNS_PATH}`);
  assert.equal(seen[0].options.redirect, 'manual');
  assert.equal(seen[0].options.headers['User-Agent'], 'Listo');
  assert.equal(Object.keys(seen[0].options.headers).some((name) => /authorization|token/i.test(name)), false);
  assert.ok(seen[0].options.signal instanceof AbortSignal);
});

test('fetchGithub : redirection, code d\'erreur, réponse trop grande ou mal formée, délai → erreur', async () => {
  const fails = async (makeResponse, options = {}) => assert.rejects(fetchGithub(RUNS_PATH, { fetchImpl: fakeFetch(makeResponse).fetchImpl, ...options }));
  await fails(() => new Response(null, { status: 302, headers: { location: 'https://exemple.test/' } }));
  await fails(() => new Response(null, { status: 301, headers: { location: 'https://api.github.com/autre' } }));
  await fails(() => new Response('{}', { status: 403 }));
  await fails(() => new Response('{}', { status: 500 }));
  await fails(() => new Response('pas du JSON', { status: 200 }));
  await fails(() => new Response(JSON.stringify({ x: 'a'.repeat(300 * 1024) }), { status: 200 }));
  await fails(() => new Response('{}', { status: 200, headers: { 'content-length': String(10 * 1024 * 1024) } }));
  // Réponse arrivée d'ailleurs (adresse finale différente)
  await fails(() => {
    const res = Response.json(runs(NEWER));
    Object.defineProperty(res, 'url', { value: 'https://exemple.test/runs' });
    return res;
  });
  // Délai : GitHub ne répond pas, la demande est abandonnée
  await fails((options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason));
  }), { timeoutMs: 30 });
});

// --- Affichage dans Réglages › À propos (public/js/format.js) ---

test('ligne « Mise à jour » : À jour, nouvelle version, impossible, hors ligne, rien si désactivée', async () => {
  const { updateCheckLine } = await import('../public/js/format.js');
  const ok = (latest) => ({ current: INSTALLED, latest, upToDate: latest === INSTALLED, checkedAt: '2026-10-16T12:00:00.000Z', state: 'ok' });
  assert.deepEqual(updateCheckLine(ok(INSTALLED)), { icon: 'check', title: 'Mise à jour', sub: 'À jour' });
  assert.deepEqual(updateCheckLine(ok(NEWER)), {
    icon: 'alert',
    title: 'Nouvelle version disponible : 9f8e7d6',
    sub: 'Sur le serveur : docker compose pull && docker compose up -d',
    commit: NEWER,
  });
  assert.equal(updateCheckLine({ state: 'indisponible' }).sub, 'Vérification impossible');
  assert.equal(updateCheckLine({ ...ok(NEWER), latest: 'pas-un-commit' }).sub, 'Vérification impossible');
  assert.equal(updateCheckLine(ok(NEWER), { online: false }).sub, 'Indisponible hors ligne');
  assert.equal(updateCheckLine(null).sub, 'Vérification…');
  assert.equal(updateCheckLine({ state: 'desactive' }), null);
  assert.equal(updateCheckLine({ state: 'developpement' }), null);
});
