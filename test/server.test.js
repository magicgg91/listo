// Tests du serveur web : route /healthz et démarrage complet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { openDatabase } from '../server/db.js';
import { tempDir } from './helpers.js';

// Démarre l'application sur un port libre et renvoie son adresse
async function listen(t, db) {
  const server = createApp({ db }).listen(0);
  await once(server, 'listening');
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

test('/healthz répond « ok », sans donnée et sans cache', async (t) => {
  const url = await listen(t, openDatabase(':memory:'));
  const res = await fetch(`${url}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('/healthz signale une erreur si la base ne répond plus', async (t) => {
  const db = openDatabase(':memory:');
  const url = await listen(t, db);
  db.close();
  const res = await fetch(`${url}/healthz`);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { status: 'error' });
});

test("la page d'accueil est servie", async (t) => {
  const url = await listen(t, openDatabase(':memory:'));
  const res = await fetch(url);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Listo/);
});

// Critère d'acceptation de l'étape 1, hors Docker : le serveur démarre,
// /healthz répond et la base apparaît dans le dossier data.
test('démarrage complet : base et clé créées, /healthz répond, arrêt propre', async (t) => {
  const dir = tempDir(t);
  const child = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env,
      PORT: '0',
      LISTO_DB_PATH: path.join(dir, 'data', 'listo.db'),
      LISTO_KEY_PATH: path.join(dir, 'secrets', 'secret.key'),
    },
  });
  t.after(() => child.kill());

  // Attendre la ligne « démarré sur le port N » dans les journaux
  let output = '';
  const port = await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/démarré sur le port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.on('exit', () => reject(new Error(`Le serveur s'est arrêté :\n${output}`)));
  });

  const res = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(res.status, 200);
  assert.ok(fs.existsSync(path.join(dir, 'data', 'listo.db')), 'base absente de data/');
  assert.ok(fs.existsSync(path.join(dir, 'secrets', 'secret.key')), 'clé absente de secrets/');
  assert.match(output, /Clé de chiffrement créée/);

  // docker stop envoie SIGTERM : Listo doit s'arrêter proprement (code 0)
  child.kill('SIGTERM');
  const [code] = await once(child, 'exit');
  assert.equal(code, 0);
});
