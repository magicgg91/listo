// Fabrique, à partir de la source unique du guide (public/js/help-content.js,
// la même que la page « Aide » de l'application) :
// - docs/guide.md, le guide dans le dépôt ;
// - site/, la page publique du guide (GitHub Pages, .github/workflows/pages.yml) :
//   index.html (fabriquée ici), listo.css (copie du kit de l'application),
//   guide.css (règles de la page « Aide » de public/css/app.css, puis
//   scripts/site-assets/site.css), guide.js (scripts/site-assets/guide.js)
//   et icon.svg (public/icons/icon.svg). Ne jamais modifier site/ à la main.
//
// À lancer à la main après chaque changement du guide :
//   node scripts/guide.js        (ou : npm run guide)
// Le test test/guide.test.js échoue tant que docs/guide.md ou site/ ne sont
// pas à jour.
//
// Aucune dépendance : Markdown et HTML sont écrits ici, ligne par ligne. Les
// numéros viennent de outline() (jamais écrits à la main) ; chaque titre a
// une ancre stable (l'identifiant de sa section), la même dans docs/guide.md,
// sur la page publique et dans l'application.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDE, ROLES, PERMISSIONS, PERMISSIONS_NOTE, SERVER_NOTE, outline, parseInline, refLabel, numbered } from '../public/js/help-content.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GUIDE_FILE = path.join(ROOT, 'docs', 'guide.md');
export const SITE_DIR = path.join(ROOT, 'site');
export const SITE_URL = 'https://magicgg91.github.io/listo/';
const REPO_URL = 'https://github.com/magicgg91/listo';
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Caractères qui changeraient la mise en forme Markdown d'un texte ordinaire
const escape = (text) => text.replace(/([\\*_[\]<>#|])/g, '\\$1');

// Un texte avec `code`, [[renvoi]] et [lien](https://…), en Markdown
export function inlineMarkdown(text) {
  return parseInline(text).map((part) => {
    if (part.code !== undefined) return `\`${part.code}\``;
    if (part.ref !== undefined) return `[${escape(refLabel(part.ref))}](#${part.ref})`;
    if (part.link !== undefined) return `[${escape(part.link)}](${part.href})`;
    return escape(part.text);
  }).join('');
}

// Une cellule de tableau : pas de retour à la ligne, | protégé
const cell = (text) => inlineMarkdown(text).replace(/\n/g, ' ');

function table(head, rows) {
  return [
    `| ${head.map(cell).join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}

// Le tableau « Qui peut quoi », avec « Oui » et « Non » en toutes lettres
function whoTable() {
  return [
    table(['Action', ...ROLES.map((r) => r.label)],
      PERMISSIONS.map((p) => [p.action, ...ROLES.map((r) => (p.roles.includes(r.key) ? 'Oui' : 'Non'))])),
    '',
    inlineMarkdown(PERMISSIONS_NOTE),
  ].join('\n');
}

function block(entry) {
  if (typeof entry === 'string') return inlineMarkdown(entry);
  if (entry.ul) return entry.ul.map((text) => `- ${inlineMarkdown(text)}`).join('\n');
  if (entry.ol) return entry.ol.map((text, i) => `${i + 1}. ${inlineMarkdown(text)}`).join('\n');
  if (entry.code !== undefined) return ['```sh', entry.code, '```'].join('\n');
  if (entry.table) return table(entry.table.head, entry.table.rows);
  if (entry.note) return `> **Attention** : ${inlineMarkdown(entry.note)}`;
  if (entry.sub) return `**${inlineMarkdown(entry.sub)}**`;
  if (entry.who) return whoTable();
  throw new Error(`Bloc inconnu dans le guide : ${JSON.stringify(entry).slice(0, 80)}`);
}

// Le document entier
export function guideMarkdown() {
  const entries = outline();
  const entryOf = new Map(entries.map((e) => [e.id, e]));
  const out = [
    '# Listo : le guide',
    '',
    '<!-- Fichier fabriqué par scripts/guide.js à partir de public/js/help-content.js : ne pas le modifier à la main. -->',
    '',
    `Le mode d'emploi complet de Listo, le même que la page « Aide » de l'application (Réglages › « Aide ») et que la page en ligne [${SITE_URL}](${SITE_URL}). Les parties marquées « Pour la personne qui gère le serveur » ne concernent que l'installation du serveur ; son entretien (restauration, mises à jour, journaux) est décrit dans le guide d'exploitation, [docs/exploitation.md](exploitation.md).`,
    '',
    '## Sommaire',
    '',
    // Chapitres seulement ; chacun déplie ses sections (<details>, affiché
    // par GitHub) : « Aller au chapitre », puis les sections
    ...entries.filter((e) => e.level === 1).flatMap((chapter) => [
      '<details>',
      `<summary>${html(numbered(chapter))}</summary>`,
      '',
      `- [Aller au chapitre](#${chapter.id})`,
      ...entries.filter((e) => e.chapter === chapter.id).map((e) => `- [${escape(numbered(e))}](#${e.id})`),
      '',
      '</details>',
      '',
    ]),
  ];
  const heading = (level, id) => ['', `<a id="${id}"></a>`, '', `${'#'.repeat(level)} ${escape(numbered(entryOf.get(id)))}`];
  for (const chapter of GUIDE) {
    out.push(...heading(2, chapter.id));
    if (chapter.server) out.push('', `*${SERVER_NOTE}.*`);
    for (const entry of chapter.blocks ?? []) out.push('', block(entry));
    for (const section of chapter.sections ?? []) {
      out.push(...heading(3, section.id));
      if (section.server && !chapter.server) out.push('', `*${SERVER_NOTE}.*`);
      for (const entry of section.blocks ?? []) out.push('', block(entry));
    }
  }
  out.push('');
  return out.join('\n');
}

// --- Page publique (site/) ---

// Texte posé dans du HTML : jamais interprété comme du balisage
export const html = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const svgIcon = (name, size = '') => `<svg class="icon${size ? ` ${size}` : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// Un texte avec `code`, [[renvoi]] et [lien](https://…), en HTML
export function inlineHtml(text) {
  return parseInline(text).map((part) => {
    if (part.code !== undefined) return `<code class="help__code-inline">${html(part.code)}</code>`;
    if (part.ref !== undefined) return `<a class="help__ref" href="#${part.ref}">${html(refLabel(part.ref))}</a>`;
    if (part.link !== undefined) return `<a href="${html(part.href)}" rel="noopener noreferrer">${html(part.link)}</a>`;
    return html(part.text);
  }).join('');
}

// « Qui peut quoi » : le même balisage que l'application (oui / non en
// icône ET en texte)
function whoHtml() {
  const rows = PERMISSIONS.map((p) => `<div class="help-who__row"><p class="help-who__action">${html(p.action)}</p><ul class="help-who__roles">${ROLES.map((r) => {
    const yes = p.roles.includes(r.key);
    return `<li class="chip help-who__role help-who__role--${yes ? 'yes' : 'no'}">${svgIcon(yes ? 'check' : 'close', 'icon--xs')}<span>${html(r.label)}</span><span class="visually-hidden"> : ${yes ? 'oui' : 'non'}</span></li>`;
  }).join('')}</ul></div>`).join('\n');
  return `<div class="help-who"><div class="group">\n${rows}\n</div><p class="help__note">${inlineHtml(PERMISSIONS_NOTE)}</p></div>`;
}

// Tableau en blocs empilés (lisible à 320 px), comme dans l'application
function tableHtml({ head, rows }) {
  return `<div class="help-table" role="list">${rows.map((row) => `<div class="help-table__row" role="listitem"><p class="help-table__key">${inlineHtml(row[0])}</p>${row.slice(1).map((value, i) => `<p class="help-table__cell"><span class="help-table__head">${html(head[i + 1])} : </span>${inlineHtml(value)}</p>`).join('')}</div>`).join('\n')}</div>`;
}

function blockHtml(entry) {
  if (typeof entry === 'string') return `<p class="help__text">${inlineHtml(entry)}</p>`;
  if (entry.ul) return `<ul class="help__list">${entry.ul.map((t) => `<li>${inlineHtml(t)}</li>`).join('')}</ul>`;
  if (entry.ol) return `<ol class="help__list help__list--steps">${entry.ol.map((t) => `<li>${inlineHtml(t)}</li>`).join('')}</ol>`;
  if (entry.code !== undefined) return `<pre class="help__code"><code>${html(entry.code)}</code></pre>`;
  if (entry.note) return `<div class="note help__note-box">${svgIcon('alert')}<p>${inlineHtml(entry.note)}</p></div>`;
  if (entry.sub) return `<h4 class="help__sub">${inlineHtml(entry.sub)}</h4>`;
  if (entry.table) return tableHtml(entry.table);
  if (entry.who) return whoHtml();
  throw new Error(`Bloc inconnu dans le guide : ${JSON.stringify(entry).slice(0, 80)}`);
}

const serverNote = () => `<p class="help__server">${svgIcon('wrench', 'icon--xs')}${html(SERVER_NOTE)}</p>`;

// Sommaire du haut de la page : un <details> natif par chapitre (marche sans
// JavaScript ; name : un seul ouvert à la fois), « Aller au chapitre » puis
// les sections
function pageTocHtml() {
  const entries = outline();
  const link = (e, label = numbered(e)) => `<a class="help-toc__entry help-toc__entry--2" href="#${e.id}">${html(label)}</a>`;
  return `<ol class="help-toc__list">${entries.filter((e) => e.level === 1).map((chapter) => `\n<li><details class="site__toc-chapter" name="sommaire-page"><summary class="help-toc__entry help-toc__entry--1">${svgIcon('chev-d', 'icon--sm')}<span>${html(numbered(chapter))}</span></summary><ol class="help-toc__list help-toc__list--sub"><li>${link(chapter, 'Aller au chapitre')}</li>${entries.filter((e) => e.chapter === chapter.id).map((e) => `<li>${link(e)}</li>`).join('')}</ol></details></li>`).join('')}\n</ol>`;
}

// Sommaire de la feuille : chaque chapitre est un bouton (aria-expanded,
// aria-controls) qui déplie ses sections, un seul à la fois (guide.js) ; la
// marque de la section en cours est cachée, montrée par guide.js
function sheetTocHtml() {
  const entries = outline();
  const entry = (e, label = numbered(e)) => `<a class="help-toc__entry help-toc__entry--2" href="#${e.id}" data-section="${e.id}"><span class="help-toc__mark" hidden>${svgIcon('chev-r', 'icon--sm')}</span><span>${html(label)}</span><span class="visually-hidden" hidden> (section en cours)</span></a>`;
  return `<ol class="help-toc__list">${entries.filter((e) => e.level === 1).map((chapter) => `\n<li><button class="help-toc__entry help-toc__entry--1 help-toc__chapter" type="button" aria-expanded="false" aria-controls="sommaire-${chapter.id}" data-chapter="${chapter.id}">${svgIcon('chev-d', 'icon--sm')}<span>${html(numbered(chapter))}</span></button><ol class="help-toc__list help-toc__list--sub" id="sommaire-${chapter.id}" hidden><li>${entry(chapter, 'Aller au chapitre')}</li>${entries.filter((e) => e.chapter === chapter.id).map((e) => `<li>${entry(e)}</li>`).join('')}</ol></li>`).join('')}\n</ol>`;
}

// Le sprite d'icônes de l'application, collé tel quel (aucun fichier distant)
function sprite() {
  const page = read('public/index.html');
  const start = page.indexOf('<svg class="sprite"');
  const end = page.indexOf('</defs></svg>', start) + '</defs></svg>'.length;
  if (start < 0 || end < start) throw new Error('Sprite introuvable dans public/index.html');
  return page.slice(start, end);
}

// Règles de la page « Aide » de l'application, puis celles du site
function siteCss() {
  const app = read('public/css/app.css');
  const start = app.indexOf('/* Page « Aide » (help.js)');
  const end = app.indexOf('/* Recherche (search-row.js');
  if (start < 0 || end < start) throw new Error('Règles de la page « Aide » introuvables dans public/css/app.css');
  // En-tête collé d'une feuille qui défile (fiche d'un article, sommaire)
  const sheetHead = app.split('\n').filter((line) => /^\.sheet__(head--tools|heading|tools) /.test(line));
  if (sheetHead.length !== 4) throw new Error('En-tête de feuille introuvable dans public/css/app.css');
  // Champ de recherche : ni la croix ni l'arrondi du navigateur, pas de
  // second contour (le cadre .searchfield montre déjà le focus)
  const searchInput = app.split('\n').filter((line) => /^(\.app )?\.searchfield(__input[ :{,]| > \.icon )/.test(line));
  if (searchInput.length !== 4) throw new Error('Règles du champ de recherche introuvables dans public/css/app.css');
  return [
    '/* Fichier fabriqué par scripts/guide.js : ne pas le modifier à la main. */',
    '/* Règles de la page « Aide » et de l\'en-tête de feuille de l\'application (public/css/app.css) */',
    app.slice(start, end).trimEnd(),
    ...sheetHead,
    ...searchInput,
    '',
    read('scripts/site-assets/site.css'),
  ].join('\n');
}

// La page publique du guide
export function siteHtml() {
  const entryOf = new Map(outline().map((e) => [e.id, e]));
  const chapters = GUIDE.map((chapter) => {
    const sections = (chapter.sections ?? []).map((section) => [
      `<section class="card help__topic" aria-labelledby="${section.id}">`,
      `<h3 class="help__title" id="${section.id}" tabindex="-1">${html(numbered(entryOf.get(section.id)))}</h3>`,
      section.server && !chapter.server ? serverNote() : '',
      ...(section.blocks ?? []).map(blockHtml),
      '</section>',
    ].filter(Boolean).join('\n'));
    return [
      `<section class="help__part" aria-labelledby="${chapter.id}">`,
      `<h2 class="aisle help__chapter" id="${chapter.id}" tabindex="-1">${html(numbered(entryOf.get(chapter.id)))}</h2>`,
      '<div class="help__section">',
      chapter.server ? serverNote() : '',
      (chapter.blocks ?? []).length ? `<div class="card help__topic">\n${chapter.blocks.map(blockHtml).join('\n')}\n</div>` : '',
      ...sections,
      '</div>',
      '</section>',
    ].filter(Boolean).join('\n');
  });
  return `<!doctype html>
<!-- Page fabriquée par scripts/guide.js à partir de public/js/help-content.js : ne pas la modifier à la main. -->
<html lang="fr" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#F4F7FB" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0C1422" media="(prefers-color-scheme: dark)">
<title>Listo : le guide</title>
<meta name="description" content="Le mode d'emploi complet de Listo, application de listes partagées (courses, tâches, envies) à installer sur son propre serveur.">
<link rel="canonical" href="${SITE_URL}">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="listo.css">
<link rel="stylesheet" href="guide.css">
<script type="module" src="guide.js"></script>
</head>
<body class="app site">
${sprite()}
<a class="skip-link" href="#contenu">Aller au contenu</a>
<div class="help-search help-search--bar site__search" id="guide-recherche" hidden>
<div class="help-search__row"><label class="searchfield">${svgIcon('search', 'icon--sm')}<input class="searchfield__input" id="guide-recherche-champ" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="100" placeholder="Rechercher dans le guide" aria-label="Rechercher dans le guide"><button class="icon-btn" type="button" aria-label="Effacer la recherche" data-clear hidden>${svgIcon('x-circle')}</button></label><button class="icon-btn" type="button" aria-label="Fermer la recherche" data-close-search>${svgIcon('close')}</button></div>
<p class="help-search__status" role="status"></p>
</div>
<div class="site__inner">
<header class="site__head">
<div class="site__brand"><img class="site__logo" src="icon.svg" alt="" width="44" height="44"><h1 class="site__title" id="haut" tabindex="-1">Listo : le guide</h1></div>
<p class="site__intro">Le mode d'emploi complet de Listo, le même que la page « Aide » de l'application (Réglages › « Aide »). Les parties marquées « ${html(SERVER_NOTE)} » ne concernent que l'installation du serveur.</p>
</header>
<nav class="card site__toc" aria-labelledby="sommaire-page"><h2 class="site__toc-title" id="sommaire-page" tabindex="-1">Sommaire</h2>
${pageTocHtml()}
</nav>
<main class="help" id="contenu">
<div class="empty help-search__empty" id="guide-recherche-vide" hidden>${svgIcon('search', 'icon--lg')}<p class="empty__text">Aucun résultat. Essayez un autre mot, ou ouvrez le sommaire.</p></div>
${chapters.join('\n')}
</main>
<footer class="site__foot"><p>Listo est un logiciel libre (licence Apache-2.0). Code source : <a href="${REPO_URL}" rel="noopener noreferrer">${REPO_URL.replace('https://', '')}</a>.</p></footer>
</div>
<div class="help-fabs" id="boutons" hidden>
<button class="help-fab" id="haut-bouton" type="button" aria-label="Retour en haut de la page" data-tip="Retour en haut de la page" hidden>${svgIcon('arrow-up')}</button>
<button class="help-fab" id="recherche-bouton" type="button" aria-label="Rechercher dans le guide" data-tip="Rechercher dans le guide" aria-expanded="false" aria-controls="guide-recherche">${svgIcon('search')}</button>
<button class="help-fab help__toc-btn" id="sommaire-bouton" type="button" aria-label="Sommaire du guide" data-tip="Sommaire du guide" aria-haspopup="dialog" aria-expanded="false" aria-controls="sommaire">${svgIcon('layers')}</button>
</div>
<dialog class="sheet sheet--scroll site-sheet" id="sommaire" aria-labelledby="sommaire-titre">
<div class="sheet__grab" aria-hidden="true"></div>
<div class="sheet__head sheet__head--tools"><div class="sheet__heading"><h2 class="sheet__title" id="sommaire-titre">Sommaire</h2></div><div class="sheet__tools"><button class="icon-btn" type="button" aria-label="Fermer" data-close>${svgIcon('close')}</button></div></div>
<nav class="help-toc" aria-label="Sommaire">
<a class="help-toc__entry help-toc__top" href="#haut">${svgIcon('arrow-up', 'icon--sm')}<span>Haut de page</span></a>
${sheetTocHtml()}
</nav>
</dialog>
</body>
</html>
`;
}

// Tous les fichiers de site/ : { chemin relatif : contenu }
export function siteFiles() {
  return {
    'index.html': siteHtml(),
    'listo.css': read('public/css/listo.css'),
    'guide.css': siteCss(),
    'guide.js': read('scripts/site-assets/guide.js'),
    'search.js': read('public/js/search.js'),
    'icon.svg': read('public/icons/icon.svg'),
  };
}

// Lancé directement : écrit docs/guide.md et site/ (et retire de site/ tout
// fichier qui n'en fait plus partie)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(GUIDE_FILE, guideMarkdown());
  const files = siteFiles();
  fs.mkdirSync(SITE_DIR, { recursive: true });
  for (const name of fs.readdirSync(SITE_DIR)) if (!(name in files)) fs.rmSync(path.join(SITE_DIR, name), { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(SITE_DIR, name), content);
  console.log(`Guide écrit : ${path.relative(ROOT, GUIDE_FILE)} et ${path.relative(ROOT, SITE_DIR)}/ (${Object.keys(files).join(', ')}), ${outline().length} titres numérotés.`);
}
