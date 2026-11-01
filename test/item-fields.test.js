// Fiche d'un article : champ Code-barres sur une ligne (champ avec sa petite
// croix « Effacer », puis le bouton de scan, icône seule) et aides courtes à
// côté du titre des champs (« Code-barres (8, 12 ou 13 chiffres) »,
// « Quantité (par exemple 2 ou 500 g) »), dans le <label> : lues avec le nom
// du champ. Le rendu est aussi vérifié dans Chromium (voir
// docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeBarcode } from '../public/js/barcode.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const list = read('public/js/screens/list.js');
const dom = read('public/js/dom.js');

test('plus de bouton « Effacer » : une croix dans le champ, visible seulement s\'il n\'est pas vide', () => {
  assert.doesNotMatch(list, /\}, 'Effacer'\);\s*const drawEan/, 'ancien bouton texte');
  assert.doesNotMatch(list, /class: 'photo-actions' \}, eanScan/);
  // Croix = bouton-icône du kit (44 px), dans .input-wrap avec le champ
  assert.match(list, /const eanClear = iconButton\('close', 'Effacer le code-barres', \(\) => \{\s*eanInput\.value = '';\s*drawEan\(\);\s*\}\);/);
  assert.match(list, /h\('div', \{ class: 'input-wrap' \}, eanInput, eanClear\)/);
  // Visible seulement si le champ contient quelque chose (redessiné à chaque frappe)
  assert.match(list, /eanClear\.hidden = !eanInput\.value;/);
  assert.match(list, /eanInput\.addEventListener\('input', drawEan\);/);
  // Le champ n'est jamais activé par la croix (ni par rien d'autre)
  assert.doesNotMatch(list, /eanInput\.(focus|select)\(/);
  // Le texte saisi ne passe pas sous la croix (marge à droite du kit)
  const kit = read('public/css/listo.css');
  assert.match(kit, /\.input-wrap \.input \{ padding-right: 52px; \}/);
  assert.match(kit, /\.input-wrap \.icon-btn \{ position: absolute; top: 4px; right: 4px; \}/);
});

test('bouton de scan sur la ligne du champ : icône seule, aria-label, même composant', () => {
  assert.match(list, /const eanScan = eanPicker\.button\(\{ class: 'btn btn--secondary btn--icon', 'aria-label': 'Scanner un code-barres' \}, icon\('barcode'\)\);/);
  assert.match(list, /field\('Code-barres', h\('div', \{ class: 'field__row' \}, h\('div', \{ class: 'input-wrap' \}, eanInput, eanClear\), eanScan\),\s*\{ aside: '8, 12 ou 13 chiffres' \}\)/);
  const css = read('public/css/app.css');
  assert.match(css, /\.field__row \{ display: flex; align-items: center; gap: var\(--space-1\); \}/);
  assert.match(css, /\.field__row \.input-wrap, \.field__row > \.input \{ flex: 1; min-width: 0; \}/, 'le champ prend la largeur restante');
});

test('aides courtes dans la ligne du titre, reliées au champ ; plus de ligne d\'aide dessous', () => {
  // Le texte de l'aide est dans le <label> du champ (nom accessible complet)
  assert.match(dom, /const title = h\('label', \{ class: 'field__label', for: input\?\.id \}, label,\s*aside \? \[' ', h\('span', \{ class: 'field__aside' \}, `\(\$\{aside\}\)`\)\] : null\);/);
  assert.match(list, /field\('Quantité', quantity, \{ aside: 'par exemple 2 ou 500 g' \}\)/);
  for (const gone of ['Chiffres sous les barres', 'Texte libre, par exemple']) assert.ok(!list.includes(gone), gone);
  // Mode scan : la note d'un produit trouvé (« marque et format »)
  assert.match(read('public/js/screens/scan.js'), /field\(found \? 'Note' : 'Note \(facultative\)', noteInput, \{ aside: found \? 'facultative : marque et format' : undefined \}\)/);
  // Discret : plus petit, grisé, pas en gras ; retour à la ligne normal
  const css = read('public/css/app.css');
  assert.match(css, /\.field__aside \{ font-size: 0\.93em; font-weight: 400; color: var\(--color-text-2\); \}/);
  assert.doesNotMatch(css, /\.field__aside \{[^}]*nowrap/);
});

test('inchangé : code-barres facultatif, validation 8, 12 ou 13 chiffres, enregistrement', () => {
  assert.match(list, /const newEan = typedEan \? normalizeBarcode\(typedEan\) : null;/);
  assert.match(list, /if \(shopping && newEan !== \(item\.ean \?\? null\)\) changes\.ean = newEan;/);
  assert.equal(normalizeBarcode('3428272950019'), '3428272950019');
  assert.equal(normalizeBarcode('012345678905'), '0012345678905');
  assert.equal(normalizeBarcode('3428272950018'), null);
  // Le message d'erreur s'affiche toujours sous le champ
  assert.match(list, /eanField\.setError\(typedEan && !newEan \? 'Code invalide : vérifiez les chiffres' : null\)/);
});
