// Photo et scan : UN seul bouton partout, le choix est celui du téléphone.
// Un champ fichier caché accept="image/*" SANS l'attribut capture : le
// téléphone propose lui-même l'appareil photo ou la photothèque. Un seul
// composant partagé (createImagePicker de photo.js) pour tous les points
// d'entrée. Exception (décision du 19 octobre 2026) : sur Android, ce même
// composant propose d'abord « Prendre une photo / Choisir dans la galerie »
// (voir test/android-picker.test.js) ; nulle part ailleurs. L'ouverture
// réelle du sélecteur se vérifie sur le téléphone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isImageFile, readBarcode, ImageUnreadable } from '../public/js/barcode.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Fichiers de l'interface (hors bibliothèque copiée dans public/vendor/)
function interfaceFiles() {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'vendor') walk(rel); } else if (/\.(js|html)$/.test(entry.name)) found.push(rel);
    }
  };
  walk('public');
  walk('server/pages');
  return found;
}
// Code sans les commentaires de fin de ligne
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

test('attribut capture : seulement dans le composant partagé, pour le choix Android', () => {
  for (const file of interfaceFiles()) {
    const count = (code(file).match(/capture\s*[:=]/g) ?? []).length;
    assert.equal(count, file.endsWith('public/js/photo.js') ? 1 : 0, `${file} : attribut capture`);
  }
  const photo = read('public/js/photo.js');
  assert.match(photo, /if \(android\) \{\s*const camera = field\(\{ capture: 'environment' \}\);/);
});

test('plus de bouton « Appareil photo » ni « Galerie » ; le seul menu de choix est celui d\'Android, dans le composant partagé', () => {
  for (const file of interfaceFiles()) {
    const text = code(file);
    for (const gone of ["'Appareil photo'", "'Galerie'", 'Choisir une photo', 'openPhotoChoice', 'photoChoiceButtons', 'photoInputs']) {
      assert.ok(!text.includes(gone), `${file} : « ${gone} » doit avoir disparu`);
    }
    if (!file.endsWith('public/js/photo.js')) {
      assert.ok(!text.includes('Prendre une photo') && !text.includes('Choisir dans la galerie'), `${file} : choix réservé au composant partagé`);
    }
  }
});

test('un seul composant : champ caché accept="image/*" sans capture, ouvert dans l\'appui', () => {
  const photo = read('public/js/photo.js');
  assert.match(photo, /const input = h\('input', \{ class: 'visually-hidden', type: 'file', accept: 'image\/\*', tabindex: '-1', 'aria-hidden': 'true', \.\.\.attrs \}\);/);
  // Hors Android : le champ sans capture, ouvert directement dans l'appui
  assert.match(photo, /const gallery = field\(\);\s*let input = gallery;\s*let open = \(\) => gallery\.click\(\);/);
  assert.match(photo, /h\('button', \{ type: 'button', \.\.\.attrs, onClick: open \}/);
  // Seul ce composant crée un champ fichier dans l'application (la page
  // publique n'en a pas)
  for (const file of interfaceFiles()) {
    const count = (code(file).match(/type: 'file'/g) ?? []).length;
    assert.equal(count, file.endsWith('public/js/photo.js') ? 1 : 0, `${file} : champ fichier hors du composant partagé`);
  }
});

test('tous les points d\'entrée utilisent le même composant', () => {
  const list = read('public/js/screens/list.js');
  const scan = read('public/js/screens/scan.js');
  // Feuille de l'article : photo (« Ajouter une photo » / « Changer la photo ») et code-barres
  assert.match(list, /const photoPicker = createImagePicker\(\(file\) => sendPhoto\(file\), \{ title: `Photo de l'\$\{words\.one\}` \}\);/);
  assert.match(list, /pick\('btn--secondary btn--block', 'Ajouter une photo'\)/);
  assert.match(list, /pick\('btn--secondary btn--sm', 'Changer la photo'\)/);
  assert.match(list, /const eanPicker = createImagePicker\(\(file\) => readEan\(file\), \{ title: 'Scanner un code-barres' \}\);/);
  assert.match(list, /eanPicker\.button\(\{ class: 'btn btn--secondary btn--icon', 'aria-label': 'Scanner un code-barres' \}, icon\('barcode'\)\);/);
  // Barre d'ajout et « Réessayer » du mode scan : le même sélecteur
  assert.match(scan, /const picker = createImagePicker\(\(file\) => \{\s*session \?\?= openSession\(\);\s*session\.scan\(file\);/);
  assert.match(scan, /const button = picker\.button\(\{\s*class: 'btn btn--secondary btn--icon',\s*'aria-label': 'Scanner un produit',/);
  assert.match(scan, /const retake = \(\) => picker\.button\(\{ class: 'btn btn--primary btn--block' \}, icon\('camera', 'icon--sm'\), 'Réessayer'\);/);
  // Les champs cachés sont dans la page (exigé par l'iPhone)
  assert.match(list, /photoArea, photoNote, photoPicker\.input\)/);
  assert.match(list, /eanStatus, eanTwin, eanPicker\.input\)/);
  assert.match(scan, /return \{ button, inputs: \[picker\.input\] \};/);
  assert.match(list, /h\('div', \{ class: 'addbar' \}, suggestBox, addForm, scanner\.inputs\)/);
});

test('fichier qui n\'est pas une image : refusé avant toute lecture', async () => {
  assert.equal(isImageFile({ type: 'image/jpeg' }), true);
  assert.equal(isImageFile({ type: 'image/heic' }), true);
  assert.equal(isImageFile({ type: 'image/png' }), true);
  assert.equal(isImageFile({ type: '' }), true, 'type inconnu : on essaie de le lire');
  assert.equal(isImageFile({ type: 'text/plain' }), false);
  assert.equal(isImageFile({ type: 'application/pdf' }), false);
  assert.equal(isImageFile(null), false);
  await assert.rejects(readBarcode({ type: 'text/plain' }), ImageUnreadable);
});
