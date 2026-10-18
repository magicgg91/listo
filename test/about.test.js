// Réglages › À propos : la route GET /api/about donne le commit de l'image
// installée, aux comptes connectés seulement. Une valeur invalide n'est
// jamais renvoyée.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, setupAdmin } from './helpers.js';
import { validCommit, loadConfig } from '../server/config.js';

const COMMIT = '3a1b2c4d5e6f708192a3b4c5d6e7f8091a2b3c4d';

test('commit : seulement 40 caractères hexadécimaux, sinon rien', () => {
  assert.equal(validCommit(COMMIT), COMMIT);
  for (const bad of [undefined, null, '', '3a1b2c4', `${COMMIT}0`, COMMIT.toUpperCase(), `${COMMIT.slice(0, 39)}g`,
    '<script>alert(1)</script>'.padEnd(40, 'a'), `${COMMIT.slice(0, 39)}\n`, ` ${COMMIT.slice(1)}`]) {
    assert.equal(validCommit(bad), null, JSON.stringify(bad));
  }
  assert.equal(loadConfig({ LISTO_COMMIT: COMMIT }).commit, COMMIT);
  assert.equal(loadConfig({}).commit, null);
  assert.equal(loadConfig({ LISTO_COMMIT: 'n importe quoi' }).commit, null);
});

test('GET /api/about : refusé sans connexion, jamais en cache, commit valide seulement', async (t) => {
  const app = await startTestApp(t, { config: { commit: COMMIT } });
  const visitor = app.client();
  assert.equal((await visitor.get('/api/about')).status, 401);
  const admin = await setupAdmin(app);
  const res = await admin.get('/api/about');
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), ['commit', 'build'], 'le commit et l\'identifiant opaque, rien d\'autre');
  assert.equal(res.body.commit, COMMIT);
  assert.match(res.body.build, /^[0-9a-f]{16}$/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  // Ni la surveillance ni le lien public ne donnent la version
  assert.doesNotMatch(await (await fetch(`${app.base}/healthz`)).text(), /3a1b2c4/);
});

test('GET /api/about : « non précisé » quand la variable est absente ou invalide', async (t) => {
  for (const env of [{}, { LISTO_COMMIT: 'abc123' }, { LISTO_COMMIT: `${COMMIT};rm -rf /` }]) {
    const app = await startTestApp(t, { config: { commit: loadConfig(env).commit } });
    const admin = await setupAdmin(app);
    assert.deepEqual((await admin.get('/api/about')).body, { commit: 'non précisé', build: null }, JSON.stringify(env));
  }
});
