// Le vrai processus Listo (server/index.js), lancé comme dans Docker
// (étape 11) : refus de démarrer en production sans https, et arrêt propre
// sur SIGTERM (« docker compose up -d » d'une mise à jour, « docker stop »).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import Database from 'better-sqlite3';
import { tempDir } from './helpers.js';
import { configProblem, loadConfig } from '../server/config.js';

const ROOT = new URL('..', import.meta.url).pathname;

// Lance Listo avec des dossiers data/ et secrets/ temporaires
function launch(t, env) {
  const dir = tempDir(t);
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH,
      PORT: '0',
      LISTO_DB_PATH: path.join(dir, 'data', 'listo.db'),
      LISTO_KEY_PATH: path.join(dir, 'secrets', 'secret.key'),
      ...env,
    },
  });
  const out = { stdout: '', stderr: '' };
  child.stdout.on('data', (d) => { out.stdout += d; });
  child.stderr.on('data', (d) => { out.stderr += d; });
  t.after(() => child.kill('SIGKILL'));
  const exited = once(child, 'exit');
  const started = new Promise((resolve) => {
    const timer = setInterval(() => {
      const port = out.stdout.match(/démarré sur le port (\d+)/)?.[1];
      if (port) {
        clearInterval(timer);
        resolve(`http://127.0.0.1:${port}`);
      }
    }, 20);
    exited.then(() => clearInterval(timer));
  });
  return { child, out, dir, exited, started };
}

test('configuration : en production, LISTO_PUBLIC_URL doit être en https', () => {
  const config = (env) => loadConfig({ NODE_ENV: 'production', ...env });
  assert.match(configProblem(config({ LISTO_PUBLIC_URL: 'http://listo.exemple.fr' })), /doit commencer par https:\/\//);
  assert.match(configProblem(config({})), /https/, 'valeur par défaut (http://localhost) refusée en production');
  assert.match(configProblem(config({ LISTO_PUBLIC_URL: 'listo.exemple.fr' })), /pas une adresse valide/);
  assert.equal(configProblem(config({ LISTO_PUBLIC_URL: 'https://listo.exemple.fr' })), null);
  assert.equal(configProblem(loadConfig({ LISTO_PUBLIC_URL: 'http://localhost:3000' })), null, 'http accepté hors production');
  assert.match(configProblem(loadConfig({ PORT: 'abc' })), /PORT invalide/);
});

test('production sans https : Listo refuse de démarrer, avec un message clair', async (t) => {
  const listo = launch(t, { NODE_ENV: 'production', LISTO_PUBLIC_URL: 'http://listo.exemple.fr' });
  const [code] = await listo.exited;
  assert.equal(code, 1);
  assert.match(listo.out.stderr, /Listo ne démarre pas : En production, LISTO_PUBLIC_URL doit commencer par https:\/\//);
  assert.doesNotMatch(listo.out.stderr, /\bat .*\.js:\d+/, 'pas de trace technique');
});

test('arrêt propre sur SIGTERM : flux temps réel fermés, base fermée intacte, sortie 0', async (t) => {
  const listo = launch(t, { NODE_ENV: 'production', LISTO_PUBLIC_URL: 'https://listo.exemple.fr' });
  const base = await listo.started;
  const origin = 'https://listo.exemple.fr';
  const code = listo.out.stdout.match(/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/)[0];
  assert.match(listo.out.stdout, /Sauvegardes nocturnes : .*backups/);

  // Création de l'Admin et d'une liste, puis un flux temps réel ouvert
  const setup = await fetch(`${base}/api/setup`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ code, username: 'guillaume', password: 'MotDePasseAdmin!', displayName: 'Guillaume' }),
  });
  assert.equal(setup.status, 201);
  const cookie = setup.headers.getSetCookie()[0].split(';')[0];
  await fetch(`${base}/api/ops`, {
    method: 'POST',
    headers: { origin, cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ ops: [{ id: crypto.randomUUID(), type: 'list.create', listId: crypto.randomUUID(), name: 'Avant arrêt', listType: 'shopping' }] }),
  });
  const events = await fetch(`${base}/api/events`, { headers: { cookie, origin } });
  assert.equal(events.status, 200);
  const reader = events.body.getReader();
  await reader.read(); // premier message reçu : le flux est ouvert

  // SIGTERM : Listo s'arrête seul, vite, proprement
  const begin = Date.now();
  listo.child.kill('SIGTERM');
  const [exitCode] = await listo.exited;
  assert.equal(exitCode, 0);
  assert.ok(Date.now() - begin < 4000, 'arrêt sans attendre le délai de secours');
  assert.match(listo.out.stdout, /Signal SIGTERM reçu : arrêt de Listo\./);
  assert.match(listo.out.stdout, /Base fermée\. Listo est arrêté\./);
  // Le flux temps réel a été terminé
  let done = false;
  while (!done) ({ done } = await reader.read().catch(() => ({ done: true })));

  // La base est intacte et contient la liste
  const db = new Database(path.join(listo.dir, 'data', 'listo.db'), { readonly: true });
  t.after(() => db.close());
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  assert.equal(db.prepare('SELECT name FROM lists').pluck().get(), 'Avant arrêt');
});
