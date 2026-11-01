// Situations de secours (étape 11) : clé secrets/secret.key perdue puis
// recréée, et mot de passe du dernier Admin oublié (server/admin-secours.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tempDir, createClient, login, ORIGIN, SETUP_CODE } from './helpers.js';
import { openDatabase } from '../server/db.js';
import { loadConfig } from '../server/config.js';
import { createApp } from '../server/app.js';
import { totpCode, totpStep } from '../server/totp.js';
import { openTotpSecret } from '../server/twofactor.js';

const ROOT = new URL('..', import.meta.url).pathname;

// La commande refuse d'être lancée en administrateur (root) : si les tests
// tournent en root, elle est lancée sous un compte ordinaire (comme
// « docker exec -u node »), propriétaire des fichiers de la base
function runAsUser(file, args, { cwd, env }) {
  const asRoot = process.getuid?.() === 0;
  if (asRoot) {
    const dir = path.dirname(env.LISTO_DB_PATH);
    for (const name of fs.readdirSync(dir)) fs.chownSync(path.join(dir, name), 1000, 1000);
    fs.chownSync(dir, 1000, 1000);
    fs.chownSync(path.dirname(dir), 1000, 1000); // dossier temporaire du test
  }
  return promisify(execFile)(file, args, { cwd, env, ...(asRoot ? { uid: 1000, gid: 1000 } : {}) });
}
const run = runAsUser;

// Listo sur une base fichier, avec la clé donnée
async function start(t, dbPath, masterKey) {
  const db = openDatabase(dbPath);
  const logs = [];
  const hasUsers = db.prepare('SELECT COUNT(*) FROM users').pluck().get() > 0;
  const app = createApp({ db, config: { ...loadConfig({}), publicUrl: ORIGIN, dbPath }, masterKey, setupCode: hasUsers ? null : SETUP_CODE, log: (l) => logs.push(l) });
  const server = app.listen(0);
  await once(server, 'listening');
  const stop = () => {
    app.locals.ctx.stop();
    server.close();
    db.close();
  };
  t.after(stop);
  return { base: `http://127.0.0.1:${server.address().port}`, ctx: app.locals.ctx, db, logs, stop };
}

test('clé perdue puis recréée : 2FA refusée sans erreur interne, lien public à recréer, secours possible', async (t) => {
  const dbPath = path.join(tempDir(t), 'data', 'listo.db');
  const oldKey = crypto.randomBytes(32);

  // Avant : Admin avec 2FA active, une liste partagée par lien
  let listo = await start(t, dbPath, oldKey);
  const admin = createClient(listo.base);
  await admin.post('/api/setup', { code: SETUP_CODE, username: 'guillaume', password: 'MotDePasseAdmin!', displayName: 'Guillaume' });
  await admin.post('/api/me/2fa/enable');
  const user = listo.db.prepare('SELECT * FROM users').get();
  const code = totpCode(openTotpSecret(listo.ctx, user), totpStep(Date.now()));
  assert.equal((await admin.post('/api/me/2fa/verify', { code })).status, 200);
  const listId = crypto.randomUUID();
  await admin.post('/api/ops', { ops: [{ id: crypto.randomUUID(), type: 'list.create', listId, name: 'Courses', listType: 'shopping' }] });
  const share = await admin.request('PUT', `/api/lists/${listId}/share`, {});
  const token = share.body.share.url.split('/p/')[1];
  listo.stop();

  // Après : la clé a été perdue, Listo en a créé une nouvelle
  listo = await start(t, dbPath, crypto.randomBytes(32));
  const again = createClient(listo.base);
  const step1 = await login(again, 'guillaume', 'MotDePasseAdmin!');
  assert.equal(step1.status, 200);
  assert.equal(step1.body.twoFactorRequired, true);
  const step2 = await again.post('/api/login/2fa', { code: '123456' });
  assert.equal(step2.status, 401, 'code refusé, pas d\'erreur interne');
  assert.ok(listo.logs.some((line) => line.includes('secret_2fa_illisible')));
  // Le lien public marche toujours pour le visiteur
  assert.equal((await createClient(listo.base).get(`/api/public/${token}`)).status, 200);

  // Secours : mot de passe provisoire et 2FA retirée, par la commande du serveur
  const { stdout } = await run(process.execPath, ['server/admin-secours.js', 'guillaume', '--retirer-2fa'], {
    cwd: ROOT, env: { PATH: process.env.PATH, LISTO_DB_PATH: dbPath },
  });
  const provisional = stdout.match(/^ {4}(\S{16})$/m)[1];
  assert.match(stdout, /double authentification de ce compte est désactivée/);
  const rescued = createClient(listo.base);
  const res = await login(rescued, 'guillaume', provisional);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.mustChangePassword, true, 'à changer tout de suite');
  assert.equal(res.body.user.totpEnabled, false);
  assert.equal(stdout.includes('MotDePasseAdmin!'), false);

  // Le propriétaire voit son lien, sans adresse (illisible), et peut l'arrêter
  await rescued.post('/api/me/password', { currentPassword: provisional, newPassword: 'NouveauMotDePasse!' });
  const shown = await rescued.get(`/api/lists/${listId}/share`);
  assert.equal(shown.status, 200);
  assert.equal(shown.body.share.url, null);
  assert.equal((await rescued.del(`/api/lists/${listId}/share`)).status, 200);
  assert.equal((await createClient(listo.base).get(`/api/public/${token}`)).status, 404);
  const fresh = await rescued.request('PUT', `/api/lists/${listId}/share`, {});
  assert.match(fresh.body.share.url, /\/p\//);
});

