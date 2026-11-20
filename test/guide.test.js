// docs/guide.md (français), docs/guide.en.md (anglais) et site/ (page
// publique, GitHub Pages : anglais à la racine, français dans fr/) :
// fabriqués par scripts/guide.js à partir de la source unique
// (public/js/help-content.js, et help-content-en.js pour l'anglais).
// Ce test échoue si l'un d'eux n'est pas à jour (relancer : node
// scripts/guide.js), si le sommaire ne correspond pas aux titres, si une
// page publique charge quoi que ce soit d'ailleurs, si un texte n'est pas
// dans la langue de la page, ou si un lien d'un document du dépôt est cassé.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { guideMarkdown, inlineMarkdown, GUIDE_FILE, GUIDE_FILES, siteFiles, siteHtml, inlineHtml, html, SITE_DIR, SITE_URL, SITE_URLS, SITE_PAGES, SITE_LANG, filesUnder } from '../scripts/guide.js';
import { brokenLinks, anchorsOf, linksOf, slug } from '../scripts/doc-links.js';
import { outline, numbered, helpFor, HELP_LOCALES } from '../public/js/help-content.js';
import { translate, LOCALE_NAMES } from '../public/js/i18n.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const tr = (locale, key, params) => translate(locale, key, params);

test('docs/guide.md (français) et docs/guide.en.md (anglais) sont à jour (sinon : node scripts/guide.js)', () => {
  assert.equal(GUIDE_FILE, GUIDE_FILES.fr);
  assert.deepEqual(Object.keys(GUIDE_FILES).sort(), [...HELP_LOCALES].sort());
  assert.equal(path.relative(ROOT, GUIDE_FILES.en), 'docs/guide.en.md');
  for (const [locale, file] of Object.entries(GUIDE_FILES)) {
    assert.equal(fs.readFileSync(file, 'utf8'), guideMarkdown(locale), `${path.relative(ROOT, file)} n'est pas à jour : lancez node scripts/guide.js`);
  }
  assert.equal(guideMarkdown(), guideMarkdown('fr'), 'le français par défaut');
  assert.match(read('package.json'), /"guide": "node scripts\/guide\.js"/);
  // Chaque guide renvoie à la page publique de sa langue ; l'anglais renvoie aussi au français
  assert.ok(read('docs/guide.md').includes(`[${SITE_URLS.fr}](${SITE_URLS.fr})`));
  assert.ok(read('docs/guide.en.md').includes(`[${SITE_URL}](${SITE_URL})`));
  assert.match(read('docs/guide.en.md'), /\[docs\/guide\.md\]\(guide\.md\)/);
  assert.match(read('docs/guide.md'), /^# Listo : le guide$/m);
  assert.match(read('docs/guide.en.md'), /^# Listo: the guide$/m);
});

for (const locale of ['fr', 'en']) test(`sommaire (${locale}) : une entrée par section, dans l'ordre, avec le même numéro que le titre ; ancres uniques`, () => {
  const md = fs.readFileSync(GUIDE_FILES[locale], 'utf8');
  const { GUIDE, SERVER_NOTE, DOC, PERMISSIONS } = helpFor(locale);
  const entries = outline(GUIDE);
  const toc = md.slice(md.indexOf(`## ${tr(locale, 'aide.sommaire')}`), md.indexOf('<a id='));
  assert.ok(toc.length > 100, 'sommaire trouvé');
  const tocLinks = [...toc.matchAll(/\]\(#([a-z0-9-]+)\)/g)].map((m) => m[1]);
  assert.deepEqual(tocLinks, entries.map((e) => e.id));
  const anchors = [...md.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]);
  assert.deepEqual(anchors, entries.map((e) => e.id), 'une ancre stable par titre, dans l\'ordre');
  assert.equal(new Set(anchors).size, anchors.length);
  // Les titres : ## pour un chapitre, ### pour une section, numéros de outline()
  for (const e of entries) {
    const title = `${e.level === 1 ? '##' : '###'} ${numbered(e).replace(/([\\*_[\]<>#|])/g, '\\$1')}`;
    assert.ok(md.includes(`<a id="${e.id}"></a>\n\n${title}\n`), title);
  }
  // Mention des parties du serveur (chapitre Installation et quelques sections)
  assert.equal(md.split(`\n*${SERVER_NOTE}.*\n`).length - 1, 1 + 6); // + « Activer la fonction sur le serveur » (notifications)
  // Sommaire court : les chapitres, chacun repliable (<details>, affiché par GitHub)
  assert.equal((toc.match(/<details>/g) ?? []).length, entries.filter((e) => e.level === 1).length);
  assert.equal(toc.split(`- [${tr(locale, 'aide.sommaire.chapitre')}](#`).length - 1, entries.filter((e) => e.level === 1).length);
  assert.ok(toc.includes(`<summary>${numbered(entries[0])}</summary>\n\n- [${tr(locale, 'aide.sommaire.chapitre')}](#presentation)`));
  // « Qui peut quoi » : oui et non en toutes lettres, dans la langue du guide
  assert.ok(md.includes(`| ${DOC.action} | ${helpFor(locale).ROLES.map((r) => r.label).join(' | ')} |`));
  assert.equal((md.match(new RegExp(`^\\| ${PERMISSIONS[0].action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|`, 'gm')) ?? []).length, 1);
  assert.ok(md.includes(`| ${DOC.yes} |`) && md.includes(`| ${DOC.no} |`));
  // Encadrés : « Attention : » / “Warning:”
  assert.ok(md.includes(`\n> ${tr(locale, 'aide.tableau.entete', { head: `**${DOC.warning}**` })} `));
  // Ni HTML (hors ancres et commentaire), ni renvoi non résolu
  assert.doesNotMatch(md.replace(/<a id="[^"]+"><\/a>|<!--[^>]*-->|<\/?details>|<summary>[^<]*<\/summary>/g, ''), /<[a-z]/i);
  assert.doesNotMatch(md, /\[\[/);
});

test('les deux guides et les deux pages : mêmes ancres, dans le même ordre ; textes dans la langue de chacun', () => {
  const ids = outline().map((e) => e.id);
  const anchors = (text) => [...text.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]);
  assert.deepEqual(anchors(read('docs/guide.md')), ids);
  assert.deepEqual(anchors(read('docs/guide.en.md')), ids);
  const files = siteFiles();
  for (const page of Object.values(SITE_PAGES)) {
    const headings = [...files[page].matchAll(/<h[23] class="(?:aisle help__chapter|help__title)" id="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(headings, ids, page);
  }
  // Anglais : aucun texte français du guide (ni « », ni « Oui » / « Non »)
  const english = read('docs/guide.en.md');
  assert.doesNotMatch(english.replace(/<!--[^>]*-->/g, ''), /[«»]|\| Oui \||\| Non \||Attention|Sommaire|Aller au chapitre|Pour la personne qui gère/);
  const en = files[SITE_PAGES.en].replace(/<!--[^>]*-->/g, '');
  assert.doesNotMatch(en, /[«»]|Rechercher|Sommaire|Aller au|Haut de page|section en cours|Fermer|Aucun résultat|: oui|: non|logiciel libre/);
  // Français : les mêmes textes de l'application, en français
  const frPage = files[SITE_PAGES.fr];
  for (const key of ['aide.recherche', 'aide.recherche.fermer', 'aide.sommaire.haut', 'aide.recherche.aucunResultat', 'application.allerAuContenu']) {
    assert.ok(frPage.includes(html(tr('fr', key))), key);
    assert.ok(en.includes(html(tr('en', key))), key);
  }
});

test('Markdown : texte protégé, code, renvois et liens', () => {
  assert.equal(inlineMarkdown('Voir [[sauvegardes]], `docker logs listo` et [le site](https://securityheaders.com).'),
    'Voir [3.8 Sauvegardes](#sauvegardes), `docker logs listo` et [le site](https://securityheaders.com).');
  assert.equal(inlineMarkdown('__Host- *a* <b> [x] | #'), '\\_\\_Host- \\*a\\* \\<b\\> \\[x\\] \\| \\#');
  // Un renvoi prend le numéro et le titre du guide de la langue du texte
  assert.equal(inlineMarkdown('See [[sauvegardes]].', 'en'), `See [3.8 ${outline(helpFor('en').GUIDE).find((e) => e.id === 'sauvegardes').title}](#sauvegardes).`);
});

test('liens des documents du dépôt : aucun lien cassé (fichiers et ancres)', () => {
  assert.deepEqual(brokenLinks(), []);
  // Le vérificateur repère bien les titres et les ancres
  assert.equal(slug('9. Mettre à jour Listo'), '9-mettre-à-jour-listo');
  assert.equal(slug('Mode scan : Open Food Facts'), 'mode-scan--open-food-facts');
  assert.ok(anchorsOf('<a id="npm"></a>\n\n### 4.4 Régler').has('npm'));
  assert.deepEqual(linksOf('[a](b.md#c) `[x](y)`\n```\n[z](w)\n```'), ['b.md#c']);
  // Le guide d'exploitation (écrit à la main) : cité là où l'on parle d'entretien
  for (const file of ['README.md', 'README.fr.md', 'SECURITY.md', 'docker-compose.yml', '.github/dependabot.yml']) {
    assert.match(read(file), /exploitation\.md/, file);
  }
  assert.match(read('docs/exploitation.md'), /\[docs\/guide\.md\]\(guide\.md\)/);
  for (const file of ['README.md', 'README.fr.md']) assert.doesNotMatch(read(file), /guide(\.en)?\.md#serveur/, file);
  // Les liens du README anglais vers le guide anglais mènent à une ancre de docs/guide.en.md
  const enAnchors = anchorsOf(read('docs/guide.en.md'));
  for (const id of [...read('README.md').matchAll(/docs\/guide\.en\.md#([a-z0-9-]+)/g)].map((m) => m[1])) assert.ok(enAnchors.has(id), id);
});

test('README courts (anglais README.md, français README.fr.md) : moins de 60 lignes, renvoient au guide de leur langue, sans tableau des variables', () => {
  for (const [file, guide] of [['README.md', /docs\/guide\.en\.md/], ['README.fr.md', /docs\/guide\.md/]]) {
    const readme = read(file);
    assert.ok(readme.split('\n').length <= 60, `${file} : ${readme.split('\n').length} lignes`);
    assert.match(readme, guide, file);
    assert.match(readme, /Claude/);
    assert.doesNotMatch(readme, /LISTO_PRODUCT_LOOKUP|\| Variable \|/);
    assert.ok((readme.match(/!\[[^\]]*\]\(docs\/images\//g) ?? []).length >= 1, file);
  }
});

test('site/ est à jour et ne contient que les deux pages du guide et ce qu\'il leur faut (ni docs/, ni cahier des charges)', () => {
  const files = siteFiles();
  assert.deepEqual(SITE_PAGES, { en: 'index.html', fr: 'fr/index.html' }, 'anglais à la racine, français dans fr/');
  assert.equal(SITE_LANG, 'en');
  assert.deepEqual(SITE_URLS, { en: SITE_URL, fr: `${SITE_URL}fr/` });
  assert.deepEqual(Object.keys(files).sort(), ['fr/index.html', 'guide.css', 'guide.js', 'icon.svg', 'index.html', 'listo.css', 'search.js']);
  assert.deepEqual(filesUnder(SITE_DIR).sort(), Object.keys(files).sort(), 'aucun autre fichier dans site/');
  for (const [name, content] of Object.entries(files)) {
    assert.equal(fs.readFileSync(path.join(SITE_DIR, name), 'utf8'), content, `site/${name} n'est pas à jour : lancez node scripts/guide.js`);
  }
  assert.equal(files['index.html'], siteHtml('en'));
  assert.equal(files['fr/index.html'], siteHtml('fr'));
  // Copies exactes du kit et de l'application ; sources propres au site
  assert.equal(files['listo.css'], read('public/css/listo.css'));
  assert.equal(files['guide.js'], read('scripts/site-assets/guide.js'));
  assert.equal(files['search.js'], read('public/js/search.js'), 'la même recherche que l\'application');
  assert.ok(files['guide.css'].includes(read('scripts/site-assets/site.css')));
  assert.ok(files['guide.css'].includes('.help-toc__entry.is-current {'));
  for (const page of Object.values(SITE_PAGES)) assert.doesNotMatch(files[page], /cahier des charges|mcp-cadrage/i);
});

for (const locale of ['en', 'fr']) test(`page publique (${locale}) : même numérotation, mêmes ancres, sommaire dans la page et dans la feuille, accessible, dans sa langue`, () => {
  const page = siteHtml(locale);
  const { GUIDE, PERMISSIONS, SERVER_NOTE, DOC } = helpFor(locale);
  const t = (key) => html(translate(locale, key));
  const entries = outline(GUIDE);
  for (const e of entries) {
    assert.equal(page.split(`id="${e.id}"`).length - 1, 1, `ancre unique : ${e.id}`);
    const tag = e.level === 1 ? 'h2' : 'h3';
    assert.ok(page.includes(`<${tag} class="${e.level === 1 ? 'aisle help__chapter' : 'help__title'}" id="${e.id}" tabindex="-1">${html(numbered(e))}</${tag}>`), numbered(e));
  }
  // Langue de la page, lien vers l'autre langue (écrit dans cette langue-là)
  assert.match(page, new RegExp(`<html lang="${locale}" data-theme="auto">`));
  const other = locale === 'en' ? 'fr' : 'en';
  const otherHref = locale === 'en' ? 'fr/' : '../';
  assert.ok(page.includes(`<a class="site__lang" href="${otherHref}" hreflang="${other}" lang="${other}">${LOCALE_NAMES[other]}</a>`), 'lien vers l\'autre langue');
  assert.equal(LOCALE_NAMES.fr, 'Français');
  assert.equal(LOCALE_NAMES.en, 'English');
  assert.ok(page.includes(`<link rel="canonical" href="${SITE_URLS[locale]}">`));
  for (const l of ['en', 'fr']) assert.ok(page.includes(`<link rel="alternate" hreflang="${l}" href="${SITE_URLS[l]}">`), l);
  assert.ok(page.includes(`<title>${html(DOC.title)}</title>`));
  assert.ok(page.includes(`<h1 class="site__title" id="haut" tabindex="-1">${html(DOC.title)}</h1>`));
  assert.ok(page.includes(`<meta name="description" content="${html(DOC.description)}">`));
  // Fichiers partagés : la page française les prend dans le dossier du dessus
  const up = locale === 'en' ? '' : '../';
  for (const file of ['listo.css', 'guide.css']) assert.ok(page.includes(`<link rel="stylesheet" href="${up}${file}">`), file);
  assert.ok(page.includes(`<script type="module" src="${up}guide.js"></script>`));
  assert.ok(page.includes(`<img class="site__logo" src="${up}icon.svg"`));
  // Nombre de résultats : les formes du pluriel de la langue, pour search.js
  const texts = JSON.parse(page.match(/<p class="help-search__status" role="status" data-texts="([^"]+)"><\/p>/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  assert.deepEqual(Object.keys(texts), ['recherche.resultats']);
  assert.equal(texts['recherche.resultats'].other, locale === 'en' ? '{count} results' : '{count} résultats');
  // Sommaire : écrit dans la page (sans JavaScript) et dans la feuille
  const pageToc = page.slice(page.indexOf('<nav class="card site__toc"'), page.indexOf('</nav>'));
  assert.deepEqual([...pageToc.matchAll(/<a [^>]*href="#([a-z0-9-]+)"/g)].map((m) => m[1]), entries.map((e) => e.id));
  const chapters = entries.filter((e) => e.level === 1);
  assert.equal((pageToc.match(/<details class="site__toc-chapter" name="sommaire-page">/g) ?? []).length, chapters.length, 'sans JavaScript : <details> natifs, un seul ouvert');
  assert.equal(pageToc.split(`>${t('aide.sommaire.chapitre')}<`).length - 1, chapters.length);
  assert.ok(pageToc.includes(`<h2 class="site__toc-title" id="sommaire-page" tabindex="-1">${t('aide.sommaire')}</h2>`));
  const sheet = page.slice(page.indexOf('<dialog'), page.indexOf('</dialog>'));
  assert.deepEqual([...sheet.matchAll(/data-section="([a-z0-9-]+)"/g)].map((m) => m[1]), entries.map((e) => e.id));
  for (const c of chapters) {
    assert.match(sheet, new RegExp(`<button class="help-toc__entry help-toc__entry--1 help-toc__chapter" type="button" aria-expanded="false" aria-controls="sommaire-${c.id}" data-chapter="${c.id}">`));
    assert.match(sheet, new RegExp(`<ol class="help-toc__list help-toc__list--sub" id="sommaire-${c.id}" hidden>`));
  }
  assert.equal(sheet.split(`<span class="visually-hidden" hidden> ${t('aide.sommaire.enCours')}</span>`).length - 1, entries.length);
  // Recherche : barre ouverte par la loupe (cachée au départ et sans
  // JavaScript), champ du kit, « Fermer la recherche », compteur annoncé,
  // message quand rien n'est trouvé
  assert.match(page, /<div class="help-search help-search--bar site__search" id="guide-recherche" hidden>/);
  assert.ok(page.includes(`<button class="icon-btn" type="button" aria-label="${t('aide.recherche.fermer')}" data-close-search>`));
  assert.ok(page.includes(`<input class="searchfield__input" id="guide-recherche-champ" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="100" placeholder="${t('aide.recherche')}" aria-label="${t('aide.recherche')}">`));
  assert.ok(page.includes(`<button class="icon-btn" type="button" aria-label="${t('aide.recherche.effacer')}" data-clear hidden>`));
  assert.ok(page.includes(`id="guide-recherche-vide" hidden><svg class="icon icon--lg" aria-hidden="true"><use href="#i-search"/></svg><p class="empty__text">${t('aide.recherche.aucunResultat')}</p>`));
  assert.ok(sheet.includes(`href="#haut"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-arrow-up"/></svg><span>${t('aide.sommaire.haut')}</span>`));
  assert.match(page, /<h1 class="site__title" id="haut" tabindex="-1">/);
  // Trois boutons ronds, icône seule, cachés sans JavaScript (pile cachée) ;
  // nom (aria-label) et info-bulle (data-tip) ; « Retour en haut » caché au départ
  assert.match(page, /<div class="help-fabs" id="boutons" hidden>/);
  assert.ok(page.includes(`<button class="help-fab" id="haut-bouton" type="button" aria-label="${t('aide.hautDePage.bouton')}" data-tip="${t('aide.hautDePage.bouton')}" hidden><svg class="icon" aria-hidden="true"><use href="#i-arrow-up"/></svg></button>`));
  assert.ok(page.includes(`<button class="help-fab" id="recherche-bouton" type="button" aria-label="${t('aide.recherche')}" data-tip="${t('aide.recherche')}" aria-expanded="false" aria-controls="guide-recherche"><svg class="icon" aria-hidden="true"><use href="#i-search"/></svg></button>`));
  assert.ok(page.includes(`<button class="help-fab help__toc-btn" id="sommaire-bouton" type="button" aria-label="${t('aide.sommaire.bouton')}" data-tip="${t('aide.sommaire.bouton')}" aria-haspopup="dialog" aria-expanded="false" aria-controls="sommaire"><svg class="icon" aria-hidden="true"><use href="#i-layers"/></svg></button>`));
  assert.match(page, /<dialog class="sheet sheet--scroll site-sheet" id="sommaire" aria-labelledby="sommaire-titre">/);
  assert.ok(page.includes(`aria-label="${t('fenetres.fermer')}" data-close>`));
  assert.ok(sheet.includes(`<nav class="help-toc" aria-label="${t('aide.sommaire')}">`));
  assert.match(page, /<meta name="color-scheme" content="light dark">/);
  assert.ok(page.includes(`<a class="skip-link" href="#contenu">${t('application.allerAuContenu')}</a>`));
  // Mention des parties du serveur ; tableau « Qui peut quoi » (oui / non dans la langue)
  assert.equal(page.split(`class="help__server"><svg class="icon icon--xs" aria-hidden="true"><use href="#i-wrench"/></svg>${html(SERVER_NOTE)}</p>`).length - 1, 1 + 6);
  assert.equal(page.split('class="help-who__row"').length - 1, PERMISSIONS.length);
  assert.ok(page.includes(`<span class="visually-hidden"> ${t('aide.qui.oui')}</span>`) && page.includes(`<span class="visually-hidden"> ${t('aide.qui.non')}</span>`));
  // En-têtes des tableaux : « Titre : » / “Title:”
  assert.ok(page.includes(`<span class="help-table__head">${html(translate(locale, 'aide.tableau.entete', { head: GUIDE.find((c) => c.id === 'installation').sections.find((x) => x.id === 'variables').blocks.find((b) => b.table).table.head[1] }))} </span>`));
});

test('script de la page publique : sommaire, focus, Échap, recherche dans la langue de la page', () => {
  // Script du sommaire : aria-current, focus rendu, Échap natif (dialog)
  const script = read('scripts/site-assets/guide.js');
  assert.match(script, /setAttribute\('aria-current', 'location'\)/);
  assert.match(script, /sheet\.showModal\(\)/);
  assert.match(script, /else button\.focus\(\);/);
  assert.match(script, /el\.focus\(\{ preventScroll: true \}\)/);
  // Boutons : affichés avec JavaScript ; sans <dialog> (anciens Safari), le
  // bouton « Sommaire » reste et mène au sommaire de la page (non-régression
  // du bouton disparu)
  assert.match(script, /if \(buttons\) buttons\.hidden = false;/);
  assert.match(script, /if \(button && sheet && typeof sheet\.showModal !== 'function'\) \{/);
  assert.match(script, /topButton\.hidden = window\.scrollY < window\.innerHeight \* 0\.75;/);
  assert.match(script, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(script, /innerHTML|fetch\(|XMLHttpRequest|import\(/);
  assert.deepEqual([...script.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]), ['./search.js'], 'rien d\'autre que la recherche, copiée sur le site');
  assert.match(script, /mark\.className = 'hit';/);
  // Échap : efface, puis (déjà vide) ferme la barre
  assert.match(script, /if \(event\.key !== 'Escape'\) return;\s*event\.preventDefault\(\);\s*if \(field\.value !== ''\) \{/);
  assert.match(script, /other\.setAttribute\('aria-expanded', String\(open\)\)/);
  // Nombre de résultats : textes de la page (data-texts), pluriel de la
  // langue de la page ; aucun texte écrit dans le script
  assert.match(script, /setTranslator\(/);
  assert.match(script, /new Intl\.PluralRules\(document\.documentElement\.lang/);
  assert.match(script, /dataset\.texts/);
  assert.doesNotMatch(script.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n'), /résultat|results?\b'|'[A-Z][a-z]+ [a-z]+/);
});

test('recherche du site : “results” sur la page anglaise, « résultats » sur la page française (search.js avec la traduction de guide.js)', async () => {
  // Le traducteur de guide.js, recréé ici avec les textes écrits dans chaque page
  const search = await import('../public/js/search.js');
  const files = siteFiles();
  try {
    for (const [locale, words] of [['en', ['0 results', '1 result', '4 results']], ['fr', ['0 résultat', '1 résultat', '4 résultats']]]) {
      const page = files[SITE_PAGES[locale]];
      const texts = JSON.parse(page.match(/data-texts="([^"]+)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      const plural = new Intl.PluralRules(locale);
      search.setTranslator((key, { count }) => (texts[key][`=${count}`] ?? texts[key][plural.select(count)] ?? texts[key].other).replace(/\{count\}/g, String(count)));
      assert.deepEqual([0, 1, 4].map(search.resultsLabel), words, locale);
    }
  } finally {
    search.setTranslator(null);
  }
});

test('pages publiques autonomes : rien chargé d\'ailleurs, pas de noindex (choix du propriétaire), aucun secret ni adresse réelle', () => {
  const files = siteFiles();
  for (const [locale, name] of Object.entries(SITE_PAGES)) {
    const page = files[name];
    const up = locale === 'en' ? '' : '../';
    // Ressources : seulement des fichiers de site/ (pas de CDN, pas de police
    // distante) ; adresses absolues : le lien canonique et les autres langues
    const loaded = [...page.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(loaded)].sort(), [...Object.values(SITE_URLS), ...['guide.css', 'guide.js', 'icon.svg', 'listo.css'].map((f) => `${up}${f}`)].sort(), name);
    assert.ok(page.includes(`<link rel="canonical" href="${SITE_URLS[locale]}">`), 'seules adresses absolues : le lien canonique et les autres langues');
    assert.doesNotMatch(page, /<iframe|<object|<embed/);
    assert.doesNotMatch(page, /noindex|name="robots"/);
    // Liens vers d'autres sites : exemples inventés et sites publics connus
    const hosts = [...page.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
    for (const host of hosts) assert.ok(['listo.exemple.fr', 'auth.exemple.fr', 'securityheaders.com', 'github.com', 'world.openfoodfacts.org', 'magicgg91.github.io', 'platform.claude.com', 'www.w3.org', 'ip'].includes(host), host);
    assert.doesNotMatch(page, /mondomaine|192\.168\.(?!1\.(10|20)\b)/);
  }
  assert.doesNotMatch(files['search.js'], /^import /m, 'search.js n\'importe rien');
  for (const css of [files['listo.css'], files['guide.css']]) assert.doesNotMatch(css, /@import|@font-face|url\(\s*['"]?(?:https?:)?\/\//);
  // Texte toujours protégé
  assert.equal(html('<b>"&'), '&lt;b&gt;&quot;&amp;');
  assert.equal(inlineHtml('Voir [[npm]], `a<b`, [site](https://exemple.fr).'),
    'Voir <a class="help__ref" href="#npm">3.5 Exemple avec Nginx Proxy Manager</a>, <code class="help__code-inline">a&lt;b</code>, <a href="https://exemple.fr" rel="noopener noreferrer">site</a>.');
  assert.equal(inlineHtml('See [[npm]].', 'en'), `See <a class="help__ref" href="#npm">${html(numbered(outline(helpFor('en').GUIDE).find((e) => e.id === 'npm')))}</a>.`);
  assert.match(read('README.md'), /https:\/\/magicgg91\.github\.io\/listo\//);
  assert.match(read('README.md'), /https:\/\/magicgg91\.github\.io\/listo\/fr\//);
});

test('workflow GitHub Pages : publie site/ seulement, à chaque fusion sur main, actions officielles épinglées, permissions minimales, aucun secret', () => {
  const wf = read('.github/workflows/pages.yml');
  assert.match(wf, /on:\n  push:\n    branches: \[main\]/);
  assert.match(wf, /^permissions: \{\}$/m);
  assert.match(wf, /permissions:\n      contents: read[^\n]*\n      pages: write[^\n]*\n      id-token: write/);
  for (const action of ['actions/checkout', 'actions/configure-pages', 'actions/upload-pages-artifact', 'actions/deploy-pages']) {
    assert.match(wf, new RegExp(`uses: ${action}@[0-9a-f]{40} # v\\d+\\.\\d+\\.\\d+`), action);
  }
  assert.match(wf, /with:\n          path: site\n/);
  assert.doesNotMatch(wf, /secrets\./);
  assert.match(wf, /name: github-pages/);
  // L'image Docker ne contient ni le site ni les scripts
  assert.match(read('.dockerignore'), /^site\/$/m);
});

test('captures du README : toutes utilisées, toutes présentes, sans métadonnées, poids raisonnable, hors de l\'image Docker', () => {
  const readme = read('README.md');
  const used = [...readme.matchAll(/\]\(docs\/images\/([^)]+)\)/g)].map((m) => m[1]).sort();
  const files = fs.readdirSync(path.join(ROOT, 'docs/images')).sort();
  assert.deepEqual(files, used, 'chaque capture est montrée par le README, et chaque image du README existe');
  for (const file of files) {
    const data = fs.readFileSync(path.join(ROOT, 'docs/images', file));
    assert.equal(data.subarray(1, 4).toString(), 'PNG', file);
    // Morceaux du PNG : aucun texte, aucune date, aucune donnée EXIF
    const kinds = [];
    for (let i = 8; i < data.length;) {
      const length = data.readUInt32BE(i);
      kinds.push(data.subarray(i + 4, i + 8).toString());
      i += length + 12;
    }
    assert.deepEqual(kinds.filter((k) => /^(tEXt|iTXt|zTXt|eXIf|tIME)$/.test(k)), [], file);
    assert.ok(data.length < 150_000, `${file} : ${data.length} octets`);
  }
  assert.doesNotMatch(readme, /captures datent d'avant/);
  assert.match(read('.dockerignore'), /^docs\/$/m);
});
