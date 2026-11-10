// docs/guide.md et site/ (page publique, GitHub Pages) : fabriqués par
// scripts/guide.js à partir de la source unique (public/js/help-content.js).
// Ce test échoue si l'un d'eux n'est pas à jour (relancer : node
// scripts/guide.js), si le sommaire ne correspond pas aux titres, si la page
// publique charge quoi que ce soit d'ailleurs, ou si un lien d'un document du
// dépôt est cassé.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { guideMarkdown, inlineMarkdown, GUIDE_FILE, siteFiles, siteHtml, inlineHtml, html, SITE_DIR, SITE_URL } from '../scripts/guide.js';
import { brokenLinks, anchorsOf, linksOf, slug } from '../scripts/doc-links.js';
import { outline, numbered, PERMISSIONS } from '../public/js/help-content.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('docs/guide.md est à jour (sinon : node scripts/guide.js)', () => {
  assert.equal(fs.readFileSync(GUIDE_FILE, 'utf8'), guideMarkdown(), 'docs/guide.md n\'est pas à jour : lancez node scripts/guide.js');
  assert.match(read('package.json'), /"guide": "node scripts\/guide\.js"/);
});

test('sommaire : une entrée par section, dans l\'ordre, avec le même numéro que le titre ; ancres uniques', () => {
  const md = read('docs/guide.md');
  const entries = outline();
  const toc = md.slice(md.indexOf('## Sommaire'), md.indexOf('<a id='));
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
  assert.equal((md.match(/^\*Pour la personne qui gère le serveur\.\*$/gm) ?? []).length, 1 + 5);
  // Sommaire court : les chapitres, chacun repliable (<details>, affiché par GitHub)
  assert.equal((toc.match(/<details>/g) ?? []).length, entries.filter((e) => e.level === 1).length);
  assert.equal((toc.match(/\[Aller au chapitre\]/g) ?? []).length, entries.filter((e) => e.level === 1).length);
  assert.match(toc, /<summary>1\. Présentation<\/summary>\n\n- \[Aller au chapitre\]\(#presentation\)/);
  // Ni HTML (hors ancres et commentaire), ni renvoi non résolu
  assert.doesNotMatch(md.replace(/<a id="[^"]+"><\/a>|<!--[^>]*-->|<\/?details>|<summary>[^<]*<\/summary>/g, ''), /<[a-z]/i);
  assert.doesNotMatch(md, /\[\[/);
});

test('Markdown : texte protégé, code, renvois et liens', () => {
  assert.equal(inlineMarkdown('Voir [[sauvegardes]], `docker logs listo` et [le site](https://securityheaders.com).'),
    'Voir [3.8 Sauvegardes](#sauvegardes), `docker logs listo` et [le site](https://securityheaders.com).');
  assert.equal(inlineMarkdown('__Host- *a* <b> [x] | #'), '\\_\\_Host- \\*a\\* \\<b\\> \\[x\\] \\| \\#');
});

test('liens des documents du dépôt : aucun lien cassé (fichiers et ancres)', () => {
  assert.deepEqual(brokenLinks(), []);
  // Le vérificateur repère bien les titres et les ancres
  assert.equal(slug('9. Mettre à jour Listo'), '9-mettre-à-jour-listo');
  assert.equal(slug('Mode scan : Open Food Facts'), 'mode-scan--open-food-facts');
  assert.ok(anchorsOf('<a id="npm"></a>\n\n### 4.4 Régler').has('npm'));
  assert.deepEqual(linksOf('[a](b.md#c) `[x](y)`\n```\n[z](w)\n```'), ['b.md#c']);
  // Le guide d'exploitation (écrit à la main) : cité là où l'on parle d'entretien
  for (const file of ['README.md', 'SECURITY.md', 'docker-compose.yml', '.github/dependabot.yml']) {
    assert.match(read(file), /exploitation\.md/, file);
  }
  assert.match(read('docs/exploitation.md'), /\[docs\/guide\.md\]\(guide\.md\)/);
  assert.doesNotMatch(read('README.md'), /guide\.md#serveur/);
});

test('README court : moins de 60 lignes, renvoie au guide, sans tableau des variables', () => {
  const readme = read('README.md');
  assert.ok(readme.split('\n').length <= 60, `${readme.split('\n').length} lignes`);
  assert.match(readme, /docs\/guide\.md/);
  assert.match(readme, /Claude/);
  assert.doesNotMatch(readme, /LISTO_PRODUCT_LOOKUP|\| Variable \|/);
  assert.ok((readme.match(/!\[[^\]]*\]\(docs\/images\//g) ?? []).length >= 1);
});

test('site/ est à jour et ne contient que la page du guide et ce qu\'il lui faut (ni docs/, ni cahier des charges)', () => {
  const files = siteFiles();
  assert.deepEqual(Object.keys(files).sort(), ['guide.css', 'guide.js', 'icon.svg', 'index.html', 'listo.css', 'search.js']);
  assert.deepEqual(fs.readdirSync(SITE_DIR).sort(), Object.keys(files).sort(), 'aucun autre fichier dans site/');
  for (const [name, content] of Object.entries(files)) {
    assert.equal(fs.readFileSync(path.join(SITE_DIR, name), 'utf8'), content, `site/${name} n'est pas à jour : lancez node scripts/guide.js`);
  }
  // Copies exactes du kit et de l'application ; sources propres au site
  assert.equal(files['listo.css'], read('public/css/listo.css'));
  assert.equal(files['guide.js'], read('scripts/site-assets/guide.js'));
  assert.equal(files['search.js'], read('public/js/search.js'), 'la même recherche que l\'application');
  assert.ok(files['guide.css'].includes(read('scripts/site-assets/site.css')));
  assert.ok(files['guide.css'].includes('.help-toc__entry.is-current {'));
  const index = files['index.html'];
  assert.doesNotMatch(index, /cahier des charges|mcp-cadrage/i);
});

test('page publique : même numérotation, mêmes ancres, sommaire dans la page et dans la feuille, accessible', () => {
  const page = siteHtml();
  const entries = outline();
  for (const e of entries) {
    assert.equal(page.split(`id="${e.id}"`).length - 1, 1, `ancre unique : ${e.id}`);
    const tag = e.level === 1 ? 'h2' : 'h3';
    assert.ok(page.includes(`<${tag} class="${e.level === 1 ? 'aisle help__chapter' : 'help__title'}" id="${e.id}" tabindex="-1">${html(numbered(e))}</${tag}>`), numbered(e));
  }
  // Sommaire : écrit dans la page (sans JavaScript) et dans la feuille
  const pageToc = page.slice(page.indexOf('<nav class="card site__toc"'), page.indexOf('</nav>'));
  assert.deepEqual([...pageToc.matchAll(/<a [^>]*href="#([a-z0-9-]+)"/g)].map((m) => m[1]), entries.map((e) => e.id));
  const chapters = entries.filter((e) => e.level === 1);
  assert.equal((pageToc.match(/<details class="site__toc-chapter" name="sommaire-page">/g) ?? []).length, chapters.length, 'sans JavaScript : <details> natifs, un seul ouvert');
  assert.equal((pageToc.match(/>Aller au chapitre</g) ?? []).length, chapters.length);
  const sheet = page.slice(page.indexOf('<dialog'), page.indexOf('</dialog>'));
  assert.deepEqual([...sheet.matchAll(/data-section="([a-z0-9-]+)"/g)].map((m) => m[1]), entries.map((e) => e.id));
  for (const c of chapters) {
    assert.match(sheet, new RegExp(`<button class="help-toc__entry help-toc__entry--1 help-toc__chapter" type="button" aria-expanded="false" aria-controls="sommaire-${c.id}" data-chapter="${c.id}">`));
    assert.match(sheet, new RegExp(`<ol class="help-toc__list help-toc__list--sub" id="sommaire-${c.id}" hidden>`));
  }
  // Recherche : barre ouverte par la loupe (cachée au départ et sans
  // JavaScript), champ du kit, « Fermer la recherche », compteur annoncé,
  // message quand rien n'est trouvé
  assert.match(page, /<div class="help-search help-search--bar site__search" id="guide-recherche" hidden>/);
  assert.match(page, /<button class="icon-btn" type="button" aria-label="Fermer la recherche" data-close-search>/);
  assert.match(page, /<input class="searchfield__input" id="guide-recherche-champ" type="search"[^>]*aria-label="Rechercher dans le guide">/);
  assert.match(page, /<p class="help-search__status" role="status"><\/p>/);
  assert.match(page, /<button class="icon-btn" type="button" aria-label="Effacer la recherche" data-clear hidden>/);
  assert.match(page, /id="guide-recherche-vide" hidden>/);
  assert.match(page, /<script type="module" src="guide\.js"><\/script>/);
  assert.match(sheet, /href="#haut">.*Haut de page/);
  assert.match(page, /<h1 class="site__title" id="haut" tabindex="-1">/);
  // Trois boutons ronds, icône seule, cachés sans JavaScript (pile cachée) ;
  // nom (aria-label) et info-bulle (data-tip) ; « Retour en haut » caché au départ
  assert.match(page, /<div class="help-fabs" id="boutons" hidden>/);
  assert.match(page, /<button class="help-fab" id="haut-bouton" type="button" aria-label="Retour en haut de la page" data-tip="Retour en haut de la page" hidden><svg class="icon" aria-hidden="true"><use href="#i-arrow-up"\/><\/svg><\/button>/);
  assert.match(page, /<button class="help-fab" id="recherche-bouton" type="button" aria-label="Rechercher dans le guide" data-tip="Rechercher dans le guide" aria-expanded="false" aria-controls="guide-recherche"><svg class="icon" aria-hidden="true"><use href="#i-search"\/><\/svg><\/button>/);
  assert.match(page, /<button class="help-fab help__toc-btn" id="sommaire-bouton" type="button" aria-label="Sommaire du guide" data-tip="Sommaire du guide" aria-haspopup="dialog" aria-expanded="false" aria-controls="sommaire"><svg class="icon" aria-hidden="true"><use href="#i-layers"\/><\/svg><\/button>/);
  assert.match(page, /<dialog class="sheet sheet--scroll site-sheet" id="sommaire" aria-labelledby="sommaire-titre">/);
  assert.match(page, /aria-label="Fermer" data-close>/);
  assert.match(page, /<html lang="fr" data-theme="auto">/);
  assert.match(page, /<meta name="color-scheme" content="light dark">/);
  assert.match(page, /<a class="skip-link" href="#contenu">/);
  // Mention des parties du serveur ; tableau « Qui peut quoi »
  assert.equal(page.split('class="help__server"').length - 1, 1 + 5);
  assert.equal(page.split('class="help-who__row"').length - 1, PERMISSIONS.length);
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
  assert.match(page, /<h2 class="site__toc-title" id="sommaire-page" tabindex="-1">/);
  assert.doesNotMatch(script, /innerHTML|fetch\(|XMLHttpRequest|import\(/);
  assert.deepEqual([...script.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]), ['./search.js'], 'rien d\'autre que la recherche, copiée sur le site');
  assert.match(script, /mark\.className = 'hit';/);
  // Échap : efface, puis (déjà vide) ferme la barre
  assert.match(script, /if \(event\.key !== 'Escape'\) return;\s*event\.preventDefault\(\);\s*if \(field\.value !== ''\) \{/);
  assert.match(script, /other\.setAttribute\('aria-expanded', String\(open\)\)/);
});

test('page publique autonome : rien chargé d\'ailleurs, pas de noindex (choix du propriétaire), aucun secret ni adresse réelle', () => {
  const files = siteFiles();
  const page = files['index.html'];
  // Ressources : seulement des fichiers de site/ (pas de CDN, pas de police distante)
  const loaded = [...page.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.doesNotMatch(files['search.js'], /^import /m, 'search.js n\'importe rien');
  assert.deepEqual([...new Set(loaded)].sort(), [SITE_URL, 'guide.css', 'guide.js', 'icon.svg', 'listo.css'].sort());
  assert.match(page, new RegExp(`<link rel="canonical" href="${SITE_URL}">`), 'seule adresse absolue : le lien canonique');
  for (const css of [files['listo.css'], files['guide.css']]) assert.doesNotMatch(css, /@import|@font-face|url\(\s*['"]?(?:https?:)?\/\//);
  assert.doesNotMatch(page, /<iframe|<object|<embed/);
  assert.doesNotMatch(page, /noindex|name="robots"/);
  // Liens vers d'autres sites : exemples inventés et sites publics connus
  const hosts = [...page.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
  for (const host of hosts) assert.ok(['listo.exemple.fr', 'securityheaders.com', 'github.com', 'world.openfoodfacts.org', 'magicgg91.github.io', 'platform.claude.com', 'www.w3.org', 'ip'].includes(host), host);
  assert.doesNotMatch(page, /mondomaine|192\.168\.(?!1\.(10|20)\b)/);
  // Texte toujours protégé
  assert.equal(html('<b>"&'), '&lt;b&gt;&quot;&amp;');
  assert.equal(inlineHtml('Voir [[npm]], `a<b`, [site](https://exemple.fr).'),
    'Voir <a class="help__ref" href="#npm">3.5 Exemple avec Nginx Proxy Manager</a>, <code class="help__code-inline">a&lt;b</code>, <a href="https://exemple.fr" rel="noopener noreferrer">site</a>.');
  assert.match(read('README.md'), /https:\/\/magicgg91\.github\.io\/listo\//);
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
