// Exactitude de l'aide : chaque libellé cité entre « » dans
// public/js/help-content.js existe dans l'interface. Une évolution qui
// renomme un bouton fait échouer ce test tant que l'aide n'est pas à jour.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SECTIONS, PERMISSIONS, PERMISSIONS_NOTE, CLAUDE_TOPIC } from '../public/js/help-content.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('libellés cités dans l\'aide : tous présents dans l\'interface', () => {
  const ui = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'vendor') walk(rel); } else if (rel.endsWith('.js') && !rel.endsWith('help-content.js')) ui.push(read(rel));
    }
  };
  walk('public/js');
  const interfaceText = ui.join('\n');
  const helpText = JSON.stringify([PERMISSIONS, PERMISSIONS_NOTE, SECTIONS, CLAUDE_TOPIC]);
  for (const label of ['Dupliquer la liste', 'Quitter la liste', 'Partager par lien', 'Modifier la liste', 'Lecture seule', 'Peut modifier']) {
    assert.ok(helpText.includes(`« ${label} »`), `aide : « ${label} »`);
    assert.ok(interfaceText.includes(`'${label}'`) || interfaceText.includes(`${label}`), `interface : « ${label} »`);
  }
  // Toute citation « … » de l'aide existe dans le code de l'interface
  const quotes = [...new Set([...helpText.matchAll(/« ([^»]+) »/g)].map((m) => m[1]))];
  assert.ok(quotes.length > 30);
  for (const quote of quotes) assert.ok(interfaceText.includes(quote), `« ${quote} » absent de l'interface`);
});

