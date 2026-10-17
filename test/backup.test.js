// Sauvegarde nocturne (étape 11) : copie cohérente et contrôlée, rotation des
// 14 dernières, droits 600, jamais la clé, échec journalisé sans arrêt, et
// restauration réelle d'une copie (comptes et listes retrouvés).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
import Database from 'better-sqlite3';
import { startTestApp, setupAdmin, tempDir, createClient, login, ORIGIN, SETUP_CODE } from './helpers.js';
import { openDatabase } from '../server/db.js';
import { loadConfig } from '../server/config.js';
import { createApp } from '../server/app.js';
import { loadOrCreateKey } from '../server/secrets.js';
import { createBackups, backupName, msUntilNext, BACKUP_KEEP } from '../server/backup.js';

const DAY = 24 * 60 * 60 * 1000;
const uuid = () => crypto.randomUUID();

test('heure de la sauvegarde : la prochaine 3 h 00 (heure locale)', () => {
  const at = (h, m = 0) => new Date(2026, 9, 17, h, m).getTime();
  assert.equal(msUntilNext(at(1)), 2 * 60 * 60 * 1000);
  assert.equal(msUntilNext(at(2, 59)), 60 * 1000);
  assert.equal(msUntilNext(at(3)), DAY, 'à 3 h pile : la nuit suivante');
  assert.equal(msUntilNext(at(14)), 13 * 60 * 60 * 1000);
  assert.equal(backupName(new Date(2026, 9, 7, 3, 0)), 'listo-2026-10-07-0300.db');
});

test('sauvegarde : copie créée, contrôlée, droits 600, données présentes, journal', async (t) => {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const listId = uuid();
  await guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId, name: 'Courses sauvegardées', categoryId: 1 }] });

  const result = app.ctx.backups.run();
  assert.equal(result.ok, true, result.error);
  assert.equal(path.dirname(result.file), app.backupDir);
  assert.equal(fs.statSync(result.file).mode & 0o777, 0o600);
  // La copie s'ouvre (lecture seule) et contient les données
  const copy = new Database(result.file, { readonly: true });
  t.after(() => copy.close());
  assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok');
  assert.equal(copy.prepare('SELECT name FROM lists WHERE id = ?').pluck().get(listId), 'Courses sauvegardées');
  assert.equal(copy.prepare('SELECT username FROM users').pluck().get(), 'guillaume');
  assert.ok(app.logs.some((line) => line.includes('sauvegarde_reussie') && line.includes(path.basename(result.file))));
});

test('rotation : 14 copies gardées, la 15e supprime la plus ancienne (horloge avancée)', async (t) => {
  const app = await startTestApp(t);
  await setupAdmin(app);
  const names = [];
  for (let night = 1; night <= 15; night++) {
    app.clock.now += DAY;
    const result = app.ctx.backups.run();
    assert.equal(result.ok, true);
    names.push(path.basename(result.file));
  }
  const kept = app.ctx.backups.list();
  assert.equal(kept.length, BACKUP_KEEP);
  assert.equal(kept.includes(names[0]), false, 'la plus ancienne est supprimée');
  assert.deepEqual(kept, names.slice(1));
  assert.ok(app.logs.at(-1).includes('supprimees=1'));
});

test('la clé secrets/secret.key n\'est jamais copiée dans les sauvegardes', async (t) => {
  const dir = tempDir(t);
  const { key } = loadOrCreateKey(path.join(dir, 'secrets', 'secret.key'));
  const keyText = key.toString('base64');
  const app = await startTestApp(t, { backupDir: path.join(dir, 'data', 'backups') });
  await setupAdmin(app);
  app.ctx.backups.run();
  const files = fs.readdirSync(app.backupDir);
  assert.ok(files.length > 0);
  assert.ok(files.every((name) => /^listo-[\d-]+\.db$/.test(name)), 'seulement des copies de la base');
  for (const name of files) {
    const content = fs.readFileSync(path.join(app.backupDir, name));
    assert.equal(content.includes(keyText), false);
    assert.equal(content.includes(key), false);
  }
});

