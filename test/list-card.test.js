// Carte compacte de « Mes listes » : deux lignes (trois si le titre passe
// sur deux lignes), ni catégorie ni magasin. Rendu vérifié aussi dans
// Chromium, en clair et en sombre (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('carte compacte : ni catégorie ni magasin ; badge « Multi » ; lien public collé aux pastilles, absent sans lien', () => {
  const lists = read('public/js/screens/lists.js');
  const card = lists.slice(lists.indexOf('function cardLink('), lists.indexOf('export function cardCount('));
  // Ni catégorie ni magasin sur la carte
  assert.doesNotMatch(card, /category\.name|store\.name|list-card__meta|icon\('store'/);
  // Ligne 1 : icône, titre, heure (le bouton ⋮ est posé à côté, voir listCard)
  assert.match(card, /h\('div', \{ class: 'list-card__head' \},\s*h\('span', \{ class: 'list-card__icon' \}, icon\(listIcon\(list\), 'icon--sm'\)\),\s*h\('h2', \{ class: 'list-card__name' \}, list\.name\),\s*h\('span', \{ class: 'list-card__time' \}, relativeTime\(list\.lastActivity\)\)\),/);
  // Ligne 2 à gauche : compteur, puis « Multi » quand il y a lieu
  assert.match(card, /h\('div', \{ class: 'list-card__left' \},\s*cardCount\(list\),\s*list\.store\?\.isMulti && list\.category\.isShopping \? multiBadge\(\) : null,/);
  // Ligne 2 à droite : le lien public juste avant les pastilles, seulement s'il y en a un
  assert.match(card, /h\('div', \{ class: 'list-card__people' \},\s*\/\/[^\n]*\n\s*hasPublicLink\(list\) \? h\('span', \{ class: 'list-card__link', role: 'img', 'aria-label': 'Lien public actif', title: 'Lien public actif' \}, icon\('link', 'icon--xs'\)\) : null,\s*h\('div', \{ class: 'avatars'/);
  assert.equal((card.match(/icon\('link'/g) ?? []).length, 1, 'le symbole du lien n\'apparaît qu\'une fois');
  // Deux lignes au plus (trois si le titre passe sur deux lignes)
  assert.equal((card.match(/class: 'list-card__(head|foot)'/g) ?? []).length, 2);
  const css = read('public/css/app.css');
  assert.match(css, /\.list-card__people \{ display: flex; flex: none; align-items: center; gap: 6px; \}/);
  assert.match(css, /\.list-card__head \.list-card__name \{[^}]*-webkit-line-clamp: 2;[^}]*\}/, 'titre : deux lignes au plus');
});
