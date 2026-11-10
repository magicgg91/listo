// Page « Aide » (#/aide, #/aide/<section>) : le guide numéroté en 8
// chapitres, source unique (public/js/help-content.js), recherche, chapitres
// repliables, bouton « Sommaire » (chapitres repliables, un seul déplié),
// même contenu et mêmes numéros pour tout le monde, disponible hors ligne ;
// tout ce qui concerne Claude dans « MCP Claude » ; l'entretien du serveur
// dans docs/exploitation.md, hors du guide. Un petit faux document suffit pour dessiner l'écran ; la
// feuille du sommaire, les sauts et le thème sont vérifiés dans Chromium
// (docs/developpement.md, point 36).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { matchRoute, ROUTES } from '../public/js/router.js';
import { GUIDE, PERMISSIONS, PERMISSIONS_NOTE, ROLES, SERVER_NOTE, outline, numbered, parseInline, refLabel, blockTexts, searchGuide, plainText } from '../public/js/help-content.js';
import { resultsLabel } from '../public/js/search.js';

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
  set textContent(text) { this.children = text === '' ? [] : [new FakeText(text)]; }
  replaceChildren(...nodes) { this.children = nodes; }
  fire(type, event = {}) { for (const fn of this.listeners[type] ?? []) fn({ preventDefault() {}, ...event }); }
  focus() { this.focused = true; }
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
  assert.match(code('public/js/app.js'), /case 'help': mount\(\(\) => renderHelp\(\), \{ wide: true \}\); break;/);
  assert.match(code('public/js/app.js'), /case 'helpSection': mount\(\(\) => renderHelp\(params\.section\), \{ wide: true \}\); break;/);
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
  assert.deepEqual(GUIDE.map((c) => c.id), ['presentation', 'possibilites', 'installation', 'comptes', 'quotidien', 'notifications', 'roles', 'claude', 'faq']);
  assert.equal(GUIDE.find((c) => c.id === 'claude').title, 'MCP Claude');
  assert.deepEqual(entries.filter((e) => e.chapter === 'roles').map((e) => e.id).filter((id) => id.startsWith('role-')),
    ['role-admin', 'role-contributeur', 'role-lecture', 'role-visiteur', 'role-beneficiaire']);
  // Aucun numéro écrit à la main dans les titres
  for (const e of entries) assert.doesNotMatch(e.title, /^\d/, e.title);
  assert.equal(numbered(entries[0]), '1. Présentation');
  assert.equal(numbered(entries[1]), '1.1 Ce qu\'est Listo');
  // Même contenu pour tout le monde : plus de section réservée aux Admin
  assert.ok(GUIDE.every((c) => !('adminOnly' in c)));
  // Parties du serveur : marquées (un chapitre, et des sections d'autres chapitres)
  assert.deepEqual(GUIDE.filter((c) => c.server).map((c) => c.id), ['installation']);
  assert.deepEqual(GUIDE.flatMap((c) => (c.sections ?? []).filter((s) => s.server).map((s) => s.id)), ['secours', 'notif-serveur', 'mcp-serveur', 'mcp-regles', 'mcp-essai', 'cle-perdue']);
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
  assert.equal(refLabel('sauvegardes'), '3.8 Sauvegardes');
  assert.throws(() => refLabel('inconnu'));
  const kinds = new Set(allBlocks().map((b) => (typeof b === 'string' ? 'p' : Object.keys(b)[0])));
  assert.deepEqual([...kinds].sort(), ['code', 'note', 'ol', 'p', 'sub', 'table', 'ul', 'who']);
  // Découpage du texte enrichi
  assert.deepEqual(parseInline('Voir [[npm]] et `docker logs listo`, ou [le site](https://exemple.fr).'),
    [{ text: 'Voir ' }, { ref: 'npm' }, { text: ' et ' }, { code: 'docker logs listo' }, { text: ', ou ' }, { link: 'le site', href: 'https://exemple.fr' }, { text: '.' }]);
  assert.deepEqual(parseInline('[lien](javascript:alert(1))'), [{ text: '[lien](javascript:alert(1))' }], 'seulement https');
});

