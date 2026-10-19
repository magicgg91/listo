// Page « Aide » (#/aide) : ouverte depuis les Réglages, contenu dans un seul
// module (public/js/help-content.js), sections repliables, section
// Administrateur réservée aux Admin, disponible hors ligne. Un petit faux
// document suffit pour dessiner l'écran ; le rendu réel est vérifié dans
// Chromium (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { matchRoute, ROUTES } from '../public/js/router.js';
import { SECTIONS, PERMISSIONS, PERMISSIONS_NOTE, ROLES, helpSections } from '../public/js/help-content.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
const ADMIN = { role: 'admin' };
const USER = { role: 'user' };

// --- Faux document : ce qu'utilisent h(), icon() et iconButton() ---
class FakeNode {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
    this.listeners = {};
    this.hidden = false;
  }
  setAttribute(name, value) { this.attrs[name] = value; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  append(...nodes) { this.children.push(...nodes); }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  click() { for (const fn of this.listeners.click ?? []) fn({}); }
  get textContent() { return this.children.map((c) => c.textContent ?? '').join(''); }
  findAll(check) {
    const found = check(this) ? [this] : [];
    for (const child of this.children) if (child instanceof FakeNode) found.push(...child.findAll(check));
    return found;
  }
}
class FakeText extends FakeNode {
  constructor(text) {
    super('#text');
    this.text = text;
  }
  get textContent() { return this.text; }
}
function fakeDom(t) {
  globalThis.Node = FakeNode;
  globalThis.document = { createElement: (tag) => new FakeNode(tag), createElementNS: (ns, tag) => new FakeNode(tag), createTextNode: (text) => new FakeText(text) };
  t.after(() => {
    delete globalThis.Node;
    delete globalThis.document;
  });
}
const hasClass = (node, name) => (node.attrs.class ?? '').split(' ').includes(name);
async function render(t, user) {
  fakeDom(t);
  const { renderHelp } = await import('../public/js/screens/help.js');
  return renderHelp(user);
}
const toggles = (screen) => screen.findAll((n) => hasClass(n, 'aisle__toggle'));
const bodies = (screen) => screen.findAll((n) => hasClass(n, 'help__section'));

