// Administration, onglet « Articles » (appelé « Noms » avant le 19 octobre
// 2026) : la mémoire des noms d'articles de courses. Seul le libellé change ;
// les routes gardent leur nom (/api/admin/names…).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { itemWords } from '../public/js/words.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Code sans les commentaires de fin de ligne
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

test('libellé : onglet « Articles », plus aucun « Noms » à l\'écran', () => {
  const admin = code('public/js/screens/admin.js');
  // L'onglet : le mot des listes de courses, avec une majuscule
  assert.match(admin, /\{ key: 'noms', label: ITEM\.many\.charAt\(0\)\.toUpperCase\(\) \+ ITEM\.many\.slice\(1\) \}/);
  const many = itemWords(true).many;
  assert.equal(many.charAt(0).toUpperCase() + many.slice(1), 'Articles');
  // Ni « Noms », ni « Noms enregistrés », ni « un nom » comme désignation d'une entrée
  assert.doesNotMatch(admin, /Noms|Rechercher un nom|Aucun nom/);
  assert.match(admin, /placeholder: `Rechercher un \$\{ITEM\.one\}`, 'aria-label': `Rechercher un \$\{ITEM\.one\}`/);
  assert.match(admin, /`Aucun \$\{ITEM\.one\} ne correspond à cette recherche\.` : `Aucun \$\{ITEM\.one\} enregistré pour le moment\.`/);
  assert.match(admin, /h\('p', \{ class: 'section-title' \}, countItems\(page\.total, true\)\)/);
  // Message d'une entrée qui n'existe plus
  assert.match(read('server/routes/admin-names.js'), /const NOT_FOUND = 'Cet article n\\'est plus enregistré \(déjà corrigé ou retiré \?\)\.';/);
  // Les routes ne changent pas
  assert.match(admin, /get\(`\/api\/admin\/names\?\$\{params\}`\)/);
  // Documentation : le nouveau libellé
  assert.match(read('docs/exploitation.md'), /onglet \*\*Articles\*\*/);
  assert.doesNotMatch(read('docs/exploitation.md'), /onglet \*\*Noms\*\*/);
});
