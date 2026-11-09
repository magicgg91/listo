// Page « Aide » (#/aide, #/aide/<section>) : le guide numéroté, source
// unique (public/js/help-content.js), chapitres repliables, bouton
// « Sommaire », même contenu et mêmes numéros pour tout le monde, disponible
// hors ligne. Un petit faux document suffit pour dessiner l'écran ; la
// feuille du sommaire, les sauts et le thème sont vérifiés dans Chromium
// (docs/developpement.md, point 36).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { matchRoute, ROUTES } from '../public/js/router.js';
import { GUIDE, PERMISSIONS, PERMISSIONS_NOTE, ROLES, SERVER_NOTE, outline, numbered, parseInline, refLabel, blockTexts } from '../public/js/help-content.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

// Tous les textes du guide (titres compris)
const allTexts = () => [
  PERMISSIONS_NOTE, ...PERMISSIONS.map((p) => p.action),
  ...GUIDE.flatMap((c) => [c.title, ...(c.blocks ?? []).flatMap(blockTexts),
    ...(c.sections ?? []).flatMap((s) => [s.title, ...(s.blocks ?? []).flatMap(blockTexts)])]),
];
const allBlocks = () => GUIDE.flatMap((c) => [...(c.blocks ?? []), ...(c.sections ?? []).flatMap((s) => s.blocks ?? [])]);

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
  click() { for (const fn of this.listeners.click ?? []) fn({ preventDefault() {} }); }
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
async function render(t, section) {
  fakeDom(t);
  const { renderHelp } = await import('../public/js/screens/help.js');
  return renderHelp(section);
}
const toggles = (screen) => screen.findAll((n) => hasClass(n, 'aisle__toggle'));

test('Réglages : une ligne « Aide » ; adresses #/aide et #/aide/<section> ; « Connexions Claude » renvoie au chapitre Claude', () => {
  assert.match(code('public/js/screens/settings.js'), /row\(\{ iconName: 'book', title: 'Aide', sub: 'Mode d\\'emploi de Listo', onClick: \(\) => navigate\('help'\) \}\)/);
  assert.deepEqual(matchRoute('#/aide'), { name: 'help', params: {} });
  assert.deepEqual(matchRoute('#/aide/sauvegardes'), { name: 'helpSection', params: { section: 'sauvegardes' } });
  assert.ok(ROUTES.some((r) => r.name === 'help' && r.path === '/aide'));
  assert.match(code('public/js/app.js'), /case 'help': mount\(\(\) => renderHelp\(\)\); break;/);
  assert.match(code('public/js/app.js'), /case 'helpSection': mount\(\(\) => renderHelp\(params\.section\)\); break;/);
  assert.match(code('public/js/screens/claude-connections.js'), /navigate\('helpSection', \{ section: 'claude' \}\)/);
  assert.match(read('public/index.html'), /<symbol id="i-book"/);
  assert.match(read('public/index.html'), /<symbol id="i-layers"/);
});

test('numérotation calculée : une entrée par chapitre et par section, numéros suivis, identifiants uniques et stables', () => {
  const entries = outline();
  const chapters = entries.filter((e) => e.level === 1);
  assert.equal(chapters.length, GUIDE.length);
  assert.equal(entries.length, GUIDE.length + GUIDE.reduce((n, c) => n + (c.sections ?? []).length, 0));
  chapters.forEach((c, i) => assert.equal(c.number, String(i + 1)));
  for (const chapter of GUIDE) {
    const sections = entries.filter((e) => e.chapter === chapter.id);
    assert.ok(sections.length >= 1, chapter.id);
    sections.forEach((s, j) => assert.equal(s.number, `${entries.find((e) => e.id === chapter.id).number}.${j + 1}`));
  }
  const ids = entries.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'identifiants uniques');
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9-]*$/, `ancre valable : ${id}`);
  // Ordre demandé : présentation, possibilités et Claude au début ; serveur à la fin
  assert.deepEqual(GUIDE.map((c) => c.id), ['presentation', 'possibilites', 'claude', 'installation', 'comptes', 'quotidien', 'roles', 'faq', 'serveur']);
  assert.deepEqual(entries.filter((e) => e.chapter === 'roles').map((e) => e.id).filter((id) => id.startsWith('role-')),
    ['role-admin', 'role-contributeur', 'role-lecture', 'role-visiteur', 'role-beneficiaire']);
  // Aucun numéro écrit à la main dans les titres
  for (const e of entries) assert.doesNotMatch(e.title, /^\d/, e.title);
  assert.equal(numbered(entries[0]), '1. Présentation');
  assert.equal(numbered(entries[1]), '1.1 Ce qu\'est Listo');
  // Même contenu pour tout le monde : plus de section réservée aux Admin
  assert.ok(GUIDE.every((c) => !('adminOnly' in c)));
  // Chapitres du serveur : marqués
  assert.deepEqual(GUIDE.filter((c) => c.server).map((c) => c.id), ['installation', 'serveur']);
});

