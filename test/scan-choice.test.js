// Mode scan, partie B : « Prendre une photo » (appareil photo) ou « Choisir
// une photo » (galerie). Deux sélecteurs de fichier cachés, comme pour la
// photo d'un article ; les deux chemins passent par la même lecture locale.
// L'ouverture réelle de l'appareil photo et de la galerie se vérifie sur le
// téléphone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isImageFile, readBarcode, ImageUnreadable } from '../public/js/barcode.js';

const scan = fs.readFileSync(new URL('../public/js/screens/scan.js', import.meta.url), 'utf8');

test('deux sélecteurs cachés : un avec capture (appareil photo), un sans (galerie)', () => {
  assert.match(scan, /return \{ camera: make\('environment'\), gallery: make\(null\) \};/);
  assert.match(scan, /type: 'file', accept: 'image\/\*', capture, tabindex: '-1', 'aria-hidden': 'true'/);
});

test('le choix s\'ouvre à l\'appui sur « Scanner », les deux chemins mènent à la même lecture', () => {
  // Bouton « Scanner » : feuille de choix
  assert.match(scan, /'aria-label': 'Scanner un produit',[\s\S]*?onClick: \(\) => openPhotoChoice\(/);
  // Les deux choix, dans cet ordre, ouvrent leur sélecteur dans l'appui
  assert.match(scan, /choice\(camera, 'camera', 'Prendre une photo'/);
  assert.match(scan, /choice\(gallery, 'image', 'Choisir une photo'/);
  assert.match(scan, /onClick: \(\) => \{\s*input\.click\(\);\s*after\(\);/);
  // Un seul point d'arrivée pour les deux sélecteurs : session.scan(fichier)
  assert.match(scan, /const inputs = photoInputs\(\(file\) => \{\s*session \?\?= openSession\(\);\s*session\.scan\(file\);/);
  // Code non lu : les deux mêmes choix (plus de « Reprendre une photo » seul)
  assert.match(scan, /const retake = \(\) => photoChoiceButtons\(inputs, \{ primary: true \}\);/);
  assert.ok(!scan.includes('Reprendre une photo'));
});

test('fichier qui n\'est pas une image : refusé avant toute lecture', async () => {
  assert.equal(isImageFile({ type: 'image/jpeg' }), true);
  assert.equal(isImageFile({ type: 'image/heic' }), true);
  assert.equal(isImageFile({ type: 'image/png' }), true);
  assert.equal(isImageFile({ type: '' }), true, 'type inconnu : on essaie de le lire');
  assert.equal(isImageFile({ type: 'text/plain' }), false);
  assert.equal(isImageFile({ type: 'application/pdf' }), false);
  assert.equal(isImageFile(null), false);
  // Refusé tout de suite : ni lecteur, ni dessin (aucun navigateur ici)
  await assert.rejects(readBarcode({ type: 'text/plain' }), ImageUnreadable);
});