test('une copie ratée est journalisée sans arrêter Listo', async (t) => {
  const dir = tempDir(t);
  const blocker = path.join(dir, 'pas-un-dossier');
  fs.writeFileSync(blocker, 'x'); // le dossier des copies ne peut pas être créé
  const logs = [];
  const db = openDatabase(':memory:');
  const backups = createBackups({ db, dir: path.join(blocker, 'backups'), audit: (event, details) => logs.push({ event, details }) });
  const result = backups.run();
  assert.equal(result.ok, false);
  assert.equal(logs[0].event, 'sauvegarde_ratee');
  assert.ok(logs[0].details.raison);
  // Listo continue : la suivante, au bon endroit, réussit
  const ok = createBackups({ db, dir: path.join(dir, 'backups'), audit: () => {} }).run();
  assert.equal(ok.ok, true);
});

test('restauration réelle : arrêter, remplacer listo.db, remettre la clé, redémarrer → comptes et listes retrouvés', async (t) => {
  // Une installation « comme en production » : fichiers data/ et secrets/
  const root = tempDir(t);
  const dbPath = path.join(root, 'data', 'listo.db');
  const keyPath = path.join(root, 'secrets', 'secret.key');
  const config = { ...loadConfig({}), publicUrl: ORIGIN, dbPath, keyPath };
  const start = async () => {
    const db = openDatabase(dbPath);
    const { key } = loadOrCreateKey(keyPath);
    const hasUsers = db.prepare('SELECT COUNT(*) FROM users').pluck().get() > 0;
    const app = createApp({ db, config, masterKey: key, setupCode: hasUsers ? null : SETUP_CODE, log: () => {} });
    const server = app.listen(0);
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const stop = () => {
      app.locals.ctx.stop();
      server.close();
      db.close();
    };
    return { base, ctx: app.locals.ctx, stop };
  };

  // 1. Listo tourne : compte Admin (avec 2FA), une liste ; sauvegarde de la nuit
  let listo = await start();
  const admin = createClient(listo.base);
  await admin.post('/api/setup', { code: SETUP_CODE, username: 'guillaume', password: 'MotDePasseAdmin!', displayName: 'Guillaume' });
  const listId = uuid();
  await admin.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId, name: 'Liste à retrouver', categoryId: 1 }] });
  const enable = await admin.post('/api/me/2fa/enable', { password: 'MotDePasseAdmin!' });
  assert.equal(enable.status, 200);
  const backup = listo.ctx.backups.run();
  assert.equal(backup.ok, true);

  // 2. Après la sauvegarde : la liste est supprimée par erreur
  await admin.post('/api/ops', { ops: [{ id: uuid(), type: 'list.delete', listId }] });
  listo.stop(); // « docker compose stop »

  // 3. Restauration : on remplace listo.db par la copie (et on retire les
  //    fichiers -wal et -shm de l'ancienne base) ; la clé reste en place
  for (const extra of ['-wal', '-shm']) fs.rmSync(`${dbPath}${extra}`, { force: true });
  fs.copyFileSync(backup.file, dbPath);

  // 4. Redémarrage : comptes et listes de la sauvegarde sont là
  listo = await start();
  t.after(() => listo.stop());
  const again = createClient(listo.base);
  const res = await login(again, 'guillaume', 'MotDePasseAdmin!');
  assert.equal(res.status, 200, res.text);
  const lists = (await again.get('/api/lists')).body.lists;
  assert.deepEqual(lists.map((l) => l.name), ['Liste à retrouver']);
  // Le secret 2FA (chiffré) reste lisible avec la même clé : son QR code se refait
  const qr = await fetch(`${listo.base}/api/me/2fa/qr.png`, { headers: { cookie: [...again.jar].map(([n, v]) => `${n}=${v}`).join('; ') } });
  assert.equal(qr.status, 200);
  assert.equal(qr.headers.get('content-type'), 'image/png');
});
