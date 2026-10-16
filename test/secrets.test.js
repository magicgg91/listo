// Tests de la clé de chiffrement des secrets 2FA.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadOrCreateKey } from '../server/secrets.js';
import { tempDir } from './helpers.js';

test('la clé est créée au premier démarrage, en droits 600', (t) => {
  const keyPath = path.join(tempDir(t), 'secrets', 'secret.key');
  const { key, created } = loadOrCreateKey(keyPath);
  assert.equal(created, true);
  assert.equal(key.length, 32);
  assert.equal(fs.statSync(keyPath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(keyPath)).mode & 0o777, 0o700);
});

test('la même clé est relue aux démarrages suivants', (t) => {
  const keyPath = path.join(tempDir(t), 'secret.key');
  const first = loadOrCreateKey(keyPath);
  const second = loadOrCreateKey(keyPath);
  assert.equal(second.created, false);
  assert.deepEqual(second.key, first.key);
});

test('une clé abîmée arrête le démarrage au lieu d\'être remplacée', (t) => {
  const keyPath = path.join(tempDir(t), 'secret.key');
  fs.writeFileSync(keyPath, 'pas une clé');
  assert.throws(() => loadOrCreateKey(keyPath), /invalide/);
  assert.equal(fs.readFileSync(keyPath, 'utf8'), 'pas une clé');
});
