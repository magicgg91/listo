// Écran « Mon compte » : la carte du compte des Réglages l'ouvre ; il reçoit
// les blocs Sécurité, Apparence et Ce téléphone, qui ne sont plus dans les
// Réglages ; retours d'écran vers « Mon compte ». Le fonctionnement réel
// (clics, thème, réinitialisation, clavier, hors ligne) est vérifié dans un
// vrai navigateur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { matchRoute, pathFor } from '../public/js/router.js';

const read = (file) => fs.readFileSync(new URL(`../public/js/${file}`, import.meta.url), 'utf8');
const settings = read('screens/settings.js');
const account = read('screens/account.js');
// Corps d'une fonction (de sa déclaration à son accolade fermante)
const body = (source, name) => {
  const start = source.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}\n', start) + 2);
};

test('« Mon compte » a sa propre adresse : un rechargement le rouvre', () => {
  assert.deepEqual(matchRoute('#/reglages/compte'), { name: 'account', params: {} });
  assert.equal(pathFor('account'), '#/reglages/compte');
  assert.match(read('app.js'), /case 'account': mount\(\(onLeave\) => renderAccount\(onLeave\)\); break;/);
});

test('Réglages : la carte du compte est un bouton qui ouvre « Mon compte »', () => {
  const screen = body(settings, 'renderSettings');
  assert.match(screen, /h\('button', \{\s*class: 'card account account--link',\s*type: 'button',\s*'aria-label': `Mon compte : \$\{user\.displayName\}`,\s*onClick: \(\) => navigate\('account'\),/);
  assert.ok(screen.includes("icon('chev-r')"), 'chevron');
  assert.ok(screen.includes('roleChip(user)'), 'badge Admin / Utilisateur');
  // Sécurité, Apparence et Ce téléphone ne sont plus dans les Réglages
  for (const gone of ["'Sécurité'", "'Apparence'", "'Ce téléphone'", 'Mot de passe', 'Double authentification', 'Réinitialiser', 'segmented', 'applyTheme']) {
    assert.equal(screen.includes(gone), false, gone);
  }
  // Ce qui reste : Administration (Admin), À propos, Se déconnecter
  assert.ok(screen.indexOf("'Administration'") < screen.indexOf("'À propos'"));
  assert.ok(screen.includes("'Se déconnecter'"));
});

test('« Mon compte » : identité, puis Sécurité, Apparence, Ce téléphone, dans cet ordre', () => {
  const screen = body(account, 'renderAccount');
  const order = ["topbar('Mon compte'", 'roleChip(user)', "'Sécurité'", "title: 'Mot de passe'", 'twoFactorRow)', "'Apparence'", "'aria-label': 'Thème'", "'Ce téléphone'", "title: 'Réinitialiser les données de ce téléphone'"];
  const view = screen.slice(screen.indexOf("return h('div', { class: 'screen' }"));
  const positions = order.map((text) => view.indexOf(text));
  for (const [i, text] of order.entries()) assert.ok(positions[i] >= 0, text);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'ordre');
  assert.ok(screen.includes("goBack('settings')"), 'retour vers Réglages');
  // Thème : écrit data-theme et se mémorise (theme.js), effet immédiat
  assert.match(account, /onClick: \(\) => \{\s*applyTheme\(value\);/);
  // Réinitialisation : même garde hors ligne, même confirmation, file gardée
  assert.ok(account.includes("toast('Indisponible hors ligne : il faut du réseau pour tout recharger.')"));
  assert.match(account, /confirmDialog\(\{\s*title: 'Réinitialiser les données de ce téléphone \?'/);
  assert.ok(account.includes('pendingCount()') && account.includes('await resetLocalCopy()'));
});

test('mot de passe et double authentification reviennent sur « Mon compte », jamais sur Réglages', () => {
  assert.ok(body(settings, 'renderPassword').includes("topbar('Mot de passe', () => goBack('account'))"));
  assert.ok(settings.includes("topbar('Double authentification', () => goBack('account'))"));
  assert.equal(/goBack\('settings'\)|navigate\('settings'/.test(settings.replace(body(settings, 'renderSettings'), '')), false);
  assert.match(settings, /const finish = \(\) => navigate\('account', \{\}, \{ replace: true \}\);/);
});

test('« Nouveautés » : description seule sous le titre, état annoncé par l\'interrupteur', () => {
  const start = account.indexOf('function newsSwitches(');
  const block = account.slice(start, account.indexOf('\n}\n', start) + 2);
  // Plus d'« Activé · » / « Désactivé · » : l'interrupteur montre déjà l'état
  for (const gone of ['Activé', 'Désactivé', "'aria-label'"]) assert.equal(block.includes(gone), false, gone);
  assert.ok(block.includes("'Ce que les autres ont ajouté ou modifié depuis votre dernière visite.'"));
  assert.ok(block.includes("['checks', 'Signaler les éléments cochés', 'Ce que les autres cochent ou décochent.'],"));
  // Vrai interrupteur : nom = titre de la ligne, description reliée, état dans aria-checked
  assert.match(block, /h\('button', \{ class: 'switch', type: 'button', role: 'switch', 'aria-labelledby': titleId, 'aria-describedby': helpId \}\)/);
  assert.match(block, /h\('span', \{ class: 'row__title', id: titleId \}, label\), h\('span', \{ class: 'row__sub', id: helpId \}, help\)/);
  assert.match(block, /toggle\.setAttribute\('aria-checked', String\(Boolean\(app\.data\.news\?\.\[key\]\)\)\);/);
  // Le texte de la ligne ne change plus quand on bascule
  assert.equal(block.includes('textContent'), false);
});