test('contenu : les parties demandées sont là (types, possibilités, MCP Claude, installation, comptes, rôles, dépannage)', () => {
  const ids = new Set(outline().map((e) => e.id));
  for (const id of ['types', 'vocabulaire', 'claude-phrases', 'claude-niveaux', 'claude-jamais', 'claude-envies', 'claude-limites', 'claude-connecter', 'claude-connexions', 'claude-prudence', 'claude-activation',
    'prerequis', 'dossier', 'proxy', 'npm', 'demarrage', 'cle', 'sauvegardes', 'verifications', 'premier-admin', 'creer-comptes', 'premiere-connexion', 'double-auth', 'oubli', 'secours',
    'faq-hors-ligne', 'faq-photo', 'faq-lien', 'faq-double-auth', 'cle-perdue', 'version', 'faq-claude', 'mcp-serveur', 'mcp-regles', 'mcp-essai']) {
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

test('écran : chapitres numérotés repliables (premier déplié), titres h2 et h3 avec ancres, trois boutons flottants accessibles', async (t) => {
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
  // Mention des parties du serveur (chapitre et sections)
  assert.equal(screen.findAll((n) => hasClass(n, 'help__server')).length, GUIDE.filter((c) => c.server).length + GUIDE.flatMap((c) => c.sections ?? []).filter((x) => x.server).length);
  assert.ok(screen.textContent.includes(SERVER_NOTE));
  // Trois boutons flottants ronds, icône seule (aucun texte visible), nom
  // pour les lecteurs d'écran et info-bulle ; de haut en bas dans la pile :
  // retour en haut (caché au départ), loupe, sommaire
  const fabs = screen.findAll((n) => hasClass(n, 'help-fab'));
  assert.deepEqual(fabs.map((b) => b.attrs['aria-label']), ['Retour en haut de la page', 'Rechercher dans le guide', 'Sommaire du guide']);
  assert.ok(fabs.every((b) => b.tag === 'button' && b.textContent === '' && b.attrs['data-tip'] === b.attrs['aria-label']));
  assert.deepEqual(fabs.map((b) => b.hidden), [true, false, false]);
  const [topFab, searchFab, toc] = fabs;
  assert.ok(hasClass(toc, 'help__toc-btn'));
  assert.equal(toc.attrs['aria-expanded'], 'false');
  assert.equal(toc.attrs['aria-haspopup'], 'dialog');
  assert.equal(searchFab.attrs['aria-expanded'], 'false');
  assert.equal(searchFab.attrs['aria-controls'], 'aide-recherche');
  // La barre de recherche n'apparaît qu'après la loupe ; le curseur y va
  // alors (exception voulue) ; « Fermer la recherche » remet tout
  const bar = screen.findAll((n) => n.attrs.id === 'aide-recherche')[0];
  assert.equal(bar.hidden, true);
  const searchField = bar.findAll((n) => n.tag === 'input')[0];
  assert.equal(searchField.focused, undefined, 'aucun curseur au départ');
  searchFab.click();
  assert.equal(bar.hidden, false);
  assert.equal(searchFab.getAttribute('aria-expanded'), 'true');
  assert.equal(searchField.focused, true, 'la loupe met le curseur dans le champ');
  bar.findAll((n) => n.attrs['aria-label'] === 'Fermer la recherche')[0].click();
  assert.equal(bar.hidden, true);
  assert.equal(searchFab.getAttribute('aria-expanded'), 'false');
  assert.equal(searchFab.focused, true, 'focus rendu à la loupe');
  assert.ok(topFab);
  // Barre du haut, aucun champ de saisie
  assert.equal(screen.findAll((n) => hasClass(n, 'topbar__title'))[0].textContent, 'Aide');
  assert.equal(screen.findAll((n) => n.attrs['aria-label'] === 'Retour').length, 1);
  // Un seul champ, la recherche
  const fields = screen.findAll((n) => n.tag === 'input' || n.tag === 'textarea');
  assert.equal(fields.length, 1);
  // Renvois : de vrais liens vers #/aide/<section> ; liens externes protégés
  const refs = screen.findAll((n) => hasClass(n, 'help__ref'));
  assert.ok(refs.length > 40);
  assert.ok(refs.every((a) => a.tag === 'a' && /^#\/aide\/[a-z0-9-]+$/.test(a.attrs.href)));
  const external = screen.findAll((n) => n.tag === 'a' && /^https:/.test(n.attrs.href ?? ''));
  assert.ok(external.length >= 1 && external.every((a) => a.attrs.rel === 'noopener noreferrer' && a.attrs.target === '_blank'));
  // Un renvoi déplie le chapitre de sa cible
  const toBackups = refs.find((a) => a.attrs.href === '#/aide/sauvegardes');
  const install = GUIDE.findIndex((c) => c.id === 'installation');
  if (buttons[install].getAttribute('aria-expanded') === 'true') buttons[install].click(); // replié d'abord
  assert.equal(buttons[install].getAttribute('aria-expanded'), 'false');
  toBackups.click();
  assert.equal(buttons[install].getAttribute('aria-expanded'), 'true');
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
  assert.match(screen, /tocContent\(\{ entries, here, hereChapter, onChoose: choose \}\)/);
  assert.match(screen, /current \? icon\('chev-r', 'icon--sm'\) : null/);
  assert.match(screen, /\(section en cours\)/);
  assert.match(screen, /'Haut de page'/);
  assert.match(screen, /tocButton\.setAttribute\('aria-expanded', 'false'\)/);
  // La fenêtre (ui.js) se ferme par Échap, par la croix « Fermer » et rend le focus
  const ui = code('public/js/ui.js');
  assert.match(ui, /if \(event\.key === 'Escape'\) close\(\);/);
  assert.match(ui, /iconButton\('close', 'Fermer', \(\) => close\(\)\)/);
  assert.match(ui, /opener\.focus\(\)/);
});

test('hors ligne : les fichiers de l\'aide sont gardés par le service worker, nouvelle version', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /'\/js\/help-content\.js',/);
  assert.match(sw, /'\/js\/screens\/help\.js',/);
  assert.match(sw, /const VERSION = `v(69|[7-9]\d|\d{3,})-/);
  assert.match(sw, /'\/js\/search\.js',/);
});

// --- Recherche dans le guide ---

test('recherche (source) : titres et texte, majuscules et accents ignorés ; chapitres et sections trouvés ; compteur ; rien trouvé', () => {
  assert.equal(searchGuide(''), null);
  assert.equal(searchGuide('   '), null);
  const a = searchGuide('sauvegarde');
  const b = searchGuide('SAUVEGARDÉ');
  assert.deepEqual(a, b, 'majuscules et accents ignorés');
  assert.ok(a.count >= 3, `${a.count} résultats`);
  const install = a.chapters.find((c) => c.id === 'installation');
  assert.ok(install.sections.includes('sauvegardes') && install.sections.includes('cle'));
  assert.ok(!install.sections.includes('npm'), 'une section sans le mot est masquée');
  assert.ok(!a.chapters.some((c) => c.id === 'quotidien'), 'un chapitre sans le mot est masqué');
  // Le texte des renvois, du code et des tableaux compte aussi
  assert.ok(searchGuide('LISTO_MCP').chapters.some((c) => c.id === 'claude'));
  assert.ok(searchGuide('docker-compose.yml').count > 0);
  assert.ok(searchGuide('Lecture seule').chapters.some((c) => c.id === 'roles' && c.intro), '« Qui peut quoi » compte');
  // Un titre de chapitre trouvé : tout le chapitre
  const claude = searchGuide('mcp claude').chapters.find((c) => c.id === 'claude');
  assert.equal(claude.sections.length, GUIDE.find((c) => c.id === 'claude').sections.length);
  // Rien
  assert.deepEqual(searchGuide('zzqqxw'), { chapters: [], count: 0 });
  // Caractères spéciaux : jamais lus comme une expression
  assert.doesNotThrow(() => searchGuide('(*[<&'));
  assert.equal(plainText('Voir [[sauvegardes]] et `docker logs listo`.'), 'Voir 3.8 Sauvegardes et docker logs listo.');
});

test('recherche (écran) : champ du kit, résultats surlignés en DOM, « N résultats » annoncé, rien trouvé, Échap et la croix effacent', async (t) => {
  const screen = await render(t);
  const input = screen.findAll((n) => n.tag === 'input')[0];
  assert.equal(input.attrs['aria-label'], 'Rechercher dans le guide');
  assert.equal(input.attrs.type, 'search');
  assert.ok(screen.findAll((n) => hasClass(n, 'searchfield')).length === 1, 'composant .searchfield du kit');
  const status = screen.findAll((n) => n.attrs.role === 'status')[0];
  const clear = screen.findAll((n) => n.attrs['aria-label'] === 'Effacer la recherche')[0];
  assert.equal(clear.hidden, true);
  const chapters = () => toggles(screen).map((b) => b.textContent);
  assert.equal(chapters().length, 9);
  // Taper : seuls les chapitres trouvés, dépliés ; texte surligné ; compteur
  input.value = 'SAUVEGARDÉ';
  input.fire('input');
  const expected = searchGuide('sauvegarde');
  assert.equal(status.textContent, resultsLabel(expected.count));
  assert.equal(chapters().length, expected.chapters.length);
  assert.ok(toggles(screen).every((b) => b.getAttribute('aria-expanded') === 'true'));
  assert.equal(screen.findAll((n) => n.tag === 'h3').length, expected.chapters.reduce((n, c) => n + c.sections.length, 0));
  const marks = screen.findAll((n) => n.tag === 'mark');
  assert.ok(marks.length >= expected.count);
  assert.ok(marks.every((m) => m.attrs.class === 'hit' && /^sauvegard/i.test(m.textContent)), marks.map((m) => m.textContent).join(','));
  assert.equal(clear.hidden, false);
  // Rien trouvé : message, « 0 résultat »
  input.value = 'zzqqxw';
  input.fire('input');
  assert.equal(status.textContent, '0 résultat');
  assert.equal(chapters().length, 0);
  assert.match(screen.textContent, /Aucun résultat\./);
  // Échap : tout revient (9 chapitres, le premier déplié, rien de surligné)
  input.fire('keydown', { key: 'Escape' });
  assert.equal(input.value, '');
  assert.equal(status.textContent, '');
  assert.equal(chapters().length, 9);
  assert.equal(screen.findAll((n) => n.tag === 'mark').length, 0);
  assert.equal(toggles(screen)[0].getAttribute('aria-expanded'), 'true');
  // La croix aussi
  input.value = 'claude';
  input.fire('input');
  assert.ok(chapters().length < 8);
  clear.click();
  assert.equal(chapters().length, 9);
  assert.equal(clear.hidden, true);
  // Jamais de HTML : le surlignage est posé en DOM
  assert.doesNotMatch(code('public/js/screens/help.js'), /innerHTML|insertAdjacentHTML/);
  assert.match(code('public/js/screens/help.js'), /h\('mark', \{ class: 'hit' \}, part\.text\)/);
});

test('sommaire à deux niveaux : chapitres seulement, un seul déplié (celui de la section en cours), « Aller au chapitre », aria-expanded et aria-controls, saut', async (t) => {
  fakeDom(t);
  const { tocContent } = await import('../public/js/screens/help.js');
  const chosen = [];
  const entries = outline();
  const nav = tocContent({ entries, here: 'sauvegardes', hereChapter: 'installation', onChoose: (id) => chosen.push(id) });
  const chapterButtons = nav.findAll((n) => hasClass(n, 'help-toc__chapter'));
  assert.deepEqual(chapterButtons.map((b) => b.textContent), entries.filter((e) => e.level === 1).map(numbered));
  const subs = nav.findAll((n) => hasClass(n, 'help-toc__list--sub'));
  chapterButtons.forEach((b, i) => assert.equal(b.attrs['aria-controls'], subs[i].attrs.id));
  const expanded = () => chapterButtons.map((b) => b.getAttribute('aria-expanded'));
  assert.deepEqual(expanded(), GUIDE.map((c) => String(c.id === 'installation')), 'le chapitre de la section en cours');
  assert.deepEqual(subs.map((sub) => sub.hidden), GUIDE.map((c) => c.id !== 'installation'));
  // « Aller au chapitre » en premier, puis les sections
  const at = (id) => GUIDE.findIndex((c) => c.id === id); // place d'un chapitre (ordre calculé)
  const first = subs[at('installation')].findAll((n) => n.tag === 'button');
  assert.equal(first[0].textContent, 'Aller au chapitre');
  assert.deepEqual(first.slice(1).map((b) => b.textContent.replace(' (section en cours)', '')), entries.filter((e) => e.chapter === 'installation').map(numbered));
  // Section en cours : aria-current, icône ET texte caché pour les lecteurs d'écran
  const current = nav.findAll((n) => n.attrs['aria-current'] === 'location');
  assert.equal(current.length, 1);
  assert.match(current[0].textContent, /3\.8 Sauvegardes \(section en cours\)/);
  assert.equal(current[0].findAll((n) => n.tag === 'use')[0].attrs.href, '#i-chev-r');
  // Un autre chapitre : il se déplie, le premier se replie (un seul à la fois)
  chapterButtons[at('claude')].click();
  assert.deepEqual(expanded(), GUIDE.map((c) => String(c.id === 'claude')));
  chapterButtons[at('claude')].click();
  assert.ok(expanded().every((v) => v === 'false'), 'retoucher le replie');
  // Saut : l'entrée touchée est transmise (la feuille se ferme et l'écran saute)
  chapterButtons[at('claude')].click();
  subs[at('claude')].findAll((n) => n.tag === 'button')[0].click();
  subs[at('claude')].findAll((n) => n.tag === 'button')[2].click();
  nav.findAll((n) => hasClass(n, 'help-toc__top'))[0].click();
  assert.deepEqual(chosen, ['claude', entries.filter((e) => e.chapter === 'claude')[1].id, 'top']);
  // 44 px : entrées et chapitres
  assert.match(read('public/css/app.css'), /\.help-toc__entry \{[^}]*min-height: var\(--tap-min\)/);
});

// --- Structure : chapitre serveur retiré, Claude regroupé ---

test('plus de chapitre « Gérer le serveur » : son entretien est dans docs/exploitation.md (écrit à la main), les cinq sujets gardés sont dans le guide', () => {
  const ids = new Set(outline().map((e) => e.id));
  for (const gone of ['serveur', 'restauration', 'mises-a-jour', 'revenir', 'migrations', 'surveillance', 'journaux', 'scan-serveur']) assert.ok(!ids.has(gone), gone);
  const text = [allTexts(), allBlocks().filter((b) => b.code).map((b) => b.code)].flat().join('\n');
  for (const marker of ['Dependabot', 'npm audit', 'sha-xxxxxxx', 'listo-avant-restauration', 'journal.log.1', 'Ce qu\'Open Food Facts apprend', 'docker compose pull', 'Migration 15']) {
    assert.ok(!text.includes(marker), `encore dans le guide : ${marker}`);
  }
  // Où sont passés les cinq sujets gardés
  const chapterOf = (id) => outline().find((e) => e.id === id).chapter;
  assert.equal(chapterOf('sauvegardes'), 'installation');
  assert.equal(chapterOf('cle'), 'installation');
  assert.equal(chapterOf('secours'), 'comptes');
  assert.equal(chapterOf('faq-double-auth'), 'faq');
  assert.equal(chapterOf('cle-perdue'), 'faq');
  assert.equal(chapterOf('version'), 'faq');
  // Le guide d'exploitation : écrit à la main, avec un sommaire et les ancres des sections retirées
  const expl = read('docs/exploitation.md');
  assert.doesNotMatch(expl, /Fichier fabriqué/);
  assert.match(expl, /## Sommaire/);
  for (const id of ['restauration', 'mises-a-jour', 'revenir', 'migrations', 'surveillance', 'journaux', 'depannage-serveur', 'scan-serveur']) {
    assert.match(expl, new RegExp(`<a id="${id}"></a>`), id);
    assert.match(expl, new RegExp(`\\]\\(#${id}\\)`), `sommaire : ${id}`);
  }
  for (const marker of ['Dependabot', 'npm audit', 'sha-xxxxxxx', 'listo-avant-restauration', 'journal.log.1', 'Ce qu\'Open Food Facts apprend', 'docker compose pull', 'Migration 15']) {
    assert.ok(expl.includes(marker), `perdu : ${marker}`);
  }
  // Le guide y renvoie en une ligne, sans l'inclure (ni l'application, ni le site)
  assert.match(text, /guide d'exploitation, dans le dépôt/);
});

test('« MCP Claude » regroupe tout ce qui concerne Claude ; ailleurs, au plus un renvoi', () => {
  const claude = GUIDE.find((c) => c.id === 'claude');
  const claudeIds = new Set([claude.id, ...claude.sections.map((s) => s.id)]);
  for (const id of ['claude-quoi', 'claude-phrases', 'claude-niveaux', 'claude-jamais', 'claude-envies', 'claude-limites', 'claude-connecter', 'claude-connexions', 'claude-prudence', 'faq-claude', 'claude-activation', 'mcp-serveur', 'mcp-regles', 'mcp-essai']) {
    assert.ok(claudeIds.has(id), id);
  }
  // Dans les autres chapitres, une phrase qui parle de Claude renvoie au chapitre
  for (const chapter of GUIDE.filter((c) => c.id !== 'claude')) {
    // (une ligne de tableau se lit en entier : la cellule de renvoi compte)
    const textsOf = (block) => (block.table ? block.table.rows.map((row) => row.join(' | ')) : blockTexts(block));
    const texts = [chapter.title, ...(chapter.blocks ?? []).flatMap(textsOf), ...(chapter.sections ?? []).flatMap((s) => [s.title, ...(s.blocks ?? []).flatMap(textsOf)])];
    for (const text of texts.filter((x) => /Claude|MCP/.test(x))) {
      const refs = parseInline(text).filter((p) => p.ref !== undefined).map((p) => p.ref);
      assert.ok(refs.some((id) => claudeIds.has(id)), `${chapter.id} : « ${text.slice(0, 80)} » sans renvoi vers « MCP Claude »`);
    }
  }
  // Ce qui concernait Claude n'est pas perdu
  const claudeText = claude.sections.flatMap((s) => (s.blocks ?? []).flatMap(blockTexts)).join('\n');
  for (const marker of ['nouvelle conversation', 'LISTO_MCP=on', 'IPv4', 'Proxy : rien à régler', 'claude.origine_refusee', 'Premier', 'rayon ou un magasin est inconnu', 'ne voit pas les connexions Claude des autres comptes', 'platform.claude.com']) {
    assert.ok(claudeText.includes(marker) || claude.sections.some((s) => s.title.includes(marker)), marker);
  }
});

// --- Boutons flottants : non-régression du bouton « Sommaire » disparu ---
// (vérifié aussi dans Chromium à 320, 390 et 768 px, en clair et en sombre,
// en haut, au milieu et tout en bas de la page : voir docs/developpement.md)
test('boutons flottants : pile au-dessus de la zone de sécurité, place gardée en bas de page, 44 px au moins, cachés sans JavaScript sur le site', () => {
  const css = read('public/css/app.css');
  assert.match(css, /\.help-screen, \.site, \.help-fabs \{ --help-fab: 48px; \}/);
  assert.match(css, /\.help-fabs \{ position: absolute; right: var\(--space-2\); bottom: calc\(var\(--space-3\) \+ env\(safe-area-inset-bottom, 0px\)\); z-index: 5; display: flex; flex-direction: column;/);
  assert.match(css, /\.help-fab \{[^}]*width: var\(--help-fab\); height: var\(--help-fab\);[^}]*border-radius: 50%;/);
  assert.match(css, /\.help-fab\[hidden\] \{ display: none; \}/);
  // Le bas de la page garde la place des trois boutons (rien de caché dessous)
  assert.match(css, /\.help \{ padding-top: 0; padding-bottom: calc\(var\(--help-fab\) \* 3 \+ 12px \* 2 \+ var\(--space-3\) \* 2 \+ env\(safe-area-inset-bottom, 0px\)\); \}/);
  // Info-bulle seulement avec une souris, au survol ET au focus clavier
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.help-fab::after \{ content: attr\(data-tip\);/);
  assert.match(css, /\.help-fab:hover::after, \.help-fab:focus-visible::after \{ display: block; \}/);
  // Site : pile fixée à la fenêtre, cachée sans JavaScript
  const site = read('scripts/site-assets/site.css');
  assert.match(site, /\.site \.help-fabs \{ position: fixed;/);
  assert.match(site, /\.site \.help-fabs\[hidden\] \{ display: none; \}/);
  assert.match(site, /\.site__inner \{[^}]*padding: var\(--space-2\) var\(--space-2\) calc\(var\(--help-fab\) \* 3 \+ 12px \* 2 \+ var\(--space-3\) \* 2 \+ env\(safe-area-inset-bottom, 0px\)\);/);
  // Retour en haut : sans animation si moins de mouvement est demandé
  assert.match(code('public/js/screens/help.js'), /matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\.matches;\s*body\.scrollTo\?\.\(\{ top: 0, behavior: still \? 'auto' : 'smooth' \}\);\s*topTitle\.focus\(\{ preventScroll: true \}\);/);
});

test('chapitre « Notifications » : son sommaire, ses sujets ; plus aucune affirmation « pas de notification » ; trois exceptions au principe', () => {
  const chapter = GUIDE.find((c) => c.id === 'notifications');
  assert.equal(chapter.title, 'Notifications');
  assert.equal(GUIDE.indexOf(chapter), GUIDE.findIndex((c) => c.id === 'quotidien') + 1, 'juste après « Au quotidien »');
  assert.deepEqual(chapter.sections.map((s) => s.id), ['notif-activer', 'notif-recevoir', 'notif-detail', 'notif-silencer', 'notif-limites', 'notif-confidentialite', 'notif-serveur', 'notif-depannage']);
  const text = JSON.stringify(chapter);
  for (const needle of ['Android', 'Ordinateur', 'iPhone', 'accueil', 'une minute', '8 h', '« Afficher le détail dans la notification »', '« Silencer cette liste »', '30 notifications par personne et par heure', 'Apple', 'Google', 'Mozilla', 'Microsoft', 'LISTO_PUSH=on', 'désactivée par défaut', 'refusées', 'Firefox', 'secrets/vapid.json']) {
    assert.ok(text.includes(needle), needle);
  }
  // Dans la recherche du guide
  assert.ok(searchGuide('notification').chapters.some((c) => c.id === 'notifications'));
  // L'ancienne affirmation a disparu partout (guide, aide, site, documents)
  const sources = ['public/js/help-content.js', 'docs/guide.md', 'site/index.html', 'README.md', 'SECURITY.md', 'docs/exploitation.md'];
  for (const file of sources) {
    assert.doesNotMatch(read(file), /pas de notification|aucune notification|sans notification|ne vous dérange/i, file);
  }
  // Le principe et ses trois exceptions (version, scan, notifications)
  const limits = JSON.stringify(GUIDE.find((c) => c.id === 'presentation').sections.find((s) => s.id === 'limites'));
  assert.match(limits, /Aucune donnée envoyée ailleurs que sur votre serveur, sauf trois exceptions/);
  for (const needle of ['GitHub', 'Open Food Facts', 'notifications']) assert.ok(limits.includes(needle), needle);
});
