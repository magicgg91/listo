// Lecteurs d'écran (VoiceOver), lot 2 des bonnes pratiques du web moderne
// (décisions du 14 novembre 2026). Le comportement réel avec VoiceOver se
// vérifie sur un iPhone (docs/developpement.md, point 54) ; ici : la zone
// d'annonce (exécutée avec un faux document) et les règles dans le code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fr from '../public/js/i18n/fr.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// Faux document : juste ce dont js/announce.js a besoin
function fakeDocument() {
  const body = { children: [], append(el) { this.children.push(el); el.isConnected = true; } };
  return {
    body,
    createElement: () => ({ attrs: {}, textContent: '', isConnected: false, setAttribute(k, v) { this.attrs[k] = v; } }),
  };
}

test('zone d\'annonce : deux zones créées une fois, texte écrit un instant après, même texte relu', async () => {
  globalThis.document = fakeDocument();
  const { prepareAnnouncer, announce } = await import(`../public/js/announce.js?t=${Date.now()}`);
  prepareAnnouncer();
  prepareAnnouncer();
  const [polite, urgent] = document.body.children;
  assert.equal(document.body.children.length, 2, 'créées une seule fois');
  assert.deepEqual([polite.attrs.role, polite.attrs['aria-live']], ['status', 'polite']);
  assert.deepEqual([urgent.attrs.role, urgent.attrs['aria-live']], ['alert', 'assertive']);
  assert.equal(polite.className, 'visually-hidden', 'rien ne change à l\'écran');

  announce('« Lait » supprimé');
  assert.equal(polite.textContent, '', 'vidée d\'abord');
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(polite.textContent, '« Lait » supprimé');
  // Même erreur deux fois : la zone est vidée puis réécrite (relue)
  announce('Saisissez votre identifiant', { urgent: true });
  await new Promise((r) => setTimeout(r, 150));
  announce('Saisissez votre identifiant', { urgent: true });
  assert.equal(urgent.textContent, '');
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(urgent.textContent, 'Saisissez votre identifiant');
  announce('');
  assert.equal(polite.textContent, '« Lait » supprimé', 'texte vide : rien');
  delete globalThis.document;
});

test('messages et erreurs passent par la zone d\'annonce (plus de role posé sur un message qui apparaît)', () => {
  const ui = read('public/js/ui.js');
  assert.match(ui, /h\('div', \{ class: `toast\$\{low \? ' toast--low' : ''\}` \}/);
  assert.match(ui, /announce\(text\);/);
  const dom = read('public/js/dom.js');
  assert.doesNotMatch(dom, /role: 'alert'/);
  assert.match(dom, /announce\(message, \{ urgent: true \}\)/);
  const page = read('public/js/public.js');
  assert.doesNotMatch(page, /role: 'alert', hidden: true/);
  assert.match(page, /prepareAnnouncer\(\);/);
  assert.match(read('public/js/app.js'), /prepareAnnouncer\(\);/);
});

test('« Annuler » reste tant que le focus est dessus', () => {
  const ui = read('public/js/ui.js');
  assert.match(ui, /if \(el\.contains\(document\.activeElement\)\) return;/);
  assert.match(ui, /el\.addEventListener\('focusout', \(event\) => \{\n    if \(!el\.contains\(event\.relatedTarget\)\) leaveAfter\(TOAST_AFTER_FOCUS_MS\);/);
});

test('fenêtre ouverte : le reste de l\'écran est inerte, rendu à la fermeture (avant de rendre le focus)', () => {
  const ui = read('public/js/ui.js');
  assert.match(ui, /if \(child === scrim \|\| child === panel \|\| child\.inert\) continue;\n      child\.inert = true;\n      madeInert\.push\(child\);/);
  const restore = ui.indexOf('for (const element of madeInert) element.inert = false;');
  assert.ok(restore > 0);
  assert.ok(restore < ui.indexOf('opener.focus()'), 'inerte retiré avant le retour du focus');
});

test('rond à cocher : nom fixe, l\'état dans aria-pressed seulement (dit une fois)', () => {
  const list = read('public/js/screens/list.js');
  assert.match(list, /'aria-pressed': String\(item\.checked\),\n      'aria-label': isWishList\(view\?\.list\) \? t\('liste\.envies\.recu\.nom', \{ name: item\.name \}\) : item\.name,/);
  assert.equal(fr['liste.envies.recu.nom'], 'Reçu : {name}');
  assert.match(read('public/js/screens/deadlines.js'), /'aria-pressed': 'false', 'aria-label': item\.name,/);
  // Balisage de référence du kit aligné
  assert.doesNotMatch(read('design/components.html'), /class="check"[^>]*aria-label="(Cocher|Décocher) /);
});

test('aide sous un champ reliée au champ (aria-describedby), avec l\'erreur quand il y en a une', () => {
  const dom = read('public/js/dom.js');
  assert.match(dom, /h\('span', \{ class: 'field__hint', id: `\$\{inputId\}-aide` \}, hint\)/);
  assert.match(dom, /const ids = \[hintEl\?\.id, withError \? error\.id : null\]\.filter\(Boolean\)\.join\(' '\);/);
});

test('changement d\'écran : titre de la page, focus sur le titre h1 (jamais un champ, sans contour)', () => {
  const app = read('public/js/app.js');
  assert.match(app, /document\.title = name \? `\$\{name\} · Listo` : 'Listo';/);
  assert.match(app, /if \(!changed \|\| !heading \|\| isTextField\(document\.activeElement\) \|\| col\.querySelector\('\.scrim'\)\) return;/);
  assert.match(read('public/css/app.css'), /\.app h1\[data-screen-focus\]:focus \{ outline: none; \}/);
});

test('titre focalisé : sans contour même après un changement d\'application (le marqueur ne part que quand un autre élément prend le focus)', () => {
  const app = read('public/js/app.js');
  assert.doesNotMatch(app, /addEventListener\('blur', \(\) => heading\.removeAttribute\('data-screen-focus'\)/);
  assert.match(app, /if \(event\.target === heading\) return;\n    heading\.removeAttribute\('data-screen-focus'\);/);
  assert.match(app, /document\.addEventListener\('focusin', keepUntilElsewhere, true\);/);
});
