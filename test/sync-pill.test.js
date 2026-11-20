// Pastille de synchronisation (« À jour », « Synchronisation… », « Hors
// ligne · 3 en attente ») : quand un appui relance la synchronisation, c'est
// un vrai bouton, annoncé comme tel, dont le nom dit l'état ET l'action
// (« À jour, synchroniser maintenant ») ; un changement d'état reste annoncé
// (aria-live), une seule fois. Vérifié aussi dans l'arbre d'accessibilité de
// Chromium (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fr from '../public/js/i18n/fr.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const ui = read('public/js/ui.js');

test('pastille cliquable : un vrai <button> (pas role="status"), avec aria-live', () => {
  assert.match(ui, /const pill = onRefresh\s*\? h\('button', \{ type: 'button', 'aria-live': 'polite', onClick: onRefresh \}\)\s*: h\('p', \{ role: 'status', 'aria-live': 'polite' \}\);/);
  // Le rôle « status » écraserait le rôle de bouton : jamais sur le bouton
  assert.doesNotMatch(ui, /h\('button', \{[^}]*role: 'status'/);
});

test('nom du bouton : l\'état et l\'action, mis à jour à chaque changement', () => {
  assert.match(ui, /if \(pill\.tagName === 'BUTTON'\) pill\.setAttribute\('aria-label', t\('fenetres\.sync\.bouton', \{ state: text \}\)\);/);
  assert.equal(fr['fenetres.sync.bouton'], '{state}, synchroniser maintenant');
  for (const state of ["t('fenetres.sync.aJour')", "t('fenetres.sync.enCours')", "t('fenetres.sync.horsLigne.enAttente', { count: pendingCount })", "t('fenetres.sync.horsLigne')"]) assert.ok(ui.includes(state), state);
  assert.equal(fr['fenetres.sync.aJour'], 'À jour');
  assert.equal(fr['fenetres.sync.enCours'], 'Synchronisation…');
  assert.equal(fr['fenetres.sync.horsLigne.enAttente'], 'Hors ligne · {count} en attente');
  assert.equal(fr['fenetres.sync.horsLigne'], 'Hors ligne');
});

test('annonce sans répétition : rien n\'est redessiné si l\'état affiché ne change pas', () => {
  assert.match(ui, /const painted = `\$\{syncState\}\|\$\{text\}`;\s*if \(pill\.dataset\.painted !== painted\) \{/);
});

test('toutes les pastilles relancent une synchronisation (accueil, colonne, liste)', () => {
  for (const file of ['public/js/screens/lists.js', 'public/js/screens/list.js']) {
    const source = read(file);
    const all = (source.match(/syncPill\(/g) ?? []).length;
    const refreshing = (source.match(/syncPill\(\(\) => refreshData\(\{ full: true \}\)/g) ?? []).length;
    assert.ok(all > 0 && refreshing === all, `${file} : ${refreshing} sur ${all}`);
  }
});
