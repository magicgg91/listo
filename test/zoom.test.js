// Pas de zoom par double appui (décision du 11 novembre 2026) : constat sur
// iPhone, deux appuis rapides sur les jours d'une répétition agrandissaient
// la page. Le pincement reste permis (accessibilité) : la page ne bloque
// jamais le zoom de la personne.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('double appui sans zoom ; pincement toujours permis ; balayage des lignes gardé', () => {
  const css = read('public/css/app.css');
  // Sur chaque élément (une zone qui défile ne reprend pas la règle de ses
  // parents), avec une priorité nulle
  assert.match(css, /^:where\(\*\) \{ touch-action: manipulation; \}$/m);
  // Le balayage d'une ligne (supprimer) garde sa règle, plus précise
  assert.match(css, /\.item\.swipe \{[^}]*touch-action: pan-y;/);
  // Jamais de blocage du pincement
  const page = read('public/index.html');
  assert.match(page, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
  assert.doesNotMatch(page + css + read('public/js/viewport.js'), /maximum-scale|user-scalable|gesturestart/);
  assert.doesNotMatch(css, /touch-action: none/);
});
