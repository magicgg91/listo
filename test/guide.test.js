// docs/guide.md : fabriqué par scripts/guide.js à partir de la source
// unique (public/js/help-content.js). Ce test échoue si le fichier n'est pas
// à jour (relancer : node scripts/guide.js), si le sommaire ne correspond pas
// aux titres, ou si un lien d'un document du dépôt est cassé.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { guideMarkdown, inlineMarkdown, GUIDE_FILE } from '../scripts/guide.js';
import { brokenLinks, anchorsOf, linksOf, slug } from '../scripts/doc-links.js';
import { outline, numbered } from '../public/js/help-content.js';

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
  // Mention des chapitres du serveur
  assert.equal((md.match(/^\*Pour la personne qui gère le serveur\.\*$/gm) ?? []).length, 2);
  // Ni HTML (hors ancres et commentaire), ni renvoi non résolu
  assert.doesNotMatch(md.replace(/<a id="[^"]+"><\/a>|<!--[^>]*-->/g, ''), /<[a-z]/i);
  assert.doesNotMatch(md, /\[\[/);
});

test('Markdown : texte protégé, code, renvois et liens', () => {
  assert.equal(inlineMarkdown('Voir [[restauration]], `docker logs listo` et [le site](https://securityheaders.com).'),
    'Voir [9.2 Restaurer une sauvegarde](#restauration), `docker logs listo` et [le site](https://securityheaders.com).');
  assert.equal(inlineMarkdown('__Host- *a* <b> [x] | #'), '\\_\\_Host- \\*a\\* \\<b\\> \\[x\\] \\| \\#');
});

test('liens des documents du dépôt : aucun lien cassé (fichiers et ancres)', () => {
  assert.deepEqual(brokenLinks(), []);
  // Le vérificateur repère bien les titres et les ancres
  assert.equal(slug('9. Mettre à jour Listo'), '9-mettre-à-jour-listo');
  assert.equal(slug('Mode scan : Open Food Facts'), 'mode-scan--open-food-facts');
  assert.ok(anchorsOf('<a id="npm"></a>\n\n### 4.4 Régler').has('npm'));
  assert.deepEqual(linksOf('[a](b.md#c) `[x](y)`\n```\n[z](w)\n```'), ['b.md#c']);
  // Plus aucun renvoi vers l'ancien guide d'exploitation, sauf son renvoi
  for (const file of ['README.md', 'SECURITY.md', 'docker-compose.yml', '.github/dependabot.yml', 'design/README.md']) {
    assert.doesNotMatch(read(file), /exploitation\.md/, file);
  }
  assert.match(read('docs/exploitation.md'), /\[docs\/guide\.md\]\(guide\.md\)/);
});

test('README court : moins de 60 lignes, renvoie au guide, sans tableau des variables', () => {
  const readme = read('README.md');
  assert.ok(readme.split('\n').length <= 60, `${readme.split('\n').length} lignes`);
  assert.match(readme, /docs\/guide\.md/);
  assert.match(readme, /Claude/);
  assert.doesNotMatch(readme, /LISTO_PRODUCT_LOOKUP|\| Variable \|/);
  assert.ok((readme.match(/!\[[^\]]*\]\(docs\/images\//g) ?? []).length >= 1);
});
