// Fabrique, à partir de la source unique du guide (public/js/help-content.js
// pour le français, public/js/help-content-en.js pour l'anglais : la même que
// la page « Aide » de l'application) :
// - docs/guide.md (français) et docs/guide.en.md (anglais), le guide dans le
//   dépôt ;
// - site/, la page publique du guide (GitHub Pages, .github/workflows/pages.yml),
//   en anglais à la racine (index.html, https://magicgg91.github.io/listo/) et
//   en français dans fr/ (fr/index.html, …/listo/fr/), chaque page avec un
//   lien vers l'autre langue (décision du 20 novembre 2026). Fichiers
//   partagés par les deux pages (la page française les prend avec ../) :
//   listo.css (copie du kit de l'application), guide.css (règles de la page
//   « Aide » de public/css/app.css, puis scripts/site-assets/site.css),
//   guide.js (scripts/site-assets/guide.js), search.js (copie de
//   public/js/search.js) et icon.svg (public/icons/icon.svg). Ne jamais
//   modifier site/ à la main.
//
// Tous les textes viennent du guide de la langue (helpFor : chapitres,
// « Qui peut quoi », DOC pour le titre, l'introduction et le pied de page)
// ou des textes de l'application (translate : boutons, sommaire, recherche) :
// aucun texte de page écrit ici dans une langue.
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
import { helpFor, HELP_LOCALES, outline, parseInline, refLabel, numbered } from '../public/js/help-content.js';
import { translate, LOCALE_NAMES } from '../public/js/i18n.js';
import frTexts from '../public/js/i18n/fr.js';
import enTexts from '../public/js/i18n/en.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Le guide de chaque langue dans le dépôt
export const GUIDE_FILES = { fr: path.join(ROOT, 'docs', 'guide.md'), en: path.join(ROOT, 'docs', 'guide.en.md') };
export const GUIDE_FILE = GUIDE_FILES.fr;
export const SITE_DIR = path.join(ROOT, 'site');
export const SITE_URL = 'https://magicgg91.github.io/listo/';
// La page publique de chaque langue : l'anglais à la racine (langue
// d'ouverture du site), le français dans fr/
export const SITE_LANG = 'en';
export const SITE_PAGES = { en: 'index.html', fr: 'fr/index.html' };
const pageDir = (locale) => SITE_PAGES[locale].replace(/index\.html$/, ''); // '' ou 'fr/'
export const SITE_URLS = Object.fromEntries(Object.keys(SITE_PAGES).map((locale) => [locale, `${SITE_URL}${pageDir(locale)}`]));
// Fichier source du guide de chaque langue (cité dans le commentaire des copies)
const SOURCES = { fr: 'public/js/help-content.js', en: 'public/js/help-content-en.js' };
// Textes de l'application, pour les formes du pluriel données au site
const TEXTS = { fr: frTexts, en: enTexts };
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Emplacements {nom} d'un texte de DOC remplacés par leurs valeurs
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (all, name) => values[name] ?? all);

