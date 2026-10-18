// Zone de sécurité du bas : la page s'affiche aussi sous la barre système
// d'Android et sous l'indicateur d'accueil de l'iPhone (viewport-fit=cover).
// Tout ce qui est collé en bas de l'écran doit en tenir compte, sinon il passe
// dessous (bouton « Nouvelle liste » à moitié caché sur Android). Le rendu
// réel est vérifié dans un navigateur avec une zone de sécurité simulée.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const kit = read('public/css/listo.css');
const app = read('public/css/app.css');
const INSET = 'env(safe-area-inset-bottom, 0px)';

// Déclarations d'une règle CSS (sélecteur exact, en début de ligne)
function rule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm'));
  assert.ok(match, `règle « ${selector} » introuvable`);
  return match[1];
}

test('bouton « Nouvelle liste » (.fab) : placé au-dessus de la zone de sécurité', () => {
  assert.match(rule(kit, '.fab'), /bottom: calc\(var\(--space-3\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
  // Le kit de design reste identique à la copie de l'application
  assert.equal(rule(read('design/listo.css'), '.fab'), rule(kit, '.fab'));
});

test('tout ce qui est collé en bas tient compte de la zone de sécurité', () => {
  for (const selector of ['.addbar', '.footer', '.sheet', '.lightbox__cap', '.lightbox__foot', '.public-foot']) {
    assert.ok(rule(kit, selector).includes(INSET), selector);
  }
  for (const selector of ['.toast', '.toast--low', '.cards', '.body:last-child, .body:has(+ .footer[hidden])']) {
    assert.ok(rule(app, selector).includes(INSET), selector);
  }
});

test('la page couvre tout l\'écran (zone de sécurité active) et prend la hauteur visible', () => {
  assert.match(read('public/index.html'), /<meta name="viewport" content="[^"]*viewport-fit=cover/);
  assert.match(rule(app, '.app'), /height: 100dvh/);
});
