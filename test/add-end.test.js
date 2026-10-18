// Fin d'ajout dans une liste de courses (partie A) : après un ajout, à la
// main ou par le mode scan, plus aucun champ n'a le curseur (clavier
// replié) ; le mode scan se ferme avec un toast ; toute fenêtre qui se ferme
// et tout changement d'écran retirent le curseur d'un champ. Le rendu réel
// (clavier de l'iPhone et d'Android) est vérifié à la main.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const ui = read('js/ui.js');
const list = read('js/screens/list.js');
const scan = read('js/screens/scan.js');
const app = read('js/app.js');

test('releaseFocus : retire le curseur d\'un champ de saisie seulement (blur, jamais focus)', () => {
  assert.match(ui, /export function releaseFocus\(\) \{\s*const active = document\.activeElement;\s*if \(isTextField\(active\)\) active\.blur\(\);\s*\}/);
});

test('fenêtre qui se ferme, changement d\'écran : curseur retiré', () => {
  assert.match(ui, /if \(panel\.contains\(document\.activeElement\)\) releaseFocus\(\);/);
  assert.match(app, /function mount\([^)]*\) \{\s*\/\/[^\n]*\n\s*releaseFocus\(\);/);
});

test('saisie à la main (liste de courses) : curseur retiré et article montré après l\'ajout', () => {
  assert.match(list, /if \(!item \|\| !view\?\.list\.category\.isShopping\) return;\s*suggestBox\.hidden = true;\s*releaseFocus\(\);\s*revealItem\(item\.id\);/);
  assert.match(list, /'data-item-id': item\.id/);
});

test('mode scan : feuille fermée après l\'ajout, toast « Ajouté : … », ancien enchaînement supprimé', () => {
  assert.match(scan, /sheet\.close\(\);\s*releaseFocus\(\);\s*toast\(`Ajouté : \$\{finalName\}`/);
  for (const gone of ['Scanner un autre produit', 'Terminé', 'addedCount', 'showNext', 'ajoutés']) {
    assert.ok(!scan.includes(gone), `« ${gone} » doit avoir disparu de scan.js`);
  }
  // « Annuler » ferme la feuille
  assert.match(scan, /const cancel = \(\) => btn\('btn--secondary btn--block', \['Annuler'\], \(\) => sheet\.close\(\)\);/);
});