test('renvois [[id]] : tous vers une section qui existe ; blocs connus ; liens en https seulement', () => {
  const ids = new Set(outline().map((e) => e.id));
  let refs = 0;
  for (const text of allTexts()) {
    for (const part of parseInline(text)) {
      if (part.ref !== undefined) {
        refs += 1;
        assert.ok(ids.has(part.ref), `renvoi inconnu : [[${part.ref}]]`);
      }
      if (part.link !== undefined) assert.match(part.href, /^https:\/\//);
    }
    assert.doesNotMatch(text, /\[\[(?![a-z0-9-]+\]\])/, `renvoi mal écrit : ${text.slice(0, 60)}`);
  }
  assert.ok(refs > 40, `${refs} renvois`);
  assert.equal(refLabel('restauration'), '9.2 Restaurer une sauvegarde');
  assert.throws(() => refLabel('inconnu'));
  const kinds = new Set(allBlocks().map((b) => (typeof b === 'string' ? 'p' : Object.keys(b)[0])));
  assert.deepEqual([...kinds].sort(), ['code', 'note', 'ol', 'p', 'sub', 'table', 'ul', 'who']);
  // Découpage du texte enrichi
  assert.deepEqual(parseInline('Voir [[npm]] et `docker logs listo`, ou [le site](https://exemple.fr).'),
    [{ text: 'Voir ' }, { ref: 'npm' }, { text: ' et ' }, { code: 'docker logs listo' }, { text: ', ou ' }, { link: 'le site', href: 'https://exemple.fr' }, { text: '.' }]);
  assert.deepEqual(parseInline('[lien](javascript:alert(1))'), [{ text: '[lien](javascript:alert(1))' }], 'seulement https');
});

test('contenu : les parties demandées sont là (types, possibilités, Claude, installation, comptes, rôles, dépannage, serveur)', () => {
  const ids = new Set(outline().map((e) => e.id));
  for (const id of ['types', 'vocabulaire', 'claude-phrases', 'claude-niveaux', 'claude-jamais', 'claude-envies', 'claude-limites', 'claude-connecter', 'claude-connexions', 'claude-prudence', 'claude-activation',
    'prerequis', 'dossier', 'npm', 'demarrage', 'cle', 'verifications', 'premier-admin', 'creer-comptes', 'premiere-connexion', 'double-auth', 'oubli',
    'faq-hors-ligne', 'faq-photo', 'faq-lien', 'faq-claude', 'sauvegardes', 'restauration', 'mises-a-jour', 'journaux', 'scan-serveur', 'mcp-serveur']) {
    assert.ok(ids.has(id), id);
  }
  const text = allTexts().join('\n');
  // Claude : les deux niveaux, les limites, les envies, LISTO_MCP
  assert.match(text, /« Lecture seule » \(choisi au départ\)/);
  assert.match(text, /« Lecture et écriture » : en plus/);
  assert.match(text, /100 ajouts, 300 éléments cochés ou décochés, 300 éléments modifiés/);
  assert.match(text, /Claude ne reçoit jamais aucune donnée de réservation/);
  assert.match(text, /`LISTO_MCP=on`/);
  assert.match(text, /nouvelle conversation, ou déconnectez puis reconnectez le connecteur/);
  // Le tableau « Qui peut quoi » est dans le chapitre des rôles
  assert.ok(GUIDE.find((c) => c.id === 'roles').blocks.some((b) => b.who));
});

test('aucun secret ni adresse réelle : seulement des exemples inventés ; vouvoiement ; jamais de HTML', () => {
  const text = [allTexts(), allBlocks().filter((b) => b.code).map((b) => b.code)].flat().join('\n');
  // Domaines : l'exemple inventé, et des sites publics connus
  const hosts = [...text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
  // (« ip » : le nom à remplacer de http://IP:13300 et http://IP_LOCALE:13300)
  for (const host of hosts) assert.ok(['listo.exemple.fr', 'securityheaders.com', 'github.com', 'world.openfoodfacts.org', 'platform.claude.com', 'ip'].includes(host), host);
  assert.doesNotMatch(text, /mondomaine/);
  // Adresses IP : seulement le réseau local d'exemple (la liste d'Anthropic est un lien vers sa page officielle, jamais une plage recopiée)
  for (const ip of text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? []) assert.ok(/^192\.168\.1\.\d+$|^0\.0\.0\.0$/.test(ip), ip);
  // Pas de code de démarrage réel, ni de clé
  assert.doesNotMatch(text, /K7RM|BEGIN|sk-/);
  assert.doesNotMatch(text, /(?<!\p{L})(tu|ton|tes|ta)(?!\p{L})/iu, 'vouvoiement');
  for (const file of ['public/js/help-content.js', 'public/js/screens/help.js']) assert.doesNotMatch(code(file), /innerHTML|insertAdjacentHTML|outerHTML/, file);
  // Les guillemets « » ne servent qu'aux libellés : un exemple prend “ ”
  assert.match(text, /“Ajoute du lait chez Leclerc dans la liste Samedi\.”/);
});

test('écran : chapitres numérotés repliables (premier déplié), titres h2 et h3 avec ancres, bouton « Sommaire » accessible', async (t) => {
  const screen = await render(t);
  const buttons = toggles(screen);
  assert.equal(buttons.length, GUIDE.length);
  assert.deepEqual(buttons.map((b) => b.textContent), outline().filter((e) => e.level === 1).map(numbered));
  assert.deepEqual(buttons.map((b) => b.getAttribute('aria-expanded')), GUIDE.map((c, i) => String(i === 0)));
  const bodies = screen.findAll((n) => hasClass(n, 'help__section'));
  assert.deepEqual(bodies.map((b) => b.hidden), GUIDE.map((c, i) => i !== 0));
  buttons.forEach((b, i) => assert.equal(b.getAttribute('aria-controls'), bodies[i].attrs.id));
  buttons[3].click();
  buttons[0].click();
  assert.deepEqual(buttons.map((b) => b.getAttribute('aria-expanded')), GUIDE.map((c, i) => String(i === 3)));
  // Vrais titres : h2 par chapitre, h3 par section, numérotés, avec ancre stable
  const h2 = screen.findAll((n) => n.tag === 'h2');
  const h3 = screen.findAll((n) => n.tag === 'h3');
  assert.equal(h2.length, GUIDE.length);
  assert.deepEqual(h3.map((n) => n.textContent), outline().filter((e) => e.level === 2).map(numbered));
  assert.deepEqual(h3.map((n) => n.attrs.id), outline().filter((e) => e.level === 2).map((e) => `guide-${e.id}`));
  assert.ok([...h2, ...h3].every((n) => n.attrs.tabindex === '-1'), 'focus possible après un saut');
  // Mention des chapitres du serveur
  assert.equal(screen.findAll((n) => hasClass(n, 'help__server')).length, GUIDE.filter((c) => c.server).length);
  assert.ok(screen.textContent.includes(SERVER_NOTE));
  // Bouton « Sommaire » : texte visible, aria-label, aria-expanded, fenêtre annoncée
  const toc = screen.findAll((n) => hasClass(n, 'help__toc-btn'))[0];
  assert.equal(toc.tag, 'button');
  assert.ok(hasClass(toc, 'fab'), 'même bouton flottant que « Nouvelle liste » (56 px)');
  assert.equal(toc.textContent, 'Sommaire');
  assert.equal(toc.attrs['aria-label'], 'Sommaire du guide');
  assert.equal(toc.attrs['aria-expanded'], 'false');
  assert.equal(toc.attrs['aria-haspopup'], 'dialog');
  // Barre du haut, aucun champ de saisie
  assert.equal(screen.findAll((n) => hasClass(n, 'topbar__title'))[0].textContent, 'Aide');
  assert.equal(screen.findAll((n) => n.attrs['aria-label'] === 'Retour').length, 1);
  assert.equal(screen.findAll((n) => n.tag === 'input' || n.tag === 'textarea').length, 0);
  // Renvois : de vrais liens vers #/aide/<section> ; liens externes protégés
  const refs = screen.findAll((n) => hasClass(n, 'help__ref'));
  assert.ok(refs.length > 40);
  assert.ok(refs.every((a) => a.tag === 'a' && /^#\/aide\/[a-z0-9-]+$/.test(a.attrs.href)));
  const external = screen.findAll((n) => n.tag === 'a' && /^https:/.test(n.attrs.href ?? ''));
  assert.ok(external.length >= 1 && external.every((a) => a.attrs.rel === 'noopener noreferrer' && a.attrs.target === '_blank'));
  // Un renvoi déplie le chapitre de sa cible
  const toRestore = refs.find((a) => a.attrs.href === '#/aide/restauration');
  assert.equal(buttons[8].getAttribute('aria-expanded'), 'false');
  toRestore.click();
  assert.equal(buttons[8].getAttribute('aria-expanded'), 'true');
});

test('« Qui peut quoi » : cinq rôles, oui ou non en icône ET en texte ; droits vérifiés', async (t) => {
  assert.deepEqual(ROLES.map((r) => r.label), ['Propriétaire', 'Contributeur', 'Lecture seule', 'Visiteur', 'Admin']);
  const screen = await render(t);
  const rows = screen.findAll((n) => hasClass(n, 'help-who__row'));
  assert.equal(rows.length, PERMISSIONS.length);
  for (const [i, row] of rows.entries()) {
    const roles = row.findAll((n) => hasClass(n, 'help-who__role'));
    assert.equal(roles.length, ROLES.length);
    roles.forEach((chip, j) => {
      const yes = PERMISSIONS[i].roles.includes(ROLES[j].key);
      assert.ok(chip.textContent.endsWith(yes ? ' : oui' : ' : non'), chip.textContent);
      assert.equal(chip.findAll((n) => n.tag === 'use')[0].attrs.href, yes ? '#i-check' : '#i-close');
    });
  }
  const who = (action) => PERMISSIONS.find((p) => p.action.startsWith(action)).roles;
  assert.deepEqual(who('Modifier la liste'), ['owner']);
  assert.deepEqual(who('Partager la liste'), ['owner']);
  assert.deepEqual(who('Créer un lien public'), ['owner']);
  assert.deepEqual(who('Supprimer la liste'), ['owner']);
  assert.deepEqual(who('Dupliquer la liste'), ['owner', 'contributor']);
  assert.deepEqual(who('Quitter la liste'), ['contributor', 'reader']);
  assert.deepEqual(who('Cocher'), ['owner', 'contributor']);
  assert.ok(!who('Voir la liste').includes('admin'), 'l\'Admin ne voit pas les listes des autres');
  assert.ok(who('Réserver').includes('visitor'), 'un visiteur réserve par le lien d\'une liste d\'envies');
  assert.ok(screen.textContent.includes(PERMISSIONS_NOTE));
});

test('tableaux en blocs empilés (320 px) ; commandes en bloc de code ; encadrés', async (t) => {
  const screen = await render(t);
  const tables = allBlocks().filter((b) => b.table);
  assert.equal(screen.findAll((n) => hasClass(n, 'help-table')).length, tables.length);
  assert.equal(screen.findAll((n) => hasClass(n, 'help-table__row')).length, tables.reduce((n, b) => n + b.table.rows.length, 0));
  assert.equal(screen.findAll((n) => n.tag === 'pre').length, allBlocks().filter((b) => b.code !== undefined).length);
  assert.equal(screen.findAll((n) => hasClass(n, 'help__note-box')).length, allBlocks().filter((b) => b.note).length);
  const css = read('public/css/app.css');
  assert.match(css, /\.help__code \{[^}]*white-space: break-spaces; overflow-wrap: anywhere;/);
  assert.match(css, /\.help-toc__entry \{[^}]*min-height: var\(--tap-min\)/);
  assert.match(css, /\.help-toc__entry\.is-current \{[^}]*font-weight: 700/);
  assert.match(css, /\.help-who__role--no \{[^}]*border: 1px dashed/);
});

test('sommaire : feuille du kit (openSheet), section en cours repérée sans la couleur seule, « Haut de page », focus rendu', () => {
  const screen = code('public/js/screens/help.js');
  assert.match(screen, /openSheet\(\{\s*title: 'Sommaire',/);
  assert.match(screen, /returnTo: tocButton,/);
  assert.match(screen, /'aria-current': current \? 'location' : null/);
  assert.match(screen, /current \? icon\('chev-r', 'icon--sm'\) : null/);
  assert.match(screen, /\(section en cours\)/);
  assert.match(screen, /'Haut de page'/);
  assert.match(screen, /tocButton\.setAttribute\('aria-expanded', 'false'\)/);
  // La fenêtre (ui.js) se ferme par Échap, par la croix « Fermer » et rend le focus
  const ui = code('public/js/ui.js');
  assert.match(ui, /if \(event\.key === 'Escape'\) close\(\);/);
  assert.match(ui, /iconButton\('close', 'Fermer', close\)/);
  assert.match(ui, /opener\.focus\(\)/);
});

test('hors ligne : les fichiers de l\'aide sont gardés par le service worker, nouvelle version', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /'\/js\/help-content\.js',/);
  assert.match(sw, /'\/js\/screens\/help\.js',/);
  assert.match(sw, /const VERSION = `v6[7-9]-/);
});
