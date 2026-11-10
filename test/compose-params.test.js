// Paramètres de Listo : chaque variable documentée dans le guide (tableau
// « Les réglages (variables) ») figure dans tous les exemples de fichier
// compose (docker-compose.yml, docker-compose.dev.yml, l'exemple du chapitre
// Installation du guide), et inversement. LISTO_PUSH (en commentaire, avec son
// explication courte) et TZ=Europe/Paris partout.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GUIDE } from '../public/js/help-content.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const variables = GUIDE.find((c) => c.id === 'installation').sections.find((s) => s.id === 'variables');

// Variables du tableau du guide
const documented = variables.blocks.find((b) => b.table).table.rows.map((row) => row[0].replace(/`/g, ''));
// Posée par l'image elle-même (Dockerfile), jamais dans un fichier compose
const FROM_IMAGE = ['LISTO_COMMIT'];
// Variables d'un exemple de compose (LISTO_DEV_* : réglages de l'ordinateur
// pour docker-compose.dev.yml, pas des variables lues par Listo)
const namesIn = (text) => new Set([...text.matchAll(/\b(NODE_ENV|PORT|TZ|LISTO_[A-Z_]+)\b/g)].map((m) => m[1]).filter((n) => !n.startsWith('LISTO_DEV_')));

const EXAMPLES = {
  'docker-compose.yml': read('docker-compose.yml'),
  'docker-compose.dev.yml': read('docker-compose.dev.yml'),
  'guide, chapitre Installation (exemple)': variables.blocks.find((b) => b.code).code,
};

test('paramètres : chaque variable documentée est dans chaque exemple de compose, et inversement', () => {
  assert.ok(documented.includes('LISTO_PUSH') && documented.includes('LISTO_MCP') && documented.includes('TZ'));
  assert.equal(documented.indexOf('LISTO_PUSH'), documented.indexOf('LISTO_MCP') + 1, 'LISTO_PUSH à côté de LISTO_MCP');
  for (const [name, text] of Object.entries(EXAMPLES)) {
    const found = namesIn(text);
    for (const variable of documented.filter((v) => !FROM_IMAGE.includes(v))) assert.ok(found.has(variable), `${variable} absent de ${name}`);
    for (const variable of found) assert.ok(documented.includes(variable), `${variable} (${name}) absent du tableau du guide`);
  }
  // Valeurs par défaut écrites dans le tableau
  const row = (v) => variables.blocks.find((b) => b.table).table.rows.find((r) => r[0] === `\`${v}\``);
  assert.equal(row('LISTO_PUSH')[1], 'absente : désactivées');
  assert.equal(row('LISTO_MCP')[1], 'absente : désactivé');
});

test('LISTO_PUSH : en commentaire, avec la même explication courte, dans tous les exemples ; TZ=Europe/Paris partout', () => {
  const pushLine = /# - LISTO_PUSH=on/;
  const explained = (text) => ['DÉSACTIVÉES par défaut', 'Apple', 'Google', 'Mozilla', 'Microsoft', 'secrets/vapid.json', 'secret.key'].every((word) => text.includes(word));
  const examples = { ...EXAMPLES, 'docs/guide.md': read('docs/guide.md'), 'site/index.html': read('site/index.html'), 'docs/exploitation.md': read('docs/exploitation.md') };
  for (const [name, text] of Object.entries(examples)) {
    assert.match(text, pushLine, name);
    assert.ok(explained(text), `explication de LISTO_PUSH dans ${name}`);
    assert.doesNotMatch(text, /^\s*- LISTO_PUSH=on/m, `${name} : jamais activé dans un exemple`);
    assert.match(text, /TZ=Europe\/Paris/, `TZ dans ${name}`);
  }
  // LISTO_MCP : nommé, jamais avec « =on » dans docker-compose.yml (décision du 31 octobre 2026)
  assert.doesNotMatch(read('docker-compose.yml'), /LISTO_MCP=on/);
  // README : la variable est citée
  assert.match(read('README.md'), /`LISTO_PUSH=on`/);
  // Guide : le résumé des échéances suit le fuseau du serveur, donc TZ
  const server = JSON.stringify(GUIDE.find((c) => c.id === 'notifications').sections.find((s) => s.id === 'notif-serveur'));
  assert.match(server, /8 h dans le fuseau du serveur : réglez `TZ`/);
  assert.match(JSON.stringify(variables), /résumé des échéances \(8 h\)/);
});