// Caractères qui changeraient la mise en forme Markdown d'un texte ordinaire
const escape = (text) => text.replace(/([\\*_[\]<>#|])/g, '\\$1');

// Un texte avec `code`, [[renvoi]] et [lien](https://…), en Markdown ;
// locale : la langue du texte (numéro et titre des renvois)
export function inlineMarkdown(text, locale = 'fr') {
  const { GUIDE } = helpFor(locale);
  return parseInline(text).map((part) => {
    if (part.code !== undefined) return `\`${part.code}\``;
    if (part.ref !== undefined) return `[${escape(refLabel(part.ref, GUIDE))}](#${part.ref})`;
    if (part.link !== undefined) return `[${escape(part.link)}](${part.href})`;
    return escape(part.text);
  }).join('');
}

// Une cellule de tableau : pas de retour à la ligne, | protégé
const cell = (text, locale) => inlineMarkdown(text, locale).replace(/\n/g, ' ');

function table(head, rows, locale) {
  return [
    `| ${head.map((text) => cell(text, locale)).join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((text) => cell(text, locale)).join(' | ')} |`),
  ].join('\n');
}

// Le tableau « Qui peut quoi », avec « Oui » et « Non » en toutes lettres
function whoTable(locale) {
  const { ROLES, PERMISSIONS, PERMISSIONS_NOTE, DOC } = helpFor(locale);
  return [
    table([DOC.action, ...ROLES.map((r) => r.label)],
      PERMISSIONS.map((p) => [p.action, ...ROLES.map((r) => (p.roles.includes(r.key) ? DOC.yes : DOC.no))]), locale),
    '',
    inlineMarkdown(PERMISSIONS_NOTE, locale),
  ].join('\n');
}

function block(entry, locale) {
  const inline = (text) => inlineMarkdown(text, locale);
  if (typeof entry === 'string') return inline(entry);
  if (entry.ul) return entry.ul.map((text) => `- ${inline(text)}`).join('\n');
  if (entry.ol) return entry.ol.map((text, i) => `${i + 1}. ${inline(text)}`).join('\n');
  if (entry.code !== undefined) return ['```sh', entry.code, '```'].join('\n');
  if (entry.table) return table(entry.table.head, entry.table.rows, locale);
  // « **Attention** : … » (le deux-points suit la langue : aide.tableau.entete)
  if (entry.note) return `> ${translate(locale, 'aide.tableau.entete', { head: `**${helpFor(locale).DOC.warning}**` })} ${inline(entry.note)}`;
  if (entry.sub) return `**${inline(entry.sub)}**`;
  if (entry.who) return whoTable(locale);
  throw new Error(`Bloc inconnu dans le guide : ${JSON.stringify(entry).slice(0, 80)}`);
}

// Le document entier, dans une langue (docs/guide.md : 'fr' ;
// docs/guide.en.md : 'en')
export function guideMarkdown(locale = 'fr') {
  const { GUIDE, SERVER_NOTE, DOC } = helpFor(locale);
  const tr = (key, params) => translate(locale, key, params);
  const entries = outline(GUIDE);
  const entryOf = new Map(entries.map((e) => [e.id, e]));
  const out = [
    `# ${DOC.title}`,
    '',
    `<!-- Fichier fabriqué par scripts/guide.js à partir de ${SOURCES[locale]} : ne pas le modifier à la main. -->`,
    '',
    // Introduction : déjà du Markdown (liens vers la page publique et vers
    // d'autres documents du dépôt)
    fill(DOC.intro, { site: SITE_URLS[locale], server: SERVER_NOTE }),
    '',
    `## ${tr('aide.sommaire')}`,
    '',
    // Chapitres seulement ; chacun déplie ses sections (<details>, affiché
    // par GitHub) : « Aller au chapitre », puis les sections
    ...entries.filter((e) => e.level === 1).flatMap((chapter) => [
      '<details>',
      `<summary>${html(numbered(chapter))}</summary>`,
      '',
      `- [${escape(tr('aide.sommaire.chapitre'))}](#${chapter.id})`,
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
    for (const entry of chapter.blocks ?? []) out.push('', block(entry, locale));
    for (const section of chapter.sections ?? []) {
      out.push(...heading(3, section.id));
      if (section.server && !chapter.server) out.push('', `*${SERVER_NOTE}.*`);
      for (const entry of section.blocks ?? []) out.push('', block(entry, locale));
    }
  }
  out.push('');
  return out.join('\n');
}

// --- Page publique (site/) ---

// Texte posé dans du HTML : jamais interprété comme du balisage
export const html = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const svgIcon = (name, size = '') => `<svg class="icon${size ? ` ${size}` : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// Un texte avec `code`, [[renvoi]] et [lien](https://…), en HTML ; locale :
// la langue du texte (numéro et titre des renvois)
export function inlineHtml(text, locale = 'fr') {
  const { GUIDE } = helpFor(locale);
  return parseInline(text).map((part) => {
    if (part.code !== undefined) return `<code class="help__code-inline">${html(part.code)}</code>`;
    if (part.ref !== undefined) return `<a class="help__ref" href="#${part.ref}">${html(refLabel(part.ref, GUIDE))}</a>`;
    if (part.link !== undefined) return `<a href="${html(part.href)}" rel="noopener noreferrer">${html(part.link)}</a>`;
    return html(part.text);
  }).join('');
}

// « Qui peut quoi » : le même balisage que l'application (oui / non en
// icône ET en texte)
function whoHtml(locale) {
  const { ROLES, PERMISSIONS, PERMISSIONS_NOTE } = helpFor(locale);
  const rows = PERMISSIONS.map((p) => `<div class="help-who__row"><p class="help-who__action">${html(p.action)}</p><ul class="help-who__roles">${ROLES.map((r) => {
    const yes = p.roles.includes(r.key);
    return `<li class="chip help-who__role help-who__role--${yes ? 'yes' : 'no'}">${svgIcon(yes ? 'check' : 'close', 'icon--xs')}<span>${html(r.label)}</span><span class="visually-hidden"> ${html(translate(locale, yes ? 'aide.qui.oui' : 'aide.qui.non'))}</span></li>`;
  }).join('')}</ul></div>`).join('\n');
  return `<div class="help-who"><div class="group">\n${rows}\n</div><p class="help__note">${inlineHtml(PERMISSIONS_NOTE, locale)}</p></div>`;
}

// Tableau en blocs empilés (lisible à 320 px), comme dans l'application
function tableHtml({ head, rows }, locale) {
  return `<div class="help-table" role="list">${rows.map((row) => `<div class="help-table__row" role="listitem"><p class="help-table__key">${inlineHtml(row[0], locale)}</p>${row.slice(1).map((value, i) => `<p class="help-table__cell"><span class="help-table__head">${html(translate(locale, 'aide.tableau.entete', { head: head[i + 1] }))} </span>${inlineHtml(value, locale)}</p>`).join('')}</div>`).join('\n')}</div>`;
}

function blockHtml(entry, locale) {
  const inline = (text) => inlineHtml(text, locale);
  if (typeof entry === 'string') return `<p class="help__text">${inline(entry)}</p>`;
  if (entry.ul) return `<ul class="help__list">${entry.ul.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`;
  if (entry.ol) return `<ol class="help__list help__list--steps">${entry.ol.map((t) => `<li>${inline(t)}</li>`).join('')}</ol>`;
  if (entry.code !== undefined) return `<pre class="help__code"><code>${html(entry.code)}</code></pre>`;
  if (entry.note) return `<div class="note help__note-box">${svgIcon('alert')}<p>${inline(entry.note)}</p></div>`;
  if (entry.sub) return `<h4 class="help__sub">${inline(entry.sub)}</h4>`;
  if (entry.table) return tableHtml(entry.table, locale);
  if (entry.who) return whoHtml(locale);
  throw new Error(`Bloc inconnu dans le guide : ${JSON.stringify(entry).slice(0, 80)}`);
}

const serverNote = (locale) => `<p class="help__server">${svgIcon('wrench', 'icon--xs')}${html(helpFor(locale).SERVER_NOTE)}</p>`;

// Sommaire du haut de la page : un <details> natif par chapitre (marche sans
// JavaScript ; name : un seul ouvert à la fois), « Aller au chapitre » puis
// les sections
function pageTocHtml(locale) {
  const entries = outline(helpFor(locale).GUIDE);
  const link = (e, label = numbered(e)) => `<a class="help-toc__entry help-toc__entry--2" href="#${e.id}">${html(label)}</a>`;
  const toChapter = translate(locale, 'aide.sommaire.chapitre');
  return `<ol class="help-toc__list">${entries.filter((e) => e.level === 1).map((chapter) => `\n<li><details class="site__toc-chapter" name="sommaire-page"><summary class="help-toc__entry help-toc__entry--1">${svgIcon('chev-d', 'icon--sm')}<span>${html(numbered(chapter))}</span></summary><ol class="help-toc__list help-toc__list--sub"><li>${link(chapter, toChapter)}</li>${entries.filter((e) => e.chapter === chapter.id).map((e) => `<li>${link(e)}</li>`).join('')}</ol></details></li>`).join('')}\n</ol>`;
}

// Sommaire de la feuille : chaque chapitre est un bouton (aria-expanded,
// aria-controls) qui déplie ses sections, un seul à la fois (guide.js) ; la
// marque de la section en cours est cachée, montrée par guide.js
function sheetTocHtml(locale) {
  const entries = outline(helpFor(locale).GUIDE);
  const here = html(translate(locale, 'aide.sommaire.enCours'));
  const entry = (e, label = numbered(e)) => `<a class="help-toc__entry help-toc__entry--2" href="#${e.id}" data-section="${e.id}"><span class="help-toc__mark" hidden>${svgIcon('chev-r', 'icon--sm')}</span><span>${html(label)}</span><span class="visually-hidden" hidden> ${here}</span></a>`;
  const toChapter = translate(locale, 'aide.sommaire.chapitre');
  return `<ol class="help-toc__list">${entries.filter((e) => e.level === 1).map((chapter) => `\n<li><button class="help-toc__entry help-toc__entry--1 help-toc__chapter" type="button" aria-expanded="false" aria-controls="sommaire-${chapter.id}" data-chapter="${chapter.id}">${svgIcon('chev-d', 'icon--sm')}<span>${html(numbered(chapter))}</span></button><ol class="help-toc__list help-toc__list--sub" id="sommaire-${chapter.id}" hidden><li>${entry(chapter, toChapter)}</li>${entries.filter((e) => e.chapter === chapter.id).map((e) => `<li>${entry(e)}</li>`).join('')}</ol></li>`).join('')}\n</ol>`;
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

// Adresse relative, depuis la page d'une langue, d'un fichier de site/ (la
// page française, dans fr/, prend les fichiers partagés avec ../)
const fromPage = (locale, file) => `${'../'.repeat(pageDir(locale).split('/').length - 1)}${file}`;

// Lien vers la page de chaque autre langue, écrit dans sa langue (« Français »
// sur la page anglaise, “English” sur la page française)
function languageLinks(locale) {
  return Object.keys(SITE_PAGES).filter((other) => other !== locale)
    .map((other) => `<a class="site__lang" href="${fromPage(locale, pageDir(other)) || './'}" hreflang="${other}" lang="${other}">${html(LOCALE_NAMES[other])}</a>`).join('');
}

// La page publique du guide, dans une langue (site/index.html : 'en' ;
// site/fr/index.html : 'fr')
export function siteHtml(locale = 'fr') {
  const { GUIDE, SERVER_NOTE, DOC } = helpFor(locale);
  const tr = (key, params) => html(translate(locale, key, params));
  const asset = (file) => fromPage(locale, file);
  const entryOf = new Map(outline(GUIDE).map((e) => [e.id, e]));
  // Textes donnés à search.js (setTranslator, dans guide.js) : le nombre de
  // résultats, avec ses formes du pluriel, dans la langue de la page
  const searchTexts = html(JSON.stringify({ 'recherche.resultats': TEXTS[locale]['recherche.resultats'] }));
  const chapters = GUIDE.map((chapter) => {
    const sections = (chapter.sections ?? []).map((section) => [
      `<section class="card help__topic" aria-labelledby="${section.id}">`,
      `<h3 class="help__title" id="${section.id}" tabindex="-1">${html(numbered(entryOf.get(section.id)))}</h3>`,
      section.server && !chapter.server ? serverNote(locale) : '',
      ...(section.blocks ?? []).map((entry) => blockHtml(entry, locale)),
      '</section>',
    ].filter(Boolean).join('\n'));
    return [
      `<section class="help__part" aria-labelledby="${chapter.id}">`,
      `<h2 class="aisle help__chapter" id="${chapter.id}" tabindex="-1">${html(numbered(entryOf.get(chapter.id)))}</h2>`,
      '<div class="help__section">',
      chapter.server ? serverNote(locale) : '',
      (chapter.blocks ?? []).length ? `<div class="card help__topic">\n${chapter.blocks.map((entry) => blockHtml(entry, locale)).join('\n')}\n</div>` : '',
      ...sections,
      '</div>',
      '</section>',
    ].filter(Boolean).join('\n');
  });
  return `<!doctype html>
<!-- Page fabriquée par scripts/guide.js à partir de ${SOURCES[locale]} : ne pas la modifier à la main. -->
<html lang="${locale}" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#F4F7FB" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0C1422" media="(prefers-color-scheme: dark)">
<title>${html(DOC.title)}</title>
<meta name="description" content="${html(DOC.description)}">
<link rel="canonical" href="${SITE_URLS[locale]}">
${Object.keys(SITE_PAGES).map((other) => `<link rel="alternate" hreflang="${other}" href="${SITE_URLS[other]}">`).join('\n')}
<link rel="icon" href="${asset('icon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${asset('listo.css')}">
<link rel="stylesheet" href="${asset('guide.css')}">
<script type="module" src="${asset('guide.js')}"></script>
</head>
<body class="app site">
${sprite()}
<a class="skip-link" href="#contenu">${tr('application.allerAuContenu')}</a>
<div class="help-search help-search--bar site__search" id="guide-recherche" hidden>
<div class="help-search__row"><label class="searchfield">${svgIcon('search', 'icon--sm')}<input class="searchfield__input" id="guide-recherche-champ" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="100" placeholder="${tr('aide.recherche')}" aria-label="${tr('aide.recherche')}"><button class="icon-btn" type="button" aria-label="${tr('aide.recherche.effacer')}" data-clear hidden>${svgIcon('x-circle')}</button></label><button class="icon-btn" type="button" aria-label="${tr('aide.recherche.fermer')}" data-close-search>${svgIcon('close')}</button></div>
<p class="help-search__status" role="status" data-texts="${searchTexts}"></p>
</div>
<div class="site__inner">
<header class="site__head">
<div class="site__brand"><img class="site__logo" src="${asset('icon.svg')}" alt="" width="44" height="44"><h1 class="site__title" id="haut" tabindex="-1">${html(DOC.title)}</h1>${languageLinks(locale)}</div>
<p class="site__intro">${inlineHtml(fill(DOC.siteIntro, { server: SERVER_NOTE }), locale)}</p>
</header>
<nav class="card site__toc" aria-labelledby="sommaire-page"><h2 class="site__toc-title" id="sommaire-page" tabindex="-1">${tr('aide.sommaire')}</h2>
${pageTocHtml(locale)}
</nav>
<main class="help" id="contenu">
<div class="empty help-search__empty" id="guide-recherche-vide" hidden>${svgIcon('search', 'icon--lg')}<p class="empty__text">${tr('aide.recherche.aucunResultat')}</p></div>
${chapters.join('\n')}
</main>
<footer class="site__foot"><p>${inlineHtml(DOC.footer, locale)}</p></footer>
</div>
<div class="help-fabs" id="boutons" hidden>
<button class="help-fab" id="haut-bouton" type="button" aria-label="${tr('aide.hautDePage.bouton')}" data-tip="${tr('aide.hautDePage.bouton')}" hidden>${svgIcon('arrow-up')}</button>
<button class="help-fab" id="recherche-bouton" type="button" aria-label="${tr('aide.recherche')}" data-tip="${tr('aide.recherche')}" aria-expanded="false" aria-controls="guide-recherche">${svgIcon('search')}</button>
<button class="help-fab help__toc-btn" id="sommaire-bouton" type="button" aria-label="${tr('aide.sommaire.bouton')}" data-tip="${tr('aide.sommaire.bouton')}" aria-haspopup="dialog" aria-expanded="false" aria-controls="sommaire">${svgIcon('layers')}</button>
</div>
<dialog class="sheet sheet--scroll site-sheet" id="sommaire" aria-labelledby="sommaire-titre">
<div class="sheet__grab" aria-hidden="true"></div>
<div class="sheet__head sheet__head--tools"><div class="sheet__heading"><h2 class="sheet__title" id="sommaire-titre">${tr('aide.sommaire')}</h2></div><div class="sheet__tools"><button class="icon-btn" type="button" aria-label="${tr('fenetres.fermer')}" data-close>${svgIcon('close')}</button></div></div>
<nav class="help-toc" aria-label="${tr('aide.sommaire')}">
<a class="help-toc__entry help-toc__top" href="#haut">${svgIcon('arrow-up', 'icon--sm')}<span>${tr('aide.sommaire.haut')}</span></a>
${sheetTocHtml(locale)}
</nav>
</dialog>
</body>
</html>
`;
}

// Tous les fichiers de site/ : { chemin relatif : contenu } (une page par
// langue, puis les fichiers partagés)
export function siteFiles() {
  return {
    ...Object.fromEntries(Object.entries(SITE_PAGES).map(([locale, page]) => [page, siteHtml(locale)])),
    'listo.css': read('public/css/listo.css'),
    'guide.css': siteCss(),
    'guide.js': read('scripts/site-assets/guide.js'),
    'search.js': read('public/js/search.js'),
    'icon.svg': read('public/icons/icon.svg'),
  };
}

// Tous les fichiers présents dans un dossier (chemins relatifs, sous-dossiers compris)
export function filesUnder(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory()
    ? filesUnder(path.join(dir, entry.name), `${prefix}${entry.name}/`)
    : [`${prefix}${entry.name}`]));
}

// Lancé directement : écrit docs/guide.md, docs/guide.en.md et site/ (et
// retire de site/ tout fichier qui n'en fait plus partie)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [locale, file] of Object.entries(GUIDE_FILES)) fs.writeFileSync(file, guideMarkdown(locale));
  const files = siteFiles();
  fs.mkdirSync(SITE_DIR, { recursive: true });
  for (const name of filesUnder(SITE_DIR)) if (!(name in files)) fs.rmSync(path.join(SITE_DIR, name));
  for (const entry of fs.readdirSync(SITE_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() && !filesUnder(path.join(SITE_DIR, entry.name)).length) fs.rmSync(path.join(SITE_DIR, entry.name), { recursive: true });
  }
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(SITE_DIR, name)), { recursive: true });
    fs.writeFileSync(path.join(SITE_DIR, name), content);
  }
  const written = Object.values(GUIDE_FILES).map((file) => path.relative(ROOT, file)).join(', ');
  console.log(`Guide écrit : ${written} et ${path.relative(ROOT, SITE_DIR)}/ (${Object.keys(files).join(', ')}), ${HELP_LOCALES.map((locale) => `${outline(helpFor(locale).GUIDE).length} titres numérotés (${locale})`).join(', ')}.`);
}