test('commande de secours : identifiant inconnu ou mauvaise option refusés', async (t) => {
  const dbPath = path.join(tempDir(t), 'data', 'listo.db');
  openDatabase(dbPath).close();
  const env = { PATH: process.env.PATH, LISTO_DB_PATH: dbPath };
  await assert.rejects(run(process.execPath, ['server/admin-secours.js', 'personne'], { cwd: ROOT, env }), /Aucun compte/);
  await assert.rejects(run(process.execPath, ['server/admin-secours.js', 'x', '--autre'], { cwd: ROOT, env }), /Utilisation/);
});

test('commande de secours : les connexions Claude du compte sont révoquées (migration 17)', async (t) => {
  const dbPath = path.join(tempDir(t), 'data', 'listo.db');
  const db = openDatabase(dbPath);
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 3600 * 1000).toISOString();
  db.prepare("INSERT INTO users (id, username, display_name, password_hash) VALUES (1, 'guillaume', 'Guillaume', 'x')").run();
  db.prepare("INSERT INTO oauth_clients (client_id, kind, redirect_uris, created_at) VALUES ('dcr_x', 'dcr', '[]', ?)").run(now);
  db.prepare(`INSERT INTO oauth_grants (id, user_id, client_id, app_key, client_host, redirect_host, scope, all_lists, created_at)
    VALUES (1, 1, 'dcr_x', 'dcr:claude.ai', 'claude.ai', 'claude.ai', 'lists:read', 1, ?)`).run(now);
  db.prepare("INSERT INTO oauth_tokens (token_hash, grant_id, kind, resource, scope, created_at, expires_at) VALUES ('h', 1, 'access', 'r', 'lists:read', ?, ?)").run(now, later);
  db.close();
  await run(process.execPath, ['server/admin-secours.js', 'guillaume'], { cwd: ROOT, env: { PATH: process.env.PATH, LISTO_DB_PATH: dbPath } });
  const after = openDatabase(dbPath);
  assert.ok(after.prepare('SELECT revoked_at FROM oauth_grants WHERE id = 1').pluck().get(), 'connexion révoquée');
  assert.ok(after.prepare("SELECT revoked_at FROM oauth_tokens WHERE token_hash = 'h'").pluck().get(), 'jeton révoqué');
  after.close();
});
