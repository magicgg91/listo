// Scan pour cocher (partie D) : le code lu correspond à un article de la
// liste ouverte, d'après les données déjà sur le téléphone (aucun appel :
// marche hors ligne). Plusieurs articles : le premier non coché, sinon le
// dernier coché.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { listItemForEan } from '../public/js/store.js';

const item = (name, ean, checked = false, checkedAt = null) => ({ id: name, name, ean, checked, checkedAt });

test('article non coché avec ce code : proposé', () => {
  const view = { groups: [{ items: [item('Pain', null), item('Lait', '3428272950019')] }], done: [] };
  assert.equal(listItemForEan(view, '3428272950019').name, 'Lait');
  assert.equal(listItemForEan(view, '3017620422003'), null);
  assert.equal(listItemForEan(view, null), null);
  assert.equal(listItemForEan(null, '3428272950019'), null);
});

test('plusieurs articles : le premier non coché (ordre de la liste), sinon le dernier coché', () => {
  const view = {
    groups: [{ items: [item('Lait (pack)', '3428272950019'), item('Lait', '3428272950019')] }],
    done: [item('Lait bio', '3428272950019', true, '2026-10-18T10:00:00.000Z')],
  };
  assert.equal(listItemForEan(view, '3428272950019').name, 'Lait (pack)');
  const allDone = {
    groups: [],
    done: [
      item('Lait', '3428272950019', true, '2026-10-18T09:00:00.000Z'),
      item('Lait (pack)', '3428272950019', true, '2026-10-18T11:00:00.000Z'),
      item('Lait bio', '3428272950019', true, '2026-10-18T10:00:00.000Z'),
    ],
  };
  const found = listItemForEan(allDone, '3428272950019');
  assert.equal(found.name, 'Lait (pack)');
  assert.equal(found.checked, true);
});

test('fiche : « Cocher (je l\'ai pris) », « Ajouter quand même », « Annuler » ; « Déjà coché » : « Le remettre dans la liste »', () => {
  const scan = fs.readFileSync(new URL('../public/js/screens/scan.js', import.meta.url), 'utf8');
  // Code lu ou tapé : d'abord la liste ouverte, sur le téléphone, sans appel
  assert.match(scan, /function handleCode\(code\) \{\s*const item = listItemForEan\(getView\(\), code\);\s*if \(item\) inList\(item, code\);\s*else lookup\(code\);/);
  assert.match(scan, /'Cocher \(je l\\'ai pris\)'/);
  assert.match(scan, /'Le remettre dans la liste'/);
  assert.match(scan, /check\(item, true\);\s*done\(`Coché : \$\{item\.name\}`\);/);
  assert.match(scan, /check\(item, false\);\s*done\(`Remis dans la liste : \$\{item\.name\}`\);/);
  assert.match(scan, /\$\{item\.checked \? 'Déjà coché' : 'Déjà dans la liste'\} : \$\{item\.name\}/);
  // Cocher passe par l'opération habituelle (file d'attente, zone des cochés)
  const list = fs.readFileSync(new URL('../public/js/screens/list.js', import.meta.url), 'utf8');
  assert.match(list, /check: \(item, checked\) => actions\.checkItem\(item, checked\),/);
});
