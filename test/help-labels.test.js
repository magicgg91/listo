// Exactitude du guide : chaque libellé cité entre « » dans
// public/js/help-content.js existe tel quel dans l'interface (code des
// écrans, ou message envoyé par le serveur et affiché à l'écran). Une
// évolution qui renomme un bouton fait échouer ce test tant que le guide
// n'est pas à jour. Les exemples (phrases à dire à Claude, noms inventés,
// textes d'un autre logiciel) s'écrivent entre “ ” et ne sont pas vérifiés.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GUIDE, PERMISSIONS, PERMISSIONS_NOTE, SERVER_NOTE, blockTexts } from '../public/js/help-content.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Le code de l'interface et du serveur, apostrophes échappées (\') remises
function sources() {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'vendor') walk(rel); } else if (rel.endsWith('.js') && !rel.endsWith('help-content.js')) files.push(read(rel));
    }
  };
  walk('public/js');
  walk('server');
  return files.join('\n').replace(/\\'/g, '\'');
}

const guideTexts = () => [
  PERMISSIONS_NOTE, SERVER_NOTE, ...PERMISSIONS.map((p) => p.action),
  ...GUIDE.flatMap((c) => [c.title, ...(c.blocks ?? []).flatMap(blockTexts),
    ...(c.sections ?? []).flatMap((s) => [s.title, ...(s.blocks ?? []).flatMap(blockTexts)])]),
].join('\n');

test('libellés cités dans le guide : tous présents dans l\'interface', () => {
  const interfaceText = sources();
  const helpText = guideTexts();
  for (const label of ['Dupliquer la liste', 'Quitter la liste', 'Partager par lien', 'Modifier la liste', 'Lecture seule', 'Peut modifier', 'Lecture et écriture', 'Connexions Claude', 'Copier l\'adresse', 'Code de démarrage', 'Ajouter un compte']) {
    assert.ok(helpText.includes(`« ${label} »`), `guide : « ${label} »`);
    assert.ok(interfaceText.includes(label), `interface : « ${label} »`);
  }
  // Toute citation « … » du guide existe dans le code de l'interface ou du serveur
  const quotes = [...new Set([...helpText.matchAll(/« ([^»]+) »/g)].map((m) => m[1]))];
  assert.ok(quotes.length > 100, `${quotes.length} libellés cités`);
  const missing = quotes.filter((quote) => !interfaceText.includes(quote));
  assert.deepEqual(missing, [], 'libellés absents de l\'interface');
});

test('les exemples ne prennent jamais « » : “ ” (pas de faux libellé)', () => {
  const helpText = guideTexts();
  // Phrases à dire à Claude : toutes entre “ ”
  for (const sentence of ['Quelles sont mes listes Listo ?', 'Coche le pain et le beurre.']) {
    assert.ok(helpText.includes(`“${sentence}`), sentence);
    assert.ok(!helpText.includes(`« ${sentence}`), sentence);
  }
  // Guillemets bien appariés
  assert.equal((helpText.match(/«/g) ?? []).length, (helpText.match(/»/g) ?? []).length);
  assert.equal((helpText.match(/“/g) ?? []).length, (helpText.match(/”/g) ?? []).length);
});
