// Vérification de mise à jour (Réglages › À propos, Admin) : GET
// /api/admin/update-check. GitHub est toujours simulé : aucun test ne fait de
// vraie demande sur Internet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
// Ligne « Version et mise à jour » : version (lien), statut et bouton
// « Vérifier » pour l'Admin seulement.

test('À propos : Admin à jour, nouvelle version, vérification impossible, en cours, hors ligne', async () => {
  const { aboutVersion } = await import('../public/js/format.js');
  const now = Date.parse('2026-10-16T12:15:00.000Z');
  const ok = (latest) => ({ current: INSTALLED, latest, upToDate: latest === INSTALLED, checkedAt: '2026-10-16T12:00:00.000Z', state: 'ok' });
  const admin = (options) => aboutVersion({ commit: INSTALLED, isAdmin: true, now, ...options });
  const version = { text: '3a1b2c4', commit: INSTALLED };

  assert.deepEqual(admin({ result: ok(INSTALLED) }),
    { version, status: { text: 'À jour · vérifié il y a 15 min' }, help: null, button: true, busy: false });
  assert.deepEqual(admin({ result: ok(NEWER) }), {
    version,
    status: { text: 'Nouvelle version disponible : ', commit: NEWER, link: '9f8e7d6' },
    help: 'Sur le serveur : docker compose pull && docker compose up -d',
    button: true,
    busy: false,
  });
  assert.deepEqual(admin({ result: { state: 'indisponible' } }).status, { text: 'Vérification impossible' });
  assert.deepEqual(admin({ result: { ...ok(NEWER), latest: 'pas-un-commit' } }).status, { text: 'Vérification impossible' });
  // Message d'aide seulement quand une nouvelle version existe
  for (const result of [ok(INSTALLED), { state: 'indisponible' }, null]) assert.equal(admin({ result }).help, null);
  // Vérification en cours : icône qui tourne, bouton désactivé
  const busy = admin({ result: ok(INSTALLED), busy: true });
  assert.deepEqual([busy.status.text, busy.button, busy.busy], ['Vérification…', true, true]);
  assert.equal(admin({ result: null }).status.text, 'Vérification…');
  // Hors ligne
  const offline = admin({ result: ok(NEWER), online: false });
  assert.deepEqual([offline.status.text, offline.help, offline.button], ['Indisponible hors ligne', null, true]);
  assert.deepEqual(aboutVersion({ commit: null, isAdmin: true, online: false }).version, { text: 'indisponible hors ligne' });
});

test('À propos : autre compte, vérification désactivée, développement → la version seule, sans statut ni bouton', async () => {
  const { aboutVersion } = await import('../public/js/format.js');
  const versionOnly = (version) => ({ version, status: null, help: null, button: false, busy: false });
  const version = { text: '3a1b2c4', commit: INSTALLED };
  // Compte non Admin : jamais de statut, même avec une réponse
  assert.deepEqual(aboutVersion({ commit: INSTALLED, isAdmin: false }), versionOnly(version));
  assert.deepEqual(aboutVersion({ commit: INSTALLED, isAdmin: false, online: false }), versionOnly(version));
  // LISTO_UPDATE_CHECK=off
  assert.deepEqual(aboutVersion({ commit: INSTALLED, isAdmin: true, result: { current: INSTALLED, latest: null, upToDate: null, checkedAt: null, state: 'desactive' } }), versionOnly(version));
  // Développement : « non précisée », sans lien ni bouton
  assert.deepEqual(aboutVersion({ commit: 'non précisé', isAdmin: true }), versionOnly({ text: 'non précisée' }));
  assert.deepEqual(aboutVersion({ commit: INSTALLED, isAdmin: true, result: { state: 'developpement' } }).button, false);
});

test('À propos : liens vers GitHub ouverts à part (noopener noreferrer), libellés explicites', () => {
  const source = fs.readFileSync(new URL('../public/js/screens/settings.js', import.meta.url), 'utf8');
  assert.match(source, /const outLink = \(attrs, \.\.\.children\) => h\('a', \{ target: '_blank', rel: 'noopener noreferrer', \.\.\.attrs \}/);
  assert.equal(/h\('a'/.test(source.replace("h('a', { target: '_blank', rel: 'noopener noreferrer', ...attrs }", '')), false, 'tout lien passe par outLink');
  assert.ok(source.includes("'aria-label': `Développeur : ${GITHUB.owner} sur GitHub`"));
  assert.ok(source.includes("'aria-label': 'Projet Listo sur GitHub'"));
  assert.ok(source.includes("'aria-label': 'Vérifier maintenant'"));
  assert.ok(source.includes('ownerUrl') && source.includes('repoUrl'));
  // Styles du kit identiques dans l'application
  const kit = fs.readFileSync(new URL('../design/listo.css', import.meta.url), 'utf8');
  const appCss = fs.readFileSync(new URL('../public/css/listo.css', import.meta.url), 'utf8');
  const section = (css) => css.slice(css.indexOf('/* 16.6 Bloc'), css.indexOf('.about-links__sep'));
  assert.ok(section(appCss).length > 100);
  assert.equal(section(kit), section(appCss));
});
