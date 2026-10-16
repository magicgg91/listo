// Tests du journal de sécurité écrit dans un fichier (data/journal.log).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createJournalFile } from '../server/audit.js';
import { startTestApp, setupAdmin, addUser, login, tempDir } from './helpers.js';

const MEGABYTE = 1024 * 1024;
const mode = (file) => fs.statSync(file).mode & 0o777;

test('le fichier du journal est créé avec les droits 600', async (t) => {
  const file = path.join(tempDir(t), 'journal.log');
  const app = await startTestApp(t, { journalFile: createJournalFile({ path: file }) });
  await setupAdmin(app);
  assert.equal(mode(file), 0o600);
  const content = fs.readFileSync(file, 'utf8');
  assert.match(content, /\[journal\] creation_admin utilisateur="guillaume"/);
  // Les mêmes lignes partent aussi vers docker logs
  assert.equal(content, app.logs.map((line) => `${line}\n`).join(''));
});

test('un fichier existant avec de mauvais droits repasse en 600', (t) => {
  const file = path.join(tempDir(t), 'journal.log');
  fs.writeFileSync(file, 'ancienne ligne\n', { mode: 0o644 });
  createJournalFile({ path: file })('nouvelle ligne');
  assert.equal(mode(file), 0o600);
  assert.equal(fs.readFileSync(file, 'utf8'), 'ancienne ligne\nnouvelle ligne\n');
});

test('rotation à 1 Mo : le fichier ne dépasse jamais la taille limite', (t) => {
  const file = path.join(tempDir(t), 'journal.log');
  const write = createJournalFile({ path: file });
  const line = 'x'.repeat(99); // 100 octets avec le retour à la ligne
  for (let i = 0; i < 25000; i++) write(line); // 2,5 Mo au total

  assert.ok(fs.statSync(file).size <= MEGABYTE);
  for (const old of [`${file}.1`, `${file}.2`]) {
    const size = fs.statSync(old).size;
    assert.ok(size <= MEGABYTE, `${old} trop gros`);
    assert.ok(size > MEGABYTE - 100, `${old} a tourné avant la limite`);
    assert.equal(mode(old), 0o600);
  }
  assert.ok(!fs.existsSync(`${file}.3`));
});

test('rotation : 5 anciens fichiers conservés, les plus anciens supprimés', (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'journal.log');
  const write = createJournalFile({ path: file, maxBytes: 100 }); // petite limite pour le test
  // Lignes de 10 octets : 10 lignes par fichier ; 100 lignes = 10 fichiers
  for (let i = 0; i < 100; i++) write(`ligne ${String(i).padStart(3, '0')}`);

  assert.deepEqual(fs.readdirSync(dir).sort(), [
    'journal.log', 'journal.log.1', 'journal.log.2', 'journal.log.3', 'journal.log.4', 'journal.log.5',
  ]);
  // journal.log contient les lignes les plus récentes, .5 les plus anciennes gardées
  assert.match(fs.readFileSync(file, 'utf8'), /ligne 099\n$/);
  assert.match(fs.readFileSync(`${file}.1`, 'utf8'), /^ligne 080\n/);
  assert.match(fs.readFileSync(`${file}.5`, 'utf8'), /^ligne 040\n/);
  const everything = fs.readdirSync(dir).map((name) => fs.readFileSync(path.join(dir, name), 'utf8')).join('');
  assert.ok(!everything.includes('ligne 039'), 'les lignes les plus anciennes sont supprimées');
  for (const name of fs.readdirSync(dir)) {
    assert.ok(fs.statSync(path.join(dir, name)).size <= 100);
    assert.equal(mode(path.join(dir, name)), 0o600);
  }
});

test("une erreur d'écriture ne casse pas la connexion, et elle est signalée une fois", async (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'absent', 'journal.log'); // dossier inexistant : écriture impossible
  const reports = [];
  const app = await startTestApp(t, { journalFile: createJournalFile({ path: file, report: (m) => reports.push(m) }) });

  await setupAdmin(app);
  await addUser(app.db, { username: 'marie', password: 'MotDePasseMarie!' });
  assert.equal((await login(app.client(), 'marie', 'Mauvais!Mauvais!')).status, 401);
  const res = await login(app.client(), 'marie', 'MotDePasseMarie!');
  assert.equal(res.status, 200, 'la connexion fonctionne malgré le journal en panne');

  assert.equal(reports.length, 1, 'une seule alerte tant que le problème dure');
  assert.match(reports[0], /impossible d'écrire.*ENOENT/);
  assert.match(app.logs.join('\n'), /connexion_reussie/, 'le journal reste dans docker logs');

  // Le problème est réparé : l'écriture reprend et c'est signalé
  fs.mkdirSync(path.dirname(file));
  await login(app.client(), 'marie', 'MotDePasseMarie!');
  assert.match(reports[1], /rétablie/);
  assert.match(fs.readFileSync(file, 'utf8'), /connexion_reussie/);
});

test("un journal impossible à écrire (dossier à la place du fichier) n'arrête rien", async (t) => {
  const file = path.join(tempDir(t), 'journal.log');
  fs.mkdirSync(file); // un dossier porte le nom du fichier
  const reports = [];
  const app = await startTestApp(t, { journalFile: createJournalFile({ path: file, report: (m) => reports.push(m) }) });
  const admin = await setupAdmin(app);
  assert.equal((await admin.get('/api/me')).status, 200);
  assert.equal(reports.length, 1);
});