test('Réglages : une ligne « Aide » qui ouvre la page ; adresse #/aide (rafraîchissement compris)', () => {
  assert.match(code('public/js/screens/settings.js'), /row\(\{ iconName: 'book', title: 'Aide', sub: 'Mode d\\'emploi de Listo', onClick: \(\) => navigate\('help'\) \}\)/);
  assert.deepEqual(matchRoute('#/aide'), { name: 'help', params: {} });
  assert.ok(ROUTES.some((r) => r.name === 'help' && r.path === '/aide'));
  // L'écran est monté pour cette adresse (au démarrage comme à chaque changement)
  assert.match(code('public/js/app.js'), /case 'help': mount\(\(\) => renderHelp\(app\.user\)\); break;/);
  // Icône existante du sprite
  assert.match(read('public/index.html'), /<symbol id="i-book"/);
});

test('cinq sections dans l\'ordre ; la section Administrateur seulement pour un Admin', async (t) => {
  assert.deepEqual(SECTIONS.map((s) => s.title), ['Pour tout le monde', 'Propriétaire d\'une liste', 'Contributeur', 'Invité', 'Administrateur']);
  assert.deepEqual(helpSections(ADMIN).map((s) => s.id), ['tous', 'proprietaire', 'contributeur', 'invite', 'admin']);
  for (const user of [USER, { role: 'user', displayName: 'Admin' }, null, undefined]) {
    assert.deepEqual(helpSections(user).map((s) => s.id), ['tous', 'proprietaire', 'contributeur', 'invite'], JSON.stringify(user));
  }
  // Ce qui est passé à l'écran d'un compte Utilisateur : aucun texte de la section Administrateur
  const userScreen = await render(t, USER);
  const text = userScreen.textContent;
  assert.ok(!text.includes('Administrateur'));
  for (const topic of SECTIONS.find((s) => s.id === 'admin').topics) {
    for (const p of [...(topic.paragraphs ?? []), ...(topic.items ?? [])]) assert.ok(!text.includes(p), p);
  }
  assert.deepEqual(toggles(userScreen).map((b) => b.textContent), ['Pour tout le monde', 'Propriétaire d\'une liste', 'Contributeur', 'Invité']);
});

test('sections repliables : la première dépliée, les autres repliées ; aria-expanded suit chaque appui', async (t) => {
  const screen = await render(t, ADMIN);
  const buttons = toggles(screen);
  const parts = bodies(screen);
  assert.equal(buttons.length, 5);
  assert.deepEqual(buttons.map((b) => b.getAttribute('aria-expanded')), ['true', 'false', 'false', 'false', 'false']);
  assert.deepEqual(parts.map((p) => p.hidden), [false, true, true, true, true]);
  buttons.forEach((b, i) => assert.equal(b.getAttribute('aria-controls'), parts[i].attrs.id));
  buttons[2].click();
  buttons[0].click();
  assert.deepEqual(buttons.map((b) => b.getAttribute('aria-expanded')), ['false', 'false', 'true', 'false', 'false']);
  assert.deepEqual(parts.map((p) => p.hidden), [true, true, false, true, true]);
  // Bouton de 44 px au moins, chevron qui tourne (même composant que les groupes d'une liste)
  assert.ok(buttons.every((b) => b.attrs.type === 'button'));
  assert.match(read('public/css/listo.css'), /\.aisle__toggle\[aria-expanded="false"\] > \.icon \{ transform: rotate\(-90deg\); \}/);
  // Barre du haut : titre « Aide », retour
  assert.equal(screen.findAll((n) => hasClass(n, 'topbar__title'))[0].textContent, 'Aide');
  assert.equal(screen.findAll((n) => n.attrs['aria-label'] === 'Retour').length, 1);
  // Aucun champ de saisie : rien ne prend le focus
  assert.equal(screen.findAll((n) => n.tag === 'input' || n.tag === 'textarea').length, 0);
});

test('« Qui peut quoi » : quatre rôles, oui ou non en icône ET en texte ; note sur l\'invité', async (t) => {
  assert.deepEqual(ROLES.map((r) => r.label), ['Propriétaire', 'Contributeur', 'Invité', 'Admin']);
  const screen = await render(t, USER);
  const rows = screen.findAll((n) => hasClass(n, 'help-who__row'));
  assert.equal(rows.length, PERMISSIONS.length);
  for (const [i, row] of rows.entries()) {
    const roles = row.findAll((n) => hasClass(n, 'help-who__role'));
    assert.equal(roles.length, 4);
    roles.forEach((chip, j) => {
      const yes = PERMISSIONS[i].roles.includes(ROLES[j].key);
      assert.ok(chip.textContent.endsWith(yes ? ' : oui' : ' : non'), chip.textContent);
      assert.equal(chip.findAll((n) => n.tag === 'use')[0].attrs.href, yes ? '#i-check' : '#i-close');
    });
  }
  // Droits vérifiés dans le code : seul le propriétaire modifie, partage, crée le lien, supprime
  const who = (action) => PERMISSIONS.find((p) => p.action.startsWith(action)).roles;
  assert.deepEqual(who('Modifier la liste'), ['owner']);
  assert.deepEqual(who('Partager la liste'), ['owner']);
  assert.deepEqual(who('Créer un lien public'), ['owner']);
  assert.deepEqual(who('Supprimer la liste'), ['owner']);
  assert.deepEqual(who('Dupliquer la liste'), ['owner', 'contributor']);
  assert.deepEqual(who('Quitter la liste'), ['contributor', 'guest']);
  assert.ok(!who('Voir la liste').includes('admin'));
  assert.match(PERMISSIONS_NOTE, /lien public sans compte/);
  assert.ok(screen.textContent.includes(PERMISSIONS_NOTE));
});

test('texte : vouvoiement, sobre, sans dates ni numéros de version ; jamais de HTML', () => {
  const helpText = JSON.stringify([PERMISSIONS, PERMISSIONS_NOTE, SECTIONS]);
  assert.doesNotMatch(helpText, /\btu\b|\bton\b|\btes\b|<|>|20\d\d|\bv\d+\b|octobre|version/i);
  for (const file of ['public/js/help-content.js', 'public/js/screens/help.js']) assert.doesNotMatch(code(file), /innerHTML|insertAdjacentHTML|outerHTML/, file);
  // Tout le texte d'aide vit dans help-content.js : l'écran n'écrit que « Aide », « Qui peut quoi » et « Retour »
  const screenStrings = [...code('public/js/screens/help.js').matchAll(/'([^'\n]*)'/g)].map((m) => m[1]).filter((s) => /^[A-ZÀ-Ý]/.test(s));
  assert.deepEqual([...new Set(screenStrings)].sort(), ['Aide', 'Qui peut quoi', 'Retour']);
  // Vocabulaire « article / élément » expliqué une fois
  assert.equal((helpText.match(/« article »/g) ?? []).length, 1);
  assert.equal((helpText.match(/« élément »/g) ?? []).length, 1);
});

test('hors ligne : les deux fichiers de l\'aide sont gardés par le service worker', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /'\/js\/help-content\.js',/);
  assert.match(sw, /'\/js\/screens\/help\.js',/);
  assert.match(read('public/css/app.css'), /\.help-who__role--no \{[^}]*border: 1px dashed/);
});
